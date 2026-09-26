'use client'

// The Offers manager.
//
// A jewellery counter lives on the festival calendar, and a festival offer is a
// short, dated promise. This screen is built around that one idea: an offer has
// a start and an end, and the dates decide when the website shows it. Nothing
// has to be remembered and switched off afterwards, because an offer whose end
// date has passed simply stops appearing.
//
// Covered in one screen:
//   · what is running today, what is coming up, and what has finished
//   · the offer name, savings, optional code, and its exact date window
//   · an on/off switch for taking an offer down early
//
// Deliberately NOT here: changing product prices. A festival offer is an
// advertisement — the shop sets the price it charges on the Store screen, and a
// banner promising "10% off" is settled at the counter. Keeping the two apart
// means a banner can never quietly rewrite what a piece costs.

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  BadgePercent,
  CalendarClock,
  CalendarDays,
  Check,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Input, Notice, SectionHeading, Select, StatCard, WorkspaceHero, money } from '@/components/ui'
import { useApi } from '@/lib/use-api'
import { businessDate } from '@/lib/business-time'
import { offerBannerUrl, offerDate, offerState, savingsLabel, OFFER_ACCENTS, type OfferState } from '@/lib/offers'
import type { Offer, OfferAccent, OfferDiscountType } from '@/lib/types'

type Draft = {
  title: string
  description: string
  code: string
  discountType: OfferDiscountType
  discountValue: string
  startsOn: string
  endsOn: string
  accent: OfferAccent
  showInSection: boolean
}

const today = () => businessDate()

const EMPTY: Draft = {
  title: '',
  description: '',
  code: '',
  discountType: 'percent',
  discountValue: '',
  startsOn: today(),
  endsOn: today(),
  accent: 'red',
  showInSection: true,
}

/** A ready-made window, so a festival offer is a tap rather than date typing. */
function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const STATE_LABEL: Record<OfferState, string> = {
  ACTIVE: 'Running now',
  UPCOMING: 'Starts later',
  EXPIRED: 'Finished',
}

const STATE_TONE: Record<OfferState, 'success' | 'gold' | 'neutral'> = {
  ACTIVE: 'success',
  UPCOMING: 'gold',
  EXPIRED: 'neutral',
}

export default function OffersSection() {
  const offers = useApi<Offer[]>('/api/offers', { refreshInterval: 120_000 })
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  /** Id of the offer whose banner is currently uploading or being removed. */
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  // One hidden file input is reused by every row, so the list stays light.
  const fileInput = useRef<HTMLInputElement | null>(null)
  const pendingOffer = useRef<Offer | null>(null)

  const day = today()
  const rows = offers.data ?? []

  const counts = useMemo(() => {
    const active = rows.filter((offer) => offer.active && offerState(offer, day) === 'ACTIVE').length
    const upcoming = rows.filter((offer) => offer.active && offerState(offer, day) === 'UPCOMING').length
    return { active, upcoming, total: rows.length }
  }, [rows, day])

  const startNew = () => {
    setEditingId(null)
    setDraft(EMPTY)
    setError('')
    setMessage('')
    setShowForm(true)
  }

  const startEdit = (offer: Offer) => {
    setEditingId(offer.id)
    setDraft({
      title: offer.title,
      description: offer.description ?? '',
      code: offer.code ?? '',
      discountType: offer.discountType,
      discountValue: String(Number(offer.discountValue)),
      startsOn: offer.startsOn,
      endsOn: offer.endsOn,
      accent: offer.accent,
      showInSection: offer.showInSection,
    })
    setError('')
    setMessage('')
    setShowForm(true)
  }

  /** Every write reports all three states: busy, success and failure. */
  const send = useCallback(
    async (method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>, note: string) => {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        // DELETE names the row in the query string, not the body.
        const url = method === 'DELETE' ? `/api/offers?id=${encodeURIComponent(String(body.id))}` : '/api/offers'
        const response = await fetch(url, {
          method,
          headers: method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
          body: method === 'DELETE' ? undefined : JSON.stringify(body),
        })
        const text = await response.text()
        const result = text ? JSON.parse(text) : {}
        if (!response.ok) {
          setError(result.error ?? 'Could not save that change.')
          return false
        }
        setMessage(note)
        offers.refresh()
        return true
      } catch {
        setError('Could not reach the server. Please try again.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [offers],
  )

  /**
   * Uploads or replaces an offer's banner photo.
   *
   * Separate from `send` because the body is multipart rather than JSON, but it
   * reports the same three states. The offer must already be saved — the image
   * is attached to a row id, so a brand-new offer is saved first.
   */
  const uploadBanner = useCallback(
    async (offer: Offer, file: File) => {
      setUploadingId(offer.id)
      setError('')
      setMessage('')
      try {
        const form = new FormData()
        form.set('image', file)
        const response = await fetch(`/api/offers/image?id=${encodeURIComponent(String(offer.id))}`, {
          method: 'POST',
          body: form,
        })
        const text = await response.text()
        const result = text ? JSON.parse(text) : {}
        if (!response.ok) {
          const detail = result.error ?? 'unknown error'
          setError(`${file.name} could not be uploaded: ${detail}`)
          return
        }
        setMessage(`Banner photo updated for "${offer.title}".`)
        offers.refresh()
      } catch {
        setError('Could not reach the server. Please try again.')
      } finally {
        setUploadingId(null)
      }
    },
    [offers],
  )

  /** Removes the photo, leaving the offer and its dates untouched. */
  const removeBanner = useCallback(
    async (offer: Offer) => {
      setUploadingId(offer.id)
      setError('')
      setMessage('')
      try {
        const response = await fetch(`/api/offers/image?id=${encodeURIComponent(String(offer.id))}`, { method: 'DELETE' })
        const text = await response.text()
        const result = text ? JSON.parse(text) : {}
        if (!response.ok) {
          setError(result.error ?? 'Could not remove the banner photo.')
          return
        }
        setMessage(`Banner photo removed from "${offer.title}".`)
        offers.refresh()
      } catch {
        setError('Could not reach the server. Please try again.')
      } finally {
        setUploadingId(null)
      }
    },
    [offers],
  )

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const payload = {
      ...(editingId === null ? {} : { id: editingId }),
      title: draft.title,
      description: draft.description,
      code: draft.code,
      discountType: draft.discountType,
      discountValue: Number(draft.discountValue),
      startsOn: draft.startsOn,
      endsOn: draft.endsOn,
      accent: draft.accent,
      showInSection: draft.showInSection,
    }
    const ok = await send(
      editingId === null ? 'POST' : 'PATCH',
      payload,
      editingId === null ? `"${draft.title}" is saved.` : `"${draft.title}" is updated.`,
    )
    if (ok) {
      setShowForm(false)
      setEditingId(null)
      setDraft(EMPTY)
    }
  }

  const remove = async (offer: Offer) => {
    if (!window.confirm(`Delete the "${offer.title}" offer? This cannot be undone.`)) return
    await send('DELETE', { id: offer.id }, `"${offer.title}" is deleted.`)
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHero
        eyebrow="Festival offers"
        title="Run an offer for the festival"
        description="Set the dates and the saving, and the website shows it automatically for exactly that window — then stops on its own. An offer never changes the price of a piece; the price you set on the Store screen is the price the shop charges."
        action={
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 rounded-xl border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur transition hover:bg-white/20"
          >
            <Plus className="size-3.5" /> New offer
          </button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Sparkles} label="Running now" value={String(counts.active)} hint="Showing on the website" tone="success" loading={offers.isLoading} />
        <StatCard icon={CalendarClock} label="Starting soon" value={String(counts.upcoming)} hint="Waiting for their start date" tone="gold" loading={offers.isLoading} />
        <StatCard icon={Tag} label="All offers" value={String(counts.total)} hint="Running, upcoming and past" loading={offers.isLoading} />
      </section>

      {showForm && (
        <Card className="business-primary-card">
          <SectionHeading
            title={editingId === null ? 'New festival offer' : 'Edit this offer'}
            description="The website shows the offer only between these two dates, inclusive. Nothing needs to be switched off afterwards."
          />

          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Offer name" hint="What the customer sees first — e.g. Diwali Offer">
              <Input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="e.g. Diwali Offer"
                maxLength={80}
                required
              />
            </Field>

            <Field label="Offer code" hint="Optional — a code the customer quotes at the counter">
              <Input
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                placeholder="e.g. DIWALI10"
                maxLength={24}
              />
            </Field>

            <Field label="Discount type" hint="A percentage off, or a flat rupee amount">
              <Select
                value={draft.discountType}
                onChange={(event) => setDraft({ ...draft, discountType: event.target.value as OfferDiscountType })}
              >
                <option value="percent">Percentage off</option>
                <option value="flat">Flat amount off</option>
              </Select>
            </Field>

            <Field
              label={draft.discountType === 'flat' ? 'Amount off (₹)' : 'Percent off (%)'}
              hint={
                draft.discountType === 'flat'
                  ? 'Rupees off — settled at the counter'
                  : 'A number from 1 to 100'
              }
            >
              <Input
                type="number"
                min="0.01"
                max={draft.discountType === 'percent' ? 100 : undefined}
                step="0.01"
                value={draft.discountValue}
                onChange={(event) => setDraft({ ...draft, discountValue: event.target.value })}
                placeholder={draft.discountType === 'flat' ? '200' : '10'}
                required
              />
            </Field>

            <Field label="Starts on" hint="First day the offer shows">
              <Input
                type="date"
                value={draft.startsOn}
                onChange={(event) => {
                  const startsOn = event.target.value
                  // Keep the window valid as the start moves: an end date before
                  // the start would be rejected, so push it along instead.
                  setDraft({
                    ...draft,
                    startsOn,
                    endsOn: draft.endsOn < startsOn ? startsOn : draft.endsOn,
                  })
                }}
                required
              />
            </Field>

            <Field label="Ends on" hint="Last day the offer shows — inclusive">
              <Input
                type="date"
                value={draft.endsOn}
                min={draft.startsOn}
                onChange={(event) => setDraft({ ...draft, endsOn: event.target.value })}
                required
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              {[
                { label: 'Today only', days: 0 },
                { label: '3 days', days: 2 },
                { label: '1 week', days: 6 },
                { label: '2 weeks', days: 13 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setDraft({ ...draft, startsOn: today(), endsOn: addDays(today(), preset.days) })}
                  className="rounded-full border-hairline bg-card px-3 py-1.5 text-xs transition hover:bg-secondary"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="sm:col-span-2">
              <Field label="Description" hint="One honest line — e.g. Flat 10% off on all silver pieces this week.">
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  rows={2}
                  maxLength={160}
                  placeholder="e.g. Flat 10% off on all silver pieces this week."
                  className="w-full rounded-xl border-hairline bg-card/90 px-3 py-2.5 text-sm transition"
                />
              </Field>
            </div>

            {/*
              Card colour. A fixed set of four rather than a colour picker: the
              cards set white type on a solid field, so a free choice would let a
              shopkeeper pick something their own offer name cannot be read on.
            */}
            <Field label="Card colour" hint="How the offer card looks in the Offers section on the website">
              <div className="flex flex-wrap gap-2">
                {OFFER_ACCENTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDraft({ ...draft, accent: option.value })}
                    aria-pressed={draft.accent === option.value}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                      draft.accent === option.value
                        ? 'border-gold bg-gold-soft text-gold-deep'
                        : 'border-hairline bg-card hover:bg-secondary'
                    }`}
                  >
                    <span className="size-4 rounded-full border border-black/10" data-accent={option.value} style={{ background: `var(--sf-offer-${option.value === 'maroon' ? 'maroon' : option.value})` }} />
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            {/*
              Whether the offer also gets a card. A one-line announcement reads
              thin as a large card, so a shop may want the strip without the
              board.
            */}
            <Field label="Show as a card" hint="Off keeps it as a slim strip only — for small announcements">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, showInSection: !draft.showInSection })}
                aria-pressed={draft.showInSection}
                className={`flex h-11 w-full items-center justify-between rounded-xl border px-3 text-sm transition ${
                  draft.showInSection ? 'border-gold bg-gold-soft text-gold-deep' : 'border-hairline bg-card'
                }`}
              >
                <span>{draft.showInSection ? 'Also shown as a card' : 'Slim strip only'}</span>
                <span className={`flex size-5 items-center justify-center rounded-full border ${draft.showInSection ? 'border-gold bg-gold text-slate-950' : 'border-hairline'}`}>
                  {draft.showInSection && <Check className="size-3" />}
                </span>
              </button>
            </Field>

            {/*
              The festival photo. Offered only once the offer has been saved,
              because the image is attached to a row id — showing an uploader
              that silently could not save would be worse than not showing one.
            */}
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Banner photo</p>
              {editingId === null ? (
                <p className="rounded-xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
                  Save the offer first, then upload a festival photo — it appears on the website behind the offer text.
                </p>
              ) : (
                <BannerPicker
                  offer={rows.find((row) => row.id === editingId) ?? null}
                  busy={uploadingId === editingId}
                  onPick={() => {
                    const target = rows.find((row) => row.id === editingId) ?? null
                    if (!target) return
                    pendingOffer.current = target
                    fileInput.current?.click()
                  }}
                  onRemove={() => {
                    const target = rows.find((row) => row.id === editingId) ?? null
                    if (target) void removeBanner(target)
                  }}
                />
              )}
            </div>

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" variant="gold" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {editingId === null ? 'Save offer' : 'Save changes'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setDraft(EMPTY) }}>
                Cancel
              </Button>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BadgePercent className="size-3.5" /> The website updates within a minute.
              </p>
            </div>
          </form>
        </Card>
      )}

      <div className="flex-col gap-3">
        {message && <Notice tone="success">{message}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>

      <Card>
        <SectionHeading
          title="Your offers"
          description="An offer shows on the website only while it is switched on and today falls between its dates."
          action={
            !showForm ? (
              <Button variant="gold" onClick={startNew}>
                <Plus className="size-4" /> New offer
              </Button>
            ) : undefined
          }
        />

        {offers.isLoading ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading offers">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-secondary/60" />
            ))}
          </div>
        ) : offers.error ? (
          <Notice tone="danger">{offers.error}</Notice>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No offers yet"
            description="Create one for the next festival — set the dates and the saving, and the website will show it for exactly that window."
          />
        ) : (
          <ul className="stagger flex-col gap-3">
            {rows.map((offer) => {
              const state = offerState(offer, day)
              const value = Number(offer.discountValue)
              const saving = savingsLabel(offer.discountType, value)

              return (
                <li
                  key={offer.id}
                  className={`business-list-row rounded-2xl p-4 ${offer.active ? '' : 'opacity-70'}`}
                >
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                    {/*
                      The uploaded photo, or a placeholder offering to add one.
                      Showing the real artwork here is what lets the shopkeeper
                      confirm the crop before the festival starts.
                    */}
                    <button
                      type="button"
                      onClick={() => {
                        pendingOffer.current = offer
                        fileInput.current?.click()
                      }}
                      disabled={uploadingId === offer.id}
                      aria-label={offer.hasBanner ? `Replace the banner photo for ${offer.title}` : `Upload a banner photo for ${offer.title}`}
                      className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border-hairline bg-gold-soft text-gold-deep transition hover:opacity-90 disabled:opacity-60"
                    >
                      {uploadingId === offer.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : offer.hasBanner ? (
                        <img src={offerBannerUrl(offer.id, offer.bannerVersion)} alt="" className="size-11 object-cover" />
                      ) : (
                        <BadgePercent className="size-5" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
                        {!offer.active && <Badge tone="neutral">Switched off</Badge>}
                        {offer.code && <Badge tone="gold">{offer.code}</Badge>}
                      </div>
                      <p className="mt-1.5 truncate text-sm font-medium">{offer.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {offerDate(offer.startsOn)} → {offerDate(offer.endsOn)}
                        {saving ? ` · ${saving}` : ''}
                      </p>
                      {offer.description && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{offer.description}</p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="tnum text-sm font-semibold">
                        {offer.discountType === 'flat' ? money(value) : `${value.toLocaleString('en-IN')}%`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {offer.discountType === 'flat' ? 'flat amount off' : 'percent off'}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        onClick={() =>
                          void send(
                            'PATCH',
                            { id: offer.id, active: !offer.active },
                            offer.active ? `"${offer.title}" is switched off.` : `"${offer.title}" is switched on.`,
                          )
                        }
                        disabled={busy}
                        className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-60 ${offer.active ? 'border-hairline bg-card hover:bg-secondary' : 'bg-gold text-slate-950 hover:opacity-92'
                          }`}
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : offer.active ? <AlertCircle className="size-3.5" /> : <Sparkles className="size-3.5" />}
                        {offer.active ? 'Switch off' : 'Switch on'}
                      </button>
                      <button
                        onClick={() => startEdit(offer)}
                        className="flex h-9 items-center gap-1.5 rounded-xl border-hairline bg-card px-3 text-xs transition hover:bg-secondary"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </button>
                      {offer.hasBanner && (
                        <button
                          onClick={() => void removeBanner(offer)}
                          disabled={uploadingId === offer.id}
                          className="flex h-9 items-center gap-1.5 rounded-xl border-hairline bg-card px-3 text-xs text-muted-foreground transition hover:bg-secondary disabled:opacity-60"
                        >
                          <X className="size-3.5" /> Photo
                        </button>
                      )}
                      <button
                        onClick={() => void remove(offer)}
                        disabled={busy}
                        aria-label={`Delete ${offer.title}`}
                        className="flex size-9 items-center justify-center rounded-xl border-hairline bg-card text-muted-foreground transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/*
        One hidden input serves every upload button on the page.
        It is wired to whichever offer the click came from, held in a ref — so a
        long list of offers does not carry an input element each.
      */}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const offer = pendingOffer.current
          // Clear the value so choosing the same file twice still fires onChange.
          event.target.value = ''
          if (file && offer) void uploadBanner(offer, file)
        }}
      />
    </div>
  )
}

/**
 * The banner photo control inside the editor.
 *
 * It shows the artwork the customer will see, at the shape they will see it in,
 * so the shopkeeper can tell whether the photo is being cropped badly before the
 * festival rather than after.
 */
function BannerPicker({
  offer,
  busy,
  onPick,
  onRemove,
}: {
  offer: Offer | null
  busy: boolean
  onPick: () => void
  onRemove: () => void
}) {
  if (!offer) return null

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border-hairline bg-secondary/60 p-4">
      <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-hairline bg-card">
        {busy ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : offer.hasBanner ? (
          <img src={offerBannerUrl(offer.id, offer.bannerVersion)} alt="Offer banner" className="size-20 object-cover" />
        ) : (
          <ImagePlus className="size-6 text-muted-foreground" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          {offer.hasBanner
            ? 'This photo leads the offer band on the website, beside the offer text. A wide landscape banner works best — the sides are trimmed slightly to fit the frame.'
            : 'Add a festival photo to lead the offer band on the website. A wide landscape banner works best — the sides are trimmed slightly to fit the frame.'}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={onPick} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {offer.hasBanner ? 'Replace photo' : 'Upload photo'}
          </Button>
          {offer.hasBanner && (
            <Button variant="ghost" onClick={onRemove} disabled={busy}>
              <X className="size-4" /> Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
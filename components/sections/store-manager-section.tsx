'use client'

// The Store manager.
//
// This is the single place the shop controls its own website. It is built
// around one idea: the billing catalogue and the public website are the same
// catalogue, and publishing is a deliberate second step. Nothing appears on the
// website until it is switched on here.
//
// Covered in one screen:
//   · which pieces are live, and which are still private
//   · website price, description, collection, badge and shelf order
//   · the storefront copy (tagline, WhatsApp number, hours) on the Profile screen
//   · a share link to hand to customers

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Gem,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Store,
  Upload,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Input, Notice, SectionHeading, Select, StatCard, WorkspaceHero, money } from '@/components/ui'
import type { Item } from '@/lib/types'

type Draft = {
  storePrice: string
  description: string
  collection: string
  badge: string
  featured: string
}

const EMPTY: Draft = { storePrice: '', description: '', collection: '', badge: '', featured: '0' }

export default function StoreManagerSection({ items, loading, refresh }: { items: Item[]; loading: boolean; refresh: () => void }) {
  const [filter, setFilter] = useState('')
  const [scope, setScope] = useState<'all' | 'live' | 'hidden'>('all')
  const [editing, setEditing] = useState<Item | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const published = useMemo(() => items.filter((item) => item.published), [items])

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase()
    return items.filter((item) => {
      if (scope === 'live' && !item.published) return false
      if (scope === 'hidden' && item.published) return false
      if (!term) return true
      return (
        item.name.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term) ||
        (item.collection ?? '').toLowerCase().includes(term) ||
        String(item.code).includes(term)
      )
    })
  }, [items, filter, scope])

  const collections = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of published) {
      const name = item.collection?.trim() || item.category
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [published])

  /** Every write goes through here so the three states are always reported. */
  const save = useCallback(
    async (item: Item, patch: Record<string, unknown>, note: string) => {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        const response = await fetch('/api/items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            code: item.code,
            barcode: item.barcode,
            name: item.name,
            category: item.category,
            price: item.price,
            ...patch,
          }),
        })
        const text = await response.text()
        const result = text ? JSON.parse(text) : {}
        if (!response.ok) {
          setError(result.error ?? 'Could not save that change.')
          return false
        }
        setMessage(note)
        refresh()
        return true
      } catch {
        setError('Could not reach the server. Please try again.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  const startEdit = (item: Item) => {
    setEditing(item)
    setDraft({
      storePrice: item.storePrice ?? '',
      description: item.description ?? '',
      collection: item.collection ?? '',
      badge: item.badge ?? '',
      featured: String(item.featured ?? 0),
    })
    setMessage('')
    setError('')
  }

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return
    const ok = await save(
      editing,
      {
        storePrice: draft.storePrice === '' ? null : Number(draft.storePrice),
        description: draft.description,
        collection: draft.collection,
        badge: draft.badge,
        featured: Number(draft.featured) || 0,
      },
      `${editing.name} updated on the website.`,
    )
    if (ok) setEditing(null)
  }

  const storeUrl = typeof window === 'undefined' ? '/' : `${window.location.origin}/`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(storeUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setError('Could not copy the link. Select the address in your browser bar instead.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHero
        eyebrow="Online presence"
        title="Your online store"
        description="Choose what the public sees, set the website price, and group pieces into collections such as One-Gram Gold, Panchaloha, and Silver. Nothing is visible until you publish it."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={copyLink} className="flex items-center gap-1.5 rounded-xl border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur transition hover:bg-white/20">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Link copied' : 'Copy store link'}
            </button>
            <Link
              href="/"
              target="_blank"
              className="flex items-center gap-1.5 rounded-xl border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur transition hover:bg-white/20"
            >
              <ExternalLink className="size-3.5" /> Open website
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard icon={Eye} label="Live on the website" value={String(published.length)} hint="Visible to customers" tone="gold" loading={loading} />
        <StatCard icon={EyeOff} label="Not published" value={String(items.length - published.length)} hint="Private to the billing desk" loading={loading} />
        <StatCard icon={Sparkles} label="Collections" value={String(collections.length)} hint="Shelves on the website" loading={loading} />
        <StatCard
          icon={Gem}
          label="Website value"
          amount={published.reduce((sum, item) => sum + Number(item.storePrice ?? item.price), 0)}
          hint="Sum of website prices"
          loading={loading}
        />
      </section>

      {collections.length > 0 && (
        <Card>
          <SectionHeading
            title="Collections on your website"
            description="A collection is just the group you type on each item. Customers browse by these, so keep the names customer-friendly."
          />
          <div className="flex flex-wrap gap-2">
            {collections.map(([name, count]) => (
              <span key={name} className="inline-flex items-center gap-2 rounded-full border-hairline bg-secondary px-3.5 py-2 text-xs font-medium">
                {name}
                <span className="tnum rounded-full bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">{count}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="business-primary-card">
        <SectionHeading
          title="Publish and price your pieces"
          description="Turn a piece on to put it on the website. The website price is optional — leave it blank and the reference price is used."
        />

        <div className="mb-5 flex-wrap items-end gap-3">
          <label className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter by name, code, category or collection" className="!pl-9" />
          </label>
          <Select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} className="!w-44">
            <option value="all">All items ({items.length})</option>
            <option value="live">Live only ({published.length})</option>
            <option value="hidden">Not published ({items.length - published.length})</option>
          </Select>
        </div>

        <div className="flex-col gap-3">
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="flex flex-col gap-3" role="status" aria-label="Loading catalogue">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-2xl bg-secondary/60" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Gem}
              title="Your catalogue is empty"
              description="Add pieces in the Items section first — then come back here to put them on the website."
            />
          ) : visible.length === 0 ? (
            <EmptyState icon={Search} title="No items match" description="Try a different filter or switch back to all items." />
          ) : (
            <ul className="stagger flex-col gap-3">
              {visible.map((item) => {
                const websitePrice = Number(item.storePrice ?? item.price)
                const overridden = item.storePrice !== null

                return (
                  <li key={item.id} className={`business-list-row rounded-2xl p-4 ${item.published ? '' : 'opacity-80'}`}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border-hairline bg-secondary">
                        {item.image ? (
                          <img src={`/api/items/image?id=${item.id}&v=${encodeURIComponent(item.imageVersion)}`} alt="" className="size-12 object-cover" />
                        ) : (
                          <Gem className="size-4 text-muted-foreground" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tnum text-xs font-semibold">#{item.code}</span>
                          <Badge tone={item.published ? 'success' : 'neutral'}>{item.published ? 'LIVE' : 'HIDDEN'}</Badge>
                          {item.badge && <Badge tone="gold">{item.badge}</Badge>}
                          {item.featured > 0 && <Badge tone="neutral">Shelf {item.featured}</Badge>}
                        </div>
                        <p className="mt-1.5 truncate text-sm font-medium">{item.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {item.collection?.trim() || item.category}
                          {item.description ? ` · ${item.description}` : ''}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="tnum text-sm font-semibold">{money(websitePrice)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {overridden ? `Website price · ${money(Number(item.price))} in shop` : 'Using reference price'}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                          onClick={() =>
                            void save(
                              item,
                              { published: !item.published },
                              item.published ? `${item.name} is now hidden from the website.` : `${item.name} is now live on your website.`,
                            )
                          }
                          disabled={busy}
                          className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-60 ${item.published ? 'border-hairline bg-card hover:bg-secondary' : 'bg-gold text-slate-950 hover:opacity-92'
                            }`}
                        >
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : item.published ? <EyeOff className="size-3.5" /> : <Upload className="size-3.5" />}
                          {item.published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          onClick={() => startEdit(item)}
                          className="flex h-9 items-center gap-1.5 rounded-xl border-hairline bg-card px-3 text-xs transition hover:bg-secondary"
                        >
                          <Pencil className="size-3.5" /> Website details
                        </button>
                      </div>
                    </div>

                    {editing?.id === item.id && (
                      <form onSubmit={saveDraft} className="animate-rise-in mt-4 grid gap-4 rounded-2xl border-hairline bg-secondary/60 p-5 sm:grid-cols-2">
                        <Field label="Website price" hint={`Leave blank to use ${money(Number(item.price))}`}>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.storePrice}
                            onChange={(event) => setDraft({ ...draft, storePrice: event.target.value })}
                            placeholder={item.price}
                          />
                        </Field>
                        <Field label="Collection" hint="The shelf customers browse — e.g. One-Gram Gold, Panchaloha, Silver">
                          <Input
                            value={draft.collection}
                            onChange={(event) => setDraft({ ...draft, collection: event.target.value })}
                            placeholder="e.g. One-Gram Gold"
                          />
                        </Field>
                        <Field label="Badge" hint="Optional short tag shown on the card — e.g. New, Limited">
                          <Input value={draft.badge} onChange={(event) => setDraft({ ...draft, badge: event.target.value })} placeholder="e.g. New" />
                        </Field>
                        <Field label="Shelf order" hint="Lower numbers appear first on the website">
                          <Input
                            type="number"
                            value={draft.featured}
                            onChange={(event) => setDraft({ ...draft, featured: event.target.value })}
                            placeholder="0"
                          />
                        </Field>
                        <div className="sm:col-span-2">
                          <Field label="Description" hint="One or two honest lines. Customers read this before they call.">
                            <textarea
                              value={draft.description}
                              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                              rows={3}
                              maxLength={600}
                              placeholder="e.g. One-gram gold-look chain with antique finish — ideal for daily wear."
                              className="w-full rounded-xl border-hairline bg-card/90 px-3 py-2.5 text-sm transition"
                            />
                          </Field>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          <Button type="submit" variant="gold" disabled={busy}>
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                            Save website details
                          </Button>
                          <Button variant="outline" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Store className="size-3.5" /> Changes appear on the website within a minute.
                          </p>
                        </div>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}

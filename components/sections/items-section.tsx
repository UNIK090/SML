'use client'

// Items section: the catalogue itself — add, edit, delete, and search.
//
// Kept separate from Billing so the catalogue can be maintained without the
// invoice form competing for space.

import { useCallback, useMemo, useState } from 'react'
import { Gem, ImagePlus, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Button, Card, EmptyState, Field, Input, Notice, SectionHeading, Skeleton, StatCard, WorkspaceHero, money } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import type { Item } from '@/lib/types'

type Draft = { code: string; barcode: string; name: string; category: string; price: string }
const EMPTY: Draft = { code: '', barcode: '', name: '', category: '', price: '' }

export default function ItemsSection({ items, loading, refresh }: { items: Item[]; loading: boolean; refresh: () => void }) {
  const { t } = usePreferences()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editing, setEditing] = useState<Item | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  // Client-side filter so the catalogue stays instantly responsive while typing.
  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return items
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term) ||
        String(item.code).includes(term),
    )
  }, [items, filter])

  const categories = useMemo(() => new Set(items.map((item) => item.category)).size, [items])
  const catalogueValue = useMemo(() => items.reduce((sum, item) => sum + Number(item.price), 0), [items])

  const startCreate = () => {
    setEditing(null)
    setDraft(EMPTY)
    setFormOpen(true)
    setPendingImage(null)
    setMessage('')
    setError('')
  }

  const startEdit = useCallback((item: Item) => {
    setEditing(item)
    setDraft({ code: String(item.code), barcode: item.barcode ?? '', name: item.name, category: item.category, price: item.price })
    setFormOpen(true)
    setPendingImage(null)
    setMessage('')
    setError('')
  }, [])

  const cancel = () => {
    setEditing(null)
    setDraft(EMPTY)
    setFormOpen(false)
    setPendingImage(null)
  }

  const imageUrl = (item: Item) => `/api/items/image?id=${item.id}&v=${encodeURIComponent(item.imageVersion)}`

  const removeImage = async (item: Item) => {
    if (!window.confirm(`Remove the product image for ${item.name}?`)) return
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/items/image?id=${item.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? 'Could not remove the image.')
      }
      setMessage(`Image removed from ${item.name}.`)
      refresh()
    } catch (e) {
      setError((e as Error).message ?? 'Could not remove the image.')
    }
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const file = pendingImage
      const payload = editing
        ? { ...draft, id: editing.id, code: Number(draft.code), price: Number(draft.price) }
        : { ...draft, code: Number(draft.code), price: Number(draft.price) }
      const response = await fetch('/api/items', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) {
        setError(result.error ?? 'Could not save the item.')
        return
      }
      let imageMessage = ''
      const freshId = result.id as number
      if (file) {
        setUploadingImage(true)
        const form = new FormData()
        form.set('image', file)
        const ir = await fetch(`/api/items/image?id=${freshId}`, { method: 'POST', body: form })
        setUploadingImage(false)
        if (!ir.ok) {
          const ires = (await ir.json()) as { error?: string }
          setError(`${result.name ?? draft.name} saved, but ${file.name} could not be uploaded: ${ires.error ?? 'unknown error'}`)
        } else {
          imageMessage = ` with image`
        }
      }
      setMessage(
        `${result.name ?? draft.name} ${editing ? 'updated' : 'added to the catalogue'}${imageMessage}.`,
      )
      cancel()
      refresh()
    } catch (e) {
      const detail = e instanceof Error ? e.message : ''
      setError(detail ? `Could not save the item: ${detail}` : 'Could not save the item.')
    } finally {
      setSaving(false)
      setUploadingImage(false)
    }
  }

  const remove = async (item: Item) => {
    if (!window.confirm(`Delete ${item.name}? Existing invoices keep their saved details.`)) return
    setMessage('')
    setError('')
    try {
      const response = await fetch(`/api/items?id=${item.id}`, { method: 'DELETE' })
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) {
        setError(result.error ?? 'Could not delete the item.')
        return
      }
      setMessage(`${item.name} removed from the catalogue.`)
      refresh()
    } catch {
      setError('Could not delete the item.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHero
        eyebrow="Catalogue management"
        title="Inventory control centre"
        description="Keep product data precise, prices current, and your sales desk ready for the next customer."
        action={<span className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur">{items.length} active items</span>}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Gem} label={t('items.count')} value={String(items.length)} hint={t('items.count.hint')} tone="gold" loading={loading} />
        <StatCard icon={Gem} label={t('items.categories')} value={String(categories)} hint={t('items.categories.hint')} loading={loading} />
        <StatCard icon={Gem} label={t('items.value')} amount={catalogueValue} hint={t('items.value.hint')} loading={loading} />
      </section>

      <Card className="business-primary-card">
        <SectionHeading
          title={t('items.title')}
          description={t('items.hint')}
          action={
            <Button onClick={startCreate} variant={formOpen ? 'outline' : 'gold'}>
              {formOpen ? <X className="size-4" /> : <Plus className="size-4" />}
              {formOpen ? t('items.closeForm') : t('items.add')}
            </Button>
          }
        />

        {formOpen && (
          <form onSubmit={save} className="mb-6 grid gap-4 rounded-2xl border-hairline bg-secondary/70 p-5 sm:grid-cols-2">
            <Field label={t('items.code')} hint={t('items.code.hint')}>
              <Input required value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="e.g. 101" inputMode="numeric" />
            </Field>
            <Field label={t('items.name')}>
              <Input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Gold chain" />
            </Field>
            <Field label="Barcode" hint="Optional · scanned at billing">
              <Input value={draft.barcode} onChange={(event) => setDraft({ ...draft, barcode: event.target.value })} placeholder="e.g. 8901234567890" inputMode="numeric" autoComplete="off" />
            </Field>
            <Field label={t('items.category')}>
              <Input required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="e.g. GOLD" />
            </Field>
            <Field label={t('items.price')}>
              <Input required type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="0.00" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Product image" hint="Optional · PNG, JPG, GIF, or WebP · max 700 KB">
                <div className="space-y-3 rounded-xl border border-dashed border-gold/55 bg-gold-soft/35 p-3">
                  {editing && editing.image && (
                    <div className="flex items-center gap-3">
                      <div className="relative overflow-hidden rounded-xl border-hairline bg-card" style={{ width: '5.25rem', height: '5.25rem' }}>
                        <img
                          src={imageUrl(editing)}
                          alt="Current product image"
                          className="size-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(editing)}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-destructive/95 px-3 text-xs font-semibold text-white shadow hover:bg-destructive"
                      >
                        <Trash2 className="size-3.5" /> Remove current image
                      </button>
                    </div>
                  )}

                  {pendingImage && (
                    <div className="flex items-center gap-3">
                      <div className="relative overflow-hidden rounded-xl border-hairline bg-card" style={{ width: '5.25rem', height: '5.25rem' }}>
                        {pendingImage.type.startsWith('image/') ? (
                          <img src={URL.createObjectURL(pendingImage)} alt="Pending upload" className="size-full object-cover" />
                        ) : (
                          <span className="flex size-full items-center justify-center text-gold-deep">
                            <ImagePlus className="size-5" />
                          </span>
                        )}
                        {uploadingImage && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                            <Loader2 className="size-4 animate-spin" />
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium">{pendingImage.name}</span>
                        <button
                          type="button"
                          onClick={() => setPendingImage(null)}
                          disabled={uploadingImage}
                          className="flex h-8 w-fit items-center gap-1.5 rounded-lg bg-destructive/95 px-2.5 text-[11px] font-semibold text-white shadow hover:bg-destructive disabled:opacity-40"
                        >
                          <X className="size-3" /> Remove
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-card px-3 text-xs font-semibold shadow-sm transition hover:bg-white dark:hover:bg-secondary">
                      <ImagePlus className="size-3.5 text-gold-deep" />
                      {pendingImage ? 'Replace image' : 'Choose image'}
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        onChange={(event) => setPendingImage(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    <span className="max-w-full truncate text-xs text-muted-foreground">
                      {pendingImage ? `${pendingImage.name} · saved on form submit` : (editing?.image ? 'Current image kept · pick a file to replace' : 'No image chosen yet')}
                    </span>
                  </div>
                </div>
              </Field>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" variant="gold" disabled={saving}>
                {saving ? t('common.saving') : editing ? t('items.update') : t('items.save')}
              </Button>
              <Button variant="outline" onClick={cancel}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        )}

        <div className="catalogue-search relative mb-6 max-w-2xl">
          <Search className="pointer-events-none absolute top-4.5 left-4 size-5 text-gold-deep" />
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('items.filterPlaceholder')} className="!h-14 !border-2 !border-gold/70 !bg-card !pl-12 text-base font-medium placeholder:font-normal" />
          <span className="pointer-events-none absolute top-4.5 right-4 hidden rounded-md bg-gold-soft px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gold-deep uppercase sm:block">Quick search</span>
        </div>

        <div className="flex-col gap-3">
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>

        <div className="mt-5">
          {loading ? (
            // Skeleton cards keep the layout stable while the catalogue loads.
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="business-list-row rounded-2xl p-4">
                  <Skeleton className="mb-3 h-5 w-16" />
                  <Skeleton className="mb-2 h-4 w-32" />
                  <Skeleton className="mb-4 h-3 w-20" />
                  <div className="flex gap-2">
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="h-9 w-10" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={Gem} title={t('items.empty')} description={t('items.empty.hint')} />
          ) : visible.length === 0 ? (
            <EmptyState icon={Search} title={t('items.noMatch')} description={t('items.noMatch.hint')} />
          ) : (
            <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => (
                <div key={item.id} className="business-list-row flex flex-col justify-between rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border-hairline bg-secondary">
                      {item.image ? (
                        <img src={imageUrl(item)} alt="" className="size-14 object-cover" />
                      ) : (
                        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-gold-deep"><Gem className="size-5" /></span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <span className="inline-flex items-center rounded-lg bg-secondary px-2 py-0.5 text-xs font-semibold">Code {item.code}</span>
                      <p className="mt-2 truncate font-medium">{item.name}</p>
                      <p className="text-xs tracking-wide text-muted-foreground uppercase">{item.category}</p>
                    </div>
                    <p className="tnum ml-auto shrink-0 text-sm font-semibold">{money(Number(item.price))}</p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" onClick={() => startEdit(item)} className="!h-9 flex-1 !px-3 text-xs">
                      <Pencil className="size-3.5" /> {t('common.edit')}
                    </Button>
                    <Button variant="danger" onClick={() => remove(item)} className="!h-9 !px-3 text-xs">
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Delete {item.name}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

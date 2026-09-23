'use client'

// Items section: the catalogue itself — add, edit, delete, and search.
//
// Kept separate from Billing so the catalogue can be maintained without the
// invoice form competing for space.

import { useCallback, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Gem, ImagePlus, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Button, Card, EmptyState, Field, Input, Notice, SectionHeading, Skeleton, StatCard, WorkspaceHero, money } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import type { Item, ItemImage } from '@/lib/types'

type Draft = { code: string; barcode: string; name: string; category: string; price: string }
const EMPTY: Draft = { code: '', barcode: '', name: '', category: '', price: '' }

type GalleryState = {
  /** Ordered list of image ids in the current display order. "primary" = the legacy first image. */
  order: Array<'primary' | number>
  /** Server metadata per image, keyed by the same ids used in `order`. */
  meta: Map<'primary' | number, { byteSize: number; mimeType: string; version: string }>
  /** Local files staged for upload, appended at end. */
  pending: File[]
  /** Images currently being uploaded (pending index → true). */
  uploading: Map<number, boolean>
}

const EMPTY_GALLERY: GalleryState = { order: [], meta: new Map(), pending: [], uploading: new Map() }

export default function ItemsSection({ items, loading, refresh }: { items: Item[]; loading: boolean; refresh: () => void }) {
  const { t } = usePreferences()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editing, setEditing] = useState<Item | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [gallery, setGallery] = useState<GalleryState>(EMPTY_GALLERY)

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
    setGallery(EMPTY_GALLERY)
    setMessage('')
    setError('')
  }

  const startEdit = useCallback(async (item: Item) => {
    setEditing(item)
    setDraft({ code: String(item.code), barcode: item.barcode ?? '', name: item.name, category: item.category, price: item.price })
    setFormOpen(true)
    setMessage('')
    setError('')
    // Fetch the existing gallery so the editor can reorder and remove.
    setGallery(EMPTY_GALLERY)
    try {
      const res = await fetch(`/api/items/image?id=${item.id}&action=list`)
      if (!res.ok) return
      const data = (await res.json()) as { images: Array<Omit<ItemImage, 'displayOrder'> & { id: ItemImage['id'] | 'primary' }> }
      const next: GalleryState = { order: [], meta: new Map(), pending: [], uploading: new Map() }
      for (const img of data.images) {
        next.order.push(img.id as 'primary' | number)
        next.meta.set(img.id as 'primary' | number, { byteSize: img.byteSize, mimeType: img.mimeType, version: img.version })
      }
      setGallery(next)
    } catch {
      /* ignore; fallback shows only the primary image thumbnail */
    }
  }, [])

  const cancel = () => {
    setEditing(null)
    setDraft(EMPTY)
    setFormOpen(false)
    setGallery(EMPTY_GALLERY)
  }

  const imageUrl = (item: Item, index = 0) => `/api/items/image?id=${item.id}&v=${encodeURIComponent(item.imageVersion)}&index=${index}`

  const removeExistingImage = async (item: Item, imageId: 'primary' | number) => {
    const label = imageId === 'primary' ? 'primary image' : 'image'
    if (!window.confirm(`Remove this ${label} for ${item.name}?`)) return
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/items/image?id=${item.id}&imageId=${String(imageId)}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? 'Could not remove the image.')
      }
      setGallery((g) => ({
        ...g,
        order: g.order.filter((id) => id !== imageId),
        meta: (() => {
          const m = new Map(g.meta)
          m.delete(imageId)
          return m
        })(),
      }))
      setMessage(`${label[0].toUpperCase()}${label.slice(1)} removed from ${item.name}.`)
      refresh()
    } catch (e) {
      setError((e as Error).message ?? 'Could not remove the image.')
    }
  }

  const reorderGallery = async (item: Item, from: number, delta: number) => {
    const to = from + delta
    if (to < 0 || to >= gallery.order.length) return
    const primaryOnly = gallery.order[from] === 'primary' || gallery.order[to] === 'primary'
    // Position 0 is always the primary; only allow reordering among gallery rows (ids that are numbers).
    const nextOrder = [...gallery.order]
    ;[nextOrder[from], nextOrder[to]] = [nextOrder[to], nextOrder[from]]
    // Ensure "primary" stays in position 0 after the swap — only gallery numeric ids get reordered.
    if (primaryOnly && nextOrder[0] !== 'primary') {
      // Put primary back at head.
      const withPrimary: Array<'primary' | number> = nextOrder.filter((id): id is 'primary' => id === 'primary')
      const rest: Array<'primary' | number> = nextOrder.filter((id): id is number => id !== 'primary')
      const combined = withPrimary.concat(rest)
      nextOrder.splice(0, nextOrder.length, ...combined)
    }
    setGallery((g) => ({ ...g, order: nextOrder }))

    // The server side only stores display_order on numeric gallery rows (not
    // the legacy primary). The primary is always position 0. So the array we
    // send is the numeric ids in the order they should appear *after* primary.
    const galleryIds = nextOrder.filter((id): id is number => typeof id === 'number')
    if (galleryIds.length === 0) return
    try {
      const res = await fetch(`/api/items/image?id=${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: galleryIds }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? 'Could not reorder images.')
      }
      refresh()
    } catch (e) {
      setError((e as Error).message ?? 'Could not reorder images.')
    }
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const pendingFiles = [...gallery.pending]
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
      // Upload pending gallery images one by one.
      const uploadedNames: string[] = []
      const freshId = result.id as number
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i]
        setGallery((g) => {
          const uploading = new Map(g.uploading)
          uploading.set(i, true)
          return { ...g, uploading }
        })
        const form = new FormData()
        form.set('image', file)
        // Index 0 primary is uploaded via setPrimary=1; remaining go to the gallery endpoint.
        const isPrimary = !editing && i === 0 && !result.image && gallery.order.length === 0
        const ir = await fetch(`/api/items/image?id=${freshId}${isPrimary ? '&setPrimary=1' : ''}`, { method: 'POST', body: form })
        setGallery((g) => {
          const uploading = new Map(g.uploading)
          uploading.delete(i)
          return { ...g, uploading }
        })
        if (!ir.ok) {
          const ires = (await ir.json()) as { error?: string }
          setError(`${result.name ?? draft.name} saved, but ${file.name} could not be uploaded: ${ires.error ?? 'unknown error'}`)
          break
        }
        uploadedNames.push(file.name)
      }
      setMessage(
        `${result.name ?? draft.name} ${editing ? 'updated' : 'added to the catalogue'}${
          uploadedNames.length > 0 ? ` with ${uploadedNames.length} image${uploadedNames.length === 1 ? '' : 's'}` : ''
        }.`,
      )
      cancel()
      refresh()
    } catch (e) {
      const detail = e instanceof Error ? e.message : ''
      setError(detail ? `Could not save the item: ${detail}` : 'Could not save the item.')
    } finally {
      setSaving(false)
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

  const onAddPendingFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setGallery((g) => ({ ...g, pending: [...g.pending, ...Array.from(fileList)] }))
  }

  const removePending = (idx: number) => {
    setGallery((g) => ({ ...g, pending: g.pending.filter((_, i) => i !== idx) }))
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
              <Field label="Product images" hint="Optional · PNG, JPG, GIF, or WebP · max 700 KB each · drag several at once">
                <div className="space-y-3 rounded-xl border border-dashed border-gold/55 bg-gold-soft/35 p-3">
                  {/* Existing / server gallery with reorder + delete controls */}
                  {editing && gallery.order.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {gallery.order.map((id, pos) => {
                        const meta = gallery.meta.get(id)
                        const primary = id === 'primary'
                        return (
                          <li key={String(id)} className="group relative overflow-hidden rounded-xl border-hairline bg-card" style={{ width: '5.25rem', height: '5.25rem' }}>
                            <img
                              src={imageUrl(editing, pos)}
                              alt={primary ? 'Primary product image' : `Gallery image ${pos}`}
                              className="size-full object-cover"
                            />
                            <span className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${primary ? 'bg-gold-deep text-white' : 'bg-black/55 text-white'}`}>
                              {primary ? 'Hero' : `#${pos}`}
                            </span>
                            <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                              <button
                                type="button"
                                onClick={() => reorderGallery(editing, pos, -1)}
                                disabled={pos === 0}
                                className="flex size-6 items-center justify-center rounded-md bg-white/90 text-slate-900 shadow hover:bg-white disabled:opacity-40"
                                aria-label="Move image earlier"
                              >
                                <ArrowUp className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeExistingImage(editing, id)}
                                className="flex size-6 items-center justify-center rounded-md bg-destructive/95 text-white shadow hover:bg-destructive"
                                aria-label={`Remove ${primary ? 'primary' : ''} image`}
                              >
                                <Trash2 className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => reorderGallery(editing, pos, +1)}
                                disabled={pos === gallery.order.length - 1}
                                className="flex size-6 items-center justify-center rounded-md bg-white/90 text-slate-900 shadow hover:bg-white disabled:opacity-40"
                                aria-label="Move image later"
                              >
                                <ArrowDown className="size-3" />
                              </button>
                            </div>
                            {meta && (
                              <span className="sr-only">{meta.mimeType} · {meta.byteSize} bytes</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {/* Pending local files before save */}
                  {gallery.pending.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {gallery.pending.map((file, idx) => {
                        const uploading = gallery.uploading.get(idx)
                        return (
                          <li key={idx} className="group relative overflow-hidden rounded-xl border-hairline bg-card" style={{ width: '5.25rem', height: '5.25rem' }}>
                            {file.type.startsWith('image/') ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={URL.createObjectURL(file)} alt={`Pending upload ${idx + 1}`} className="size-full object-cover" />
                            ) : (
                              <span className="flex size-full items-center justify-center text-gold-deep">
                                <ImagePlus className="size-5" />
                              </span>
                            )}
                            <span className="absolute left-1 top-1 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">New</span>
                            {uploading && (
                              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                                <Loader2 className="size-4 animate-spin" />
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => removePending(idx)}
                              disabled={uploading}
                              className="absolute right-1 bottom-1 flex size-6 items-center justify-center rounded-md bg-destructive/95 text-white shadow hover:bg-destructive disabled:opacity-40"
                              aria-label="Remove pending file"
                            >
                              <X className="size-3" />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-card px-3 text-xs font-semibold shadow-sm transition hover:bg-white dark:hover:bg-secondary">
                      <ImagePlus className="size-3.5 text-gold-deep" />
                      {gallery.order.length + gallery.pending.length === 0 ? 'Choose images' : 'Add more images'}
                      <input
                        className="sr-only"
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        onChange={(event) => onAddPendingFiles(event.target.files)}
                      />
                    </label>
                    <span className="max-w-full truncate text-xs text-muted-foreground">
                      {gallery.pending.length > 0
                        ? `${gallery.pending.length} new file${gallery.pending.length === 1 ? '' : 's'} ready · saved on form submit`
                        : `${gallery.order.length} image${gallery.order.length === 1 ? '' : 's'} · ${gallery.pending.length} pending`}
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
                        <img src={imageUrl(item, 0)} alt="" className="size-14 object-cover" />
                      ) : (
                        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-gold-deep"><Gem className="size-5" /></span>
                      )}
                      {item.imageCount > 1 && (
                        <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border border-white bg-gold-deep text-[9px] font-bold text-white shadow">
                          {item.imageCount}
                        </span>
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

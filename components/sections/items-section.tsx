'use client'

// Items section: the catalogue itself — add, edit, delete, and search.
//
// Kept separate from Billing so the catalogue can be maintained without the
// invoice form competing for space.

import { useMemo, useState } from 'react'
import { Gem, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Button, Card, EmptyState, Field, Input, Notice, SectionHeading, Skeleton, StatCard, money } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import type { Item } from '@/lib/types'

type Draft = { code: string; name: string; category: string; price: string }
const EMPTY: Draft = { code: '', name: '', category: '', price: '' }

export default function ItemsSection({ items, loading, refresh }: { items: Item[]; loading: boolean; refresh: () => void }) {
  const { t } = usePreferences()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editing, setEditing] = useState<Item | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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
    setMessage('')
    setError('')
  }

  const startEdit = (item: Item) => {
    setEditing(item)
    setDraft({ code: String(item.code), name: item.name, category: item.category, price: item.price })
    setFormOpen(true)
    setMessage('')
    setError('')
  }

  const cancel = () => {
    setEditing(null)
    setDraft(EMPTY)
    setFormOpen(false)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
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
      setMessage(`${result.name ?? draft.name} ${editing ? 'updated' : 'added to the catalogue'}.`)
      cancel()
      refresh()
    } catch {
      setError('Could not save the item.')
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

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Gem} label={t('items.count')} value={String(items.length)} hint={t('items.count.hint')} tone="gold" loading={loading} />
        <StatCard icon={Gem} label={t('items.categories')} value={String(categories)} hint={t('items.categories.hint')} loading={loading} />
        <StatCard icon={Gem} label={t('items.value')} amount={catalogueValue} hint={t('items.value.hint')} loading={loading} />
      </section>

      <Card>
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
          <form onSubmit={save} className="mb-6 grid gap-4 rounded-2xl bg-secondary/60 p-5 sm:grid-cols-2">
            <Field label={t('items.code')} hint={t('items.code.hint')}>
              <Input required value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="e.g. 101" inputMode="numeric" />
            </Field>
            <Field label={t('items.name')}>
              <Input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Gold chain" />
            </Field>
            <Field label={t('items.category')}>
              <Input required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="e.g. GOLD" />
            </Field>
            <Field label={t('items.price')}>
              <Input required type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="0.00" />
            </Field>
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

        <div className="relative mb-5 max-w-md">
          <Search className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-muted-foreground" />
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('items.filterPlaceholder')} className="pl-10" />
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
                <div key={index} className="rounded-2xl border-hairline bg-background/60 p-4">
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
                <div key={item.id} className="flex flex-col justify-between rounded-2xl border-hairline bg-background/60 p-4 transition hover:bg-gold-soft/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="inline-flex items-center rounded-lg bg-secondary px-2 py-0.5 text-xs font-semibold">Code {item.code}</span>
                      <p className="mt-2 truncate font-medium">{item.name}</p>
                      <p className="text-xs tracking-wide text-muted-foreground uppercase">{item.category}</p>
                    </div>
                    <p className="tnum shrink-0 text-sm font-semibold">{money(Number(item.price))}</p>
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

'use client'

// ===========================================================================
// The photo gallery manager on the Catalogue screen.
//
// One product used to hold one photo. A piece of jewellery is judged from
// several angles, so the shop can now keep a set: the cover photo, plus extra
// shots the customer can page through on the product page.
//
// Design decisions worth naming:
//
//   * The cover photo is edited by the existing uploader above, not here. This
//     panel only manages the extra shots, so there is exactly one way to change
//     the cover and no confusion about which control wins.
//
//   * Every action saves immediately. The shopkeeper is looking at real photos
//     and needs to know each one landed; a "save" button they might forget
//     would leave photos uploaded but not attached.
//
//   * Uploads run one file at a time, in order. Firing eight parallel uploads
//     at a phone would queue behind each other anyway and could land out of
//     order, so positions are assigned deliberately.
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2, TriangleAlert } from 'lucide-react'

type GalleryImage = { id: number; byteSize: number }

export default function ImageGalleryManager({
  itemId,
  itemName,
  hasCover,
}: {
  /** Database id of the catalogue item. Images cannot be attached before save. */
  itemId: number
  itemName: string
  /** False when the item has no cover photo yet. */
  hasCover: boolean
}) {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [version, setVersion] = useState('')
  const [limit, setLimit] = useState(8)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/items/images?id=${itemId}`)
      const body = (await response.json()) as { images?: GalleryImage[]; version?: string; limit?: number; error?: string }
      if (!response.ok) {
        setError(body.error ?? 'Could not load the photos.')
        return
      }
      setImages(body.images ?? [])
      setVersion(body.version ?? '')
      setLimit(body.limit ?? 8)
    } catch {
      setError('Could not load the photos.')
    } finally {
      setLoading(false)
    }
  }, [itemId])

  useEffect(() => {
    void load()
  }, [load])

  const src = (image: GalleryImage) => `/api/items/images/file?item=${itemId}&id=${image.id}&v=${encodeURIComponent(version)}`

  /**
   * Uploads the chosen files in order.
   *
   * Each one is sent on its own so a failure halfway through keeps the photos
   * that already succeeded, and the shopkeeper is told exactly how far it got.
   */
  const upload = async (files: FileList) => {
    const chosen = Array.from(files)
    if (chosen.length === 0) return

    const room = limit - images.length
    if (room <= 0) {
      setError(`This item already has the maximum of ${limit} extra photos.`)
      return
    }

    setError('')
    setNotice('')
    setBusy(true)

    let added = 0
    let failure = ''
    for (const file of chosen.slice(0, room)) {
      setUploading(added + 1)
      try {
        const form = new FormData()
        form.set('image', file)
        const response = await fetch(`/api/items/images?id=${itemId}`, { method: 'POST', body: form })
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string }
          failure = body.error ?? `Could not upload ${file.name}.`
          break
        }
        added += 1
      } catch {
        failure = `Could not upload ${file.name}. Check the connection and try again.`
        break
      }
    }

    setUploading(0)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
    await load()

    if (failure) {
      setError(added > 0 ? `${added} of ${chosen.length} added. ${failure}` : failure)
    } else if (added > 0) {
      setNotice(added === 1 ? 'Photo added.' : `${added} photos added.`)
    }
  }

  const remove = async (image: GalleryImage) => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const response = await fetch(`/api/items/images?id=${image.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Could not remove the photo.')
        return
      }
      setNotice('Photo removed.')
      await load()
    } catch {
      setError('Could not remove the photo.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Moves a photo one place left or right.
   *
   * The whole order is sent rather than a swap, so what the shopkeeper sees
   * after the move is exactly what gets stored.
   */
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= images.length) return

    const next = [...images]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setImages(next)

    setError('')
    try {
      const response = await fetch('/api/items/images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, order: next.map((image) => image.id) }),
      })
      if (!response.ok) {
        setError('Could not save the new order.')
        await load()
        return
      }
      setNotice('Order saved.')
    } catch {
      setError('Could not save the new order.')
      await load()
    }
  }

  const full = images.length >= limit

  return (
    <div className="sm:col-span-2">
      <div className="rounded-xl border border-dashed border-gold/55 bg-gold-soft/35 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-gold-deep uppercase">More photos</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Optional · shown as a gallery on the product page · max {limit}
            </p>
          </div>

          <label className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold shadow-sm transition ${busy || full || loading ? 'cursor-not-allowed bg-card opacity-55' : 'cursor-pointer bg-card hover:bg-white dark:hover:bg-secondary'
            }`}>
            {busy ? <Loader2 className="size-3.5 animate-spin text-gold-deep" /> : <ImagePlus className="size-3.5 text-gold-deep" />}
            {uploading > 0 ? `Uploading ${uploading}…` : 'Add photos'}
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp"
              disabled={busy || full || loading}
              onChange={(event) => {
                if (event.target.files) void upload(event.target.files)
              }}
            />
          </label>
        </div>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading photos…
          </div>
        ) : images.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {hasCover
              ? 'No extra photos yet. Add shots of the clasp, the finish or the piece being worn.'
              : 'Add a cover photo above first — extra photos appear after it in the gallery.'}
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-3">
            {images.map((image, index) => (
              <li key={image.id} className="w-[5.25rem]">
                <div className="relative overflow-hidden rounded-xl border-hairline bg-card" style={{ height: '5.25rem' }}>
                  <img src={src(image)} alt={`Extra photo ${index + 1}`} className="size-full object-cover" />
                  <span className="tnum absolute top-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    {index + 2}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => void move(index, -1)}
                    disabled={busy || index === 0}
                    aria-label={`Move photo ${index + 2} earlier`}
                    className="flex size-6 items-center justify-center rounded-md border-hairline bg-card transition hover:border-gold disabled:opacity-35"
                  >
                    <ArrowLeft className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(image)}
                    disabled={busy}
                    aria-label={`Remove photo ${index + 2}`}
                    className="flex size-6 items-center justify-center rounded-md bg-destructive/95 text-white transition hover:bg-destructive disabled:opacity-35"
                  >
                    <Trash2 className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(index, 1)}
                    disabled={busy || index === images.length - 1}
                    aria-label={`Move photo ${index + 2} later`}
                    className="flex size-6 items-center justify-center rounded-md border-hairline bg-card transition hover:border-gold disabled:opacity-35"
                  >
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {full && <p className="mt-2 text-[11px] text-muted-foreground">Maximum of {limit} extra photos reached.</p>}

        {notice && <p className="mt-2 text-[11px] font-medium text-success">{notice}</p>}

        {error && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-[11px] text-destructive">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" />
            {error}
          </p>
        )}

        <p className="mt-2 text-[11px] text-muted-foreground">
          Order here is the order customers see after the cover photo on {itemName}&rsquo;s page.
        </p>
      </div>
    </div>
  )
}
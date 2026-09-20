'use client'

// Barcode scanner for the billing desk.
//
// Built around an external (USB/Bluetooth) handheld scanner. Those devices act
// as a keyboard that types the barcode and presses Enter in a rapid burst, so
// the fastest, most reliable capture is a GLOBAL keystroke listener rather than
// a field the operator must click first:
//
//   1. Scan anywhere on the page — the burst is caught, looked up, and the line
//      is added to the bill automatically. The operator never touches the mouse.
//   2. The barcode field below still accepts manual typing, and its own onKeyDown
//      handles a scanner that is already focused there.
//
// A camera is offered as an optional fallback for shops without hardware, but it
// is hidden behind a toggle so it never clutters the counter.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, CheckCircle2, ScanBarcode, X } from 'lucide-react'
import { Badge, Button, Input, Notice, money } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import type { Item } from '@/lib/types'

type Found = { item: Item; price: string }

// Minimal shape of the native BarcodeDetector so we can feature-detect it
// without adding a dependency or a global type declaration file.
type DetectedBarcode = { rawValue: string }
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike
// A wedge scanner "types" the digits far faster than a human. Requiring the
// whole code to arrive within this window is what lets a scan be told apart from
// ordinary typing, so normal keyboard use is never hijacked.
const BURST_WINDOW_MS = 80
const MIN_BARCODE_LENGTH = 6
// An item is occasionally scanned twice by mistake; ignore an identical code
// re-scanned inside this window.
const DUPLICATE_WINDOW_MS = 800

export default function BarcodeScanner({ onAdd }: { onAdd: (item: Item, customerPrice: number) => void }) {
  const { t } = usePreferences()
  const [code, setCode] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraSupported, setCameraSupported] = useState(true)
  // Off by default: the counter is built around the handheld scanner.
  const [showCamera, setShowCamera] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  // Tracks the in-flight key burst so a global capture can time itself.
  const burstRef = useRef<{ buffer: string; last: number }>({ buffer: '', last: 0 })
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  // Reused to flash the last added line briefly so the operator sees confirmation.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Look the scanned barcode up in the catalogue. Empty results mean the item
  // is not registered, which is worth telling the operator plainly.
  const lookup = useCallback(
    async (raw: string) => {
      const barcode = raw.trim()
      if (!barcode) return
      // Guard against a double-trigger from the same physical scan.
      const now = Date.now()
      if (lastScanRef.current.code === barcode && now - lastScanRef.current.at < DUPLICATE_WINDOW_MS) return
      lastScanRef.current = { code: barcode, at: now }

      setSearching(true)
      setError('')
      try {
        const response = await fetch(`/api/items?barcode=${encodeURIComponent(barcode)}`)
        const text = await response.text()
        const rows = text ? (JSON.parse(text) as Item[] | { error?: string }) : []
        if (!response.ok) {
          setError((rows as { error?: string }).error ?? t('scan.notFound'))
          return
        }
        const list = rows as Item[]
        if (list.length === 0) {
          setError(t('scan.notFound'))
          return
        }
        // A scanned item lands on the bill immediately at its catalogue price;
        // the customer price stays editable on the bill line afterwards.
        onAdd(list[0], Number(list[0].price))
        setFound({ item: list[0], price: list[0].price })
        setCode('')
        // Clear the confirmation after a beat so the field reads as "ready"
        // again for the next scan.
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setFound(null), 2500)
      } catch {
        setError(t('scan.notFound'))
      } finally {
        setSearching(false)
      }
    },
    [onAdd, t],
  )

  // Global wedge-scanner capture: watch keystrokes across the whole page so a
  // scan works without the operator clicking into a field first. Only a fast
  // burst that ends in Enter (or Tab — some scanners are set to that suffix) is
  // treated as a scan.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === 'Tab') {
        const { buffer } = burstRef.current
        // The whole code must have arrived quickly and be long enough to be a
        // real barcode before it is treated as a scan. When Enter/Tab wins the
        // race, swallow it so it does not also move focus or submit the form.
        if (buffer.length >= MIN_BARCODE_LENGTH) {
          event.preventDefault()
          void lookup(buffer)
        }
        burstRef.current = { buffer: '', last: 0 }
        return
      }
      // Only single characters matter — ignore Shift, arrows, shortcut combos.
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      // Typing into another form field (price, quantity, discount…) is never a
      // scan, so those keystrokes are left alone. The scanner's own field is
      // exempt because the burst buffer below still needs to see its keys.
      const inOwnField = target === inputRef.current
      if (!inOwnField && target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        burstRef.current = { buffer: '', last: 0 }
        return
      }
      const now = Date.now()
      const { buffer, last } = burstRef.current
      const gap = now - last
      // A long pause means the operator is typing normally, not scanning.
      burstRef.current = { buffer: gap > BURST_WINDOW_MS ? event.key : buffer + event.key, last: now }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [lookup])

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraOn(false)
  }, [])


  // Release the camera when the section unmounts so the light never stays on.
  useEffect(() => () => stopCamera(), [stopCamera])

  const startCamera = useCallback(async () => {
    setError('')
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false)
      setError(t('scan.cameraUnsupported'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraOn(true)

      const detector = new Ctor()
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return
        try {
          const results = await detector.detect(videoRef.current)
          if (results.length > 0) {
            const value = results[0].rawValue
            setCode(value)
            stopCamera()
            await lookup(value)
            return
          }
        } catch {
          // A single failed frame is normal while the camera warms up.
        }
        rafRef.current = requestAnimationFrame(() => void tick())
      }
      rafRef.current = requestAnimationFrame(() => void tick())
    } catch {
      setError(t('scan.cameraError'))
      stopCamera()
    }
  }, [lookup, stopCamera, t])

  const reset = () => {
    setCode('')
    setFound(null)
    setError('')
  }

  // Manual entry fallback: type a barcode, then click Add. Used when the
  // handheld scanner is unavailable, or to look an item up before confirming.
  const addFromField = () => {
    const value = code.trim()
    if (!value) return
    void lookup(value)
  }

  return (
    <div className="rounded-2xl border-gold/55 bg-gold-soft/25 p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
            <ScanBarcode className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">{t('scan.title')}</h3>
            <p className="text-xs text-muted-foreground">{t('scan.hint')}</p>
          </div>
        </div>
        {/* Camera is optional; the handheld scanner needs no toggle. */}
        {cameraSupported && !showCamera && (
          <button
            type="button"
            onClick={() => { setShowCamera(true); void startCamera() }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border-hairline bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <Camera className="size-3.5" /> {t('scan.camera')}
          </button>
        )}
      </div>

      <div className="relative">
        <ScanBarcode className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-gold-deep" />
        <Input
          ref={inputRef}
          value={code}
          // A wedge scanner appends Enter, so this handles a scanner focused here
          // as well as a manual Enter;
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addFromField()
            }
          }}
          placeholder={t('scan.placeholder')}
          className="!border-gold/70 !pl-10 !pr-11 font-medium"
          aria-label={t('scan.title')}
          autoComplete="off"
          inputMode="numeric"
        />
        {code && (
          <button
            type="button"
            aria-label={t('common.cancel')}
            onClick={reset}
            className="absolute top-3.5 right-3.5 text-muted-foreground transition hover:text-destructive"
          >
            <X className="size-4" />
          </button>
        )}
        {searching && <span className="absolute top-3.5 right-11 text-xs text-muted-foreground">{t('scan.searching')}</span>}
      </div>

      {showCamera && (
        <div className="mt-3">
          <video ref={videoRef} className={cameraOn ? 'w-full rounded-xl border-hairline bg-black' : 'hidden'} muted playsInline />
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant={cameraOn ? 'danger' : 'outline'}
              onClick={() => (cameraOn ? stopCamera() : void startCamera())}
            >
              {cameraOn ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
              {cameraOn ? t('scan.stop') : t('scan.camera')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { stopCamera(); setShowCamera(false) }}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}

      {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}

      {found && (
        <div className="mt-3 flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border-success/40 bg-success-soft/60 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-success uppercase">
            <CheckCircle2 className="size-4" /> {t('scan.found')}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{found.item.name}</span>
          <span className="text-xs text-muted-foreground">{found.item.category}</span>
          <span className="tnum text-sm font-semibold">{money(Number(found.item.price))}</span>
          <Badge tone="gold">Code {found.item.code}</Badge>
        </div>
      )}
    </div>
  )
}

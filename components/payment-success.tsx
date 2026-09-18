'use client'

// PhonePe-style success dialog: an animated tick that draws itself inside a
// popping ring, with an optional chime.
//
// The sound is synthesised with the Web Audio API rather than shipping an audio
// file — a few hundred bytes of code instead of a binary asset, and it can be
// tuned. Browsers block audio until the user has interacted with the page, so
// failures are swallowed; the animation is the primary feedback.

import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui'

const SOUND_PREF_KEY = 'aurum-success-sound'

/** Plays a short, warm two-note chime. */
function playChime(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const context = new Ctor()
    const now = context.currentTime

    // A rising pair of notes reads as "done" rather than "error".
    const notes = [
      { frequency: 784, start: 0, duration: 0.12 },   // G5
      { frequency: 1046.5, start: 0.09, duration: 0.3 }, // C6
    ]

    for (const note of notes) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = note.frequency

      // Quick attack, exponential decay — a soft bell rather than a beep.
      const startAt = now + note.start
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration)

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + note.duration + 0.02)
    }

    // Release the audio context once the tail has finished.
    window.setTimeout(() => void context.close().catch(() => { }), 900)
  } catch {
    // Audio is a nicety; never let it break the flow.
  }
}

export default function PaymentSuccess({
  open,
  title,
  hint,
  amount,
  onDone,
  onViewInvoice,
}: {
  open: boolean
  title: string
  hint: string
  amount?: string
  onDone: () => void
  onViewInvoice?: () => void
}) {
  const [soundOn, setSoundOn] = useState(true)
  const played = useRef(false)

  // Load the sound preference once.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SOUND_PREF_KEY)
      setSoundOn(stored !== 'off')
    } catch {
      // Ignore storage failures; default to sound on.
    }
  }, [])

  // Play once per open, and let Escape dismiss.
  useEffect(() => {
    if (!open) {
      played.current = false
      return
    }
    if (!played.current) {
      played.current = true
      if (soundOn) playChime()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, soundOn, onDone])

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    try {
      window.localStorage.setItem(SOUND_PREF_KEY, next ? 'on' : 'off')
    } catch {
      // Preference simply will not persist.
    }
    if (next) playChime()
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/45 p-4 backdrop-blur-sm"
      onClick={onDone}
    >
      <div
        className="animate-rise-in card-shadow-lg w-full max-w-sm rounded-3xl bg-card p-8 text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative mx-auto mb-6 flex size-24 items-center justify-center">
          {/* Expanding halo behind the ring. */}
          <span className="animate-ripple absolute inset-0 rounded-full bg-success/25" aria-hidden />
          <span className="animate-ring-pop relative flex size-24 items-center justify-center rounded-full bg-success-soft">
            <svg viewBox="0 0 52 52" className="size-14" aria-hidden>
              <circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="3" className="text-success/25" />
              <path
                d="M15 27.5l7.5 7.5L37 19"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-tick text-success"
              />
            </svg>
          </span>
        </div>

        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>
        {amount && <p className="tnum mt-4 text-3xl font-semibold tracking-tight">{amount}</p>}

        <div className="mt-7 flex-col gap-2">
          {onViewInvoice && (
            <Button variant="outline" onClick={onViewInvoice} className="w-full">
              View invoice
            </Button>
          )}
          <Button variant="gold" onClick={onDone} className="w-full">
            Done
          </Button>
          <button
            onClick={toggleSound}
            className="mx-auto mt-1 flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          >
            {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>
        </div>
      </div>
    </div>
  )
}

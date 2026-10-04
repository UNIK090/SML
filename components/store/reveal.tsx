'use client'

// Scroll choreography for the storefront.
//
// A single scroll loop drives every entrance on the page: elements opt in with a
// `data-reveal` attribute and a `data-reveal-delay`, and this hook adds the
// `.sf-in` class once each has been seen. Doing it this way (instead of one
// wrapper component per block) keeps the markup of the landing page plain
// semantic HTML and costs one observer for the whole page.
//
// Elements are only hidden AFTER this hook mounts, which is the important part:
// on a no-JS or slow-JS load the content is fully visible rather than invisible.
//
// Beyond the one-shot entrances there are two continuous effects, both driven by
// the same rAF loop so the page never runs three scroll listeners at once:
//
//   · parallax — elements marked `data-parallax="<speed>"` drift against the
//     scroll, which gives the page depth without any one element moving far
//     enough to be noticed on its own
//   · progress — a thin bar along the top showing how far through the catalogue
//     the reader is, which on a long page is useful rather than decorative
//
// Everything here is skipped entirely under `prefers-reduced-motion`.

import { useEffect } from 'react'

/** How far a parallax layer travels, in px, at the top and bottom of its pass. */
const PARALLAX_RANGE = 60

export function useRevealOnScroll() {
  useEffect(() => {
    const root = document.documentElement
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced || typeof IntersectionObserver === 'undefined') {
      // Nothing to animate: just make sure nothing is left hidden.
      root.classList.remove('sf-reveal-ready')
      document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('sf-in'))
      return
    }

    // Arm the CSS. Until this class exists, `[data-reveal]` has no opacity rule.
    root.classList.add('sf-reveal-ready')

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const element = entry.target as HTMLElement
          const delay = Number(element.dataset.revealDelay ?? 0)
          // A negative delay is meaningless here, and an enormous one would
          // leave content invisible, so clamp it to something sane.
          element.style.transitionDelay = `${Math.min(Math.max(delay, 0), 900)}ms`
          element.classList.add('sf-in')
          observer.unobserve(element)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )

    // Re-scan on every render of the store: products arrive asynchronously, so
    // newly added cards must be observed as well as the ones present at mount.
    const scan = () => {
      document.querySelectorAll('[data-reveal]:not(.sf-in)').forEach((element) => observer.observe(element))
    }
    scan()
    const timer = window.setInterval(scan, 700)

    // --- Continuous effects -------------------------------------------------
    const parallaxNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'))
    const progressBar = document.querySelector<HTMLElement>('[data-scroll-progress]')

    let queued = false
    /**
     * Reads scroll position once per frame.
     *
     * The work is batched behind a single rAF guard because `scroll` fires far
     * more often than the screen repaints; without it a long catalogue page
     * would recalculate hundreds of positions per frame and stutter on a phone.
     */
    const update = () => {
      queued = false
      const viewportHeight = window.innerHeight

      if (progressBar) {
        const scrollable = document.documentElement.scrollHeight - viewportHeight
        const ratio = scrollable > 0 ? window.scrollY / scrollable : 0
        progressBar.style.transform = `scaleX(${Math.min(Math.max(ratio, 0), 1)})`
      }

      for (const node of parallaxNodes) {
        const rect = node.getBoundingClientRect()
        // Skip anything comfortably off-screen — the common case on a long page.
        if (rect.bottom < -200 || rect.top > viewportHeight + 200) continue
        const speed = Number(node.dataset.parallax ?? 0)
        if (!Number.isFinite(speed) || speed === 0) continue
        // Distance of the element's centre from the viewport centre, normalised
        // to -1..1, so the drift is symmetric as it passes through the screen.
        const centre = rect.top + rect.height / 2
        const offset = (centre - viewportHeight / 2) / viewportHeight
        const shift = Math.max(-1, Math.min(1, offset)) * PARALLAX_RANGE * speed
        node.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0)`
      }
    }

    const onScroll = () => {
      if (queued) return
      queued = true
      window.requestAnimationFrame(update)
    }

    // Run once so the bar and anything already in view are correct at load,
    // rather than animating in on the reader's first nudge of the wheel.
    window.requestAnimationFrame(update)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      window.clearInterval(timer)
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      root.classList.remove('sf-reveal-ready')
    }
  }, [])
}

/**
 * The thin progress line along the top of the storefront.
 *
 * Scaled rather than widened, because animating `width` forces the browser to
 * re-lay-out the bar on every frame while a transform stays on the compositor.
 */
export function ScrollProgress() {
  return <div className="sf-scroll-progress" data-scroll-progress aria-hidden />
}

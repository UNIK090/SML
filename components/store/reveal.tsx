'use client'

// Scroll choreography for the storefront.
//
// A single IntersectionObserver drives every entrance on the page: elements opt
// in with a `data-reveal` attribute and a `data-reveal-delay`, and this hook
// adds the `.sf-in` class once each has been seen. Doing it this way (instead of
// one wrapper component per block) keeps the markup of the landing page plain
// semantic HTML and costs one observer for the whole page.
//
// Elements are only hidden AFTER this hook mounts, which is the important part:
// on a no-JS or slow-JS load the content is fully visible rather than invisible.

import { useEffect } from 'react'

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

    return () => {
      window.clearInterval(timer)
      observer.disconnect()
      root.classList.remove('sf-reveal-ready')
    }
  }, [])
}

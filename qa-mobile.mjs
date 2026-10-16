// Mobile responsiveness QA: on a phone viewport, check each key page for
// horizontal overflow (content wider than the screen = "cut" pages) and that
// the document height is sensible relative to the viewport.
const PAGES = ['/', '/shop', '/collections', '/offers', '/boutique', '/track', '/search', '/orders', '/admin-login', '/pages/about']

export default async function run(page, ui) {
  const results = []
  for (const path of PAGES) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => { })
    await page.waitForTimeout(700)
    const info = await page.evaluate(() => {
      const doc = document.documentElement
      // Find elements whose right edge extends past the viewport width.
      const vw = window.innerWidth
      const offenders = []
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > vw + 1.5) {
          // Ignore elements inside a deliberately horizontally-scrollable container.
          let node = el
          let inScroller = false
          while (node && node !== document.body) {
            const s = getComputedStyle(node)
            if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'clip' || s.overflowX === 'hidden') { inScroller = true; break }
            node = node.parentElement
          }
          if (!inScroller) offenders.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 80), right: Math.round(r.right) })
        }
      })
      return {
        scrollW: doc.scrollWidth,
        clientW: doc.clientWidth,
        scrollH: doc.scrollHeight,
        innerH: window.innerHeight,
        title: document.title,
        offenders: offenders.slice(0, 6),
      }
    })
    results.push({ path, ...info })
  }
  return results
}

// Check horizontal overflow across three device widths — small phone (320),
// phone (390) and tablet (768) — on the key pages. A page whose scrollWidth
// exceeds its clientWidth is "cut" horizontally.
const PAGES = ['/', '/shop', '/boutique', '/offers', '/orders', '/admin-login']
const WIDTHS = [320, 390, 768]

export default async function run(page) {
  const out = []
  for (const width of WIDTHS) {
    for (const path of PAGES) {
      await page.setViewportSize({ width, height: width < 400 ? 640 : 1024 })
      await page.goto(`http://localhost:3000${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { })
      await page.waitForTimeout(500)
      const r = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }))
      out.push({ width, path, ...r, overflow: r.scrollW - r.clientW })
    }
  }
  return out
}

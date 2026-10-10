export default async function run(page, ui) {
  const out = {}

  // Desktop landing page
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  out.desktop = await page.evaluate(() => {
    const row = document.querySelector('.sf-header > div')
    const r = row.getBoundingClientRect()
    const kids = [...row.children].filter((k) => getComputedStyle(k).display !== 'none')
    const rects = kids.map((k) => {
      const b = k.getBoundingClientRect()
      return {
        cls: (k.className || '').toString().slice(0, 40),
        left: Math.round(b.left),
        right: Math.round(b.right),
        top: Math.round(b.top),
        h: Math.round(b.height),
      }
    })
    // Where does the row's content actually start vs the container?
    const cs = getComputedStyle(row)
    return {
      rowLeft: Math.round(r.left),
      rowRight: Math.round(r.right),
      rowWidth: Math.round(r.width),
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      alignItems: cs.alignItems,
      children: rects,
    }
  })
  await page.locator('.sf-header').screenshot({ path: '/tmp/align-desktop.png' })

  // Mobile
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const close = page.locator('button[aria-label*="Close" i], button:has-text("Maybe later")').first()
  if (await close.count()) { await close.click().catch(() => { }); await page.waitForTimeout(300) }
  out.mobile = await page.evaluate(() => {
    const row = document.querySelector('.sf-header > div')
    const r = row.getBoundingClientRect()
    const kids = [...row.children].filter((k) => getComputedStyle(k).display !== 'none')
    const rects = kids.map((k) => {
      const b = k.getBoundingClientRect()
      return {
        cls: (k.className || '').toString().slice(0, 40),
        left: Math.round(b.left),
        right: Math.round(b.right),
        h: Math.round(b.height),
      }
    })
    return { rowLeft: Math.round(r.left), rowRight: Math.round(r.right), children: rects }
  })
  await page.locator('.sf-header').screenshot({ path: '/tmp/align-mobile.png' })

  return out
}

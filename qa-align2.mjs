export default async function run(page, ui) {
  const widths = [1024, 1280, 1440, 1536]
  const out = []
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const info = await page.evaluate(() => {
      const row = document.querySelector('.sf-header > div')
      const rr = row.getBoundingClientRect()
      const cs = getComputedStyle(row)
      const contentLeft = rr.left + parseFloat(cs.paddingLeft)
      const contentRight = rr.right - parseFloat(cs.paddingRight)
      const kids = [...row.children].filter((k) => getComputedStyle(k).display !== 'none')
      const last = kids[kids.length - 1]
      const lastR = last.getBoundingClientRect()
      return {
        contentLeft: Math.round(contentLeft),
        contentRight: Math.round(contentRight),
        clusterRight: Math.round(lastR.right),
        overflowPx: Math.round(lastR.right - contentRight),
        docOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        menuVisible: (() => {
          const m = document.querySelector('button[aria-label="Menu"]')
          if (!m) return false
          const mr = m.getBoundingClientRect()
          return mr.width > 0 && getComputedStyle(m).display !== 'none'
        })(),
      }
    })
    out.push({ width: w, ...info })
  }
  return out
}

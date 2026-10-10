export default async function run(page, ui) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  return await page.evaluate(() => {
    const row = document.querySelector('.sf-header > div')
    const kids = [...row.children]
    const cluster = kids[kids.length - 1]
    const items = [...cluster.children].map((c) => {
      const b = c.getBoundingClientRect()
      return {
        cls: (c.className || '').toString().slice(0, 30),
        txt: c.textContent.trim().slice(0, 20),
        display: getComputedStyle(c).display,
        w: Math.round(b.width),
      }
    })
    const nav = row.querySelector('nav')
    const navChildren = nav ? [...nav.children].map((c) => Math.round(c.getBoundingClientRect().width)) : []
    return {
      rowWidth: Math.round(row.getBoundingClientRect().width),
      rowContentRight: Math.round(row.getBoundingClientRect().right) - 28,
      clusterLeft: Math.round(cluster.getBoundingClientRect().left),
      clusterRight: Math.round(cluster.getBoundingClientRect().right),
      clusterWidth: Math.round(cluster.getBoundingClientRect().width),
      clusterItems: items,
      navWidth: nav ? Math.round(nav.getBoundingClientRect().width) : 0,
      navScrollWidth: nav ? nav.scrollWidth : 0,
      navChildren,
    }
  })
}

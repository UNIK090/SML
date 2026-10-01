export default async function run(page, ui) {
  await page.context().addCookies([{ name: 'aurum_session', value: process.env.TOKEN, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /^Orders/ }).first().click()
  await page.waitForTimeout(4000)
  return await page.evaluate(() => ({
    orderRows: document.querySelectorAll('.order-row').length,
    ticks: document.querySelectorAll('button[aria-label*="for deletion"]').length,
    allButtons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean).slice(0, 25),
    bodySnippet: document.body.innerText.slice(0, 600),
  }))
}

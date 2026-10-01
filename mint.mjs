import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
if (!globalThis.crypto) globalThis.crypto = webcrypto
for (const line of readFileSync('.env.local','utf8').split('\n')) {
  const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
const payload = Buffer.from(JSON.stringify({ email: process.env.ADMIN_EMAIL, expiresAt: Date.now() + 3600_000 })).toString('base64url')
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(process.env.SESSION_SECRET), { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
console.log(`${payload}.${sig}`)

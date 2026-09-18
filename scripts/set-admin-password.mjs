// Generates the admin credential environment variables.
//
// Usage:
//   node scripts/set-admin-password.mjs                 # prompts, hides what you type
//   node scripts/set-admin-password.mjs --email a@b.com # skip the email prompt
//
// The password is never written to disk by this script. It prints the three
// lines to paste into .env.local, then exits.

import { createInterface } from 'node:readline'
import { randomBytes } from 'node:crypto'
import { hashPassword } from '../lib/auth.ts'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const onData = (char) => {
      // Mute the echo while a hidden answer is typed.
      if (hidden && char.toString() !== '\r' && char.toString() !== '\n') {
        process.stdout.write('\x1b[2K\x1b[200D' + question + '*'.repeat(rl.line.length))
      }
    }
    if (hidden) process.stdin.on('data', onData)
    rl.question(question, (answer) => {
      if (hidden) process.stdin.off('data', onData)
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer)
    })
  })
}

const email = (argument('--email') ?? (await ask('Admin email: '))).trim().toLowerCase()
if (!email) {
  console.error('An admin email is required.')
  process.exit(1)
}

const password = await ask('Admin password (min 8 characters): ', { hidden: true })
if (password.length < 8) {
  console.error('Please choose a password of at least 8 characters.')
  process.exit(1)
}

const confirmation = await ask('Confirm password: ', { hidden: true })
if (password !== confirmation) {
  console.error('The two passwords did not match.')
  process.exit(1)
}

console.log('\nPaste these three lines into .env.local (replace any existing ones):\n')
console.log(`ADMIN_EMAIL=${email}`)
console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`)
console.log(`SESSION_SECRET=${randomBytes(32).toString('base64url')}`)
console.log('\nKeep SESSION_SECRET private. Changing it signs every admin out.')

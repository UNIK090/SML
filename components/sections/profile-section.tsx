'use client'

// Profile settings: the shop's identity on the invoice, plus the admin password
// and the appearance/language preferences.

import { useCallback, useEffect, useState } from 'react'
import { Building2, Check, Globe, KeyRound, Loader2, Moon, Palette, Sun } from 'lucide-react'
import { Button, Card, Field, Input, Notice, SectionHeading, Skeleton } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import { LANGUAGES } from '@/lib/i18n'
import type { Shop } from '@/lib/types'

type ProfileResponse = {
  profile: Shop
  fromEnv: Shop
  adminEmail: string | null
}

export default function ProfileSection({ onShopChanged }: { onShopChanged: (shop: Shop) => void }) {
  const { theme, language, setLanguage, toggleTheme, t } = usePreferences()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [fromEnv, setFromEnv] = useState<Shop | null>(null)

  const [form, setForm] = useState({ name: '', address: '', phone: '', email: '', gstin: '' })

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [newHash, setNewHash] = useState<string | null>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/profile')
      if (!response.ok) {
        setError('Could not load your profile.')
        return
      }
      const data = (await response.json()) as ProfileResponse
      setForm({
        name: data.profile.name ?? '',
        address: data.profile.address ?? '',
        phone: data.profile.phone ?? '',
        email: data.profile.email ?? '',
        gstin: data.profile.gstin ?? '',
      })
      setFromEnv(data.fromEnv)
      setAdminEmail(data.adminEmail)
    } catch {
      setError('Could not load your profile.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) {
        setError(result.error ?? 'Could not save your profile.')
        return
      }
      setMessage('Shop details saved. They now appear on every new invoice.')
      onShopChanged(result.profile)
    } catch {
      setError('Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setError('')
    setNewHash(null)
    setNewSecret(null)

    if (newPassword !== confirmPassword) {
      setError('The two new passwords did not match.')
      return
    }

    setChangingPassword(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'password', currentPassword, newPassword }),
      })
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) {
        setError(result.error ?? 'Could not change the password.')
        return
      }
      setNewHash(result.newHash)
      setNewSecret(result.newSecret)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Password verified. Copy the two values below into .env.local to apply it.')
    } catch {
      setError('Could not change the password.')
    } finally {
      setChangingPassword(false)
    }
  }

  // A field still coming from the environment, with no saved override.
  const sourcedFromEnv = (key: keyof Shop) => !form[key] || form[key] === fromEnv?.[key]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex-col gap-3">
        {message && <Notice tone="success">{message}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>

      {/* Shop identity on the invoice */}
      <Card>
        <SectionHeading
          title="Shop details"
          description="These print at the top of every invoice and in the WhatsApp message."
          action={
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
              <Building2 className="size-5" />
            </span>
          }
        />

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="mb-2 h-3 w-24" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Shop name">
                <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your shop name" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Address" hint={sourcedFromEnv('address') ? 'Currently taken from .env.local' : 'Saved for invoices'}>
                <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Street, landmark, city, PIN" />
              </Field>
            </div>
            <Field label="Phone">
              <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="10-digit number" inputMode="tel" />
            </Field>
            <Field label="Email" hint={t('common.optional')}>
              <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Optional" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="GSTIN" hint="Leave blank if you are not GST registered — it is then omitted from the invoice.">
                <Input
                  value={form.gstin}
                  onChange={(event) => setForm({ ...form, gstin: event.target.value.toUpperCase() })}
                  placeholder="15 characters, e.g. 36ABCDE1234F1Z5"
                  maxLength={15}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="gold" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {saving ? t('common.saving') : 'Save shop details'}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Appearance and language */}
      <Card>
        <SectionHeading
          title="Appearance"
          description="Choose how the billing desk looks and which language it uses."
          action={
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
              <Palette className="size-5" />
            </span>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('nav.theme')}>
            <button
              onClick={toggleTheme}
              className="flex h-11 w-full items-center justify-between rounded-xl border-hairline bg-card px-3 text-sm transition hover:bg-secondary"
            >
              <span className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="size-4 text-gold-deep" /> : <Sun className="size-4 text-gold-deep" />}
                {theme === 'dark' ? 'Dark' : 'Light'}
              </span>
              <span className="text-xs text-muted-foreground">Tap to switch</span>
            </button>
          </Field>
          <Field label={t('nav.language')}>
            <div className="flex gap-2">
              {LANGUAGES.map((entry) => (
                <button
                  key={entry.value}
                  onClick={() => setLanguage(entry.value)}
                  className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border-hairline text-sm transition ${language === entry.value ? 'bg-gold text-white' : 'bg-card hover:bg-secondary'
                    }`}
                >
                  <Globe className="size-4" />
                  {entry.native}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      {/* Admin password */}
      <Card>
        <SectionHeading
          title="Admin password"
          description={adminEmail ? `Signed in as ${adminEmail}` : 'Change the password used to sign in.'}
          action={
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
              <KeyRound className="size-5" />
            </span>
          }
        />
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password">
            <Input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input required type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </Field>
          <Field label="Confirm new password">
            <Input required type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="outline" disabled={changingPassword}>
              {changingPassword ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {changingPassword ? 'Checking…' : 'Change password'}
            </Button>
          </div>
        </form>

        {newHash && (
          <div className="mt-5 rounded-2xl border-hairline bg-background/70 p-4">
            <p className="text-sm font-medium">Apply the new password</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The password hash lives in <span className="font-medium">.env.local</span>, which a running server cannot rewrite. Paste these two lines in place
              of the existing ones, then restart the server.
            </p>
            <div className="mt-3 flex-col gap-2">
              <code className="block overflow-x-auto rounded-lg bg-secondary p-3 text-xs break-all">ADMIN_PASSWORD_HASH={newHash}</code>
              <code className="block overflow-x-auto rounded-lg bg-secondary p-3 text-xs break-all">SESSION_SECRET={newSecret}</code>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Changing <span className="font-medium">SESSION_SECRET</span> signs out every device, including this one.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}

'use client'

// Profile settings: the shop's identity on the invoice, plus the admin password
// and the appearance/language preferences.

import { useCallback, useEffect, useState } from 'react'
import { Building2, Check, CheckCircle2, Globe, ImagePlus, KeyRound, Loader2, MessageCircleMore, Moon, Palette, Smartphone, Sun, Trash2, UserRound } from 'lucide-react'
import { Badge, Button, Card, Field, Input, Notice, SectionHeading, Skeleton, WorkspaceHero } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import { LANGUAGES } from '@/lib/i18n'
import type { BrandAssets, Shop } from '@/lib/types'

type ProfileResponse = {
  profile: Shop
  fromEnv: Shop
  adminEmail: string | null
  invoiceDelivery: {
    provider: string
    autoSendEnabled: boolean
    configured: boolean
    automatic: boolean
    detail: string
    setup: string[]
  }
  smsDelivery: {
    provider: string
    autoSendEnabled: boolean
    configured: boolean
    automatic: boolean
    detail: string
    setup: string[]
  }
}

type BrandKind = 'logo' | 'favicon' | 'avatar'

const BRAND_COPY: Record<BrandKind, { title: string; hint: string }> = {
  logo: { title: 'Shop logo', hint: 'Shown beside your shop name and on invoices.' },
  avatar: { title: 'Display picture', hint: 'Shown in the dashboard navigation.' },
  favicon: { title: 'Browser favicon', hint: 'Shown in browser tabs and bookmarks.' },
}

export default function ProfileSection({ onShopChanged, onBrandChanged }: { onShopChanged: (shop: Shop) => void; onBrandChanged: (assets: BrandAssets) => void }) {
  const { theme, language, setLanguage, toggleTheme, t } = usePreferences()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [fromEnv, setFromEnv] = useState<Shop | null>(null)
  const [invoiceDelivery, setInvoiceDelivery] = useState<ProfileResponse['invoiceDelivery'] | null>(null)
  const [smsDelivery, setSmsDelivery] = useState<ProfileResponse['smsDelivery'] | null>(null)
  const [brand, setBrand] = useState<BrandAssets | null>(null)
  const [uploading, setUploading] = useState<BrandKind | null>(null)

  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    // Storefront copy. Edited here rather than on the Store screen because it is
    // shop identity, and it is what the website hero and contact block read.
    tagline: '',
    whatsapp: '',
    storeHours: '',
  })

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
      const [response, brandResponse] = await Promise.all([fetch('/api/profile'), fetch('/api/brand?info=1')])
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
        tagline: data.profile.tagline ?? '',
        whatsapp: data.profile.whatsapp ?? '',
        storeHours: data.profile.storeHours ?? '',
      })
      setFromEnv(data.fromEnv)
      setAdminEmail(data.adminEmail)
      setInvoiceDelivery(data.invoiceDelivery)
      setSmsDelivery(data.smsDelivery)
      if (brandResponse.ok) setBrand((await brandResponse.json()) as BrandAssets)
    } catch {
      setError('Could not load your profile.')
    } finally {
      setLoading(false)
    }
  }, [])

  const saveBrandAsset = async (kind: BrandKind, file: File) => {
    setUploading(kind)
    setMessage('')
    setError('')
    try {
      const formData = new FormData()
      formData.set('image', file)
      const response = await fetch(`/api/brand?kind=${kind}`, { method: 'POST', body: formData })
      const result = (await response.json()) as { error?: string; assets?: BrandAssets }
      if (!response.ok || !result.assets) {
        setError(result.error ?? 'Could not upload the image.')
        return
      }
      setBrand(result.assets)
      onBrandChanged(result.assets)
      setMessage(`${BRAND_COPY[kind].title} updated.`)
    } catch {
      setError('Could not upload the image.')
    } finally {
      setUploading(null)
    }
  }

  const removeBrandAsset = async (kind: BrandKind) => {
    if (!window.confirm(`Remove the ${BRAND_COPY[kind].title.toLowerCase()}?`)) return
    setUploading(kind)
    setMessage('')
    setError('')
    try {
      const response = await fetch(`/api/brand?kind=${kind}`, { method: 'DELETE' })
      const result = (await response.json()) as { error?: string; assets?: BrandAssets }
      if (!response.ok || !result.assets) {
        setError(result.error ?? 'Could not remove the image.')
        return
      }
      setBrand(result.assets)
      onBrandChanged(result.assets)
      setMessage(`${BRAND_COPY[kind].title} removed.`)
    } catch {
      setError('Could not remove the image.')
    } finally {
      setUploading(null)
    }
  }

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

      <WorkspaceHero
        eyebrow="Business administration"
        title="Business profile & controls"
        description="Manage the identity customers see, your invoice delivery setup, and the operating preferences for this billing desk."
        action={<span className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur">Admin settings</span>}
      />

      {/* Shop identity on the invoice */}
      <Card className="business-primary-card">
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
              <Field label="Website tagline" hint="The one line under your shop name on the online store.">
                <Input
                  value={form.tagline}
                  onChange={(event) => setForm({ ...form, tagline: event.target.value })}
                  placeholder="e.g. Hand-picked gold and diamond jewellery since 1985"
                />
              </Field>
            </div>
            <Field label="WhatsApp number" hint="For the website's WhatsApp button. Blank uses your phone number.">
              <Input
                value={form.whatsapp}
                onChange={(event) => setForm({ ...form, whatsapp: event.target.value })}
                placeholder="10-digit number or a wa.me link"
                inputMode="tel"
              />
            </Field>
            <Field label="Shop hours" hint="Shown on the website and at checkout.">
              <Input
                value={form.storeHours}
                onChange={(event) => setForm({ ...form, storeHours: event.target.value })}
                placeholder="e.g. Mon–Sat · 10:00 am – 8:30 pm"
              />
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

      <Card>
        <SectionHeading
          title="Brand images"
          description="Upload your shop logo, display picture, and browser favicon. PNG, JPG, GIF, or WebP files under 400 KB are accepted."
          action={
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
              <ImagePlus className="size-5" />
            </span>
          }
        />
        <div className="grid gap-4 md:grid-cols-3">
          {(['logo', 'avatar', 'favicon'] as BrandKind[]).map((kind) => {
            const active = Boolean(brand?.[kind])
            const version = brand?.updatedAt ? encodeURIComponent(brand.updatedAt) : '1'
            const source = `/api/brand?kind=${kind}&v=${version}`
            return (
              <div key={kind} className="rounded-2xl border-hairline bg-background/55 p-4">
                <div className="flex items-start gap-3">
                  {active ? (
                    <img src={source} alt="" className={`shrink-0 border border-hairline bg-card object-cover ${kind === 'avatar' ? 'size-12 rounded-full' : 'size-12 rounded-xl p-1'}`} />
                  ) : (
                    <span className={`flex size-12 shrink-0 items-center justify-center border border-dashed border-hairline bg-card text-muted-foreground ${kind === 'avatar' ? 'rounded-full' : 'rounded-xl'}`}>
                      {kind === 'avatar' ? <UserRound className="size-5" /> : <ImagePlus className="size-5" />}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{BRAND_COPY[kind].title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{BRAND_COPY[kind].hint}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-hairline bg-card px-2.5 text-xs font-medium transition hover:bg-secondary ${uploading === kind ? 'pointer-events-none opacity-60' : ''}`}>
                    {uploading === kind ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                    {active ? 'Replace' : 'Upload'}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) void saveBrandAsset(kind, file)
                      }}
                    />
                  </label>
                  {active && (
                    <button onClick={() => void removeBrandAsset(kind)} disabled={uploading === kind} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-50 hover:text-destructive disabled:opacity-55 dark:hover:bg-red-950/25" aria-label={`Remove ${BRAND_COPY[kind].title}`} title={`Remove ${BRAND_COPY[kind].title}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <SectionHeading
          title="Automatic WhatsApp invoices"
          description="New bills are saved immediately, then delivered in the background when a customer mobile number is present."
          action={
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
              <MessageCircleMore className="size-5" />
            </span>
          }
        />

        {loading ? (
          <div className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-11 w-full" /></div>
        ) : invoiceDelivery && (
          <div className="rounded-2xl border-hairline bg-background/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Provider: {invoiceDelivery.provider.replace('_', ' ')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{invoiceDelivery.detail}</p>
              </div>
              <Badge tone={invoiceDelivery.automatic ? 'success' : invoiceDelivery.configured ? 'gold' : 'warn'}>
                {invoiceDelivery.automatic ? <CheckCircle2 className="size-3.5" /> : null}
                {invoiceDelivery.automatic ? 'Automatic sending on' : invoiceDelivery.configured ? 'Ready to enable' : 'Setup needed'}
              </Badge>
            </div>

            {!invoiceDelivery.automatic && (
              <div className="mt-4 border-t border-hairline pt-4">
                <p className="text-sm font-medium">Configure these production environment variables</p>
                <p className="mt-1 text-xs text-muted-foreground">For Meta, create an approved WhatsApp template whose body has exactly one variable: <code>{'{{1}}'}</code>. Customer opt-in is required before automatic messaging.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {invoiceDelivery.setup.map((value) => <code key={value} className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs">{value}</code>)}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <SectionHeading
          title="Direct SMS invoices"
          description="Send the invoice link, shop details, and bill amount directly from your store to the customer’s mobile number."
          action={
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
              <Smartphone className="size-5" />
            </span>
          }
        />

        {loading ? (
          <div className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-11 w-full" /></div>
        ) : smsDelivery && (
          <div className="rounded-2xl border-hairline bg-background/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Provider: {smsDelivery.provider === 'none' ? 'Not connected' : smsDelivery.provider.toUpperCase()}</p>
                <p className="mt-1 text-sm text-muted-foreground">{smsDelivery.detail}</p>
              </div>
              <Badge tone={smsDelivery.automatic ? 'success' : smsDelivery.configured ? 'gold' : 'warn'}>
                {smsDelivery.automatic ? <CheckCircle2 className="size-3.5" /> : null}
                {smsDelivery.automatic ? 'Direct SMS on' : smsDelivery.configured ? 'Ready to enable' : 'Setup needed'}
              </Badge>
            </div>

            {!smsDelivery.automatic && (
              <div className="mt-4 border-t border-hairline pt-4">
                <p className="text-sm font-medium">Configure direct SMS delivery</p>
                <p className="mt-1 text-xs text-muted-foreground">For India, register a transactional DLT template that includes variables for the shop name/address, invoice number, total, and invoice URL. Customer consent and an approved sender are required.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {smsDelivery.setup.map((value) => <code key={value} className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs">{value}</code>)}
                </div>
              </div>
            )}
          </div>
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

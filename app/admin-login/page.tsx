'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { Button, Field, Input, Notice } from '@/components/ui'
import { usePreferences } from '@/components/preferences'

function AdminLoginForm() {
  const { t } = usePreferences()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // Only ever follow a same-site relative path, so a crafted ?next= cannot
  // bounce the admin off to another origin after signing in. The default is the
  // admin desk, not the public shop, because that is where the sign-in came from.
  const requested = searchParams.get('next') ?? '/admin'
  const destination = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/admin'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) {
        setMessage(result.error ?? 'Could not sign you in.')
        setPassword('')
        return
      }
      router.replace(destination)
      router.refresh()
    } catch {
      setMessage('Could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-canvas flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 sm:py-12">
      <div className="card-shadow-lg grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/12 bg-card md:grid-cols-[1.08fr_.92fr]">
        {/* Brand panel */}
        <div className="relative flex min-h-[33rem] flex-col justify-between overflow-hidden bg-primary p-8 text-primary-foreground sm:p-10">
          <div className="absolute -top-24 -right-28 size-80 rounded-full border border-white/10" />
          <div className="absolute -bottom-32 -left-24 size-72 rounded-full border border-white/10" />
          <div className="relative z-10">
            <div className="mb-10 flex size-12 items-center justify-center rounded-2xl bg-gold text-slate-950 shadow-[0_12px_30px_rgb(0_0_0_/_22%)]">
              <Sparkles className="size-6" />
            </div>
            <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">Sri Maha Laxmi Jewellers</p>
            <h1 className="mt-5 text-4xl leading-[1.1] font-semibold tracking-tight">{t('login.title')}</h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">
              {t('login.hint')}
            </p>
            <div className="mt-9 grid max-w-sm grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/12 bg-white/8 p-3 backdrop-blur">
                <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-300 uppercase">Workspace</p>
                <p className="mt-1 text-sm font-medium">Billing & revenue</p>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/8 p-3 backdrop-blur">
                <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-300 uppercase">Access</p>
                <p className="mt-1 text-sm font-medium">Admin secured</p>
              </div>
            </div>
          </div>
          <div className="relative z-10 mt-16 flex items-center gap-3 text-sm text-slate-300">
            <ShieldCheck className="size-5 text-gold" />
            <span>{t('login.admin')} · protected business workspace</span>
          </div>
        </div>

        {/* Form panel */}
        <div className="bg-card p-8 sm:p-10">
          <div className="mb-8">
            <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-gold-soft text-gold-deep shadow-sm">
              <KeyRound className="size-5" />
            </div>
            <p className="mb-1 text-[10px] font-semibold tracking-[0.15em] text-gold-deep uppercase">Secure sign in</p>
            <h2 className="text-2xl font-semibold tracking-tight">{t('login.welcome')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('login.subtitle')}</p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-5">
            <Field label={t('login.email')}>
              <Input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@yourstore.com"
                disabled={busy}
              />
            </Field>

            <Field label={t('login.password')}>
              <span className="relative block">
                <Input
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  disabled={busy}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute top-3.5 right-3 text-muted-foreground transition hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </span>
            </Field>

            <Button type="submit" variant="gold" disabled={busy} className="w-full">
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {t('login.signingIn')}
                </>
              ) : (
                <>
                  {t('login.signIn')} <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

          {message && (
            <div className="mt-5">
              <Notice tone="danger">{message}</Notice>
            </div>
          )}

          <p className="mt-8 text-center text-xs text-muted-foreground">{t('login.footer')}</p>
        </div>
      </div>
    </main>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <AdminLoginForm />
    </Suspense>
  )
}

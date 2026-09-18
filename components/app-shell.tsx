'use client'

// Application shell: a properly aligned sidebar, the header controls, and the
// mobile drawer.

import { useState, type ReactNode } from 'react'
import {
  Check,
  CircleCheck,
  Clock3,
  Gem,
  Globe,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  Sparkles,
  Sun,
  Wallet,
  X,
} from 'lucide-react'
import { usePreferences } from '@/components/preferences'
import { LANGUAGES, type TranslationKey } from '@/lib/i18n'

export type SectionKey = 'billing' | 'payments' | 'items' | 'profile'

type Section = {
  key: SectionKey
  labelKey: TranslationKey
  hintKey: TranslationKey
  icon: typeof ReceiptText
}

const SECTIONS: Section[] = [
  { key: 'billing', labelKey: 'nav.billing', hintKey: 'nav.billing.hint', icon: ReceiptText },
  { key: 'payments', labelKey: 'nav.payments', hintKey: 'nav.payments.hint', icon: Wallet },
  { key: 'items', labelKey: 'nav.items', hintKey: 'nav.items.hint', icon: Gem },
  { key: 'profile', labelKey: 'nav.profile', hintKey: 'nav.profile.hint', icon: Settings },
]

/**
 * One navigation row.
 *
 * The icon is a fixed 2.25rem column and the text is a flexible block beside
 * it, so every label starts at exactly the same x — the previous version let
 * the gap shift and the hint line wrap onto a second row.
 */
function NavItem({
  section,
  active,
  collapsed,
  onSelect,
  t,
}: {
  section: Section
  active: boolean
  collapsed: boolean
  onSelect: () => void
  t: (key: TranslationKey) => string
}) {
  const { icon: Icon, labelKey, hintKey } = section

  if (collapsed) {
    return (
      <button
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        aria-label={t(labelKey)}
        title={t(labelKey)}
        className={`relative flex h-11 w-full items-center justify-center rounded-xl transition ${
          active ? 'card-shadow bg-card text-foreground' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
        }`}
      >
        {active && <span className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gold" aria-hidden />}
        <Icon className={`size-[18px] ${active ? 'text-gold-deep' : ''}`} />
      </button>
    )
  }

  return (
    <button
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={`relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
        active ? 'card-shadow bg-card text-foreground' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
      }`}
    >
      {active && <span className="absolute top-1/2 left-0 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-gold" aria-hidden />}
      {/* Fixed-width icon column keeps all labels on a single vertical line. */}
      <span className="flex w-7 shrink-0 justify-center">
        <Icon className={`size-[18px] ${active ? 'text-gold-deep' : ''}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm leading-5 font-medium">{t(labelKey)}</span>
        <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground">{t(hintKey)}</span>
      </span>
    </button>
  )
}

export default function AppShell({
  section,
  onSectionChange,
  shopName,
  adminEmail,
  children,
}: {
  section: SectionKey
  onSectionChange: (next: SectionKey) => void
  shopName: string
  adminEmail: string
  children: ReactNode
}) {
  const { theme, language, sidebarCollapsed, toggleTheme, setLanguage, toggleSidebar, t } = usePreferences()
  const [signingOut, setSigningOut] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const signOut = async () => {
    setSigningOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      window.location.href = '/admin-login'
    }
  }

  const current = SECTIONS.find((entry) => entry.key === section)
  const shopLabel = shopName.toUpperCase()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        {/* ---------- Desktop sidebar ---------- */}
        <aside
          className={`hidden shrink-0 flex-col border-hairline bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start lg:border-r lg:py-4 ${
            sidebarCollapsed ? 'lg:w-[4.5rem] lg:px-3' : 'lg:w-72 lg:px-4'
          } transition-[width,padding] duration-300 ease-out`}
        >
          {/* Brand block */}
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="size-5" />
            </span>
            {!sidebarCollapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] leading-5 font-semibold tracking-tight" title={shopLabel}>
                    {shopLabel}
                  </p>
                  <p className="truncate text-[11px] leading-4 text-muted-foreground">{t('brand.desk')}</p>
                </div>
                <button
                  onClick={toggleSidebar}
                  aria-label={t('nav.collapse')}
                  title={t('nav.collapse')}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </>
            )}
          </div>

          {sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              aria-label={t('nav.expand')}
              title={t('nav.expand')}
              className="mt-4 flex h-9 w-full items-center justify-center rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}

          {/* Navigation */}
          <nav className="mt-5 flex-1 flex-col gap-1 border-t border-hairline pt-4" aria-label="Sections">
            {SECTIONS.map((entry) => (
              <NavItem
                key={entry.key}
                section={entry}
                active={entry.key === section}
                collapsed={sidebarCollapsed}
                onSelect={() => onSectionChange(entry.key)}
                t={t}
              />
            ))}
          </nav>

          {/* Status footer */}
          <div className="mt-4 border-t border-hairline pt-4">
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-3.5">
                <span className="text-muted-foreground" title="Business day closes at 12:00 AM">
                  <Clock3 className="size-4" />
                </span>
                <span className="text-success" title="Live database">
                  <CircleCheck className="size-4" />
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-2 text-[11px] leading-4 text-muted-foreground">
                  <Clock3 className="size-3.5 shrink-0" />
                  <span className="truncate">Day closes at 12:00 AM</span>
                </p>
                <p className="flex items-center gap-2 text-[11px] leading-4 text-success">
                  <CircleCheck className="size-3.5 shrink-0" />
                  <span className="truncate">Live database</span>
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* ---------- Content ---------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-hairline bg-card/85 px-4 py-3.5 backdrop-blur sm:px-6 sm:py-4 print:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => setDrawerOpen(true)}
                  aria-label={t('nav.expand')}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border-hairline text-muted-foreground transition hover:bg-secondary hover:text-foreground lg:hidden"
                >
                  <Menu className="size-4" />
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-base leading-6 font-semibold tracking-tight sm:text-lg">{current ? t(current.labelKey) : ''}</h1>
                  <p className="hidden truncate text-xs leading-4 text-muted-foreground sm:block">{current ? t(current.hintKey) : ''}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <button
                  onClick={toggleTheme}
                  aria-label={t('nav.theme')}
                  title={t('nav.theme')}
                  className="flex size-9 items-center justify-center rounded-full border-hairline text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </button>

                <div className="relative">
                  <button
                    onClick={() => setLangOpen((value) => !value)}
                    aria-label={t('nav.language')}
                    aria-expanded={langOpen}
                    className="flex h-9 items-center gap-1.5 rounded-full border-hairline px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:px-3"
                  >
                    <Globe className="size-4" />
                    <span className="hidden sm:inline">{LANGUAGES.find((entry) => entry.value === language)?.native}</span>
                  </button>
                  {langOpen && (
                    <>
                      <button className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setLangOpen(false)} />
                      <div className="card-shadow-lg absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border-hairline bg-card py-1">
                        {LANGUAGES.map((entry) => (
                          <button
                            key={entry.value}
                            onClick={() => {
                              setLanguage(entry.value)
                              setLangOpen(false)
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-secondary"
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{entry.native}</span>
                              <span className="block truncate text-xs text-muted-foreground">{entry.label}</span>
                            </span>
                            {language === entry.value && <Check className="size-4 shrink-0 text-gold-deep" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {adminEmail && (
                  <span className="hidden max-w-[12rem] truncate rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground xl:inline" title={adminEmail}>
                    {adminEmail}
                  </span>
                )}

                <button
                  onClick={signOut}
                  disabled={signingOut}
                  className="flex h-9 items-center gap-1.5 rounded-full border-hairline px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-60 sm:px-3"
                >
                  <LogOut className="size-3.5" />
                  <span className="hidden sm:inline">{signingOut ? t('login.signingOut') : t('login.signOut')}</span>
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-7">{children}</main>
        </div>
      </div>

      {/* ---------- Mobile drawer ---------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-primary/45 backdrop-blur-sm" aria-hidden onClick={() => setDrawerOpen(false)} />
          <nav className="animate-slide-in absolute inset-y-0 left-0 flex w-72 flex-col border-r border-hairline bg-sidebar px-4 py-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Sparkles className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-5 font-semibold tracking-tight">{shopLabel}</p>
                <p className="truncate text-[11px] leading-4 text-muted-foreground">{t('brand.desk')}</p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label={t('common.close')}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 flex-col gap-1 border-t border-hairline pt-4">
              {SECTIONS.map((entry) => (
                <NavItem
                  key={entry.key}
                  section={entry}
                  active={entry.key === section}
                  collapsed={false}
                  onSelect={() => {
                    onSectionChange(entry.key)
                    setDrawerOpen(false)
                  }}
                  t={t}
                />
              ))}
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}

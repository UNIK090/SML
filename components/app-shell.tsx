'use client'

// Application shell: a properly aligned sidebar, the header controls, and the
// mobile drawer.

import { useState, type ReactNode } from 'react'
import {
  BellRing,
  Check,
  CalendarDays,
  ChartColumn,
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
  Store,
  Sun,
  Wallet,
  X,
} from 'lucide-react'
import { usePreferences } from '@/components/preferences'
import { LANGUAGES, type TranslationKey } from '@/lib/i18n'
import type { BrandAssets } from '@/lib/types'

export type SectionKey = 'billing' | 'orders' | 'payments' | 'items' | 'store' | 'reports' | 'profile'

type Section = {
  key: SectionKey
  labelKey: TranslationKey
  hintKey: TranslationKey
  icon: typeof ReceiptText
}

const SECTIONS: Section[] = [
  { key: 'billing', labelKey: 'nav.billing', hintKey: 'nav.billing.hint', icon: ReceiptText },
  // Orders sits directly under Billing because that is the order the work
  // happens in: an online order becomes a bill.
  { key: 'orders', labelKey: 'nav.orders', hintKey: 'nav.orders.hint', icon: BellRing },
  { key: 'payments', labelKey: 'nav.payments', hintKey: 'nav.payments.hint', icon: Wallet },
  { key: 'items', labelKey: 'nav.items', hintKey: 'nav.items.hint', icon: Gem },
  { key: 'store', labelKey: 'nav.store', hintKey: 'nav.store.hint', icon: Store },
  { key: 'reports', labelKey: 'nav.reports', hintKey: 'nav.reports.hint', icon: ChartColumn },
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
  notificationCount,
  onSelect,
  t,
}: {
  section: Section
  active: boolean
  collapsed: boolean
  /** Orders needing action; only supplied for the Orders navigation item. */
  notificationCount?: number
  onSelect: () => void
  t: (key: TranslationKey) => string
}) {
  const { icon: Icon, labelKey, hintKey } = section
  const badge = notificationCount && notificationCount > 0 ? (notificationCount > 99 ? '99+' : notificationCount) : null

  if (collapsed) {
    return (
      <button
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        aria-label={t(labelKey)}
        title={t(labelKey)}
        className={`relative flex h-11 w-full items-center justify-center rounded-xl transition ${
          active ? 'bg-white/14 text-sidebar-foreground shadow-[0_10px_22px_rgb(0_0_0_/_16%)]' : 'text-sidebar-foreground/55 hover:bg-white/8 hover:text-sidebar-foreground'
        }`}
      >
        {active && <span className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gold" aria-hidden />}
        <Icon className={`size-[18px] ${active ? 'text-gold' : ''}`} />
        {badge && (
          <span className="tnum absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] leading-4 font-bold text-slate-950" aria-label={`${badge} new order notifications`}>
            {badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <button
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={`relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
        active ? 'bg-white/14 text-sidebar-foreground shadow-[0_10px_22px_rgb(0_0_0_/_16%)]' : 'text-sidebar-foreground/55 hover:bg-white/8 hover:text-sidebar-foreground'
      }`}
    >
      {active && <span className="absolute top-1/2 left-0 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-gold" aria-hidden />}
      {/* Fixed-width icon column keeps all labels on a single vertical line. */}
      <span className="relative flex w-7 shrink-0 justify-center">
        <Icon className={`size-[18px] ${active ? 'text-gold' : ''}`} />
        {badge && (
          <span className="tnum absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] leading-4 font-bold text-slate-950" aria-label={`${badge} new order notifications`}>
            {badge}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm leading-5 font-medium">{t(labelKey)}</span>
        <span className={`mt-0.5 block truncate text-[11px] leading-4 ${active ? 'text-sidebar-foreground/62' : 'text-sidebar-foreground/40'}`}>{t(hintKey)}</span>
      </span>
    </button>
  )
}

export default function AppShell({
  section,
  onSectionChange,
  shopName,
  adminEmail,
  brand,
  ordersNotificationCount,
  ordersBell,
  children,
}: {
  section: SectionKey
  onSectionChange: (next: SectionKey) => void
  shopName: string
  adminEmail: string
  brand?: BrandAssets
  /** Number of online orders still needing action, shown on the Orders icon. */
  ordersNotificationCount?: number
  /**
   * The realtime order bell. Passed in rather than mounted here because only the
   * dashboard owns the realtime connection — the shell stays a pure layout.
   */
  ordersBell?: ReactNode
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
  const brandVersion = brand?.updatedAt ? encodeURIComponent(brand.updatedAt) : '1'
  const logoUrl = `/api/brand?kind=logo&v=${brandVersion}`
  const avatarUrl = `/api/brand?kind=avatar&v=${brandVersion}`

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        {/* ---------- Desktop sidebar ---------- */}
        <aside
          className={`app-sidebar hidden shrink-0 flex-col border-sidebar-border lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start lg:border-r lg:py-5 ${
            sidebarCollapsed ? 'lg:w-[4.5rem] lg:px-3' : 'lg:w-72 lg:px-4'
          } transition-[width,padding] duration-300 ease-out`}
        >
          {/* Brand block */}
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            {brand?.logo ? (
              <img src={logoUrl} alt="Shop logo" className="size-10 shrink-0 rounded-2xl border border-white/12 bg-white/8 object-contain p-1 shadow-[0_10px_24px_rgb(0_0_0_/_22%)]" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gold text-slate-950 shadow-[0_10px_24px_rgb(0_0_0_/_22%)]">
                <Sparkles className="size-5" />
              </span>
            )}
            {!sidebarCollapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] leading-5 font-semibold tracking-tight text-sidebar-foreground" title={shopLabel}>
                    {shopLabel}
                  </p>
                  <p className="truncate text-[11px] leading-4 text-sidebar-foreground/50">{t('brand.desk')}</p>
                </div>
                <button
                  onClick={toggleSidebar}
                  aria-label={t('nav.collapse')}
                  title={t('nav.collapse')}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/55 transition hover:bg-white/8 hover:text-sidebar-foreground"
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
              className="mt-5 flex h-9 w-full items-center justify-center rounded-lg text-sidebar-foreground/55 transition hover:bg-white/8 hover:text-sidebar-foreground"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}

          {/* Navigation */}
          <nav className="mt-7 flex-1 flex-col gap-1 border-t border-sidebar-border pt-4" aria-label="Sections">
            {SECTIONS.map((entry) => (
              <NavItem
                key={entry.key}
                section={entry}
                active={entry.key === section}
                collapsed={sidebarCollapsed}
                notificationCount={entry.key === 'orders' ? ordersNotificationCount : undefined}
                onSelect={() => onSectionChange(entry.key)}
                t={t}
              />
            ))}
          </nav>

          {/* Status footer */}
          <div className="mt-4 border-t border-sidebar-border pt-4">
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-3.5">
                {brand?.avatar ? <img src={avatarUrl} alt="Shop display picture" className="size-7 rounded-full border border-white/20 object-cover" /> : null}
                <span className="text-sidebar-foreground/48" title="Business day closes at 12:00 AM">
                  <Clock3 className="size-4" />
                </span>
                <span className="text-success" title="Live database">
                  <CircleCheck className="size-4" />
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {brand?.avatar && (
                  <div className="mb-1 flex items-center gap-2.5">
                    <img src={avatarUrl} alt="Shop display picture" className="size-7 rounded-full border border-white/20 object-cover" />
                    <span className="truncate text-[11px] font-medium text-sidebar-foreground/78">Shop display picture</span>
                  </div>
                )}
                <p className="flex items-center gap-2 text-[11px] leading-4 text-sidebar-foreground/52">
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
          <header className="sticky top-0 z-30 border-b border-hairline bg-background/82 px-4 py-3.5 backdrop-blur-xl sm:px-7 sm:py-4 print:hidden">
            <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => setDrawerOpen(true)}
                  aria-label={t('nav.expand')}
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border-hairline bg-card/80 text-muted-foreground transition hover:bg-secondary hover:text-foreground lg:hidden"
                >
                  <Menu className="size-4" />
                </button>
                <div className="min-w-0">
                  <div className="mb-0.5 hidden items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-gold-deep uppercase sm:flex">
                    <span className="size-1.5 rounded-full bg-gold" /> Business workspace
                  </div>
                  <h1 className="truncate text-lg leading-6 font-semibold tracking-tight sm:text-xl">{current ? t(current.labelKey) : ''}</h1>
                  <p className="hidden truncate text-xs leading-4 text-muted-foreground sm:block">{current ? t(current.hintKey) : ''}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <span className="hidden items-center gap-2 rounded-xl border-hairline bg-card/75 px-3 py-2 text-xs text-muted-foreground 2xl:flex">
                  <CalendarDays className="size-3.5 text-gold-deep" />
                  {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())}
                </span>
                {ordersBell}
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

          <main className="dashboard-canvas flex-1 px-4 py-6 sm:px-7 sm:py-8">
            <div className="mx-auto w-full max-w-[1540px]">{children}</div>
          </main>
        </div>
      </div>

      {/* ---------- Mobile drawer ---------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" aria-hidden onClick={() => setDrawerOpen(false)} />
          <nav className="app-sidebar animate-slide-in absolute inset-y-0 left-0 flex w-72 flex-col border-r border-sidebar-border px-4 py-5">
            <div className="flex items-center gap-3">
              {brand?.logo ? (
                <img src={logoUrl} alt="Shop logo" className="size-10 shrink-0 rounded-2xl border border-white/12 bg-white/8 object-contain p-1 shadow-[0_10px_24px_rgb(0_0_0_/_22%)]" />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gold text-slate-950 shadow-[0_10px_24px_rgb(0_0_0_/_22%)]">
                  <Sparkles className="size-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-5 font-semibold tracking-tight text-sidebar-foreground">{shopLabel}</p>
                <p className="truncate text-[11px] leading-4 text-sidebar-foreground/50">{t('brand.desk')}</p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label={t('common.close')}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/55 transition hover:bg-white/8 hover:text-sidebar-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-7 flex-col gap-1 border-t border-sidebar-border pt-4">
              {SECTIONS.map((entry) => (
                <NavItem
                  key={entry.key}
                  section={entry}
                  active={entry.key === section}
                  collapsed={false}
                  notificationCount={entry.key === 'orders' ? ordersNotificationCount : undefined}
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

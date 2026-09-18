'use client'

// User preferences: theme, language, and sidebar state.
//
// Stored in localStorage and mirrored onto <html> as data attributes so CSS can
// react immediately. The server cannot know these values, so the layout script
// below re-applies the theme before first paint — otherwise the page would flash
// light before switching to dark.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translate, type Language, type TranslationKey } from '@/lib/i18n'

export type Theme = 'light' | 'dark'

type Preferences = {
  theme: Theme
  language: Language
  sidebarCollapsed: boolean
  toggleTheme: () => void
  setLanguage: (next: Language) => void
  toggleSidebar: () => void
  t: (key: TranslationKey) => string
}

const STORAGE_KEY = 'aurum-prefs'

const PreferencesContext = createContext<Preferences | null>(null)

function readStored(): { theme: Theme; language: Language; sidebarCollapsed: boolean } {
  const fallback = { theme: 'light' as Theme, language: 'en' as Language, sidebarCollapsed: false }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<typeof fallback>
    return {
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      language: parsed.language === 'te' ? 'te' : 'en',
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
    }
  } catch {
    return fallback
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  // Start from defaults, then adopt the stored values after mount. Reading
  // localStorage during render would break server/client hydration matching.
  const [theme, setTheme] = useState<Theme>('light')
  const [language, setLanguage] = useState<Language>('en')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const stored = readStored()
    setTheme(stored.theme)
    setLanguage(stored.language)
    setSidebarCollapsed(stored.sidebarCollapsed)
  }, [])

  // Reflect state onto the document and persist it.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.lang = language
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, language, sidebarCollapsed }))
    } catch {
      // Storage can be unavailable (private mode); the app still works without it.
    }
  }, [theme, language, sidebarCollapsed])

  const toggleTheme = useCallback(() => setTheme((value) => (value === 'dark' ? 'light' : 'dark')), [])
  const toggleSidebar = useCallback(() => setSidebarCollapsed((value) => !value), [])
  const t = useCallback((key: TranslationKey) => translate(language, key), [language])

  const value = useMemo(
    () => ({ theme, language, sidebarCollapsed, toggleTheme, setLanguage, toggleSidebar, t }),
    [theme, language, sidebarCollapsed, toggleTheme, toggleSidebar, t],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): Preferences {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider')
  return context
}

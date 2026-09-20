import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { PreferencesProvider } from '@/components/preferences'
import './globals.css'

export const metadata: Metadata = {
  title: 'SRI MAHA LAXMI JEWELLERS | Jewellery Billing',
  description: 'Real-time jewellery billing, catalogue, and earnings ledger.',
  generator: 'v0.app',
  icons: {
    icon: [{ url: '/api/brand?kind=favicon', type: 'image/png' }],
    apple: [{ url: '/api/brand?kind=favicon', type: 'image/png' }],
  },
}
export const viewport: Viewport = { colorScheme: 'light', themeColor: '#f7f8fa' }
// Applies the stored theme before first paint, so a dark-mode user never sees a
// flash of the light theme. Runs inline and synchronously, before React hydrates.
const APPLY_THEME = `
(function () {
  try {
    var raw = localStorage.getItem('aurum-prefs');
    if (!raw) return;
    var prefs = JSON.parse(raw);
    var theme = prefs && prefs.theme === 'dark' ? 'dark' : 'light';
    var language = prefs && prefs.language === 'te' ? 'te' : 'en';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.lang = language;
    document.documentElement.style.colorScheme = theme;
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />
      </head>
      <body className="antialiased">
        <PreferencesProvider>{children}</PreferencesProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

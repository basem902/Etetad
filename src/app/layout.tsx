import type { Metadata, Viewport } from 'next'
import { Tajawal } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { InstallPrompt } from '@/components/shared/install-prompt'
import { NetworkStatus } from '@/components/shared/network-status'
import { ServiceWorkerRegistrar } from '@/components/shared/service-worker-registrar'
import './globals.css'

const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '700', '800'],
  variable: '--font-tajawal',
  display: 'swap',
})

// Phase 16: metadataBase makes OG/canonical URLs absolute. Page-level
// metadata (defined in (marketing)/page.tsx, /pricing, /contact) extends
// these defaults.
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'نظام إدارة العمارة',
    template: '%s · إدارة العمارة',
  },
  description: 'منصة شفافة لإدارة العمارات السكنية. مدفوعات + صيانة + تصويتات + تقارير.',
  applicationName: 'إدارة العمارة',
  keywords: [
    'إدارة عمارة',
    'إدارة عقارات',
    'مدفوعات السكان',
    'صيانة',
    'تصويتات',
    'SaaS عربية',
    'Saudi Arabia',
  ],
  authors: [{ name: 'imarah' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    siteName: 'إدارة العمارة',
  },
  // Explicit manifest reference (Next.js auto-detects, but some Lighthouse
  // versions miss the auto-detected one). Also exports apple-web-app meta
  // so iOS opens the app in standalone mode after "Add to Home Screen".
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'إدارة العمارة',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0e1a' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${tajawal.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NetworkStatus />
          {children}
          <InstallPrompt />
          <Toaster />
          <ServiceWorkerRegistrar />
        </ThemeProvider>
      </body>
    </html>
  )
}

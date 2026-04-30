'use client'

import { Toaster as SonnerToaster } from 'sonner'
import { useTheme } from 'next-themes'

/**
 * App-level toast container. Mount once in the root layout.
 * Uses next-themes to keep toast colors aligned with light/dark mode.
 * RTL position: top-left works well in RTL since "left" sits at the
 * leading edge of the page in Arabic.
 */
export function Toaster() {
  const { theme } = useTheme()
  const themeMode: 'light' | 'dark' | 'system' =
    theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'system'

  return (
    <SonnerToaster
      position="top-left"
      theme={themeMode}
      richColors
      closeButton
      dir="rtl"
      toastOptions={{
        classNames: {
          toast: 'font-sans',
        },
      }}
    />
  )
}

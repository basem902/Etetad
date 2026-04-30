'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * BeforeInstallPromptEvent isn't standardized — we type the parts we use.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pwa-install-dismissed-at'
const REMIND_AFTER_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

/**
 * Floating PWA install prompt. Appears once `beforeinstallprompt` fires,
 * persisting dismissals for 14 days so we don't nag the user.
 *
 * iOS Safari doesn't fire this event — users install via Share → Add to Home.
 * For iOS we'd add a separate hint (out of scope for v1).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    // Honor a recent dismissal
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? '0')
    if (Date.now() - dismissedAt < REMIND_AFTER_MS) return

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (!deferred || hidden) return null

  async function handleInstall() {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'dismissed') {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    }
    setDeferred(null)
    setHidden(true)
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setHidden(true)
  }

  return (
    <div
      role="dialog"
      aria-label="تثبيت التطبيق"
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:end-4 sm:max-w-sm z-50 rounded-lg border border-border bg-card shadow-lg p-4 flex items-start gap-3"
    >
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
        <Download className="h-5 w-5" aria-hidden />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="space-y-0.5">
          <p className="font-medium text-sm">ثبّت التطبيق</p>
          <p className="text-xs text-muted-foreground">
            للوصول السريع من الشاشة الرئيسية بدون فتح المتصفح.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleInstall}>
            تثبيت
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss}>
            ليس الآن
          </Button>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleDismiss}
        aria-label="إغلاق"
        className="shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

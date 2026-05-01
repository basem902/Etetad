'use client'

import { useEffect, useState } from 'react'
import { Download, Share, Plus, X } from 'lucide-react'
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

function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  // iPhone/iPad/iPod (and modern iPad masquerading as Mac with touch)
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && 'ontouchend' in document)
  )
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari standalone flag
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  )
}

/**
 * Floating PWA install prompt with two flavors:
 *
 * 1. Chromium / Android — uses the standard `beforeinstallprompt` event.
 *    Tap "تثبيت" → native UA prompt.
 *
 * 2. iOS Safari — doesn't fire `beforeinstallprompt`. We show a hint
 *    explaining the Share → Add to Home flow. This appears for any iOS
 *    visitor not already in standalone mode (and not recently dismissed).
 *
 * Dismissals are persisted for 14 days in either case.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOS, setShowIOS] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    // Honor a recent dismissal
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? '0')
    if (Date.now() - dismissedAt < REMIND_AFTER_MS) return

    // iOS path — no event, decide on userAgent + display-mode
    if (isIOS() && !isStandalone()) {
      setShowIOS(true)
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (hidden) return null
  if (!deferred && !showIOS) return null

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

  // iOS variant — instructions, not a button (Safari doesn't expose install API)
  if (showIOS && !deferred) {
    return (
      <div
        role="dialog"
        aria-label="ثبّت التطبيق على iPhone"
        className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:end-4 sm:max-w-sm z-50 rounded-lg border border-border bg-card shadow-lg p-4 flex items-start gap-3"
      >
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
          <Download className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="space-y-0.5">
            <p className="font-medium text-sm">ثبّت التطبيق على iPhone</p>
            <p className="text-xs text-muted-foreground leading-5">
              اضغَط زِر المُشارَكة{' '}
              <Share className="inline h-3.5 w-3.5 align-text-bottom mx-0.5" />{' '}
              في Safari ثُم اختَر{' '}
              <span className="font-medium">«إضافة إلى الشاشة الرَئيسية»</span>{' '}
              <Plus className="inline h-3.5 w-3.5 align-text-bottom mx-0.5" />
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleDismiss}>
            فَهِمت
          </Button>
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

  // Chromium / Android variant — native install button
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

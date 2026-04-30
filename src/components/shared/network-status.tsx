'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Sticky banner that appears when the browser reports we're offline.
 * Disappears as soon as connectivity returns.
 */
export function NetworkStatus() {
  // Default to online to avoid SSR mismatch flash
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    function handleOnline() {
      setOnline(true)
    }
    function handleOffline() {
      setOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 bg-warning text-warning-foreground py-1.5 px-3 text-xs flex items-center justify-center gap-2 border-b border-warning/40"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      <span>لا يوجد اتصال بالإنترنت — قد تَرى بيانات قديمة</span>
    </div>
  )
}

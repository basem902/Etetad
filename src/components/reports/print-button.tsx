'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton() {
  return (
    <Button
      onClick={() => window.print()}
      variant="outline"
      size="sm"
      data-print-hide
    >
      <Printer className="h-4 w-4" />
      طباعة
    </Button>
  )
}

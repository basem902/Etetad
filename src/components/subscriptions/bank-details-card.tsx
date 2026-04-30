'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'

interface Props {
  referenceNumber: string
  totalAmount: number
  currency: string
  bank: {
    bank_name: string
    account_holder: string
    iban: string
    account_number: string
  }
}

export function BankDetailsCard({ referenceNumber, totalAmount, currency, bank }: Props) {
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`تم نسخ ${label}`)
    } catch {
      toast.error('تَعذَّر النسخ — انسخ يدوياً.')
    }
  }

  const amountFmt = currency === 'SAR' ? formatCurrency(totalAmount) : `${totalAmount} ${currency}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">بيانات التَحويل البنكي</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Amount + Reference (highlighted) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground mb-1">المبلغ المُستحق</div>
            <div className="text-xl font-bold tabular-nums">{amountFmt}</div>
          </div>
          <div className="rounded-md border border-warning bg-warning/10 p-3">
            <div className="text-xs text-muted-foreground mb-1">رقم المرجع *</div>
            <div className="flex items-center justify-between gap-2">
              <code className="text-sm font-mono font-bold">{referenceNumber}</code>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => copy(referenceNumber, 'رقم المرجع')}
                aria-label="نسخ رقم المرجع"
                className="h-7 w-7"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          ⚠️ اذكر رقم المرجع في حقل البيان (memo) عند التحويل — يُساعدنا على
          مَطابقة التحويل بسرعة.
        </p>

        {/* Bank account fields */}
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-[100px_1fr_auto] items-center gap-2 py-1.5 border-b border-border">
            <span className="text-muted-foreground">البنك</span>
            <span className="font-medium">{bank.bank_name || '—'}</span>
            <span />
          </div>
          <div className="grid grid-cols-[100px_1fr_auto] items-center gap-2 py-1.5 border-b border-border">
            <span className="text-muted-foreground">اسم الحساب</span>
            <span className="font-medium">{bank.account_holder || '—'}</span>
            <span />
          </div>
          <div className="grid grid-cols-[100px_1fr_auto] items-center gap-2 py-1.5 border-b border-border">
            <span className="text-muted-foreground">IBAN</span>
            <code className="font-mono text-xs truncate" dir="ltr">{bank.iban || '—'}</code>
            {bank.iban && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => copy(bank.iban, 'IBAN')}
                aria-label="نسخ IBAN"
                className="h-7 w-7"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-[100px_1fr_auto] items-center gap-2 py-1.5">
            <span className="text-muted-foreground">رقم الحساب</span>
            <code className="font-mono text-xs truncate" dir="ltr">
              {bank.account_number || '—'}
            </code>
            {bank.account_number && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => copy(bank.account_number, 'رقم الحساب')}
                aria-label="نسخ رقم الحساب"
                className="h-7 w-7"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

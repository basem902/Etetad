'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

type Mode = 'monthly' | 'yearly' | 'range'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

const today = () => new Date().toISOString().slice(0, 10)

interface Props {
  /** Current period from the URL (parsed; only used to seed mode default). */
  currentPeriod?: string
}

export function PeriodSelector({ currentPeriod }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Detect initial mode from currentPeriod
  let initialMode: Mode = 'monthly'
  if (currentPeriod) {
    if (currentPeriod.includes('~')) initialMode = 'range'
    else if (/^\d{4}$/.test(currentPeriod)) initialMode = 'yearly'
  }

  const [mode, setMode] = useState<Mode>(initialMode)
  const now = new Date()
  const [monthVal, setMonthVal] = useState<string>(
    currentPeriod && /^\d{4}-\d{2}$/.test(currentPeriod)
      ? currentPeriod
      : `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`,
  )
  const [yearVal, setYearVal] = useState<string>(
    currentPeriod && /^\d{4}$/.test(currentPeriod)
      ? currentPeriod
      : `${now.getFullYear()}`,
  )
  const [fromVal, setFromVal] = useState<string>(
    currentPeriod && currentPeriod.includes('~')
      ? currentPeriod.split('~')[0] || today()
      : today(),
  )
  const [toVal, setToVal] = useState<string>(
    currentPeriod && currentPeriod.includes('~')
      ? currentPeriod.split('~')[1] || today()
      : today(),
  )

  function navigate(period: string) {
    startTransition(() => {
      router.push(`/reports/financial/${encodeURIComponent(period)}`)
    })
  }

  return (
    <div className="space-y-3">
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="monthly">شهري</TabsTrigger>
          <TabsTrigger value="yearly">سنوي</TabsTrigger>
          <TabsTrigger value="range">نطاق مخصَّص</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="pt-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="period-monthly">الشهر</Label>
              <Input
                id="period-monthly"
                type="month"
                value={monthVal}
                onChange={(e) => setMonthVal(e.target.value)}
                disabled={isPending}
              />
            </div>
            <Button
              onClick={() => navigate(monthVal)}
              loading={isPending}
              disabled={!/^\d{4}-\d{2}$/.test(monthVal)}
            >
              <Calendar className="h-4 w-4" />
              عرض
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="yearly" className="pt-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="period-yearly">السنة</Label>
              <Input
                id="period-yearly"
                type="number"
                min="2000"
                max="2100"
                value={yearVal}
                onChange={(e) => setYearVal(e.target.value)}
                disabled={isPending}
              />
            </div>
            <Button
              onClick={() => navigate(yearVal)}
              loading={isPending}
              disabled={!/^\d{4}$/.test(yearVal)}
            >
              <Calendar className="h-4 w-4" />
              عرض
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="range" className="pt-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="period-from">من</Label>
              <Input
                id="period-from"
                type="date"
                value={fromVal}
                onChange={(e) => setFromVal(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="period-to">إلى</Label>
              <Input
                id="period-to"
                type="date"
                value={toVal}
                onChange={(e) => setToVal(e.target.value)}
                disabled={isPending}
              />
            </div>
            <Button
              onClick={() => navigate(`${fromVal}~${toVal}`)}
              loading={isPending}
              disabled={!fromVal || !toVal || fromVal > toVal}
            >
              <Calendar className="h-4 w-4" />
              عرض
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Layers, DoorOpen, Cable, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { completeBuildingSetupAction } from '@/actions/building'

interface Props {
  buildingId: string
  initialName: string
  initialApartments: number
  initialElevators: number
  initialFloors: number
}

type Step = 1 | 2 | 3 | 4 | 5

const STEP_LABELS: Record<Step, string> = {
  1: 'اسم العمارة',
  2: 'عَدَد الأَدوار',
  3: 'عَدَد الشُقَق',
  4: 'عَدَد المَصاعد',
  5: 'مُراجَعة',
}

export function SetupWizard({
  buildingId,
  initialName,
  initialApartments,
  initialElevators,
  initialFloors,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState(initialName)
  const [floors, setFloors] = useState<string>(
    initialFloors > 0 ? String(initialFloors) : '',
  )
  const [apartments, setApartments] = useState<string>(
    initialApartments > 0 ? String(initialApartments) : '',
  )
  const [elevators, setElevators] = useState<string>(
    initialElevators > 0 ? String(initialElevators) : '0',
  )

  function validateStep(s: Step): string | null {
    if (s === 1) {
      if (name.trim().length < 2) return 'اسم العمارة يَجِب أن يَكون 2 أحرف على الأَقَل'
      if (name.trim().length > 200) return 'اسم العمارة طَويل جداً'
    }
    if (s === 2) {
      const n = Number(floors)
      if (!Number.isInteger(n) || n < 1 || n > 200) {
        return 'عَدَد الأَدوار يَجِب أن يَكون بين 1 و 200'
      }
    }
    if (s === 3) {
      const n = Number(apartments)
      if (!Number.isInteger(n) || n < 1 || n > 10000) {
        return 'عَدَد الشُقَق يَجِب أن يَكون بين 1 و 10000'
      }
    }
    if (s === 4) {
      const n = Number(elevators)
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        return 'عَدَد المَصاعد يَجِب أن يَكون بين 0 و 100'
      }
    }
    return null
  }

  function handleNext() {
    const err = validateStep(step)
    if (err) {
      toast.error(err)
      return
    }
    if (step < 5) setStep(((step as number) + 1) as Step)
  }

  function handlePrev() {
    if (step > 1) setStep(((step as number) - 1) as Step)
  }

  function handleSubmit() {
    // Re-validate all steps before final submit
    for (const s of [1, 2, 3, 4] as Step[]) {
      const err = validateStep(s)
      if (err) {
        toast.error(err)
        setStep(s)
        return
      }
    }

    const fd = new FormData()
    fd.set('building_id', buildingId)
    fd.set('name', name.trim())
    fd.set('floors_count', floors)
    fd.set('total_apartments', apartments)
    fd.set('elevators_count', elevators)

    startTransition(async () => {
      const result = await completeBuildingSetupAction(fd)
      if (result.success) {
        toast.success(result.message ?? 'تم.')
        router.replace(`/onboarding/share/${buildingId}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card className="w-full max-w-md">
      <CardContent className="pt-6 space-y-6">
        {/* Progress indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              الخُطوة {step} مِن 5
            </span>
            <span>{STEP_LABELS[step]}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[180px]">
          {step === 1 && (
            <StepShell icon={<Building2 />} title="ما اسم العمارة؟">
              <Label htmlFor="name">الاسم</Label>
              <Input
                id="name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
                placeholder="مثلاً: عمارة الريّان"
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleNext()
                  }
                }}
              />
            </StepShell>
          )}

          {step === 2 && (
            <StepShell icon={<Layers />} title="كَم عَدَد الأَدوار في العمارة؟">
              <Label htmlFor="floors">عَدَد الأَدوار</Label>
              <Input
                id="floors"
                autoFocus
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                value={floors}
                onChange={(e) => setFloors(e.target.value)}
                disabled={isPending}
                placeholder="مثلاً: 5"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleNext()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                نَستَخدِم هذا الرَقم لِتَوزيع الشُقَق عَلى الأَدوار تِلقائياً.
              </p>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell icon={<DoorOpen />} title="كَم عَدَد الشُقَق الإجمالي؟">
              <Label htmlFor="apartments">عَدَد الشُقَق</Label>
              <Input
                id="apartments"
                autoFocus
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                value={apartments}
                onChange={(e) => setApartments(e.target.value)}
                disabled={isPending}
                placeholder="مثلاً: 20"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleNext()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                سَيُنشَأ هذا العَدَد مِن الشُقَق فارغة جاهِزة لإسناد السُكّان لاحقاً.
              </p>
            </StepShell>
          )}

          {step === 4 && (
            <StepShell icon={<Cable />} title="كَم عَدَد المَصاعد؟">
              <Label htmlFor="elevators">عَدَد المَصاعد</Label>
              <Input
                id="elevators"
                autoFocus
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={elevators}
                onChange={(e) => setElevators(e.target.value)}
                disabled={isPending}
                placeholder="مثلاً: 1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleNext()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                ضَعْ 0 إذا لم يَكُن هُناك مَصاعد.
              </p>
            </StepShell>
          )}

          {step === 5 && (
            <StepShell icon={<Check />} title="مُراجَعة قَبل الحِفظ">
              <ReviewRow label="اسم العمارة" value={name} />
              <ReviewRow label="عَدَد الأَدوار" value={floors} />
              <ReviewRow label="عَدَد الشُقَق" value={apartments} />
              <ReviewRow label="عَدَد المَصاعد" value={elevators} />
              <p className="text-xs text-muted-foreground pt-2">
                بَعد الحِفظ، ستَنتَقِل لِصَفحة رابِط الدَعوة لِمُشارَكَتِه مَع
                السُكّان.
              </p>
            </StepShell>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handlePrev}
            disabled={isPending || step === 1}
          >
            <ArrowRight className="h-4 w-4" />
            السابِق
          </Button>

          {step < 5 ? (
            <Button type="button" onClick={handleNext} disabled={isPending}>
              التالي
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} loading={isPending}>
              حِفظ + المُتابَعة
              <Check className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StepShell({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary [&>svg]:h-5 [&>svg]:w-5"
        >
          {icon}
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium">{value || '—'}</span>
    </div>
  )
}

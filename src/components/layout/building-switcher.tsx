'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, ChevronDown, CircleSlash } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { switchBuildingAction } from '@/actions/tenant'
import type { UserBuilding } from '@/lib/tenant'
import { cn } from '@/lib/utils'

interface Props {
  buildings: UserBuilding[]
  activeBuildingId: string | null
}

const ROLE_LABELS: Record<UserBuilding['role'], string> = {
  admin: 'مدير',
  treasurer: 'أمين الصندوق',
  committee: 'عضو لجنة',
  resident: 'ساكن',
  technician: 'فني',
}

export function BuildingSwitcher({ buildings, activeBuildingId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (buildings.length === 0) return null

  const active =
    buildings.find((b) => b.building_id === activeBuildingId) ?? buildings[0]
  if (!active) return null

  function handleSwitch(buildingId: string) {
    if (buildingId === active?.building_id) return
    startTransition(async () => {
      const result = await switchBuildingAction(buildingId)
      if (result.success) {
        toast.success('تم تبديل العمارة')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || buildings.length === 1}
          className="gap-2 max-w-[220px]"
        >
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="truncate">{active.buildings?.name ?? 'عمارة'}</span>
          {buildings.length > 1 && (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[260px]">
        <DropdownMenuLabel>عماراتك</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {buildings.map((b) => {
          const isActive = b.building_id === active.building_id
          const subStatus = b.buildings?.subscription_status
          const isInactive = subStatus === 'expired' || subStatus === 'cancelled'
          return (
            <DropdownMenuItem
              key={b.building_id}
              onClick={() => handleSwitch(b.building_id)}
              className="gap-3"
            >
              <span className="flex flex-1 flex-col items-start gap-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  {b.buildings?.name ?? '—'}
                  {isInactive && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] text-destructive"
                      aria-label={subStatus === 'expired' ? 'منتهية' : 'ملغاة'}
                    >
                      <CircleSlash className="h-3 w-3" />
                      {subStatus === 'expired' ? 'منتهية' : 'ملغاة'}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  دورك: {ROLE_LABELS[b.role]}
                </span>
              </span>
              <Check
                className={cn('h-4 w-4', isActive ? 'opacity-100' : 'opacity-0')}
                aria-hidden
              />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

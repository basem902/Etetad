import Link from 'next/link'
import {
  Receipt,
  FileSpreadsheet,
  Building2,
  UserPlus,
  Vote,
  Wrench,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MembershipRole } from '@/types/database'

type Action = { href: string; label: string; icon: LucideIcon }

const ACTIONS_BY_ROLE: Record<MembershipRole, Action[]> = {
  admin: [
    { href: '/expenses/new', label: 'إضافة مصروف', icon: FileSpreadsheet },
    { href: '/apartments/new', label: 'إضافة شقة', icon: Building2 },
    { href: '/apartments', label: 'دعوة عضو', icon: UserPlus },
    { href: '/votes/new', label: 'إنشاء تصويت', icon: Vote },
  ],
  treasurer: [
    { href: '/payments/new', label: 'تسجيل دفعة', icon: Receipt },
    { href: '/expenses/new', label: 'إضافة مصروف', icon: FileSpreadsheet },
  ],
  committee: [
    { href: '/votes/new', label: 'إنشاء تصويت', icon: Vote },
    { href: '/maintenance/new', label: 'فتح طلب صيانة', icon: Wrench },
  ],
  resident: [
    { href: '/payments/new', label: 'تسجيل دفعة', icon: Receipt },
    { href: '/maintenance/new', label: 'فتح طلب صيانة', icon: Wrench },
    { href: '/suggestions/new', label: 'تقديم اقتراح', icon: Lightbulb },
  ],
  // technician has no quick actions; their dashboard focuses on assigned tasks.
  technician: [],
}

export function QuickActions({ role }: { role: MembershipRole }) {
  const actions = ACTIONS_BY_ROLE[role]
  if (!actions || actions.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">إجراءات سريعة</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          {actions.map((a) => (
            <Button
              key={a.href}
              asChild
              variant="outline"
              size="sm"
              className="justify-start h-auto py-3"
            >
              <Link href={a.href} className="flex items-center gap-2 text-right">
                <a.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="text-sm">{a.label}</span>
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

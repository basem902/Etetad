import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

const ENTITY_LABELS: Record<string, string> = {
  apartments: 'شقة',
  apartment_members: 'عضو شقة',
  building_memberships: 'عضوية عمارة',
  payments: 'دفعة',
  expenses: 'مصروف',
  vendors: 'مورد',
  maintenance_requests: 'طلب صيانة',
  tasks: 'مهمة',
  suggestions: 'اقتراح',
  votes: 'تصويت',
  vote_responses: 'صوت',
  decisions: 'قرار',
  documents: 'مستند',
  buildings: 'عمارة',
  profiles: 'ملف شخصي',
}

const ENTITY_ROUTES: Record<string, (id: string) => string | null> = {
  payments: (id) => `/payments/${id}`,
  expenses: (id) => `/expenses/${id}`,
  vendors: (id) => `/vendors/${id}`,
  maintenance_requests: (id) => `/maintenance/${id}`,
  suggestions: (id) => `/suggestions/${id}`,
  votes: (id) => `/votes/${id}`,
  decisions: (id) => `/decisions/${id}`,
  apartments: (id) => `/apartments/${id}`,
}

interface Props {
  entityType: string
  entityId: string | null
}

/**
 * Generic entity link for the audit log table. Maps entity_type → human label
 * (Arabic) and (when supported) → a clickable detail page link.
 */
export function EntityLink({ entityType, entityId }: Props) {
  const label = ENTITY_LABELS[entityType] ?? entityType
  if (!entityId) {
    return <span className="text-muted-foreground">{label}</span>
  }
  const href = ENTITY_ROUTES[entityType]?.(entityId) ?? null
  if (!href) {
    return (
      <span className="text-muted-foreground">
        {label} <span className="text-xs">({entityId.slice(0, 8)}…)</span>
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </Link>
  )
}

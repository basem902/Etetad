import { Building2 } from 'lucide-react'
import { formatDateTime } from '@/lib/format'
import type { VoterEntry } from '@/lib/queries/governance'

interface Props {
  voters: VoterEntry[]
}

/**
 * Admin-only detailed list: which apartment voted, by whom, when, and which
 * option they chose. This is the transparency mechanism that PLAN §10
 * requires for managers (regular users only see aggregate counts).
 */
export function VotedApartmentsList({ voters }: Props) {
  if (voters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        لم تَصوّت أي شقة بعد.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="h-10 px-3 text-right font-medium">الشقة</th>
            <th className="h-10 px-3 text-right font-medium">المُصوِّت</th>
            <th className="h-10 px-3 text-right font-medium">الخيار</th>
            <th className="h-10 px-3 text-right font-medium">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {voters.map((v) => (
            <tr
              key={v.apartment_id}
              className="border-t border-border hover:bg-muted/30 transition-colors"
            >
              <td className="h-12 px-3 align-middle font-medium">
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  شقة {v.apartment_number ?? '—'}
                </span>
              </td>
              <td className="h-12 px-3 align-middle">{v.user_name ?? '—'}</td>
              <td className="h-12 px-3 align-middle">{v.option_label}</td>
              <td className="h-12 px-3 align-middle whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(v.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

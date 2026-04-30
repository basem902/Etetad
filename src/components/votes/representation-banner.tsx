import { Building2, AlertTriangle } from 'lucide-react'

interface Props {
  /** When set, the user is an active rep — banner shows the apartment number. */
  apartmentNumber?: string | null
  /** When true, the user is NOT a voting rep for any apartment. */
  isNotRep?: boolean
  /** When set, the apartment has already voted (current rep name). */
  alreadyVotedBy?: string | null
  alreadyVotedAt?: string | null
  alreadyChosenOption?: string | null
}

/**
 * Big visible banner on the cast-vote screen showing one of three states:
 *   1. "تصوّت باسم شقة X" (rep + apartment hasn't voted yet)
 *   2. "تصوّتت شقة X بواسطة Y" (apartment already voted)
 *   3. "لست ممثل تصويت" (user has no voting rep role)
 */
export function RepresentationBanner({
  apartmentNumber,
  isNotRep,
  alreadyVotedBy,
  alreadyVotedAt,
  alreadyChosenOption,
}: Props) {
  if (isNotRep) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/5 p-4 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">لست ممثل تصويت لأي شقة</p>
            <p className="text-muted-foreground text-xs">
              التصويت يَتم باسم الشقة عبر ممثل واحد فقط. لو كنت عضواً في شقة،
              راجع الممثل الحالي مع المدير.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (alreadyVotedBy) {
    return (
      <div className="rounded-md border border-success/40 bg-success/5 p-4 text-sm">
        <div className="flex items-start gap-2">
          <Building2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">
              صوّتت شقة {apartmentNumber ?? '—'} بالفعل
            </p>
            <p className="text-muted-foreground text-xs">
              المُصوِّت: {alreadyVotedBy}
              {alreadyVotedAt ? ` · ${alreadyVotedAt}` : ''}
              {alreadyChosenOption ? ` · اختار: ${alreadyChosenOption}` : ''}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-4 text-sm">
      <div className="flex items-start gap-2">
        <Building2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">
            تصوّت باسم شقة {apartmentNumber ?? '—'}
          </p>
          <p className="text-muted-foreground text-xs">
            هذا الصوت يُحسب لشقتك (وليس لشخصك). صوت واحد لكل شقة.
          </p>
        </div>
      </div>
    </div>
  )
}

import { FileText, Tag, User, Calendar, Lock, Globe } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DocumentActions } from './document-actions'
import { formatDate } from '@/lib/format'
import type { DocumentRow } from '@/lib/queries/documents'

function fileSizeKB(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} بايت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} كيلوبايت`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجا`
}

interface Props {
  document: DocumentRow
  /** When true, the user can edit/delete (admin/treasurer/committee). */
  canManage: boolean
}

export function DocumentCard({ document: d, canManage }: Props) {
  return (
    <Card className="overflow-hidden hover:bg-muted/30 transition-colors">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium truncate flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              {d.title}
            </h3>
          </div>
          <Badge variant={d.is_public ? 'secondary' : 'warning'} className="shrink-0">
            {d.is_public ? (
              <>
                <Globe className="h-3 w-3" />
                عام
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" />
                إدارة فقط
              </>
            )}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          {d.category && (
            <span className="flex items-center gap-1 truncate">
              <Tag className="h-3 w-3 shrink-0" />
              {d.category}
            </span>
          )}
          <span className="flex items-center gap-1 truncate">
            <Calendar className="h-3 w-3 shrink-0" />
            {formatDate(d.created_at)}
          </span>
          {d.uploaded_by_name && (
            <span className="flex items-center gap-1 truncate col-span-2">
              <User className="h-3 w-3 shrink-0" />
              {d.uploaded_by_name}
            </span>
          )}
          <span className="text-xs text-muted-foreground col-span-2">
            الحجم: {fileSizeKB(d.file_size)}
          </span>
        </div>

        <DocumentActions document={d} canManage={canManage} />
      </CardContent>
    </Card>
  )
}

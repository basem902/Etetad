import Link from 'next/link'
import { Phone, Tag, Archive } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RatingStars } from './rating-stars'
import type { VendorRow } from '@/lib/queries/vendors'

interface Props {
  vendor: VendorRow
}

export function VendorCard({ vendor }: Props) {
  return (
    <Card className="overflow-hidden hover:bg-muted/30 transition-colors">
      <CardContent className="p-4">
        <Link href={`/vendors/${vendor.id}`} className="block space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium truncate flex-1">{vendor.name}</h3>
            {!vendor.is_active && (
              <Badge variant="secondary" className="shrink-0">
                <Archive className="h-3 w-3" />
                مؤرشف
              </Badge>
            )}
          </div>

          <RatingStars value={vendor.rating} readOnly size="h-4 w-4" />

          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {vendor.specialty && (
              <span className="flex items-center gap-1 truncate">
                <Tag className="h-3 w-3 shrink-0" />
                {vendor.specialty}
              </span>
            )}
            {vendor.phone && (
              <span className="flex items-center gap-1 truncate">
                <Phone className="h-3 w-3 shrink-0" />
                {vendor.phone}
              </span>
            )}
          </div>
        </Link>

        {vendor.phone && (
          <a
            href={`tel:${vendor.phone}`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            aria-label={`اتصل بـ ${vendor.name}`}
          >
            <Phone className="h-3.5 w-3.5" />
            اتصل الآن
          </a>
        )}
      </CardContent>
    </Card>
  )
}

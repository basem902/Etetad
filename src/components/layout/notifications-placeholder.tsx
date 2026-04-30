'use client'

import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * Placeholder notifications icon — disabled until the notifications system
 * lands in a later phase. Keeps the visual slot in the header per Phase 3 spec.
 */
export function NotificationsPlaceholder() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/*
          We render an *unstyled* span wrapper so disabled buttons still
          receive pointer-events for the Tooltip. The Button keeps `disabled`.
        */}
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="icon"
            disabled
            aria-label="الإشعارات (قريباً)"
            aria-disabled="true"
          >
            <Bell className="h-4 w-4" aria-hidden />
            {/* Empty-state badge dot, hidden but reserves space for future unread indicator */}
            <span
              aria-hidden
              className="absolute -top-0.5 end-0.5 h-2 w-2 rounded-full bg-muted opacity-0"
            />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">الإشعارات — قريباً</TooltipContent>
    </Tooltip>
  )
}

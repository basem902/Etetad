'use client'

/**
 * PasswordInput — wraps the base Input with a show/hide toggle (eye icon).
 *
 * Use anywhere we ask for a password (login, register, subscribe, reset,
 * join). The toggle is keyboard-accessible and the icon swaps between
 * Eye / EyeOff for visual feedback.
 *
 * Inherits all InputHTMLAttributes from the base Input. Pass `id`, `name`,
 * `required`, `minLength`, `autoComplete`, etc. as you would to <Input>.
 */
import { useState, forwardRef, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false)
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
            'ring-offset-background',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            // Reserve space on the LEFT for the toggle (RTL: the visual right of the input)
            'pl-10',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          className={cn(
            'absolute inset-y-0 left-0 flex items-center px-3',
            'text-muted-foreground hover:text-foreground transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          disabled={props.disabled}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'

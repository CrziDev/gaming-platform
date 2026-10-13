import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode, type SelectHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

export const inputClass =
  'w-full min-h-11 rounded-input border border-hairline bg-field px-3.5 text-[13.5px] text-ink-soft lg:min-h-10 ' +
  'placeholder:text-ink-mute transition-[color,background-color,border-color,opacity] duration-fast ease-standard ' +
  'focus:border-hairline-strong disabled:cursor-not-allowed disabled:text-ink-mute disabled:opacity-55'

type FieldProps = {
  label: string
  htmlFor: string
  error?: string | undefined
  hint?: ReactNode
  action?: ReactNode
  children: ReactNode
}

export function Field({ label, htmlFor, error, hint, action, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-mute">
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint ? <p className="text-[12px] leading-relaxed text-ink-mute">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />
}

export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye

  return (
    <div className="relative">
      <input type={visible ? 'text' : 'password'} className={cn(inputClass, 'pr-12', className)} {...props} />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((shown) => !shown)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-input text-ink-mute transition-colors duration-fast ease-standard hover:text-ink-soft lg:w-10"
      >
        <Icon aria-hidden size={18} strokeWidth={1.8} />
      </button>
    </div>
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputClass, 'appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={16}
        strokeWidth={1.8}
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-mute"
      />
    </div>
  )
}

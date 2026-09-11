import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

export const inputClass =
  'w-full min-h-11 rounded-input bg-inset px-3 text-[13.5px] text-ink-soft lg:min-h-[34px] ' +
  'placeholder:text-ink-mute transition-colors duration-[120ms] ease-standard ' +
  'focus:bg-wash disabled:text-ink-mute'

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

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputClass, 'appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-mute"
      >
        ⌄
      </span>
    </div>
  )
}

import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'play'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-display font-semibold ' +
  'transition-colors duration-[120ms] ease-standard disabled:cursor-not-allowed'

const variants: Record<ButtonVariant, string> = {
  primary:
    'rounded-xl bg-accent text-on-accent shadow-glow hover:bg-accent-hi active:bg-accent-press ' +
    'disabled:bg-surface-1 disabled:text-ink-faint disabled:shadow-none',
  secondary:
    'rounded-xl border border-line-strong bg-surface-2 text-ink hover:border-line-hover ' +
    'disabled:border-line disabled:bg-surface-1 disabled:text-ink-faint',
  ghost: 'rounded-xl text-ink-mute hover:text-ink disabled:text-ink-faint',
  destructive:
    'rounded-xl border border-danger/35 bg-danger/10 text-danger hover:bg-danger/20 ' +
    'disabled:border-line disabled:bg-surface-1 disabled:text-ink-faint',
  play: 'rounded-card bg-success text-on-accent hover:brightness-110 disabled:bg-surface-1 disabled:text-ink-faint',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-4 text-[13px] lg:min-h-9 lg:px-3.5',
  md: 'min-h-12 px-5 text-sm lg:min-h-10 lg:px-4',
  lg: 'min-h-14 px-8 text-[16px] font-bold tracking-[0.01em] lg:min-h-12',
}

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  fullWidth = false,
): string {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full')
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={cn(buttonStyles(variant, size, fullWidth), className)} {...props} />
  )
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
}

export function IconButton({ label, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex size-11 shrink-0 items-center justify-center rounded-input lg:size-9',
        'border border-line-strong bg-surface-2 text-ink-mute',
        'transition-colors duration-[120ms] ease-standard hover:border-line-hover hover:text-ink',
        className,
      )}
      {...props}
    />
  )
}

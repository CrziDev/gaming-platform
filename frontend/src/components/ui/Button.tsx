import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'play'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-chip font-semibold ' +
  'transition-colors duration-[120ms] ease-standard disabled:cursor-not-allowed'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-hi disabled:bg-surface-2 disabled:text-ink-mute',
  secondary:
    'bg-inset font-medium text-ink-soft hover:bg-wash disabled:bg-inset disabled:text-ink-mute',
  ghost: 'font-medium text-ink-mute hover:bg-wash hover:text-ink-soft disabled:text-ink-mute',
  destructive:
    'bg-danger/12 text-danger hover:bg-danger/20 disabled:bg-surface-2 disabled:text-ink-mute',
  play: 'min-h-13 rounded-tile bg-accent text-on-accent hover:bg-accent-hi disabled:bg-surface-2 disabled:text-ink-mute',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3.5 text-[12.5px] lg:min-h-8 lg:px-3',
  md: 'min-h-11 px-4 text-[13px] lg:min-h-[34px]',
  lg: 'min-h-12 px-5 text-[13.5px] lg:min-h-[38px]',
}

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  fullWidth = false,
): string {
  return cn(base, sizes[size], variants[variant], fullWidth && 'w-full')
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
        'relative inline-flex size-11 shrink-0 items-center justify-center rounded-input text-ink-mute lg:size-8',
        'transition-colors duration-[120ms] ease-standard hover:bg-wash hover:text-ink-soft',
        className,
      )}
      {...props}
    />
  )
}

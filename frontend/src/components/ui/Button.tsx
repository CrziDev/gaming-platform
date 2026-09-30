import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'play'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-input font-semibold ' +
  'transition-[color,background-color,opacity,transform,filter] duration-fast ease-standard ' +
  'active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 ' +
  'motion-reduce:transform-none'

const cta =
  'cta-gradient cta-glow font-bold hover:brightness-110 ' +
  'disabled:bg-none disabled:bg-surface-2 disabled:text-ink-mute disabled:shadow-none'

const variants: Record<ButtonVariant, string> = {
  primary: cta,
  secondary:
    'border border-hairline bg-inset font-medium text-ink-control hover:bg-wash disabled:bg-inset disabled:text-ink-mute',
  ghost: 'font-medium text-ink-mute hover:bg-wash hover:text-ink-soft disabled:text-ink-mute',
  destructive:
    'bg-danger/12 text-danger hover:bg-danger/20 disabled:bg-surface-2 disabled:text-ink-mute',
  play: cn(cta, 'tracking-[0.02em]'),
}

const sizes: Record<ButtonSize, string> = {
  sm: 'tap-target min-h-[34px] px-3 text-[12.5px] lg:min-h-8',
  md: 'tap-target min-h-9 px-3.5 text-[13px] lg:min-h-[34px] lg:px-4',
  lg: 'tap-target min-h-10 px-4 text-[13.5px] lg:min-h-[38px] lg:px-5',
}

const playSize = 'min-h-13 px-2 text-[16px] sm:min-h-15 sm:px-5 sm:text-[19px]'

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  fullWidth = false,
): string {
  return cn(base, variant === 'play' ? playSize : sizes[size], variants[variant], fullWidth && 'w-full')
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
  size?: 'compact' | 'md' | 'round' | 'float'
}

const iconSizes: Record<NonNullable<IconButtonProps['size']>, string> = {
  compact: 'tap-target size-9 rounded-chip text-ink-mute hover:bg-wash hover:text-ink-soft lg:size-8',
  md: 'size-11 rounded-chip text-ink-mute hover:bg-wash hover:text-ink-soft lg:size-8',
  round: 'glass-pill size-11 rounded-full text-ink-soft hover:bg-wash sm:size-11.5',
  float: 'tap-target glass-float size-9 rounded-input text-ink-control hover:bg-float-hover sm:size-11',
}

export function IconButton({ label, size = 'md', className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        iconSizes[size],
        'transition-[color,background-color,opacity,transform] duration-fast ease-standard active:translate-y-px disabled:pointer-events-none disabled:opacity-55 motion-reduce:transform-none',
        className,
      )}
      {...props}
    />
  )
}

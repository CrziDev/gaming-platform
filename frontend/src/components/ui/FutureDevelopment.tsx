import { cn } from '@/lib/cn'

export function FutureDevelopment({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        'flex min-h-40 items-center justify-center rounded-card glass-panel px-4 py-6 text-center text-[13.5px] text-ink-mute',
        className,
      )}
    >
      Future development
    </section>
  )
}

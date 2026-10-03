import { cn } from '@/lib/cn'

function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean)
  return words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : name.trim().slice(0, 2)
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono font-medium text-ink-mute uppercase',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

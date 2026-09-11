import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('rounded-input bg-surface-1', className)} />
}

export function SkeletonGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('grid gap-2.5', className)}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="aspect-3/4 rounded-tile" />
      ))}
    </div>
  )
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-0.5">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-14 rounded-tile" />
      ))}
    </div>
  )
}

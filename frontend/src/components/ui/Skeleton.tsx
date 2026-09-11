import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-input bg-surface-2', className)} />
}

export function SkeletonGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('grid gap-4', className)}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="aspect-3/4 rounded-card lg:aspect-4/5" />
      ))}
    </div>
  )
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-14" />
      ))}
    </div>
  )
}

import { PromotionList } from '@/components/catalogue/Promotions'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { usePromotions } from '@/features/catalogue'

export function PromotionsPage() {
  const promotionsQuery = usePromotions()

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Promotions</h1>

      {promotionsQuery.isPending ? (
        <SkeletonRows count={3} />
      ) : promotionsQuery.isError ? (
        <ErrorState
          message={promotionsQuery.error.message}
          onRetry={() => void promotionsQuery.refetch()}
        />
      ) : promotionsQuery.data.length === 0 ? (
        <EmptyState title="No promotions running" description="Check back soon." />
      ) : (
        <PromotionList promotions={promotionsQuery.data} />
      )}
    </div>
  )
}

import type { Promotion } from '@/api/types'

export function Promotions({ promotions }: { promotions: Promotion[] }) {
  if (promotions.length === 0) {
    return null
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">Promotions</h2>
      <ul
        aria-label="Promotions"
        className="grid gap-2.5 @min-[560px]:grid-cols-2 @rail:grid-cols-3"
      >
        {promotions.map((promotion) => (
          <li
            key={promotion.id}
            className="flex min-h-[84px] items-center gap-3 rounded-card bg-surface-1 p-3"
          >
            <span aria-hidden className="size-14 shrink-0 rounded-chip bg-surface-3" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="label-mono text-[9.5px] text-ink-mute">{promotion.kicker}</span>
              <span className="text-[14.5px] leading-tight font-semibold tracking-[-0.01em] text-ink text-balance">
                {promotion.title}
              </span>
              <span className="text-[12px] text-ink-mute">{promotion.subtitle}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

import { Lock, Zap } from 'lucide-react'

// The reassurance block beside the bet panel: what settles a round and where
// the money lives. Copy only; nothing here decides anything.
export function GameNotice() {
  return (
    <section aria-label="Game notice" className="flex flex-col gap-3 rounded-card bg-surface-1 p-3.5">
      <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">Game notice</h2>
      <ul className="flex flex-col gap-3">
        <li className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-input bg-inset text-accent-ink">
            <Zap aria-hidden size={15} strokeWidth={1.5} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-ink-soft">Instant results</span>
            <span className="text-[12.5px] leading-relaxed text-ink-mute text-pretty">
              Every round is settled by the platform before the ball drops.
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-input bg-inset text-accent-ink">
            <Lock aria-hidden size={15} strokeWidth={1.5} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-ink-soft">Secure platform</span>
            <span className="text-[12.5px] leading-relaxed text-ink-mute text-pretty">
              Your balance and every movement of money are recorded in your history.
            </span>
          </span>
        </li>
      </ul>
    </section>
  )
}

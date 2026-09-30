import { Link } from 'react-router'

import { cn } from '@/lib/cn'
import { paths } from '@/routes/paths'

export function Wordmark({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link
      to={paths.lobby}
      aria-label="HeziBet"
      onClick={onClick}
      className={cn('flex shrink-0 flex-col items-center leading-none text-white', className)}
    >
      <span aria-hidden className="relative text-[20px] font-bold tracking-[-0.035em] sm:text-[22px]">
        Hezi<span className="text-brand">Bet</span>
        <svg
          width="17"
          height="11"
          viewBox="0 0 18 11"
          className="absolute -top-[9px] left-[57%] w-[14px] text-gold sm:w-[15px]"
        >
          <polygon points="0,11 1.5,2 6,6.5 9,0 12,6.5 16.5,2 18,11" fill="currentColor" />
        </svg>
      </span>
      <span aria-hidden className="mt-1 pl-[0.34em] font-mono text-[7.5px] tracking-[0.34em] text-ink-mute sm:text-[8.5px]">
        PLAY SMART
      </span>
    </Link>
  )
}

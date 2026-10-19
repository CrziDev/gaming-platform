import { Link } from 'react-router'

import lockup from '@/assets/brand/playmevo-lockup.webp'
import stacked from '@/assets/brand/playmevo-stacked.webp'
import { cn } from '@/lib/cn'
import { paths } from '@/routes/paths'

export function Wordmark({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link
      to={paths.lobby}
      aria-label="PLAYMEVO"
      onClick={onClick}
      className={cn('flex shrink-0 items-center', className)}
    >
      <BrandLockup />
    </Link>
  )
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <picture className={cn('flex shrink-0', className)}>
      <source media="(min-width: 640px)" srcSet={lockup} width={164} height={30} />
      <img src={stacked} alt="PLAYMEVO" width={100} height={38} draggable={false} className="h-[38px] w-auto sm:h-[30px]" />
    </picture>
  )
}

import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

type SeeAllProps = {
  to: string
  // Names the link for assistive technology when a page carries more than one.
  subject?: string
  onClick?: () => void
}

export function SeeAll({ to, subject, onClick }: SeeAllProps) {
  return (
    <Link
      to={to}
      {...(subject ? { 'aria-label': `See all ${subject}` } : {})}
      {...(onClick ? { onClick } : {})}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[12.5px] font-medium text-ink-mute transition-colors duration-[120ms] hover:text-ink-soft lg:min-h-8"
    >
      See all
      <ChevronRight aria-hidden size={13} strokeWidth={2} />
    </Link>
  )
}

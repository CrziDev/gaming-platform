import { Dices, Layers, Radio, TrendingUp } from 'lucide-react'

type CategoryIconProps = {
  slug: string
  size?: number
  className?: string
}

export function CategoryIcon({ slug, size = 18, className }: CategoryIconProps) {
  const props = { 'aria-hidden': true, size, strokeWidth: 1.5, className } as const

  switch (slug) {
    case 'originals':
      return <Dices {...props} />
    case 'crash':
      return <TrendingUp {...props} />
    case 'live':
      return <Radio {...props} />
    default:
      return <Layers {...props} />
  }
}

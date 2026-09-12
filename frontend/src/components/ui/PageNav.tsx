import { Button } from '@/components/ui/Button'

type PageNavProps = {
  page: number
  pages: number
  size: number
  total: number
  onChange: (page: number) => void
  unit?: string
}

export function PageNav({ page, pages, size, total, onChange, unit }: PageNavProps) {
  if (total === 0) {
    return null
  }

  const first = (page - 1) * size + 1
  const last = Math.min(page * size, total)

  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
      <span className="font-mono text-[12px] text-ink-mute tnum">
        {first}–{last} of {total}
        {unit ? ` ${unit}` : ''}
      </span>
      <div className="flex gap-1.5">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  )
}

import type { ReactNode } from 'react'

type PageHeadingProps = {
  title: string
  meta?: ReactNode
  actions?: ReactNode
}

export function PageHeading({ title, meta, actions }: PageHeadingProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[21px] font-semibold tracking-tight text-ink">{title}</h1>
        {meta ? <p className="text-[13.5px] text-ink-mute">{meta}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </header>
  )
}

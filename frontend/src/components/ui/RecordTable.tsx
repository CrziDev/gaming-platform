import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type Column<T> = {
  key: string
  header: string
  align?: 'left' | 'right'
  width?: string
  columnClass?: string
  cell: (row: T) => ReactNode
}

type RecordTableProps<T> = {
  label: string
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  renderCard: (row: T) => ReactNode
  onRowClick?: (row: T) => void
  footer?: ReactNode
}

export function RecordTable<T>({
  label,
  columns,
  rows,
  rowKey,
  renderCard,
  onRowClick,
  footer,
}: RecordTableProps<T>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 lg:hidden">
        {rows.map((row) => (
          <div key={rowKey(row)}>{renderCard(row)}</div>
        ))}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-separate border-spacing-y-0.5 text-left">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    'label-mono px-3 pt-1 pb-2 font-medium text-ink-mute',
                    column.align === 'right' && 'text-right',
                    column.columnClass,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'bg-surface-1',
                  onRowClick && 'cursor-pointer transition-colors duration-[120ms] hover:bg-surface-2',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 py-3 align-middle text-[13px] text-ink-soft first:rounded-l-tile last:rounded-r-tile',
                      column.align === 'right' && 'text-right',
                      column.columnClass,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {footer}
    </div>
  )
}

type RecordCardProps = {
  title: ReactNode
  meta?: ReactNode
  value?: ReactNode
  aside?: ReactNode
  actions?: ReactNode
  leading?: ReactNode
  onClick?: () => void
}

export function RecordCard({
  title,
  meta,
  value,
  aside,
  actions,
  leading,
  onClick,
}: RecordCardProps) {
  const content = (
    <>
      <div className="flex items-center gap-3">
        {leading}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[13px] font-medium text-ink-soft">{title}</span>
          {meta ? <span className="font-mono text-[11px] text-ink-mute">{meta}</span> : null}
        </div>
        {value || aside ? (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {value}
            {aside}
          </div>
        ) : null}
      </div>
      {actions ? <div className="grid grid-cols-2 gap-2">{actions}</div> : null}
    </>
  )

  const className = 'flex w-full flex-col gap-3 rounded-tile bg-surface-1 p-3 text-left'

  if (!onClick) {
    return <div className={className}>{content}</div>
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      className={cn(className, 'transition-colors duration-[120ms] hover:bg-surface-2')}
    >
      {content}
    </div>
  )
}

import { useState } from 'react'
import { useSearchParams } from 'react-router'

import type { Round } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { RoundRecords } from '@/components/admin/RoundRecords'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { PageNav } from '@/components/ui/PageNav'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useAdminRounds } from '@/features/admin'
import type { Currency } from '@/lib/money'

type StatusFilter = 'all' | Round['status']
type CurrencyFilter = 'all' | Currency

export function AdminRoundsPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search')?.trim() ?? ''
  const [pagination, setPagination] = useState({ search, page: 1 })
  const page = pagination.search === search ? pagination.page : 1
  const setPage = (nextPage: number) => setPagination({ search, page: nextPage })
  const [days, setDays] = useState<7 | 30 | 90>(90)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [currency, setCurrency] = useState<CurrencyFilter>('all')
  const roundsQuery = useAdminRounds({
    page,
    ...(search ? { search } : { days }),
    ...(status === 'all' ? {} : { status }),
    ...(currency === 'all' ? {} : { currency }),
  })
  const result = roundsQuery.data

  const resetPage = (change: () => void) => {
    change()
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Game rounds" meta={search ? 'Console search result across all round history.' : undefined} />

      {search ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-surface-1 px-4 py-3">
          <span className="text-[13px] text-ink-mute">Matching round <span className="font-mono text-ink-soft">{search.slice(0, 12)}</span></span>
          <Button variant="secondary" size="sm" onClick={() => { setParams({}); setPage(1) }}>Clear search</Button>
        </div>
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-3">
        <Select
          aria-label="Round status"
          value={status}
          onChange={(event) => resetPage(() => setStatus(event.target.value as StatusFilter))}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="settled">Settled</option>
          <option value="cancelled">Cancelled</option>
          <option value="failed">Failed</option>
        </Select>
        <Select
          aria-label="Round currency"
          value={currency}
          onChange={(event) => resetPage(() => setCurrency(event.target.value as CurrencyFilter))}
        >
          <option value="all">All currencies</option>
          <option value="PHP">PHP</option>
          <option value="USD">USD</option>
        </Select>
        <Select
          aria-label="Round date range"
          value={String(days)}
          disabled={search !== ''}
          onChange={(event) =>
            resetPage(() => setDays(Number(event.target.value) as 7 | 30 | 90))
          }
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
      </div>

      {roundsQuery.isPending ? (
        <SkeletonRows count={8} />
      ) : roundsQuery.isError ? (
        <ErrorState
          title="Rounds unavailable"
          message="Round history could not be loaded."
          onRetry={() => void roundsQuery.refetch()}
        />
      ) : !result || result.rows.length === 0 ? (
        <EmptyState title="No rounds" description="Nothing matches these filters." />
      ) : (
        <>
          <RoundRecords rows={result.rows} showPlayer />
          <PageNav
            page={result.page}
            pages={result.pages}
            size={result.size}
            total={result.total}
            onChange={setPage}
          />
        </>
      )}
    </div>
  )
}

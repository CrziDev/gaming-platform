import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Panel } from '@/components/ui/Panel'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useLogout, useSession } from '@/features/auth'
import { useWallets } from '@/features/wallet'
import { formatDate } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'
import { useState } from 'react'

export function AccountPage() {
  const { data: user } = useSession()
  const walletsQuery = useWallets()
  const logoutMutation = useLogout()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  if (!user) {
    return null
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Account</h1>

      <Panel title="Profile" bodyClassName="flex flex-col gap-3 p-5">
        <Row label="Username">{user.display_name}</Row>
        <Row label="Email">
          <span className="break-all">{user.email}</span>
        </Row>
        <Row label="Registered">{formatDate(user.created_at)}</Row>
        <Row label="Status">
          <StatusBadge status="Active" />
        </Row>
      </Panel>

      <Panel title="Wallets" bodyClassName="flex flex-col gap-3 p-5">
        {walletsQuery.data?.map((wallet) => (
          <Row key={wallet.currency} label={wallet.currency}>
            <span className="font-mono font-medium tnum">
              {formatMoney(money(wallet.balance_minor, wallet.currency))}
            </span>
          </Row>
        ))}
        <p className="text-[13px] leading-relaxed text-ink-mute">
          One wallet per currency. Deposits and history belong to the wallet they were made in, and
          nothing converts between currencies anywhere in the platform.
        </p>
      </Panel>

      <Panel title="Session" bodyClassName="flex flex-col items-start gap-3 p-5">
        <p className="text-[13px] leading-relaxed text-ink-mute">
          Signing out ends the session on this device. Sessions are held server-side and can be
          revoked by support at any time.
        </p>
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Sign out
        </Button>
      </Panel>

      <ConfirmDialog
        open={confirming}
        title="Sign out?"
        description="You'll need to sign in again to reach your wallet and history."
        confirmLabel="Sign out"
        tone="destructive"
        pending={logoutMutation.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await logoutMutation.mutateAsync()
          setConfirming(false)
          await navigate(paths.lobby)
        }}
      />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-mute">{label}</span>
      <span className="text-right text-ink-soft">{children}</span>
    </div>
  )
}

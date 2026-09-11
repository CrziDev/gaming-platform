import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Panel } from '@/components/ui/Panel'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useLogout, useSession } from '@/features/auth'
import { useActiveWallet } from '@/features/wallet'
import { formatDate } from '@/lib/format'
import { paths } from '@/routes/paths'
import { useState } from 'react'

export function AccountPage() {
  const { data: user } = useSession()
  const { data: wallet } = useActiveWallet()
  const logoutMutation = useLogout()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  if (!user) {
    return null
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">Account</h1>

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

      <Panel title="Wallet" bodyClassName="flex flex-col gap-3 p-5">
        <Row label="Currency">
          {wallet?.currency ?? 'PHP'} — fixed at registration and permanent
        </Row>
        <p className="text-[13px] leading-relaxed text-ink-mute">
          Your wallet, deposits and history all use this currency. There is no conversion anywhere in
          the platform.
        </p>
      </Panel>

      <Panel title="Security" bodyClassName="flex flex-col items-start gap-3 p-5">
        <p className="text-[13px] leading-relaxed text-ink-mute">
          Signing out ends this session everywhere it is open. Sessions are server-side and can be
          revoked at any time.
        </p>
        <Button variant="secondary">Change password</Button>
      </Panel>

      <Panel title="Session" bodyClassName="flex flex-col items-start gap-3 p-5">
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
      <span className="text-right text-ink">{children}</span>
    </div>
  )
}

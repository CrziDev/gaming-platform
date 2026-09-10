import { Menu } from 'lucide-react'
import { Link } from 'react-router'

import { Button, IconButton } from '@/components/ui/Button'
import { useAuthIntent, useSession } from '@/features/auth'
import { useActiveWallet } from '@/features/wallet'
import { money } from '@/lib/money'
import { paths } from '@/routes/paths'

import { AccountMenu } from './AccountMenu'
import { NotificationsPanel } from './NotificationsPanel'
import { useShell } from './ShellContext'
import { WalletIndicator } from './WalletIndicator'

export function Header() {
  const { data: user } = useSession()
  const { data: wallet } = useActiveWallet()
  const { toggleRail, setDrawerOpen } = useShell()
  const { open } = useAuthIntent()

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-line bg-base/95 backdrop-blur">
      <div className="flex h-full items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <IconButton
          label="Toggle navigation"
          onClick={() => {
            if (window.matchMedia('(min-width: 1024px)').matches) {
              toggleRail()
              return
            }
            setDrawerOpen(true)
          }}
        >
          <Menu aria-hidden size={18} strokeWidth={1.5} />
        </IconButton>

        <Link to={paths.lobby} className="flex items-center gap-2.5">
          <span aria-hidden className="size-7 rounded-[9px] bg-accent shadow-glow" />
          <span className="hidden font-display text-[15px] font-semibold sm:inline">
            Gaming Platform
          </span>
        </Link>

        <div className="flex-1" />

        {user ? (
          <>
            <NotificationsPanel />
            {wallet ? (
              <>
                <span className="hidden sm:block">
                  <WalletIndicator balance={money(wallet.balance_minor, wallet.currency)} />
                </span>
                <span className="sm:hidden">
                  <WalletIndicator balance={money(wallet.balance_minor, wallet.currency)} compact />
                </span>
              </>
            ) : null}
            <AccountMenu user={user} />
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => open({ tab: 'signin' })}>
              Sign in
            </Button>
            <Button size="sm" onClick={() => open({ tab: 'join' })}>
              Join now
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}

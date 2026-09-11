import { MessageCircle, Wallet } from 'lucide-react'
import { Link } from 'react-router'

import { Button, IconButton, buttonStyles } from '@/components/ui/Button'
import { useAuthIntent, useSession } from '@/features/auth'
import { useActiveWallet } from '@/features/wallet'
import { cn } from '@/lib/cn'
import { money } from '@/lib/money'
import { paths } from '@/routes/paths'

import { AccountMenu } from './AccountMenu'
import { MenuGlyph } from './MenuGlyph'
import { NotificationsPanel } from './NotificationsPanel'
import { railVisible, useShell } from './ShellContext'
import { WalletIndicator } from './WalletIndicator'

export function Header() {
  const { data: user } = useSession()
  const { data: wallet } = useActiveWallet()
  const { toggleRail, setDrawerOpen, chatOpen, setChatOpen } = useShell()
  const { open } = useAuthIntent()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 bg-panel px-3 sm:gap-3 sm:px-3.5">
      <IconButton
        label="Toggle navigation"
        className="bg-inset"
        onClick={() => {
          if (railVisible()) {
            toggleRail()
            return
          }
          setDrawerOpen(true)
        }}
      >
        <MenuGlyph />
      </IconButton>

      <Link
        to={paths.lobby}
        className="text-[17px] font-semibold tracking-[-0.02em] text-ink sm:mr-1 sm:text-[18px]"
      >
        HeziBet
      </Link>

      <div className="flex-1" />

      {user ? (
        <>
          <div className="flex items-center gap-1.5">
            {wallet ? <WalletIndicator balance={money(wallet.balance_minor, wallet.currency)} /> : null}
            <Link
              to={paths.deposit}
              aria-label="Deposit"
              className={cn(buttonStyles('primary', 'md'), 'gap-1.5 px-3 sm:px-3.5')}
            >
              <Wallet aria-hidden size={15} strokeWidth={1.8} />
              <span className="hidden sm:inline">Deposit</span>
            </Link>
          </div>

          <div className="flex items-center gap-0.5 sm:ml-1">
            <IconButton
              label="Toggle chat"
              aria-pressed={chatOpen}
              onClick={() => setChatOpen(!chatOpen)}
              className={cn('hidden chat:inline-flex', chatOpen && 'bg-wash text-ink-soft')}
            >
              <MessageCircle aria-hidden size={17} strokeWidth={1.6} />
            </IconButton>
            <NotificationsPanel />
            <AccountMenu user={user} />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => open({ tab: 'signin' })}>
            Sign in
          </Button>
          <Button size="sm" onClick={() => open({ tab: 'join' })}>
            Join now
          </Button>
        </div>
      )}
    </header>
  )
}

import { MessageCircle } from 'lucide-react'

import { Button, IconButton } from '@/components/ui/Button'
import { useAuthIntent, useSession } from '@/features/auth'
import { useActiveWallet } from '@/features/wallet'
import { cn } from '@/lib/cn'
import { money } from '@/lib/money'

import { AccountMenu } from './AccountMenu'
import { MenuGlyph } from './MenuGlyph'
import { NotificationsPanel } from './NotificationsPanel'
import { railVisible, useShell } from './ShellContext'
import { WalletIndicator } from './WalletIndicator'
import { Wordmark } from './Wordmark'

export function Header() {
  const { data: user } = useSession()
  const { data: wallet } = useActiveWallet(Boolean(user))
  const { toggleRail, setDrawerOpen, chatOpen, setChatOpen } = useShell()
  const { open } = useAuthIntent()

  return (
    <header className="glass-chrome relative z-30 flex h-18 shrink-0 items-center gap-1.5 chrome-edge px-2.5 sm:gap-3 sm:px-3.5">
      <IconButton
        label="Toggle navigation"
        data-navigation-toggle
        className="text-ink-soft"
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

      <span aria-hidden className="hidden h-8 w-px bg-hairline sm:block" />

      <Wordmark />

      <div className="flex-1" />

      {user ? (
        wallet ? (
          <WalletIndicator balance={money(wallet.balance_minor, wallet.currency)} />
        ) : null
      ) : (
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => open({ tab: 'signin' })}>
            Sign in
          </Button>
          <Button size="sm" onClick={() => open({ tab: 'join' })}>
            Join now
          </Button>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <span className="hidden chat:contents">
          <IconButton
            label="Toggle chat"
            size="round"
            aria-pressed={chatOpen}
            onClick={() => setChatOpen(!chatOpen)}
            className={cn(chatOpen && 'bg-selected text-ink')}
          >
            <MessageCircle aria-hidden size={18} strokeWidth={1.7} />
          </IconButton>
        </span>
        {user ? (
          <>
            <NotificationsPanel />
            <AccountMenu user={user} />
          </>
        ) : null}
      </div>
    </header>
  )
}

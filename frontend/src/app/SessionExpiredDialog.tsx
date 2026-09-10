import { useLocation, useNavigate } from 'react-router'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { clearSessionExpired, useSessionExpired } from '@/features/auth/expiry'
import { useAuthIntent } from '@/features/auth'
import { adminPaths, paths, safeRedirect } from '@/routes/paths'

export function SessionExpiredDialog() {
  const expired = useSessionExpired()
  const location = useLocation()
  const navigate = useNavigate()
  const { open, close } = useAuthIntent()

  const dismiss = () => {
    clearSessionExpired()
    close()
  }

  const inConsole = location.pathname.startsWith(adminPaths.dashboard)

  const signIn = async () => {
    clearSessionExpired()

    if (inConsole) {
      await navigate(adminPaths.login, { replace: true })
      return
    }

    const target = safeRedirect({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    })

    await navigate(paths.lobby, { replace: true })
    open({ tab: 'signin', ...(target ? { redirectTo: target } : {}) })
  }

  return (
    <Modal
      open={expired}
      onClose={dismiss}
      title="Session expired"
      description="You were signed out because your session ended. Nothing was lost — sign in again to pick up where you left off."
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={dismiss}>
            Keep browsing
          </Button>
          <Button onClick={() => void signIn()}>Sign in</Button>
        </div>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink-mute">
        {inConsole
          ? 'The console signs staff out after a period of inactivity. Balances and pending requests are untouched.'
          : 'Your balance and any pending deposit are untouched. The lobby stays browsable while you are signed out.'}
      </p>
    </Modal>
  )
}

import { Route, Routes } from 'react-router'

import { AdminShell } from '@/components/admin/AdminShell'
import { AppShell } from '@/components/shell/AppShell'
import { AccountPage } from '@/pages/AccountPage'
import { DepositPage } from '@/pages/DepositPage'
import { DepositStatusPage } from '@/pages/DepositStatusPage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { GamePage } from '@/pages/GamePage'
import { GamesPage } from '@/pages/GamesPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { LobbyPage } from '@/pages/LobbyPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PromotionsPage } from '@/pages/PromotionsPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { WalletPage } from '@/pages/WalletPage'
import { AdminAuditPage } from '@/pages/admin/AdminAuditPage'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminDepositsPage } from '@/pages/admin/AdminDepositsPage'
import { AdminGameDetailPage } from '@/pages/admin/AdminGameDetailPage'
import { AdminGamesPage } from '@/pages/admin/AdminGamesPage'
import { AdminLoginPage } from '@/pages/admin/AdminLoginPage'
import { AdminRoundsPage } from '@/pages/admin/AdminRoundsPage'
import { AdminRtpPage } from '@/pages/admin/AdminRtpPage'
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage'
import { AdminTransactionsPage } from '@/pages/admin/AdminTransactionsPage'
import { AdminUserDetailPage } from '@/pages/admin/AdminUserDetailPage'
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage'
import { AuthDeepLink } from '@/routes/AuthDeepLink'
import { RequireAdmin } from '@/routes/RequireAdmin'
import { RequireNoConsoleSession } from '@/routes/RequireNoConsoleSession'
import { RequireAuth } from '@/routes/RequireAuth'
import { adminPaths, paths } from '@/routes/paths'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RequireNoConsoleSession />}>
        <Route path={adminPaths.login} element={<AdminLoginPage />} />
      </Route>

      <Route element={<RequireAdmin />}>
        <Route element={<AdminShell />}>
          <Route path={adminPaths.dashboard} element={<AdminDashboardPage />} />
          <Route path={adminPaths.deposits} element={<AdminDepositsPage />} />
          <Route path={adminPaths.users} element={<AdminUsersPage />} />
          <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
          <Route path={adminPaths.transactions} element={<AdminTransactionsPage />} />
          <Route path={adminPaths.rounds} element={<AdminRoundsPage />} />
          <Route path={adminPaths.games} element={<AdminGamesPage />} />
          <Route path="/admin/games/:id" element={<AdminGameDetailPage />} />
          <Route path={adminPaths.rtp} element={<AdminRtpPage />} />
          <Route path={adminPaths.audit} element={<AdminAuditPage />} />
          <Route path={adminPaths.settings} element={<AdminSettingsPage />} />
        </Route>
      </Route>

      <Route path={paths.forgotPassword} element={<ForgotPasswordPage />} />
      <Route path={paths.resetPassword} element={<ResetPasswordPage />} />

      <Route element={<AppShell />}>
        <Route index element={<LobbyPage />} />
        <Route path={paths.games} element={<GamesPage />} />
        <Route path={paths.hotGames} element={<GamesPage flag="hot" />} />
        <Route path={paths.newGames} element={<GamesPage flag="new" />} />
        <Route path={paths.promotions} element={<PromotionsPage />} />
        <Route path={paths.login} element={<AuthDeepLink tab="signin" />} />
        <Route path={paths.register} element={<AuthDeepLink tab="join" />} />

        <Route element={<RequireAuth />}>
          <Route path="/game/:slug" element={<GamePage />} />
          <Route path={paths.favorites} element={<FavoritesPage />} />
          <Route path={paths.wallet} element={<WalletPage />} />
          <Route path={paths.deposit} element={<DepositPage />} />
          <Route path="/wallet/deposit/:id" element={<DepositStatusPage />} />
          <Route path={paths.history} element={<HistoryPage />} />
          <Route path={paths.account} element={<AccountPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

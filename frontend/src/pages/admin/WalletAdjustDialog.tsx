import { useState } from 'react'

import type { AdminUser, Wallet } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { reasonOptions, useAdjustWallet } from '@/features/admin'
import { currencySymbol, formatMoney, money, parseMoneyInput } from '@/lib/money'

export type AdjustDirection = 'credit' | 'debit'

type WalletAdjustDialogProps = {
  user: AdminUser | null
  wallet: Wallet | null
  direction: AdjustDirection
  onClose: () => void
}

export function WalletAdjustDialog({ user, wallet, direction, onClose }: WalletAdjustDialogProps) {
  if (!user || !wallet) {
    return null
  }

  return (
    <AdjustForm
      key={`${user.id}-${wallet.currency}-${direction}`}
      user={user}
      wallet={wallet}
      direction={direction}
      onClose={onClose}
    />
  )
}

function AdjustForm({
  user,
  wallet,
  direction,
  onClose,
}: {
  user: AdminUser
  wallet: Wallet
  direction: AdjustDirection
  onClose: () => void
}) {
  const adjust = useAdjustWallet()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  const crediting = direction === 'credit'
  const balance = money(wallet.balance_minor, wallet.currency)
  const amountMinor = parseMoneyInput(amount, wallet.currency)
  const valid = amountMinor !== null && amountMinor > 0
  const nextBalance = valid
    ? money(balance.amount_minor + (crediting ? amountMinor : -amountMinor), wallet.currency)
    : balance

  const submit = async () => {
    if (!valid) {
      setError('Enter an amount')
      return
    }
    if (!crediting && amountMinor > balance.amount_minor) {
      setError('A debit cannot exceed the current balance')
      return
    }
    if (reason.trim() === '') {
      setError('A reason is required — it appears in the audit trail')
      return
    }

    await adjust.mutateAsync({
      user_id: user.id,
      currency: wallet.currency,
      direction,
      amount_minor: amountMinor,
      reason,
    })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={crediting ? 'Credit account' : 'Debit account'}
      description={`${user.id.slice(0, 8).toUpperCase()} · ${wallet.currency} balance ${formatMoney(balance)}`}
      footer={
        <div className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={adjust.isPending}>
              Cancel
            </Button>
            <Button
              variant={crediting ? 'primary' : 'destructive'}
              disabled={adjust.isPending}
              onClick={() => void submit()}
            >
              {crediting ? 'Credit' : 'Debit'}{' '}
              {valid ? formatMoney(money(amountMinor, wallet.currency)) : ''}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {crediting ? null : (
          <p className="rounded-input bg-danger/8 px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
            This removes funds from a player&rsquo;s wallet. A debit cannot exceed the current balance —
            no negative balances. The player sees the entry in their History as an adjustment.
          </p>
        )}

        <Field
          label={
            crediting
              ? `Amount (${wallet.currency})`
              : `Amount (${wallet.currency}) · max ${formatMoney(balance)}`
          }
          htmlFor="adjust-amount"
        >
          <div className="flex min-h-12 items-center gap-2.5 rounded-input bg-inset px-3.5 focus-within:bg-wash">
            <span className="font-mono text-ink-mute">{currencySymbol(wallet.currency)}</span>
            <input
              id="adjust-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent font-mono text-[17px] font-medium tnum placeholder:text-ink-mute focus:outline-none"
            />
          </div>
        </Field>

        <Field label="Reason — required, shown in the audit trail" htmlFor="adjust-reason">
          <Select id="adjust-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="">Select or type a reason</option>
            {reasonOptions().map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex items-baseline justify-between gap-4 rounded-input bg-surface-1 px-3.5 py-3 text-[13.5px]">
          <span className="text-ink-mute">New balance</span>
          <span className="font-mono font-medium tnum">{formatMoney(nextBalance)}</span>
        </div>
      </div>
    </Modal>
  )
}

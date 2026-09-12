import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { ApiError } from '@/api/client'
import type { AdminGame } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { SkeletonRows } from '@/components/ui/Skeleton'
import {
  createGameSchema,
  gameStatuses,
  useAllCategories,
  useCreateGame,
  useUpdateGame,
  type GameFormInput,
  type GameInput,
  type GamePatch,
} from '@/features/admin'
import { useCurrencies } from '@/features/wallet'
import { cn } from '@/lib/cn'
import { currencySymbol, formatMoney, money, parseMoneyInput, type Currency } from '@/lib/money'

type GameFormDialogProps = {
  open: boolean
  game?: AdminGame
  onClose: () => void
  onSaved?: (game: AdminGame) => void
}

// One dialog creates and edits: the slug is the only field that exists at
// creation and never changes afterwards, because it is the game's public URL.
export function GameFormDialog({ open, game, onClose, onSaved }: GameFormDialogProps) {
  if (!open) {
    return null
  }
  return (
    <GameForm
      key={game?.id ?? 'new'}
      {...(game ? { game } : {})}
      {...(onSaved ? { onSaved } : {})}
      onClose={onClose}
    />
  )
}

const serverFields: Record<string, keyof GameFormInput> = {
  slug: 'slug',
  name: 'name',
  description: 'description',
  category_slug: 'category_slug',
  provider: 'provider',
  status: 'status',
  currency: 'currency',
  min_wager_minor: 'min_wager',
  max_wager_minor: 'max_wager',
  wager_step_minor: 'wager_step',
}

function GameForm({ game, onClose, onSaved }: Omit<GameFormDialogProps, 'open'>) {
  const editing = game !== undefined
  const categoriesQuery = useAllCategories()
  const currenciesQuery = useCurrencies()
  const create = useCreateGame()
  const update = useUpdateGame()
  const [currency, setCurrency] = useState<Currency>(game?.currency ?? 'PHP')
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GameFormInput>({
    resolver: zodResolver(createGameSchema(currency)),
    defaultValues: game
      ? {
          slug: game.slug,
          name: game.name,
          description: game.description,
          category_slug: game.category_slug,
          provider: game.provider,
          status: game.status,
          currency: game.currency,
          min_wager: wholeUnits(game.min_wager_minor, game.currency),
          max_wager: wholeUnits(game.max_wager_minor, game.currency),
          wager_step: wholeUnits(game.wager_step_minor, game.currency),
        }
      : {
          status: 'draft',
          currency: 'PHP',
          description: '',
          min_wager: '',
          max_wager: '',
          wager_step: '',
        },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(undefined)
    const patch: GamePatch = {
      name: values.name,
      description: values.description,
      category_slug: values.category_slug,
      provider: values.provider,
      status: values.status,
      currency: values.currency as Currency,
      min_wager_minor: parseMoneyInput(values.min_wager, currency) ?? 0,
      max_wager_minor: parseMoneyInput(values.max_wager, currency) ?? 0,
      wager_step_minor: parseMoneyInput(values.wager_step, currency) ?? 0,
    }
    try {
      const saved = editing
        ? await update.mutateAsync({ id: game.id, patch })
        : await create.mutateAsync({
            slug: values.slug,
            ...patch,
          } as GameInput)
      onSaved?.(saved)
      onClose()
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setSubmitError('The request could not be sent. Check your connection and try again.')
        return
      }
      let placed = false
      for (const [sent, field] of Object.entries(serverFields)) {
        const message = error.fields[sent]
        if (message) {
          setError(field, { type: 'server', message })
          placed = true
        }
      }
      if (!placed) {
        setSubmitError(error.message)
      }
    }
  })

  const symbol = currencySymbol(currency)
  const pending = isSubmitting || create.isPending || update.isPending
  // The selects are uncontrolled: their default value only lands if the option
  // exists when they mount, so the form waits for both lists.
  const listsReady = categoriesQuery.data !== undefined && currenciesQuery.data !== undefined

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${game.name}` : 'New game'}
      description={
        editing
          ? 'Changes reach the player catalogue immediately. A status other than active hides the game.'
          : 'A new game starts as a draft: it has a record but no player can see it until it is active.'
      }
      footer={
        <div className="flex flex-col gap-3">
          {submitError ? (
            <p role="alert" className="text-[13px] text-danger">
              {submitError}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="game-form" disabled={pending || !listsReady}>
              {editing ? 'Save changes' : 'Create game'}
            </Button>
          </div>
        </div>
      }
    >
      {!listsReady ? (
        <SkeletonRows count={4} />
      ) : (
        <form
          id="game-form"
          onSubmit={(event) => void onSubmit(event)}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="game-name" error={errors.name?.message}>
              <Input id="game-name" autoComplete="off" {...register('name')} />
            </Field>
            <Field
              label="Slug"
              htmlFor="game-slug"
              error={errors.slug?.message}
              hint={
                editing
                  ? 'The slug is the game’s address and cannot change.'
                  : 'Lower-case, hyphenated; becomes /game/<slug>.'
              }
            >
              <Input
                id="game-slug"
                autoComplete="off"
                disabled={editing}
                className="font-mono"
                {...register('slug')}
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="game-description" error={errors.description?.message}>
            <textarea
              id="game-description"
              rows={2}
              className={cn(inputClass, 'min-h-[68px] resize-y py-2 leading-relaxed')}
              {...register('description')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="game-category" error={errors.category_slug?.message}>
              <Select id="game-category" {...register('category_slug')}>
                <option value="">Choose a category</option>
                {categoriesQuery.data.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Provider" htmlFor="game-provider" error={errors.provider?.message}>
              <Input id="game-provider" autoComplete="off" {...register('provider')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="game-status" error={errors.status?.message}>
              <Select id="game-status" {...register('status')}>
                {gameStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Currency"
              htmlFor="game-currency"
              error={errors.currency?.message}
              hint="One currency per game. Bets are placed from the wallet in that currency."
            >
              <Select
                id="game-currency"
                {...register('currency', {
                  onChange: (event) => setCurrency(event.target.value as Currency),
                })}
              >
                {currenciesQuery.data.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.code} · {entry.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="sr-only">Wager bounds in whole units</legend>
            <Field label={`Minimum bet (${symbol})`} htmlFor="game-min" error={errors.min_wager?.message}>
              <Input
                id="game-min"
                inputMode="numeric"
                placeholder="1"
                className="font-mono"
                {...register('min_wager')}
              />
            </Field>
            <Field label={`Maximum bet (${symbol})`} htmlFor="game-max" error={errors.max_wager?.message}>
              <Input
                id="game-max"
                inputMode="numeric"
                placeholder="5000"
                className="font-mono"
                {...register('max_wager')}
              />
            </Field>
            <Field
              label={`Bet step (${symbol})`}
              htmlFor="game-step"
              error={errors.wager_step?.message}
              hint="Every bet is the minimum plus a whole number of steps; the maximum must land on one."
            >
              <Input
                id="game-step"
                inputMode="numeric"
                placeholder="1"
                className="font-mono"
                {...register('wager_step')}
              />
            </Field>
          </fieldset>
        </form>
      )}
    </Modal>
  )
}

// Wager bounds are whole units, so the field shows "5,000", not "5,000.00".
function wholeUnits(amountMinor: number, currency: Currency): string {
  return formatMoney(money(amountMinor, currency), {
    symbol: false,
    decimals: 'trim',
  })
}

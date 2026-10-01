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
import { formatMoney, money, parseMoneyInput, type Currency } from '@/lib/money'

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
  'wager_limits.PHP.min_wager_minor': 'php_min_wager',
  'wager_limits.PHP.max_wager_minor': 'php_max_wager',
  'wager_limits.PHP.wager_step_minor': 'php_wager_step',
  'wager_limits.USD.min_wager_minor': 'usd_min_wager',
  'wager_limits.USD.max_wager_minor': 'usd_max_wager',
  'wager_limits.USD.wager_step_minor': 'usd_wager_step',
}

function GameForm({ game, onClose, onSaved }: Omit<GameFormDialogProps, 'open'>) {
  const editing = game !== undefined
  const categoriesQuery = useAllCategories()
  const currenciesQuery = useCurrencies()
  const create = useCreateGame()
  const update = useUpdateGame()
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GameFormInput>({
    resolver: zodResolver(createGameSchema()),
    defaultValues: game
      ? {
          slug: game.slug,
          name: game.name,
          description: game.description,
          category_slug: game.category_slug,
          provider: game.provider,
          status: game.status,
          php_min_wager: wholeUnits(game.wager_limits.PHP.min_wager_minor, 'PHP'),
          php_max_wager: wholeUnits(game.wager_limits.PHP.max_wager_minor, 'PHP'),
          php_wager_step: wholeUnits(game.wager_limits.PHP.wager_step_minor, 'PHP'),
          usd_min_wager: wholeUnits(game.wager_limits.USD.min_wager_minor, 'USD'),
          usd_max_wager: wholeUnits(game.wager_limits.USD.max_wager_minor, 'USD'),
          usd_wager_step: wholeUnits(game.wager_limits.USD.wager_step_minor, 'USD'),
        }
      : {
          status: 'draft',
          description: '',
          php_min_wager: '',
          php_max_wager: '',
          php_wager_step: '',
          usd_min_wager: '',
          usd_max_wager: '',
          usd_wager_step: '',
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
      wager_limits: {
        PHP: {
          min_wager_minor: parseMoneyInput(values.php_min_wager, 'PHP') ?? 0,
          max_wager_minor: parseMoneyInput(values.php_max_wager, 'PHP') ?? 0,
          wager_step_minor: parseMoneyInput(values.php_wager_step, 'PHP') ?? 0,
        },
        USD: {
          min_wager_minor: parseMoneyInput(values.usd_min_wager, 'USD') ?? 0,
          max_wager_minor: parseMoneyInput(values.usd_max_wager, 'USD') ?? 0,
          wager_step_minor: parseMoneyInput(values.usd_wager_step, 'USD') ?? 0,
        },
      },
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

  const pending = isSubmitting || create.isPending || update.isPending
  // The selects are uncontrolled: their default value only lands if the option
  // exists when they mount, so the form waits for both lists.
  const listsReady =
    categoriesQuery.data !== undefined &&
    currenciesQuery.data?.some((entry) => entry.code === 'PHP') === true &&
    currenciesQuery.data.some((entry) => entry.code === 'USD')

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${game.name}` : 'New game'}
      description={
        editing
          ? 'Changes apply immediately. Only an active game is visible to players.'
          : 'A new game starts as a draft and stays hidden from players until it is active.'
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
                  ? 'Cannot be changed after creation.'
                  : 'Lower-case letters, digits and hyphens. Used in the game’s URL.'
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

          <Field label="Status" htmlFor="game-status" error={errors.status?.message}>
            <Select id="game-status" {...register('status')}>
              {gameStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>

          <fieldset className="grid gap-4 rounded-input border border-hairline-soft p-3 sm:grid-cols-3">
            <legend className="px-1 font-mono text-[12px] text-ink-mute">PHP wager limits</legend>
            <Field label="Minimum bet (₱)" htmlFor="game-php-min" error={errors.php_min_wager?.message}>
              <Input
                id="game-php-min"
                inputMode="numeric"
                placeholder="1"
                className="font-mono"
                {...register('php_min_wager')}
              />
            </Field>
            <Field label="Maximum bet (₱)" htmlFor="game-php-max" error={errors.php_max_wager?.message}>
              <Input
                id="game-php-max"
                inputMode="numeric"
                placeholder="5000"
                className="font-mono"
                {...register('php_max_wager')}
              />
            </Field>
            <Field
              label="Bet step (₱)"
              htmlFor="game-php-step"
              error={errors.php_wager_step?.message}
              hint="The maximum must be the minimum plus a whole number of steps."
            >
              <Input
                id="game-php-step"
                inputMode="numeric"
                placeholder="1"
                className="font-mono"
                {...register('php_wager_step')}
              />
            </Field>
          </fieldset>

          <fieldset className="grid gap-4 rounded-input border border-hairline-soft p-3 sm:grid-cols-3">
            <legend className="px-1 font-mono text-[12px] text-ink-mute">USD wager limits</legend>
            <Field label="Minimum bet ($)" htmlFor="game-usd-min" error={errors.usd_min_wager?.message}>
              <Input
                id="game-usd-min"
                inputMode="numeric"
                placeholder="1"
                className="font-mono"
                {...register('usd_min_wager')}
              />
            </Field>
            <Field label="Maximum bet ($)" htmlFor="game-usd-max" error={errors.usd_max_wager?.message}>
              <Input
                id="game-usd-max"
                inputMode="numeric"
                placeholder="5000"
                className="font-mono"
                {...register('usd_max_wager')}
              />
            </Field>
            <Field
              label="Bet step ($)"
              htmlFor="game-usd-step"
              error={errors.usd_wager_step?.message}
              hint="The maximum must be the minimum plus a whole number of steps."
            >
              <Input
                id="game-usd-step"
                inputMode="numeric"
                placeholder="1"
                className="font-mono"
                {...register('usd_wager_step')}
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

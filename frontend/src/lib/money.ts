export type Currency = 'PHP' | 'USD'

export type Money = {
  amount_minor: number
  currency: Currency
}

type CurrencyMeta = {
  symbol: string
  digits: number
}

const currencies: Record<Currency, CurrencyMeta> = {
  PHP: { symbol: '₱', digits: 2 },
  USD: { symbol: '$', digits: 2 },
}

const MINUS = '−'

export function money(amount_minor: number, currency: Currency = 'PHP'): Money {
  if (!Number.isSafeInteger(amount_minor)) {
    throw new Error('money minor units must be an exact integer')
  }
  return { amount_minor, currency }
}

export function currencySymbol(currency: Currency): string {
  return currencies[currency].symbol
}

export function currencyDigits(currency: Currency): number {
  return currencies[currency].digits
}

export type FormatMoneyOptions = {
  sign?: 'auto' | 'always'
  decimals?: 'always' | 'trim'
  symbol?: boolean
}

export function formatMoney(value: Money, options: FormatMoneyOptions = {}): string {
  const { sign = 'auto', decimals = 'always', symbol = true } = options
  const { symbol: mark, digits } = currencies[value.currency]

  const negative = value.amount_minor < 0
  const padded = Math.abs(value.amount_minor).toString().padStart(digits + 1, '0')
  const whole = group(padded.slice(0, padded.length - digits))
  const fraction = padded.slice(padded.length - digits)

  const showFraction = decimals === 'always' || Number(fraction) !== 0
  const body = `${symbol ? mark : ''}${whole}${showFraction && digits > 0 ? `.${fraction}` : ''}`

  if (negative) {
    return `${MINUS}${body}`
  }
  return sign === 'always' ? `+${body}` : body
}

export function formatMoneyInput(value: Money): string {
  return formatMoney(value, { symbol: false })
}

export function parseMoneyInput(input: string, currency: Currency = 'PHP'): number | null {
  const digits = currencies[currency].digits
  const cleaned = input.trim().replace(/[\s,]/g, '').replace(/^[+]/, '')
  if (!/^-?\d*(\.\d*)?$/.test(cleaned) || cleaned === '' || cleaned === '-' || cleaned === '.') {
    return null
  }

  const negative = cleaned.startsWith('-')
  const [whole = '0', fraction = ''] = cleaned.replace(/^-/, '').split('.')
  if (fraction.length > digits) {
    return null
  }

  const minor = Number(`${whole}${fraction.padEnd(digits, '0')}`)
  if (!Number.isSafeInteger(minor)) {
    return null
  }
  return negative ? -minor : minor
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`cannot add ${a.currency} to ${b.currency}`)
  }
  return money(a.amount_minor + b.amount_minor, a.currency)
}

export function subtractMoney(a: Money, b: Money): Money {
  return addMoney(a, money(-b.amount_minor, b.currency))
}

export function moneyDirection(value: Money): 'credit' | 'debit' | 'zero' {
  if (value.amount_minor > 0) return 'credit'
  if (value.amount_minor < 0) return 'debit'
  return 'zero'
}

function group(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

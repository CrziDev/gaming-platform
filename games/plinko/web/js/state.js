// The board's whole mutable state. Nothing here is money: the host owns the
// stake, the outcome, and the balance, and tells the frame only what to draw.
export const state = {
  rows: 8,
  risk: 'normal',
  multipliers: [],
  sound: true,
  configured: false,
  activeSlot: null,
  activeUntil: 0,
  labels: [],
}

// The board's whole mutable state. Nothing here is money: the host owns the stake, the
// outcome, and the balance, and tells the frame only what to draw.
export const state = {
  risk: 'normal',
  multipliers: [],
  sound: true,
  configured: false,
  // The host's board rect inside this frame, in CSS pixels. The canvas fills the frame;
  // the board is framed inside this rect so the host's controls sit around it.
  stage: null,
  // The rects the host's controls cover, in the same pixels; art keeps clear of them.
  controls: [],
}

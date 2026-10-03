const PEG_ROWS = [3, 4, 5, 6, 7]

// The board's shape in miniature with a ball dropping through it, for as long as the
// frame takes to answer; it reports no progress to show instead.
export function GameLoader({ name }: { name: string }) {
  return (
    <div role="status" aria-label={`Loading ${name}`} className="absolute inset-0 flex flex-col items-center justify-center gap-6">
      <div aria-hidden className="relative flex flex-col items-center gap-[9px]">
        {PEG_ROWS.map((pegs) => (
          <div key={pegs} className="flex gap-[9px]">
            {Array.from({ length: pegs }, (_, index) => (
              <span key={index} className="size-[5px] rounded-full bg-ink-mute" />
            ))}
          </div>
        ))}
        <div className="game-loader-ball absolute top-[2.5px] left-1/2">
          <span className="-mt-1 -ml-1 block size-2 rounded-full bg-ink" />
        </div>
      </div>
      <span className="label-mono tracking-[0.2em] text-ink-cool">LOADING BOARD</span>
    </div>
  )
}

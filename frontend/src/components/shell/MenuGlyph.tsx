export function MenuGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="5" width="18" height="2.2" rx="1.1" />
      <rect x="3" y="10.9" width="18" height="2.2" rx="1.1" />
      <rect x="3" y="16.8" width="18" height="2.2" rx="1.1" />
    </svg>
  )
}

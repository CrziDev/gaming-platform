export function MenuGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="5.2" width="18" height="2.4" rx="1.2" />
      <rect x="3" y="10.8" width="11" height="2.4" rx="1.2" />
      <rect x="16.6" y="10.8" width="4.4" height="2.4" rx="1.2" opacity=".5" />
      <rect x="3" y="16.4" width="18" height="2.4" rx="1.2" opacity=".5" />
    </svg>
  )
}

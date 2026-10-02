import { useId } from 'react'

export type TitleMarkProps = {
  name: string
  subtitle: string
}

// The subset holds only the logo's letters, so the brush face costs a few kilobytes and
// loads only where the mark renders.
const LOGO_FONT = 'https://fonts.googleapis.com/css2?family=Kaushan+Script&text=PLINKO&display=block'

// Plinko Tropical's title mark: the name as the game's brush-script logo over a swash,
// with the subtitle arched beneath it. The heading keeps the game's full name for
// assistive technology; the lettering is art. Styled in styles/games/plinko-tropical.css.
export function TropicalTitleMark({ name, subtitle }: TitleMarkProps) {
  const arcId = useId()

  return (
    <div data-title-mark="plinko-tropical">
      <link rel="stylesheet" href={LOGO_FONT} />
      <h1 aria-label={name} data-part="title-logo">
        <svg aria-hidden data-part="title-swash" viewBox="0 0 200 28" preserveAspectRatio="none">
          <path
            fill="currentColor"
            d="M3 24.5C40 22 92 15.5 150 7.5c16-2.2 31-4.3 46-6.5-12 4.6-27 8.6-44 12.2C102 23.6 52 27.4 7 27.8c-3 0-5.4-.4-4-3.3z"
          />
        </svg>
        <span aria-hidden>PLINKO</span>
      </h1>
      <svg aria-hidden data-part="title-subtitle" viewBox="0 0 176 28">
        <path id={arcId} d="M4 25C52 22 110 15 172 3" fill="none" />
        <text>
          <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
            {subtitle}
          </textPath>
        </text>
      </svg>
      <p className="sr-only">{subtitle}</p>
    </div>
  )
}

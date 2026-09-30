import { Volume2, VolumeX } from 'lucide-react'

import { IconButton } from '@/components/ui/Button'

type SoundToggleProps = {
  on: boolean
  onChange: (next: boolean) => void
}

export function SoundToggle({ on, onChange }: SoundToggleProps) {
  return (
    <IconButton
      label={on ? 'Mute game sound' : 'Unmute game sound'}
      size="float"
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
      {on ? (
        <Volume2 aria-hidden size={19} strokeWidth={1.9} />
      ) : (
        <VolumeX aria-hidden size={19} strokeWidth={1.9} />
      )}
    </IconButton>
  )
}

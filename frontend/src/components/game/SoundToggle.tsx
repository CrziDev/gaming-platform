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
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="bg-base/70 text-ink-soft hover:bg-base/80"
    >
      {on ? (
        <Volume2 aria-hidden size={16} strokeWidth={1.5} />
      ) : (
        <VolumeX aria-hidden size={16} strokeWidth={1.5} />
      )}
    </IconButton>
  )
}

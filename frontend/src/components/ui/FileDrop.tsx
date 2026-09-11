import { UploadCloud, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { cn } from '@/lib/cn'

type FileDropProps = {
  label: string
  hint: string
  accept?: string
  value: File | null
  onChange: (file: File | null) => void
  error?: string | undefined
}

export function FileDrop({
  label,
  hint,
  accept = 'image/png,image/jpeg',
  value,
  onChange,
  error,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const inputId = useId()

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-input bg-surface-1 p-3">
        <img
          src={URL.createObjectURL(value)}
          alt=""
          className="size-14 rounded-chip object-cover"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] text-ink-soft">{value.name}</span>
          <span className="font-mono text-[11px] text-ink-mute">
            {Math.round(value.size / 1024)} KB
          </span>
        </div>
        <button
          type="button"
          aria-label="Remove upload"
          onClick={() => onChange(null)}
          className="flex size-11 items-center justify-center rounded-input text-ink-mute hover:bg-wash hover:text-ink-soft"
        >
          <X aria-hidden size={16} strokeWidth={1.5} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          onChange(event.dataTransfer.files[0] ?? null)
        }}
        className={cn(
          'flex min-h-33 cursor-pointer flex-col items-center justify-center gap-2 rounded-input',
          'px-4 py-6 text-center transition-colors duration-[120ms]',
          dragging ? 'bg-accent/12' : 'bg-inset hover:bg-wash',
        )}
      >
        <UploadCloud aria-hidden size={22} strokeWidth={1.5} className="text-ink-mute" />
        <span className="text-[13.5px] text-ink-soft">{label}</span>
        <span className="text-[11.5px] text-ink-mute">{hint}</span>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      {error ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

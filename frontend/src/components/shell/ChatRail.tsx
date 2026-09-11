import { Send, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { ChatMessage } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuthIntent, useSession } from '@/features/auth'
import { useChatRoom, useSendChatMessage } from '@/features/chat'
import { cn } from '@/lib/cn'
import { formatClock } from '@/lib/format'

import { useShell } from './ShellContext'

export function ChatRail() {
  const { chatOpen, setChatOpen } = useShell()
  const room = useChatRoom(chatOpen)

  if (!chatOpen) {
    return null
  }

  return (
    <aside aria-label="Live chat" className="hidden w-[272px] shrink-0 flex-col bg-panel @chat:flex">
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <span className="text-[13px] font-semibold text-ink-soft">Live chat</span>
        {room.data ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-mute">
            <span aria-hidden className="size-[5px] rounded-full bg-accent-ink" />
            {room.data.online}
            <span className="sr-only">online</span>
          </span>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => setChatOpen(false)}
          className="flex size-[26px] items-center justify-center rounded-[7px] text-ink-mute transition-colors duration-[120ms] hover:bg-wash hover:text-ink-soft"
        >
          <X aria-hidden size={14} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-1 pb-3">
        {room.isPending ? (
          <div role="status" aria-label="Loading" className="flex flex-col gap-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : room.isError ? (
          <p className="text-[12.5px] text-ink-mute">Chat is unavailable right now.</p>
        ) : (
          <ul aria-label="Messages" className="flex flex-col gap-3">
            {room.data.messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
          </ul>
        )}
      </div>

      <Composer />
    </aside>
  )
}

function Message({ message }: { message: ChatMessage }) {
  const admin = message.role === 'admin'

  return (
    <li className="flex gap-2">
      <span aria-hidden className="size-6 shrink-0 rounded-full bg-surface-3" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className={cn('text-[11.5px] font-medium', admin ? 'text-accent-ink' : 'text-ink-soft')}>
            {message.user}
          </span>
          {admin ? (
            <span className="rounded-[4px] bg-accent-ink/16 px-1.5 py-px font-mono text-[8.5px] font-medium tracking-[0.1em] text-accent-ink uppercase">
              admin
            </span>
          ) : null}
          <span className="font-mono text-[10px] text-ink-mute">{formatClock(message.created_at)}</span>
        </div>
        <p className="text-[12.5px] leading-snug text-ink-mute text-pretty">{message.text}</p>
      </div>
    </li>
  )
}

function Composer() {
  const { data: user } = useSession()
  const { open } = useAuthIntent()
  const send = useSendChatMessage()
  const [text, setText] = useState('')

  if (!user) {
    return (
      <div className="shrink-0 px-3 pt-2.5 pb-3">
        <Button variant="secondary" size="md" fullWidth onClick={() => open({ tab: 'signin' })}>
          Sign in to chat
        </Button>
      </div>
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (trimmed === '' || send.isPending) {
      return
    }
    await send.mutateAsync({ user, text: trimmed })
    setText('')
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex shrink-0 items-center gap-1.5 px-3 pt-2.5 pb-3">
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Message"
        aria-label="Message"
        maxLength={280}
        className="min-h-11 min-w-0 flex-1 rounded-input bg-inset px-2.75 text-[12.5px] text-ink-soft placeholder:text-ink-mute focus:bg-wash lg:min-h-[34px]"
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={send.isPending}
        className="flex size-11 shrink-0 items-center justify-center rounded-input bg-accent text-on-accent transition-colors duration-[120ms] hover:bg-accent-hi disabled:bg-surface-2 disabled:text-ink-mute lg:size-[34px]"
      >
        <Send aria-hidden size={15} strokeWidth={1.8} />
      </button>
    </form>
  )
}

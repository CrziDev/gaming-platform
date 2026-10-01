import { Send, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { ChatMessage } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuthIntent, useSession } from '@/features/auth'
import { useChatRoom, useChatSocket, useSendChatMessage } from '@/features/chat'
import { cn } from '@/lib/cn'
import { formatClock } from '@/lib/format'

import { useShell } from './ShellContext'

export function ChatRail() {
  const { chatOpen, setChatOpen } = useShell()
  const room = useChatRoom(chatOpen)
  const socket = useChatSocket(chatOpen)
  const online = socket.online ?? room.data?.online

  return (
    <aside
      aria-label="Live chat"
      aria-hidden={!chatOpen}
      inert={!chatOpen}
      className={cn(
        'glass-chrome hidden shrink-0 overflow-hidden border-l border-hairline transition-[width,opacity] duration-layout ease-standard motion-reduce:transition-none @chat:block',
        chatOpen ? 'w-[272px] opacity-100' : 'w-0 opacity-0',
      )}
    >
      <div className="flex h-full w-[272px] flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <span className="text-[13px] font-semibold text-ink-soft">Live chat</span>
          {online !== undefined ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-mute">
              <span aria-hidden className="size-[5px] rounded-full bg-accent-ink" />
              {online}
              <span className="sr-only">online</span>
            </span>
          ) : null}
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setChatOpen(false)}
            className="flex size-[26px] items-center justify-center rounded-[7px] text-ink-mute transition-colors duration-fast hover:bg-wash hover:text-ink-soft"
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
      </div>
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
            {message.display_name}
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (trimmed === '' || send.isPending) {
      return
    }
    send.mutate({ user, text: trimmed }, { onSuccess: () => setText('') })
  }

  return (
    <form onSubmit={submit} className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pt-2.5 pb-3">
      {send.isError ? (
        <p role="alert" className="w-full text-[12px] text-danger">
          {send.error.message}
        </p>
      ) : null}
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Message"
        aria-label="Message"
        maxLength={280}
        className="min-h-11 min-w-0 flex-1 rounded-input border border-hairline bg-field px-3 text-[12.5px] text-ink-soft placeholder:text-ink-mute focus:border-hairline-strong lg:min-h-9"
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={send.isPending}
        className="cta-gradient flex size-11 shrink-0 items-center justify-center rounded-input transition-[filter] duration-fast hover:brightness-110 disabled:bg-none disabled:bg-surface-2 disabled:text-ink-mute lg:size-9"
      >
        <Send aria-hidden size={15} strokeWidth={1.8} />
      </button>
    </form>
  )
}

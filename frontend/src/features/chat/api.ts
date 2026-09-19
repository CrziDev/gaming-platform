import { api } from '@/api/client'
import { mockRequest } from '@/api/mock'
import { usingFixtures } from '@/api/mode'
import type { ChatMessage, ChatRoom, User } from '@/api/types'
import { chatMessages, chatOnline } from '@/mocks/chat'

export async function fetchChatRoom(): Promise<ChatRoom> {
  if (usingFixtures) {
    return mockRequest(() => ({ online: chatOnline, messages: [...chatMessages] }))
  }
  return api.get<ChatRoom>('/chat/messages')
}

// The server names the author from the session; `user` only feeds the fixture.
export async function sendChatMessage(input: { user: User; text: string }): Promise<ChatMessage> {
  if (usingFixtures) {
    return mockRequest(() => {
      const message: ChatMessage = {
        id: `ch-${chatMessages.length + 1}`,
        display_name: input.user.display_name,
        role: input.user.role,
        text: input.text,
        created_at: new Date().toISOString(),
      }
      chatMessages.push(message)
      return message
    })
  }
  return api.post<ChatMessage>('/chat/messages', { text: input.text })
}

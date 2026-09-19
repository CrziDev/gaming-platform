import { api } from '@/api/client'
import { mockRequest } from '@/api/mock'
import { testFixturesEnabled } from '@/api/mode'
import type { ChatMessage, ChatRoom, User } from '@/api/types'

const usingTestFixtures = import.meta.env.MODE === 'test' && testFixturesEnabled

export async function fetchChatRoom(): Promise<ChatRoom> {
  if (usingTestFixtures) {
    const { chatMessages, chatOnline } = await import('@/mocks/chat')
    return mockRequest(() => ({ online: chatOnline, messages: [...chatMessages] }))
  }
  return api.get<ChatRoom>('/chat/messages')
}

// The server names the author from the session; `user` only feeds the fixture.
export async function sendChatMessage(input: { user: User; text: string }): Promise<ChatMessage> {
  if (usingTestFixtures) {
    const { chatMessages } = await import('@/mocks/chat')
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

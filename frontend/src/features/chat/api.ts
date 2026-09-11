import { mockRequest } from '@/api/mock'
import type { ChatMessage, ChatRoom, User } from '@/api/types'
import { chatMessages, chatOnline } from '@/mocks/chat'

export async function fetchChatRoom(): Promise<ChatRoom> {
  return mockRequest(() => ({ online: chatOnline, messages: [...chatMessages] }))
}

export async function sendChatMessage(input: { user: User; text: string }): Promise<ChatMessage> {
  return mockRequest(() => {
    const message: ChatMessage = {
      id: `ch-${chatMessages.length + 1}`,
      user: input.user.display_name,
      role: input.user.role,
      text: input.text,
      created_at: new Date().toISOString(),
    }
    chatMessages.push(message)
    return message
  })
}

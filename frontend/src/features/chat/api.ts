import { mockRequest } from '@/api/mock'
import { usingFixtures } from '@/api/mode'
import type { ChatMessage, ChatRoom, User } from '@/api/types'
import { chatMessages, chatOnline } from '@/mocks/chat'

// There is no chat service yet. The rail and its toggle exist only where the
// fixtures do, so a real deployment shows no chat rather than a fake room.
export const chatAvailable = usingFixtures

export async function fetchChatRoom(): Promise<ChatRoom> {
  if (!chatAvailable) return { online: 0, messages: [] }
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

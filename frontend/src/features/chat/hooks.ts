import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchChatRoom, sendChatMessage } from './api'

export function useChatRoom(enabled: boolean) {
  return useQuery({ queryKey: ['chat'], queryFn: fetchChatRoom, enabled })
}

export function useSendChatMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sendChatMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat'] }),
  })
}

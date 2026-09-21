import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createAnnouncement,
  fetchAdminAnnouncements,
  fetchAnnouncements,
  setAnnouncementStatus,
  updateAnnouncement,
  type AnnouncementInput,
} from './api'

export const announcementQueryKey = ['announcements'] as const

export function useAnnouncements() {
  return useQuery({
    queryKey: announcementQueryKey,
    queryFn: fetchAnnouncements,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useAdminAnnouncements(page: number) {
  return useQuery({
    queryKey: ['admin', 'announcements', page],
    queryFn: () => fetchAdminAnnouncements(page),
    refetchInterval: 60_000,
  })
}

function useInvalidateAnnouncements() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: announcementQueryKey }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] }),
    ])
}

export function useCreateAnnouncement() {
  const invalidate = useInvalidateAnnouncements()
  return useMutation({ mutationFn: createAnnouncement, onSuccess: invalidate })
}

export function useUpdateAnnouncement() {
  const invalidate = useInvalidateAnnouncements()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AnnouncementInput }) =>
      updateAnnouncement(id, input),
    onSuccess: invalidate,
  })
}

export function useSetAnnouncementStatus() {
  const invalidate = useInvalidateAnnouncements()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setAnnouncementStatus(id, enabled),
    onSuccess: invalidate,
  })
}

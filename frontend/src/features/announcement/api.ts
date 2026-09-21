import { api, ApiError } from '@/api/client'
import { mockRequest, paginate, type Page } from '@/api/mock'
import { testFixturesEnabled } from '@/api/mode'
import type { AdminAnnouncement, Announcement } from '@/api/types'

const usingTestFixtures = import.meta.env.MODE === 'test' && testFixturesEnabled
export const ANNOUNCEMENT_PAGE_SIZE = 20
const PUBLIC_PAGE_SIZE = 100

export type AnnouncementInput = {
  text: string
  ends_at: string | null
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  if (usingTestFixtures) {
    const { announcements } = await import('@/mocks/announcements')
    const now = Date.now()
    return mockRequest(() =>
      announcements
        .filter((item) => item.enabled && (item.ends_at === null || Date.parse(item.ends_at) > now))
        .map(({ id, text, ends_at, created_at }) => ({ id, text, ends_at, created_at })),
    )
  }

  const first = await api.get<Page<Announcement>>(`/announcements?page=1&size=${PUBLIC_PAGE_SIZE}`)
  if (first.pages === 1) return first.rows

  const remaining = await Promise.all(
    Array.from({ length: first.pages - 1 }, (_, index) =>
      api.get<Page<Announcement>>(`/announcements?page=${index + 2}&size=${PUBLIC_PAGE_SIZE}`),
    ),
  )
  const unique = new Map<string, Announcement>()
  for (const item of [first, ...remaining].flatMap((page) => page.rows)) unique.set(item.id, item)
  return [...unique.values()].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
}

export async function fetchAdminAnnouncements(page = 1): Promise<Page<AdminAnnouncement>> {
  if (usingTestFixtures) {
    const { announcements } = await import('@/mocks/announcements')
    return mockRequest(() => paginate(announcements, page, ANNOUNCEMENT_PAGE_SIZE))
  }
  return api.get<Page<AdminAnnouncement>>(
    `/admin/announcements?page=${page}&size=${ANNOUNCEMENT_PAGE_SIZE}`,
  )
}

export async function createAnnouncement(input: AnnouncementInput): Promise<AdminAnnouncement> {
  if (usingTestFixtures) {
    const { announcements } = await import('@/mocks/announcements')
    return mockRequest(() => {
      const now = new Date().toISOString()
      const created: AdminAnnouncement = {
        id: `an-${Date.now()}`,
        ...input,
        enabled: true,
        created_at: now,
        updated_at: now,
      }
      announcements.unshift(created)
      return created
    })
  }
  return api.post<AdminAnnouncement>('/admin/announcements', input)
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementInput,
): Promise<AdminAnnouncement> {
  if (usingTestFixtures) {
    const { announcements } = await import('@/mocks/announcements')
    return mockRequest(() => {
      const item = announcements.find((candidate) => candidate.id === id)
      if (!item) throw new ApiError(404, 'Announcement not found')
      Object.assign(item, input, { updated_at: new Date().toISOString() })
      return { ...item }
    })
  }
  return api.put<AdminAnnouncement>(`/admin/announcements/${encodeURIComponent(id)}`, input)
}

export async function setAnnouncementStatus(
  id: string,
  enabled: boolean,
): Promise<AdminAnnouncement> {
  if (usingTestFixtures) {
    const { announcements } = await import('@/mocks/announcements')
    return mockRequest(() => {
      const item = announcements.find((candidate) => candidate.id === id)
      if (!item) throw new ApiError(404, 'Announcement not found')
      if (enabled && item.ends_at !== null && Date.parse(item.ends_at) <= Date.now()) {
        throw new ApiError(400, 'One or more fields are invalid', null, {
          ends_at: 'Choose a future end date before enabling this announcement',
        })
      }
      item.enabled = enabled
      item.updated_at = new Date().toISOString()
      return { ...item }
    })
  }
  return api.patch<AdminAnnouncement>(`/admin/announcements/${encodeURIComponent(id)}/status`, {
    enabled,
  })
}

import type { ChatMessage } from '@/api/types'

import { minutesAgo } from './clock'

export const chatOnline = 223

export const chatMessages: ChatMessage[] = [
  { id: 'ch-1', user: 'gregor56', role: 'player', text: "Didn't accept yet", created_at: minutesAgo(9) },
  {
    id: 'ch-2',
    user: 'sofia',
    role: 'admin',
    text: 'Please keep the chat respectful or your account will be muted.',
    created_at: minutesAgo(9),
  },
  {
    id: 'ch-3',
    user: 'k1ngoff',
    role: 'player',
    text: 'Just hit 2.4K on Aurora Dice after 15 minutes',
    created_at: minutesAgo(8),
  },
  {
    id: 'ch-4',
    user: 'sadbetsonly',
    role: 'player',
    text: 'bet went to zero balance again',
    created_at: minutesAgo(7),
  },
  {
    id: 'ch-5',
    user: 'mariacruz',
    role: 'player',
    text: 'anyone tried Skyline Crash yet?',
    created_at: minutesAgo(6),
  },
  {
    id: 'ch-6',
    user: 'sofia',
    role: 'admin',
    text: 'Deposits may take up to 72h during security checks. Contact support if delayed.',
    created_at: minutesAgo(5),
  },
  { id: 'ch-7', user: 'benj_04', role: 'player', text: 'cashback landed, thanks', created_at: minutesAgo(4) },
  { id: 'ch-8', user: 'nina.dlc', role: 'player', text: 'vault break is running hot today', created_at: minutesAgo(3) },
]

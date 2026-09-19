import type { ChatMessage } from '@/api/types'

import { minutesAgo } from './clock'

export const chatOnline = 223

export const chatMessages: ChatMessage[] = [
  { id: 'ch-1', display_name: 'gregor56', role: 'player', text: "Didn't accept yet", created_at: minutesAgo(9) },
  {
    id: 'ch-2',
    display_name: 'sofia',
    role: 'admin',
    text: 'Please keep the chat respectful or your account will be muted.',
    created_at: minutesAgo(9),
  },
  {
    id: 'ch-3',
    display_name: 'k1ngoff',
    role: 'player',
    text: 'Just hit 2.4K on Aurora Dice after 15 minutes',
    created_at: minutesAgo(8),
  },
  {
    id: 'ch-4',
    display_name: 'sadbetsonly',
    role: 'player',
    text: 'bet went to zero balance again',
    created_at: minutesAgo(7),
  },
  {
    id: 'ch-5',
    display_name: 'mariacruz',
    role: 'player',
    text: 'anyone tried Skyline Crash yet?',
    created_at: minutesAgo(6),
  },
  {
    id: 'ch-6',
    display_name: 'sofia',
    role: 'admin',
    text: 'Deposits may take up to 72h during security checks. Contact support if delayed.',
    created_at: minutesAgo(5),
  },
  { id: 'ch-7', display_name: 'benj_04', role: 'player', text: 'cashback landed, thanks', created_at: minutesAgo(4) },
  { id: 'ch-8', display_name: 'nina.dlc', role: 'player', text: 'vault break is running hot today', created_at: minutesAgo(3) },
]

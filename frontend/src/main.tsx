import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/app/App'
import { installScrollbarFade } from '@/app/scrollbars'
import '@/styles/index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('main: #root is missing from index.html')
}

installScrollbarFade()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

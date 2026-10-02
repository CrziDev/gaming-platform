import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { gameFrames } from './vite/gameFrames.ts'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    gameFrames([
      { slug: 'plinko', dir: '../games/plinko/web' },
      { slug: 'plinko-billiards', dir: '../games/plinko-billiards/web' },
      { slug: 'plinko-tropical', dir: '../games/plinko-tropical/web' },
    ]),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    pool: 'vmThreads',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    css: false,
  },
})

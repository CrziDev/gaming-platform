import { createReadStream, existsSync, statSync, cpSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

type GameFrame = { slug: string; dir: string }

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

// Each integrated game is a static page outside the React bundle. In development
// it is served straight from its folder under /games/<slug>/; a production build
// copies it beside the bundle so the same URL works from dist/.
export function gameFrames(frames: GameFrame[]): Plugin {
  let resolved: { slug: string; dir: string }[] = []
  let outDir = 'dist'

  return {
    name: 'game-frames',

    configResolved(config) {
      resolved = frames.map((frame) => ({ slug: frame.slug, dir: path.resolve(config.root, frame.dir) }))
      outDir = path.resolve(config.root, config.build.outDir)
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        const pathname = url.split('?')[0] ?? ''
        const frame = resolved.find((candidate) => pathname.startsWith(`/games/${candidate.slug}/`))
        if (!frame) {
          next()
          return
        }

        const relative = decodeURIComponent(pathname.slice(`/games/${frame.slug}/`.length))
        const file = path.resolve(frame.dir, relative || 'index.html')
        if (file !== frame.dir && !file.startsWith(frame.dir + path.sep)) {
          res.statusCode = 403
          res.end()
          return
        }
        if (!existsSync(file) || !statSync(file).isFile()) {
          next()
          return
        }

        res.setHeader('Content-Type', contentTypes[path.extname(file)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-store')
        createReadStream(file).pipe(res)
      })
    },

    closeBundle() {
      for (const frame of resolved) {
        if (!existsSync(frame.dir)) continue
        cpSync(frame.dir, path.join(outDir, 'games', frame.slug), { recursive: true })
      }
    },
  }
}

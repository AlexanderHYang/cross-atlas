import { defineConfig } from 'vite'
import path from 'path'
import os from 'node:os'
import fs from 'node:fs'
import basicSsl from '@vitejs/plugin-basic-ssl'

function logWriterPlugin() {
  const logsDir = path.resolve(__dirname, '../../logs')

  return {
    name: 'log-writer',
    configureServer(server: any) {
      server.middlewares.use('/api/logs', (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        let body = ''
        let tooLarge = false
        req.on('data', (chunk: any) => {
          body += chunk.toString()
          if (body.length > 5_000_000) {
            res.statusCode = 413
            res.end('Payload Too Large')
            tooLarge = true
            req.destroy()
          }
        })

        req.on('end', () => {
          if (tooLarge) {
            return
          }
          let payload: { sessionId?: string; text?: string }
          try {
            payload = JSON.parse(body || '{}')
          } catch {
            res.statusCode = 400
            res.end('Invalid JSON')
            return
          }

          const text = typeof payload.text === 'string' ? payload.text : ''
          if (!text) {
            res.statusCode = 400
            res.end('Missing log text')
            return
          }

          const sessionIdRaw =
            typeof payload.sessionId === 'string' && payload.sessionId.length > 0
              ? payload.sessionId
              : 'study'
          const safeSessionId = sessionIdRaw.replace(/[^a-zA-Z0-9_-]/g, '')
          const filename = safeSessionId ? `study-${safeSessionId}.txt` : 'study-log.txt'

          try {
            fs.mkdirSync(logsDir, { recursive: true })
            fs.appendFileSync(path.join(logsDir, filename), text)
            res.statusCode = 200
            res.end('ok')
          } catch (error) {
            console.error('[2D log] Failed to write log file:', error)
            res.statusCode = 500
            res.end('Failed to write log')
          }
        })
      })
    },
  }
}

function resolveHost(): string {
  const override = process.env.VITE_HOST?.trim()
  if (override) {
    return override
  }

  const interfaces = os.networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    if (!entries) {
      continue
    }
    for (const entry of entries) {
      if (entry && entry.family === 'IPv4' && !entry.internal) {
        return entry.address
      }
    }
  }

  return '0.0.0.0'
}

const host = resolveHost()

export default defineConfig({
  root: path.resolve(__dirname),
  // Use a unique cache directory so 2D and 3D dev servers don't step on each other
  cacheDir: path.resolve(__dirname, '../../.vite-cache/client-2d'),
  // Babylon (and Anu, which wraps Babylon) can confuse the dep optimizer. Avoid pre-bundling them.
  optimizeDeps: {
    exclude: [
      '@babylonjs/core',
      '@babylonjs/gui',
      '@babylonjs/materials',
      '@jpmorganchase/anu',
    ],
  },
  plugins: [basicSsl(), logWriterPlugin()],
  server: {
    host,
    // @ts-ignore
    https: true,
  },
})

import { defineConfig } from 'vite'
import path from 'path'
import os from 'node:os'
import basicSsl from '@vitejs/plugin-basic-ssl'

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
  plugins: [basicSsl()],
  server: {
    host,
    https: true,
  },
})

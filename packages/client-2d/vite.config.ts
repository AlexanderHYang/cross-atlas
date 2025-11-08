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
  plugins: [basicSsl()],
  server: {
    host,
    // @ts-ignore
    https: true,
  },
})

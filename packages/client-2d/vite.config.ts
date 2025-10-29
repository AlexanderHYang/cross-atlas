import { defineConfig } from 'vite'
import path from 'path'

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
})

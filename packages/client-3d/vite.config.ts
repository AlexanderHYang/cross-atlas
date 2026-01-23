import { defineConfig } from 'vite'
import path from 'path'
import os from 'node:os'
import basicSsl from '@vitejs/plugin-basic-ssl'

const tasksEnv =
  process.env.VITE_TASKS ??
  process.env.TASKS ??
  process.env.TASK ??
  process.env.tasks ??
  process.env.task ??
  process.env.npm_config_tasks ??
  process.env.npm_config_task

if (tasksEnv && !process.env.VITE_TASKS) {
  process.env.VITE_TASKS = tasksEnv
}

const calibrationOrientationEnv =
  process.env.VITE_REQUIRE_CALIBRATION_ORIENTATION ??
  process.env.REQUIRE_CALIBRATION_ORIENTATION ??
  process.env.require_calibration_orientation ??
  process.env.npm_config_require_calibration_orientation ??
  process.env.npm_config_calibration_orientation

if (calibrationOrientationEnv && !process.env.VITE_REQUIRE_CALIBRATION_ORIENTATION) {
  process.env.VITE_REQUIRE_CALIBRATION_ORIENTATION = calibrationOrientationEnv
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
  plugins: [basicSsl()],
  server: {
    host,
    port: 5174,
    strictPort: true,
    https: true,
  },
})

import { getProjectionType, setProjectionType, updatePCAPlane } from '../../shared/src/projection'
import { SyncManager } from '../../shared/src/SyncManager'
import { Point2D } from './Point2D'

// create canvas
const canvas = document.createElement('canvas')
canvas.style.position = 'fixed'
canvas.style.left = '0'
canvas.style.top = '0'
canvas.width = window.innerWidth
canvas.height = window.innerHeight
document.body.appendChild(canvas)
const ctx = canvas.getContext('2d')!

// sync manager
const sync = new SyncManager()

// initialize sync from remote
function initializeSyncFromRemote() {
  sync.provider.once('sync', () => {
    console.log("initializing sync from remote")
    console.log("syncedPointDataMap length", sync.syncedPointDataMap.size)
    for (const p of sync.syncedPointDataMap.values()) {
      const point = new Point2D(p.id, 0, 0, '#ff0000')
      console.log("initializing point from remote:", p)
      sync.registerPoint(point)
    }
  })
}
initializeSyncFromRemote()

// draw loop
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const p of sync.localPointsById.values()) {
    if (!(p instanceof Point2D)) continue
    p.draw(ctx, canvas.width, canvas.height)
  }
  requestAnimationFrame(draw)
}
draw()

// simple drag handling
let dragging: Point2D | null = null
canvas.addEventListener('pointerdown', (ev: PointerEvent) => {
  const rect = canvas.getBoundingClientRect()
  const x = ev.clientX - rect.left
  const y = ev.clientY - rect.top

  // find topmost Point2D under cursor (iterate newest-first)
  const pts = Array.from(sync.localPointsById.values()).filter(p => p instanceof Point2D) as Point2D[]
  for (const p of pts.reverse()) {
    if (p.hitTest(x, y, canvas.width, canvas.height)) {
      dragging = p
      // capture pointer so we keep getting moves even if cursor leaves canvas
      try { canvas.setPointerCapture(ev.pointerId) } catch { /* ignore if not supported */ }
      break
    }
  }
})

canvas.addEventListener('pointermove', (ev: PointerEvent) => {
  if (!dragging) return
  const rect = canvas.getBoundingClientRect()
  const x = ev.clientX - rect.left
  const y = ev.clientY - rect.top
  dragging.setFromPixel(x, y, canvas.width, canvas.height)
})

canvas.addEventListener('pointerup', () => {
  dragging = null 
})

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
})

function toggleProjectionMode() {
  if (getProjectionType() === 'equirectangular') {
    updatePCAPlane(sync.getLocalPointDataArray().map(p => [p.position.x, p.position.y, p.position.z]), sync)
    setProjectionType('pca')
    console.log('Switched to PCA projection')
  } else {
    setProjectionType('equirectangular')
    console.log('Switched to equirectangular projection')
  }

  // update 2d positions of all points based on new projection
  for (const p of sync.localPointsById.values()) {
    if (p instanceof Point2D) {
      p.applyRemoteData(sync.syncedPointDataMap.get(p.id)!, sync.getMetadata()!)
    }
  }
}

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'p') {
    toggleProjectionMode()
  }
})

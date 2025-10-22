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

// create two demo points and register
const a = new Point2D('point1', 0, 0, '#ff0000')
sync.registerPoint(a)

// draw loop
const points: Point2D[] = [a]
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const p of points) {
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
  if (a.hitTest(x, y, canvas.width, canvas.height)) dragging = a
})
canvas.addEventListener('pointermove', (ev: PointerEvent) => {
  if (!dragging) return
  const rect = canvas.getBoundingClientRect()
  const x = ev.clientX - rect.left
  const y = ev.clientY - rect.top
  dragging.setFromPixel(x, y, canvas.width, canvas.height)
})
canvas.addEventListener('pointerup', () => { dragging = null })

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
})

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'p') {
    if (getProjectionType() === 'equirectangular') {
      updatePCAPlane(sync.getLocalPointDataArray().map(p => {
        return [p.position.x, p.position.y, p.position.z]
      }), sync)
      setProjectionType('pca')
      console.log('Switched to PCA projection')
    } else {
      setProjectionType('equirectangular')
      console.log('Switched to equirectangular projection')
    }
  }
})

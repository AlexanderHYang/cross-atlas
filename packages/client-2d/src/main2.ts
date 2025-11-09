import { Point2D } from './Point2D'
import { SyncManager2D } from './SyncManager2D'

// Create a single canvas UI for all points (centered, not full screen)
const canvas = document.createElement('canvas')
canvas.id = 'points-canvas'
canvas.style.position = 'absolute'
canvas.style.left = '50%'
canvas.style.top = '50%'
canvas.style.transform = 'translate(-50%, -50%)'
canvas.style.display = 'block'
canvas.style.background = '#ffffff' // white interior for the canvas
canvas.style.touchAction = 'none'
canvas.style.border = '4px solid #333' // visible border
canvas.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
document.body.style.margin = '0'
document.body.style.background = '#f5f5f5'
document.body.appendChild(canvas)

const style = document.createElement('style')
style.textContent = `html, body { height:100%; background: #f5f5f5; } #points-canvas { display:block; }`
document.head.appendChild(style)

const ctx = canvas.getContext('2d')!

const syncManager: SyncManager2D = await SyncManager2D.create()

// If no points exist, create a default one
if (syncManager.getLocalPoints().length === 0) {
	const c = new Point2D('point1', syncManager)
	syncManager.registerPoint(c)
}

let width = 0, height = 0
function resize() {
	const dpr = window.devicePixelRatio || 1
	// Make canvas a large but not full-screen area, centered with margins
	const maxW = Math.max(400, Math.min(window.innerWidth - 120, 1200))
	const maxH = Math.max(300, Math.min(window.innerHeight - 120, 800))
	width = Math.floor(maxW)
	height = Math.floor(maxH)
	canvas.width = Math.floor(width * dpr)
	canvas.height = Math.floor(height * dpr)
	canvas.style.width = `${width}px`
	canvas.style.height = `${height}px`
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
window.addEventListener('resize', resize)
resize()

// Define draggable rectangle (10% padding)
function getBounds() {
	const pad = 0.0
	return {
		x: width * pad,
		y: height * pad,
		w: width * (1 - pad * 2),
		h: height * (1 - pad * 2)
	}
}

// Draw loop
function drawAll() {
	// clear
	ctx.clearRect(0, 0, width, height)
	// background fill
	ctx.fillStyle = '#f5f5f5'
	ctx.fillRect(0, 0, width, height)

	// draw bounds
	const b = getBounds()
	ctx.strokeStyle = '#999'
	ctx.lineWidth = 2
	ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1)

	// draw points
	const points = syncManager.getLocalPoints()
	for (const p of points) {
		p.draw(ctx, width, height)
	}
}

let dragging: Point2D | null = null
function clampToBounds(px: number, py: number) {
	const b = getBounds()
	const clampedX = Math.min(b.x + b.w, Math.max(b.x, px))
	const clampedY = Math.min(b.y + b.h, Math.max(b.y, py))
	return { x: clampedX, y: clampedY }
}

canvas.addEventListener('pointerdown', (ev) => {
	const rect = canvas.getBoundingClientRect()
	const px = ev.clientX - rect.left
	const py = ev.clientY - rect.top
	const points = syncManager.getLocalPoints()
	// hit test reverse order so last drawn (if ordering matters) is on top
	for (let i = points.length - 1; i >= 0; i--) {
		const p = points[i]
		if (p.hitTest(px, py, width, height)) {
			dragging = p
			try { canvas.setPointerCapture(ev.pointerId) } catch {}
			break
		}
	}
})

canvas.addEventListener('pointermove', (ev) => {
	if (!dragging) return
	const rect = canvas.getBoundingClientRect()
	let px = ev.clientX - rect.left
	let py = ev.clientY - rect.top
	const c = clampToBounds(px, py)
	px = c.x
	py = c.y
	dragging.setFromPixel(px, py, width, height)
	drawAll()
})

canvas.addEventListener('pointerup', (ev) => {
	if (!dragging) return
	try { canvas.releasePointerCapture(ev.pointerId) } catch {}
	dragging = null
})

// animate
function loop() {
	drawAll()
	requestAnimationFrame(loop)
}
loop()


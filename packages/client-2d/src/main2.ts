import { Chart2D } from './Chart2D'
import { SyncManager2D } from './SyncManager2D'
import { Chart } from '../../shared/src/Chart'
import { Scene } from '@babylonjs/core'

// create canvas
const canvas = document.createElement('canvas')
canvas.style.position = 'fixed'
canvas.style.left = '0'
canvas.style.top = '0'
canvas.width = window.innerWidth
canvas.height = window.innerHeight
document.body.appendChild(canvas)
const ctx = canvas.getContext('2d')!

// simple chart sync manager (no Babylon scene needed)
const scene = null
// @ts-ignore (not using babylon in 2d yet)
const syncManager = await SyncManager2D.create(scene)

// create a local Chart2D instance for this demo and register it
// const stub = null as unknown as Chart
// const chartPoint = new Chart2D("chart1", stub, syncManager)
// syncManager.registerChart(chartPoint)

// draw loop
function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	for (const c of syncManager.getLocalCharts()) {
		c.draw(ctx, canvas.width, canvas.height)
	}
	requestAnimationFrame(draw)
}
draw()

// dragging
let dragging: Chart2D | null = null
canvas.addEventListener('pointerdown', (ev: PointerEvent) => {
	const rect = canvas.getBoundingClientRect()
	const x = ev.clientX - rect.left
	const y = ev.clientY - rect.top
	// topmost: iterate reverse if multiple later
	for (const c of Array.from(syncManager.getLocalCharts())) {
		if (c.hitTest(x, y, canvas.width, canvas.height)) {
			dragging = c
			try { canvas.setPointerCapture(ev.pointerId) } catch {}
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

canvas.addEventListener('pointerup', (ev: PointerEvent) => {
	if (dragging) {
		try { canvas.releasePointerCapture(ev.pointerId) } catch {}
	}
	dragging = null
})

window.addEventListener('resize', () => {
	canvas.width = window.innerWidth
	canvas.height = window.innerHeight
})


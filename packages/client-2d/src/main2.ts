import { Vector3 } from '@babylonjs/core'
import { Point2D } from './Point2D'
import { SyncManager2D } from './SyncManager2D'
import { equirectangularNormalizedXY, vec3ToLatLon } from '../../shared/src/projection'
import { DEFAULT_POINT_CONFIGS, DEFAULT_SPHERE_RADIUS } from '../../shared/src/defaultPoints'

const DASHBOARD_BG = '#828485ff'

// Create a single canvas UI for all points (centered, not full screen)
const canvas = document.createElement('canvas')
canvas.id = 'points-canvas'
canvas.style.position = 'absolute'
canvas.style.left = '50%'
canvas.style.top = '50%'
canvas.style.transform = 'translate(-50%, -50%)'
canvas.style.display = 'block'
canvas.style.background = DASHBOARD_BG
canvas.style.touchAction = 'none'
canvas.style.border = '4px solid #333' // visible border
canvas.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
document.body.style.margin = '0'
document.body.style.background = DASHBOARD_BG
document.body.appendChild(canvas)

const style = document.createElement('style')
style.textContent = `html, body { height:100%; background: ${DASHBOARD_BG}; } #points-canvas { display:block; }`
document.head.appendChild(style)

const ctx = canvas.getContext('2d')!


// define projection mode
let projectionMode: 'equirectangular' | 'pca' = 'equirectangular'
export function getProjectionMode() {
	return projectionMode
}
export function setProjectionMode(mode: 'equirectangular' | 'pca') {
	projectionMode = mode
}


// create SyncManager
const syncManager: SyncManager2D = await SyncManager2D.create()

// If no points exist, create defaults that match the 3D scene
if (syncManager.getLocalPoints().length === 0) {
	for (const cfg of DEFAULT_POINT_CONFIGS) {
		const point = new Point2D(cfg.id, syncManager)
		point.setRadiusHint(DEFAULT_SPHERE_RADIUS)
		point.applyDefaultConfig(cfg)
		const direction = new Vector3(cfg.direction.x, cfg.direction.y, cfg.direction.z)
		if (direction.lengthSquared() === 0) {
			continue
		}
		const normalized = direction.normalize()
		const { lat, lon } = vec3ToLatLon(normalized)
		const { nx, ny } = equirectangularNormalizedXY(lat, lon)
		point.nx = nx
		point.ny = ny
		syncManager.registerPoint(point)
	}
}

syncManager.ensureTaskTarget()

window.addEventListener('keydown', (ev) => {
	if (ev.key === 'p' || ev.key === 'P') {
		if (projectionMode === 'equirectangular') {
			setProjectionMode('pca')
			// syncManager.getPCAManager().update(
			// 		syncManager.getRemotePoints()
			// 		.map(d => new Vector3(d.position.x, d.position.y, d.position.z))
			// 	)
			syncManager.updatePCA()
			console.log('Switched to PCA projection mode')
		} else {
			setProjectionMode('equirectangular')
			console.log('Switched to Equirectangular projection mode')
		}
		for (const p of syncManager.getLocalPoints()) {
			// re-apply local data to update nx,ny based on new PCA
			const remoteData = syncManager.getRemotePointById(p.id)
			if (remoteData) {
				p.applyRemoteData(remoteData, syncManager.getPCAManager())
			}
		}
	}
});

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
	ctx.fillStyle = DASHBOARD_BG
	ctx.fillRect(0, 0, width, height)

	// draw bounds
	const b = getBounds()
	ctx.strokeStyle = '#999'
	ctx.lineWidth = 2
	ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1)

	// draw points
	const points = syncManager.getLocalPoints()
	const taskState = syncManager.getCurrentTask()
	for (const p of points) {
		const isTarget = !!taskState && taskState.targetPointId === p.id
		const isCompleted = !!taskState?.completed
		p.draw(ctx, width, height, isTarget, isCompleted)
	}

	ctx.fillStyle = '#222'
	ctx.font = '16px sans-serif'
	const status = taskState?.completed ? '✅ Completed! Waiting for next trial.' : 'Task 1: Click the matching sphere in 3D when the green circle is selected.'
	ctx.fillText(status, b.x + 8, b.y + b.h + 24)
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

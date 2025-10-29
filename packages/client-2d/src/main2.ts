import { Chart2D } from './Chart2D'
import { SyncManager2D } from './SyncManager2D'
import { Chart } from '../../shared/src/Chart'
import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight } from '@babylonjs/core'

// Dashboard containers
const stage = document.createElement('div')
stage.id = 'stage'
const board = document.createElement('div')
board.id = 'charts-board'
const grid = document.createElement('div')
grid.id = 'charts-grid'
document.body.appendChild(stage)
stage.appendChild(board)
board.appendChild(grid)

// Styles for windows and layout
const style = document.createElement('style')
style.textContent = `
	html, body { margin:0; padding:0; height:100%; overflow:hidden; background:#0d0e12; color:#d6d8e1; }
	#stage { position:fixed; inset:0; }
	#charts-board { position:absolute; inset:0; }
	#charts-grid { position:absolute; left:50%; top:50%; transform: translate(-50%, -50%); }
	.chart-window { position:absolute; transform: translate(-50%, -50%); background:#141827; border:1px solid #27314a; border-radius:10px; box-shadow: 0 12px 30px rgba(0,0,0,0.45); }
	.chart-header { height:36px; line-height:36px; padding:0 10px; border-bottom:1px solid #27314a; cursor:grab; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size:13px; color:#b9c0d4; background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0)); border-top-left-radius:10px; border-top-right-radius:10px; user-select:none; }
	.chart-canvas { display:block; width:480px; height:320px; border-bottom-left-radius:10px; border-bottom-right-radius:10px; }
`
document.head.appendChild(style)

// Sync manager (no shared Babylon scene needed here)
// @ts-ignore passing null scene intentionally
const syncManager: SyncManager2D = await SyncManager2D.create(null)

// Helper to map Chart2D normalized to pixel coords (full window as reference)
const viewportWidth = () => window.innerWidth
const viewportHeight = () => window.innerHeight
function normToPixel(nx: number, ny: number) {
	const w = viewportWidth(), h = viewportHeight()
	const x = ((nx + 1) / 2) * w
	const y = ((1 - (ny + 1) / 2)) * h
	return { x, y }
}

// Build windows for current charts; if none, create one
if (syncManager.getLocalCharts().length === 0) {
	const c = new Chart2D('chart1', syncManager as any)
	syncManager.registerChart(c)
}

const windowsById = new Map<string, HTMLElement>()
const draggingIds = new Set<string>()

function createChartWindow(c: Chart2D, index: number) {
	const win = document.createElement('div')
	win.className = 'chart-window'
	win.dataset.chartId = c.id

	const header = document.createElement('div')
	header.className = 'chart-header'
	header.textContent = `Chart ${index+1} — ${c.id}`
	win.appendChild(header)

	const canvas = document.createElement('canvas')
	canvas.className = 'chart-canvas'
	const css = getComputedStyle(canvas)
	const w = parseInt(css.width) || 480
	const h = parseInt(css.height) || 320
	canvas.width = w
	canvas.height = h
	win.appendChild(canvas)

	// Babylon per-window engine/scene
	const engine = new Engine(canvas, true)
	const scene = new Scene(engine)
	const cam = new ArcRotateCamera('cam_'+c.id, Math.PI/4, Math.PI/3, 4, Vector3.Zero(), scene)
	cam.attachControl(canvas, true)
	new HemisphericLight('h_'+c.id, new Vector3(0,1,0), scene)

	// Real Chart rendering in this window
	// Note: this Chart is visual only; position sync is handled by Chart2D windows
		const chart = new Chart('line', scene)
		c.setChart(chart)
	engine.runRenderLoop(() => scene.render())

	// Position the window from nx/ny
	const { x, y } = normToPixel(c.nx, c.ny)
	win.style.left = `${x}px`
	win.style.top = `${y}px`

	// Drag behavior via header
	let drag: null | { sx:number, sy:number, left:number, top:number } = null
	header.addEventListener('pointerdown', (e) => {
		draggingIds.add(c.id)
		header.setPointerCapture(e.pointerId)
		header.style.cursor = 'grabbing'
		const rect = win.getBoundingClientRect()
		const left = rect.left + rect.width/2
		const top = rect.top + rect.height/2
		drag = { sx: e.clientX, sy: e.clientY, left, top }
	})
	header.addEventListener('pointermove', (e) => {
		if (!drag) return
		const dx = e.clientX - drag.sx
		const dy = e.clientY - drag.sy
		const newLeft = drag.left + dx
		const newTop = drag.top + dy
		win.style.left = `${newLeft}px`
		win.style.top = `${newTop}px`
		// update Chart2D using viewport as reference
		c.setFromPixel(newLeft, newTop, viewportWidth(), viewportHeight())
	})
	header.addEventListener('pointerup', (e) => {
		try { header.releasePointerCapture(e.pointerId) } catch {}
		header.style.cursor = 'grab'
		drag = null
		draggingIds.delete(c.id)
	})

	windowsById.set(c.id, win)
	grid.appendChild(win)
}

Array.from(syncManager.getLocalCharts()).forEach((c, i) => createChartWindow(c, i))

// Reflect remote changes by adjusting window positions each frame (skip active drags)
function tick() {
	for (const c of syncManager.getLocalCharts()) {
		if (draggingIds.has(c.id)) continue
		const win = windowsById.get(c.id)
		if (!win) continue
		const { x, y } = normToPixel(c.nx, c.ny)
		win.style.left = `${x}px`
		win.style.top = `${y}px`
	}
	requestAnimationFrame(tick)
}
tick()

window.addEventListener('resize', () => {
	// on resize, just let next tick recalc using new viewport
})


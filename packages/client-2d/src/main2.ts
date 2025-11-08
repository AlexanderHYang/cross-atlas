import { Point2D } from './Point2D'
import { SyncManager2D } from './SyncManager2D'
import { Chart } from '../../shared/src/Chart'
// Babylon imports handled inside Chart2D; main stays UI-only

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
	.chart-window { position:absolute; transform: translate(-50%, -50%); border:1px solid #27314a; border-radius:10px; box-shadow: 0 12px 30px rgba(0,0,0,0.45); }
	.chart-header { height:36px; line-height:36px; padding:0 10px; border-bottom:1px solid #27314a; cursor:grab; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size:13px; color:#b9c0d4; background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0)); border-top-left-radius:10px; border-top-right-radius:10px; user-select:none; }
	.chart-canvas { display:block; width:480px; height:320px; border-bottom-left-radius:10px; border-bottom-right-radius:10px; }
`
document.head.appendChild(style)

// Sync manager
const syncManager: SyncManager2D = await SyncManager2D.create()

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
	const c = new Point2D('point1', syncManager as any)
	syncManager.registerChart(c as any)
}

// Mount a window for each chart; Chart2D owns its DOM and Babylon scene
Array.from(syncManager.getLocalCharts()).forEach((c) => c.mount(grid))

window.addEventListener('resize', () => {
	// on resize, ask each card to reposition based on nx/ny
	for (const c of syncManager.getLocalCharts()) c.updateWindowPositionFromNxNy()
})


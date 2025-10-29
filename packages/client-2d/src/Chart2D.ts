import { Vector3, Engine, Scene, ArcRotateCamera, HemisphericLight, Color4 } from "@babylonjs/core";
import { Chart, ChartSyncData, Vector3SyncData } from "../../shared/src/Chart";
import { SyncManager2D } from "./SyncManager2D";
import { equirectangularNormalizedXY, inverseEquirectangularNormalizedXY, latLonToVec3, vec3ToLatLon } from "../../shared/src/projection";

export class Chart2D {
    id: string;
    chart?: Chart;
    onLocalChange: () => void;

    // 2d specific stuff
    nx: number = 0
    ny: number = 0

    // DOM and Babylon per-window state
    private element?: HTMLDivElement
    private header?: HTMLDivElement
    private canvas?: HTMLCanvasElement
    private engine?: Engine
    private scene?: Scene
    private dragging: boolean = false
    private dragState?: { sx:number, sy:number, left:number, top:number }


    constructor(id: string, syncManager: SyncManager2D, chart?: Chart) { // chart is optional; main2.ts can attach later
        this.id = id;
        this.chart = chart;
        this.onLocalChange = () => {
            syncManager.transactChartUpdate(this);
        };
    }

    public setChart(chart: Chart) {
        this.chart = chart;
    }

    // Create the window/card and Babylon scene under a parent container
    public mount(parent: HTMLElement) {
        if (this.element) return; // already mounted

        const win = document.createElement('div')
        win.className = 'chart-window'
        win.dataset.chartId = this.id
        this.element = win

        const header = document.createElement('div')
        header.className = 'chart-header'
        header.textContent = `Chart — ${this.id}`
        win.appendChild(header)
        this.header = header

        const canvas = document.createElement('canvas')
        canvas.className = 'chart-canvas'
        const css = getComputedStyle(canvas)
        const w = parseInt(css.width) || 480
        const h = parseInt(css.height) || 320
        canvas.width = w
        canvas.height = h
        canvas.style.background = 'transparent'
        canvas.style.backgroundColor = 'transparent'
        win.appendChild(canvas)
        this.canvas = canvas

        // Babylon engine/scene for this card
        const engine = new Engine(canvas, true)
        const scene = new Scene(engine)
        scene.clearColor = new Color4(0, 0, 0, 0)
        const cam = new ArcRotateCamera('cam_'+this.id, Math.PI/4, Math.PI/3, 4, new Vector3(0.0, 1.0, 0.0), scene)
        cam.attachControl(canvas, true)
        new HemisphericLight('h_'+this.id, new Vector3(0,1,0), scene)
        this.engine = engine
        this.scene = scene

        // Create real Chart and attach to this adapter
        if (!this.chart) {
            this.chart = new Chart('line', scene)
        } else {
            // chart exists but may belong to another scene; recreate for this scene
            this.chart = new Chart('line', scene)
        }
        engine.runRenderLoop(() => scene.render())

        // initial positioning from nx/ny (convert viewport px -> board-centered px)
        const p = this.normToPixel(this.nx, this.ny)
        const leftBoard = p.x - window.innerWidth / 2
        const topBoard = p.y - window.innerHeight / 2
        this.applyWindowPosition(leftBoard, topBoard)

        // Drag handlers on header
        header.addEventListener('pointerdown', (e) => {
            this.dragging = true
            try { header.setPointerCapture(e.pointerId) } catch {}
            header.style.cursor = 'grabbing'
            const rect = win.getBoundingClientRect()
            const centerX = rect.left + rect.width/2
            const centerY = rect.top + rect.height/2
            // store starting board-centered coords (grid origin at viewport center)
            const startLeftBoard = centerX - window.innerWidth / 2
            const startTopBoard = centerY - window.innerHeight / 2
            this.dragState = { sx: e.clientX, sy: e.clientY, left: startLeftBoard, top: startTopBoard }
        })
        header.addEventListener('pointermove', (e) => {
            if (!this.dragging || !this.dragState) return
            const dx = e.clientX - this.dragState.sx
            const dy = e.clientY - this.dragState.sy
            // new board-centered pos
            const newLeftBoard = this.dragState.left + dx
            const newTopBoard = this.dragState.top + dy
            this.applyWindowPosition(newLeftBoard, newTopBoard)
            // convert back to viewport px for normalized mapping
            const px = newLeftBoard + window.innerWidth / 2
            const py = newTopBoard + window.innerHeight / 2
            this.setFromPixel(px, py, window.innerWidth, window.innerHeight)
        })
        header.addEventListener('pointerup', (e) => {
            try { header.releasePointerCapture(e.pointerId) } catch {}
            header.style.cursor = 'grab'
            this.dragging = false
            this.dragState = undefined
        })

        parent.appendChild(win)
    }

    public unmount() {
        if (this.engine) { try { this.engine.dispose() } catch {} }
        if (this.element?.parentElement) this.element.parentElement.removeChild(this.element)
        this.element = undefined
        this.header = undefined
        this.canvas = undefined
        this.engine = undefined
        this.scene = undefined
        this.dragging = false
        this.dragState = undefined
    }

    public updateWindowPositionFromNxNy() {
        if (!this.element) return
    const p = this.normToPixel(this.nx, this.ny)
    const leftBoard = p.x - window.innerWidth / 2
    const topBoard = p.y - window.innerHeight / 2
    this.applyWindowPosition(leftBoard, topBoard)
    }

    private normToPixel(nx: number, ny: number) {
        const w = window.innerWidth, h = window.innerHeight
        const x = ((nx + 1) / 2) * w
        const y = ((1 - (ny + 1) / 2)) * h
        return { x, y }
    }
    private applyWindowPosition(left:number, top:number) {
        if (!this.element) return
        this.element.style.left = `${left}px`
        this.element.style.top = `${top}px`
    }

    public applyRemoteData(remoteData: ChartSyncData) {
        console.log("applying remote data to chart", this.id);

        const x = remoteData.position.x
        const y = remoteData.position.y
        const z = remoteData.position.z
        const { lat, lon, radius } = vec3ToLatLon(new Vector3(x, y, z))
        const { nx, ny } = equirectangularNormalizedXY(lat, lon)
        this.nx = nx
        this.ny = ny
        // if mounted, reposition window immediately
        this.updateWindowPositionFromNxNy()
    }

    public getLocalData(existing: ChartSyncData): ChartSyncData {
        // equirectangular projection of (nx, ny)
        const { lat, lon } = inverseEquirectangularNormalizedXY(this.nx, this.ny)
        const v = latLonToVec3(lat, lon, 1)

        // use existing vector length (from origin)
        const existingVec = new Vector3(existing.position.x, existing.position.y, existing.position.z)
        v.scaleInPlace(existingVec.length())

        const pos: Vector3SyncData = { x: v.x, y: v.y, z: v.z }
        console.log("getting local data for chart", this.id, pos);
        return { id: this.id, position: pos }
    }

    // draw a simple point on canvas
    draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const x = ((this.nx + 1) / 2) * width
        const y = ((1 - (this.ny + 1) / 2)) * height
        ctx.beginPath()
        ctx.fillStyle = "red"
        const radius = 8
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
    }

    hitTest(px: number, py: number, width: number, height: number) {
        const x = ((this.nx + 1) / 2) * width
        const y = ((1 - (this.ny + 1) / 2)) * height
        const dx = px - x
        const dy = py - y
        const radius = 8
        return dx * dx + dy * dy <= radius * radius
    }

    setFromPixel(px: number, py: number, width: number, height: number) {
        this.nx = (px / width) * 2 - 1
        this.ny = ((height - py) / height) * 2 - 1
        this.onLocalChange()
    }
}
import { ChartSyncData, Vector3SyncData } from "../../shared/src/Chart";
import { Vector3 } from '@babylonjs/core'
import { SyncManager2D } from "./SyncManager2D";
import { equirectangularNormalizedXY, inverseEquirectangularNormalizedXY, latLonToVec3, vec3ToLatLon } from "../../shared/src/projection";

export class Point2D {
    id: string;
    onLocalChange: () => void;

    // 2d specific state
    nx: number = 0;
    ny: number = 0;

    // DOM state
    private element?: HTMLDivElement;
    private header?: HTMLDivElement;
    private canvas?: HTMLCanvasElement;
    private dragging: boolean = false;
    private dragState?: { sx: number; sy: number; left: number; top: number };

    constructor(id: string, syncManager: SyncManager2D) {
        this.id = id;
        this.onLocalChange = () => {
            syncManager.transactChartUpdate(this as any);
        };
    }

    // Create the window under a parent container
    public mount(parent: HTMLElement) {
        if (this.element) return; // already mounted

        const win = document.createElement('div');
        win.className = 'chart-window';
        win.dataset.chartId = this.id;
        this.element = win;

        const header = document.createElement('div');
        header.className = 'chart-header';
        header.textContent = `Point — ${this.id}`;
        win.appendChild(header);
        this.header = header;

        const canvas = document.createElement('canvas');
        canvas.className = 'chart-canvas';
        const css = getComputedStyle(canvas);
        const w = parseInt(css.width) || 480;
        const h = parseInt(css.height) || 320;
        canvas.width = w;
        canvas.height = h;
        canvas.style.background = 'transparent';
        canvas.style.backgroundColor = 'transparent';
        win.appendChild(canvas);
        this.canvas = canvas;

        // initial positioning from nx/ny (convert viewport px -> board-centered px)
        const p = this.normToPixel(this.nx, this.ny);
        const leftBoard = p.x - window.innerWidth / 2;
        const topBoard = p.y - window.innerHeight / 2;
        this.applyWindowPosition(leftBoard, topBoard);

        // Drag handlers on header
        header.addEventListener('pointerdown', (e) => {
            this.dragging = true;
            try { header.setPointerCapture(e.pointerId); } catch {}
            header.style.cursor = 'grabbing';
            const rect = win.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const startLeftBoard = centerX - window.innerWidth / 2;
            const startTopBoard = centerY - window.innerHeight / 2;
            this.dragState = { sx: e.clientX, sy: e.clientY, left: startLeftBoard, top: startTopBoard };
        });
        header.addEventListener('pointermove', (e) => {
            if (!this.dragging || !this.dragState) return;
            const dx = e.clientX - this.dragState.sx;
            const dy = e.clientY - this.dragState.sy;
            const newLeftBoard = this.dragState.left + dx;
            const newTopBoard = this.dragState.top + dy;
            this.applyWindowPosition(newLeftBoard, newTopBoard);
            const px = newLeftBoard + window.innerWidth / 2;
            const py = newTopBoard + window.innerHeight / 2;
            this.setFromPixel(px, py, window.innerWidth, window.innerHeight);
        });
        header.addEventListener('pointerup', (e) => {
            try { header.releasePointerCapture(e.pointerId); } catch {}
            header.style.cursor = 'grab';
            this.dragging = false;
            this.dragState = undefined;
        });

        parent.appendChild(win);
    }

    public unmount() {
        if (this.element?.parentElement) this.element.parentElement.removeChild(this.element);
        this.element = undefined;
        this.header = undefined;
        this.canvas = undefined;
        this.dragging = false;
        this.dragState = undefined;
    }

    public updateWindowPositionFromNxNy() {
        if (!this.element) return;
        const p = this.normToPixel(this.nx, this.ny);
        const leftBoard = p.x - window.innerWidth / 2;
        const topBoard = p.y - window.innerHeight / 2;
        this.applyWindowPosition(leftBoard, topBoard);
    }

    private normToPixel(nx: number, ny: number) {
        const w = window.innerWidth, h = window.innerHeight;
        const x = ((nx + 1) / 2) * w;
        const y = ((1 - (ny + 1) / 2)) * h;
        return { x, y };
    }
    private applyWindowPosition(left:number, top:number) {
        if (!this.element) return;
        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
    }

    public applyRemoteData(remoteData: ChartSyncData) {
    const x = remoteData.position.x;
    const y = remoteData.position.y;
    const z = remoteData.position.z;
    const { lat, lon, radius } = vec3ToLatLon(new Vector3(x, y, z));
        const { nx, ny } = equirectangularNormalizedXY(lat, lon);
        this.nx = nx;
        this.ny = ny;
        this.updateWindowPositionFromNxNy();
    }

    public getLocalData(existing: ChartSyncData): ChartSyncData {
        const { lat, lon } = inverseEquirectangularNormalizedXY(this.nx, this.ny);
        const v = latLonToVec3(lat, lon, 1);
    const existingVec = new Vector3(existing.position.x, existing.position.y, existing.position.z)
    // use existing vector length (from origin)
    const len = existingVec.length()
        v.x *= len; v.y *= len; v.z *= len;
        const pos: Vector3SyncData = { x: v.x, y: v.y, z: v.z };
        return { id: this.id, position: pos };
    }

    // draw a simple point on canvas
    draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const x = ((this.nx + 1) / 2) * width;
        const y = ((1 - (this.ny + 1) / 2)) * height;
        ctx.beginPath();
        ctx.fillStyle = "red";
        const radius = 8;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    hitTest(px: number, py: number, width: number, height: number) {
        const x = ((this.nx + 1) / 2) * width;
        const y = ((1 - (this.ny + 1) / 2)) * height;
        const dx = px - x;
        const dy = py - y;
        const radius = 8;
        return dx * dx + dy * dy <= radius * radius;
    }

    setFromPixel(px: number, py: number, width: number, height: number) {
        this.nx = (px / width) * 2 - 1;
        this.ny = ((height - py) / height) * 2 - 1;
        this.onLocalChange();
    }
}

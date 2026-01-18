import { PointSyncData, Vector3SyncData } from "../../shared/src/sync";
import { Vector3 } from "@babylonjs/core";
import { SyncManager2D } from "./SyncManager2D";
import { DefaultPointConfig, getDefaultPointConfig } from "../../shared/src/defaultPoints";
import { ProjectionManager } from "./ProjectionManager";

export class Point2D {
    id: string;
    onLocalChange: () => void;
    color: Vector3 = new Vector3(1, 1, 1);
    private baseColor: Vector3 = new Vector3(1, 1, 1);
    pos3d: Vector3 = new Vector3(0, 0, 0)

    // 2d specific state
    nx: number = 0;
    ny: number = 0;
    private draggable: boolean = true;
    private selectable: boolean = true;
    private colorLock: Vector3 | null = null;
    private flashHandle: number | null = null;
    private flashing: boolean = false;

    constructor(id: string, syncManager: SyncManager2D) {
        this.id = id;
        this.onLocalChange = () => {
            syncManager.transactPointUpdate(this);
        };
    }

    public setDraggable(value: boolean) {
        this.draggable = value;
    }

    public isDraggable() {
        return this.draggable;
    }

    public setSelectable(value: boolean) {
        this.selectable = value;
    }

    public isSelectable() {
        return this.selectable;
    }

    public setColor(color: Vector3) {
        this.color.copyFrom(color);
    }

    public getBaseColor(): Vector3 {
        return this.baseColor.clone();
    }

    public setBaseColor(color: Vector3) {
        this.baseColor.copyFrom(color);
    }

    public resetToBaseColor() {
        this.color.copyFrom(this.baseColor);
        this.materializeColorChange();
    }

    public setDisplayColor(color: Vector3) {
        this.color.copyFrom(color);
        this.materializeColorChange();
    }

    private materializeColorChange() {
        if (this.flashHandle !== null) {
            window.clearTimeout(this.flashHandle);
            this.flashHandle = null;
        }
        this.onLocalChange();
    }

    public flashColorSync(color: Vector3, durationMs: number = 800) {
        if (this.flashHandle !== null) {
            window.clearTimeout(this.flashHandle);
            this.flashHandle = null;
        }
        const wasSelectable = this.selectable;
        this.flashing = true;
        this.setSelectable(false);
        this.setDisplayColor(color);
        this.flashHandle = window.setTimeout(() => {
            this.resetToBaseColor();
            this.setSelectable(wasSelectable);
            this.flashing = false;
            this.flashHandle = null;
        }, durationMs);
    }

    public setLockedColor(color: Vector3) {
        if (!this.colorLock) {
            this.colorLock = new Vector3();
        }
        this.colorLock.copyFrom(color);
        this.setColor(color);
    }

    public clearLockedColor() {
        this.colorLock = null;
    }

    public hasLockedColor(): boolean {
        return this.colorLock !== null;
    }

    public applyDefaultConfig(config?: DefaultPointConfig) {
        const resolved = config ?? getDefaultPointConfig(this.id);
        if (!resolved) {
            return;
        }
        const color = resolved.color
            ? new Vector3(resolved.color.x, resolved.color.y, resolved.color.z)
            : undefined;
        const isDraggable = resolved.draggable !== false;
        const isSelectable = resolved.selectable !== false;
        this.setDraggable(isDraggable);
        this.setSelectable(isSelectable);
        if (color) {
            this.setBaseColor(color);
            this.setColor(color);
        } else {
            this.setBaseColor(this.color);
        }
        this.clearLockedColor();

        this.pos3d = new Vector3(resolved.direction.x, resolved.direction.y, resolved.direction.z);
    }

    public applyRemoteData(remoteData: PointSyncData) {
        // Skip applying remote color if we're currently flashing
        if (this.flashHandle === null) {
            this.color.set(remoteData.color.x, remoteData.color.y, remoteData.color.z);
        }
    }

    public getLocalData(): PointSyncData {
        const color = { x: this.color.x, y: this.color.y, z: this.color.z };
        return { id: this.id, color };
    }

    // draw a simple point on canvas
    draw(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        _isTaskTarget: boolean,
        _taskCompleted: boolean,
        hideColor: boolean = false,
        overrideColor: Vector3 | null = null
    ) {
        const x = ((this.nx + 1) / 2) * width;
        const y = (1 - (this.ny + 1) / 2) * height;
        // color stored in this.color as Vector3 (r,g,b) in 0..1
        const sourceColor = overrideColor ?? (hideColor ? this.baseColor : this.color);
        const r = Math.round(Math.min(1, Math.max(0, sourceColor.x)) * 255);
        const g = Math.round(Math.min(1, Math.max(0, sourceColor.y)) * 255);
        const b = Math.round(Math.min(1, Math.max(0, sourceColor.z)) * 255);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        const radius = 12;

        if (this.id === "landmark") {
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        } else {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    hitTest(px: number, py: number, width: number, height: number) {
        if (!this.selectable || this.flashing) {
            return false;
        }
        const x = ((this.nx + 1) / 2) * width;
        const y = (1 - (this.ny + 1) / 2) * height;
        const radius = 12;

        if (this.id === "landmark") {
            return px >= x - radius && px <= x + radius && py >= y - radius && py <= y + radius;
        }

        const dx = px - x;
        const dy = py - y;
        return dx * dx + dy * dy <= radius * radius;
    }

    // setFromPixel(px: number, py: number, width: number, height: number) {
    //     if (!this.draggable) {
    //         return;
    //     }
    //     this.nx = (px / width) * 2 - 1;
    //     this.ny = ((height - py) / height) * 2 - 1;
    //     this.onLocalChange();
    // }
}

import { PointSyncData, Vector3SyncData } from "../../shared/src/sync";
import { Vector3 } from '@babylonjs/core'
import { SyncManager2D } from "./SyncManager2D";
import { clamp, equirectangularNormalizedXY, inverseEquirectangularNormalizedXY, latLonToVec3, vec3ToLatLon } from "../../shared/src/projection";
import { getProjectionMode } from "./main2";
import { PCAManager } from "./PCAManager";
import { DefaultPointConfig, getDefaultPointConfig } from "../../shared/src/defaultPoints";

export class Point2D {
    id: string;
    onLocalChange: () => void;
    color: Vector3 = new Vector3(1, 1, 1)

    // 2d specific state
    nx: number = 0;
    ny: number = 0;
    private radiusHint: number = 1;
    private draggable: boolean = true;
    private colorLock: Vector3 | null = null;
    private positionLock: { nx: number; ny: number } | null = null;

    constructor(id: string, syncManager: SyncManager2D) {
        this.id = id;
        this.onLocalChange = () => {
            syncManager.transactPointUpdate(this);
        };
    }

    public setRadiusHint(radius: number) {
        if (Number.isFinite(radius) && radius > 0) {
            this.radiusHint = radius;
        }
    }

    public setDraggable(value: boolean) {
        this.draggable = value;
    }

    public setColor(color: Vector3) {
        this.color.copyFrom(color);
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

    public setPositionLock(nx: number, ny: number) {
        this.positionLock = { nx, ny };
        this.nx = nx;
        this.ny = ny;
    }

    public clearPositionLock() {
        this.positionLock = null;
    }

    public hasPositionLock(): boolean {
        return this.positionLock !== null;
    }

    public applyDefaultConfig(config?: DefaultPointConfig) {
        const resolved = config ?? getDefaultPointConfig(this.id);
        if (!resolved) {
            return;
        }
        const color = resolved.color ? new Vector3(resolved.color.x, resolved.color.y, resolved.color.z) : undefined;
        const isDraggable = resolved.draggable !== false;
        this.setDraggable(isDraggable);
        if (color) {
            if (isDraggable) {
                this.clearLockedColor();
                this.setColor(color);
            } else {
                this.setLockedColor(color);
            }
        } else if (!isDraggable) {
            // ensure the current color stays fixed even without explicit config color
            this.setLockedColor(this.color);
        } else {
            this.clearLockedColor();
        }

        if (resolved.locked2dPosition) {
            this.setPositionLock(resolved.locked2dPosition.nx, resolved.locked2dPosition.ny);
        } else {
            this.clearPositionLock();
        }
    }

    public applyRemoteData(remoteData: PointSyncData, pcaManager: PCAManager) {
        const x = remoteData.position.x;
        const y = remoteData.position.y;
        const z = remoteData.position.z;
        const remoteVec = new Vector3(x, y, z);
        const remoteLen = remoteVec.length();
        if (remoteLen > 0) {
            this.radiusHint = remoteLen;
        }
        if (this.colorLock) {
            this.color.copyFrom(this.colorLock);
        } else {
            this.color.set(remoteData.color.x, remoteData.color.y, remoteData.color.z);
        }

        if (getProjectionMode() === 'pca') {
            try {
                const [ nx, ny ] = pcaManager.project(remoteVec);
                this.nx = clamp(nx, -1, 1);
                this.ny = clamp(ny, -1, 1);
                return;
            } catch (e) {
                console.warn("Error in PCA projection (falling back to equirectangular):", e);
            }
        } 

        // equirectangular projection
        const { lat, lon } = vec3ToLatLon(remoteVec);
        const { nx, ny } = equirectangularNormalizedXY(lat, lon);
        this.nx = nx;
        this.ny = ny;

        if (this.positionLock) {
            this.nx = this.positionLock.nx;
            this.ny = this.positionLock.ny;
        }
    }

    public getLocalData(existing: PointSyncData | undefined, pcaManager: PCAManager): PointSyncData {
        const existingVec = existing
            ? new Vector3(existing.position.x, existing.position.y, existing.position.z)
            : undefined;

        if (getProjectionMode() === 'pca' && existingVec) {
            try {
                const v = pcaManager.inverseWithSignedDistance(this.nx, this.ny, existingVec)
                return {
                    id: this.id,
                    position: { x: v.x, y: v.y, z: v.z },
                    color: { x: this.color.x, y: this.color.y, z: this.color.z }
                }
            } catch (e) {
                console.warn("Error in PCA inverse projection (falling back to equirectangular):", e);
            }
        } 

        // equirectangular projection
        const lockedCoords = this.positionLock ?? null;
        const nx = lockedCoords ? lockedCoords.nx : this.nx;
        const ny = lockedCoords ? lockedCoords.ny : this.ny;
        const { lat, lon } = inverseEquirectangularNormalizedXY(nx, ny);
        let len = this.radiusHint || 1;
        if (existingVec) {
            const existingLen = existingVec.length();
            if (existingLen > 0) {
                len = existingLen;
            }
        }
        const v = latLonToVec3(lat, lon, len);

        const pos: Vector3SyncData = { x: v.x, y: v.y, z: v.z };
        const color = { x: this.color.x, y: this.color.y, z: this.color.z };
        return { id: this.id, position: pos, color };
    }

    // draw a simple point on canvas
    draw(ctx: CanvasRenderingContext2D, width: number, height: number, isTaskTarget: boolean, _taskCompleted: boolean) {
        const x = ((this.nx + 1) / 2) * width;
        const y = ((1 - (this.ny + 1) / 2)) * height;
        ctx.beginPath();
        // color stored in this.color as Vector3 (r,g,b) in 0..1
        if (isTaskTarget) {
            ctx.fillStyle = '#2ecc71';
        } else {
            const r = Math.round(Math.min(1, Math.max(0, this.color.x)) * 255);
            const g = Math.round(Math.min(1, Math.max(0, this.color.y)) * 255);
            const b = Math.round(Math.min(1, Math.max(0, this.color.z)) * 255);
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        }
        const radius = 12;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    hitTest(px: number, py: number, width: number, height: number) {
        if (!this.draggable) {
            return false;
        }
        const x = ((this.nx + 1) / 2) * width;
        const y = ((1 - (this.ny + 1) / 2)) * height;
        const dx = px - x;
        const dy = py - y;
        const radius = 12;
        return dx * dx + dy * dy <= radius * radius;
    }

    setFromPixel(px: number, py: number, width: number, height: number) {
        if (!this.draggable || this.positionLock) {
            return;
        }
        this.nx = (px / width) * 2 - 1;
        this.ny = ((height - py) / height) * 2 - 1;
        this.onLocalChange();
    }
}

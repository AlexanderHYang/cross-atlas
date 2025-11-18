import { PointSyncData, Vector3SyncData } from "../../shared/src/sync";
import { Vector3 } from '@babylonjs/core'
import { SyncManager2D } from "./SyncManager2D";
import { clamp, equirectangularNormalizedXY, inverseEquirectangularNormalizedXY, latLonToVec3, vec3ToLatLon } from "../../shared/src/projection";
import { getProjectionMode } from "./main2";
import { PCAManager } from "./PCAManager";

export class Point2D {
    id: string;
    onLocalChange: () => void;
    color: Vector3 = new Vector3(1, 0, 0)

    // 2d specific state
    nx: number = 0;
    ny: number = 0;
    private radiusHint: number = 1;

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

    public applyRemoteData(remoteData: PointSyncData, pcaManager: PCAManager) {
        const x = remoteData.position.x;
        const y = remoteData.position.y;
        const z = remoteData.position.z;
        const remoteVec = new Vector3(x, y, z);
        const remoteLen = remoteVec.length();
        if (remoteLen > 0) {
            this.radiusHint = remoteLen;
        }

        if (getProjectionMode() === 'pca') {
            try {
                const [ nx, ny ] = pcaManager.project(remoteVec);
                this.nx = clamp(nx, -1, 1);
                this.ny = clamp(ny, -1, 1);
                // update color if provided
                const c = remoteData.color;
                this.color = new Vector3(c.x, c.y, c.z);
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
        // update color if provided
        const c = remoteData.color;
        this.color = new Vector3(c.x, c.y, c.z);
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
        const { lat, lon } = inverseEquirectangularNormalizedXY(this.nx, this.ny);
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
    draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const x = ((this.nx + 1) / 2) * width;
        const y = ((1 - (this.ny + 1) / 2)) * height;
        ctx.beginPath();
        // color stored in this.color as Vector3 (r,g,b) in 0..1
        const r = Math.round(Math.min(1, Math.max(0, this.color.x)) * 255);
        const g = Math.round(Math.min(1, Math.max(0, this.color.y)) * 255);
        const b = Math.round(Math.min(1, Math.max(0, this.color.z)) * 255);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
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

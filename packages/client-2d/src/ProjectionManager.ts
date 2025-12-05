import { Vector3 } from '@babylonjs/core'
import { PCAManager } from './PCAManager'
import { clamp, equirectangularNormalizedXY, inverseEquirectangularNormalizedXY, latLonToVec3, vec3ToLatLon } from '../../shared/src/projection'
import { SyncManager2D } from './SyncManager2D'
import { PlaneSyncData } from '@shared/src/sync'

export interface IProjection {
    // project 3D -> normalized 2D
    project(v: Vector3): [number, number]
    // inverse 2D -> 3D
    inverse(nx: number, ny: number, existing: Vector3): Vector3
    getPlaneSyncData(): PlaneSyncData | null
}

export class EquirectangularProjection implements IProjection {
    project(v: Vector3): [number, number] {
        const { lat, lon } = vec3ToLatLon(v);
        const { nx, ny } =  equirectangularNormalizedXY(lat , lon);
        return [nx, ny];
    }

    inverse(nx: number, ny: number, existing: Vector3): Vector3 {
        const { lat, lon } = inverseEquirectangularNormalizedXY(nx, ny);
        let len = 1;
        if (existing.length() > 0) {
            len = existing.length();
        }
        const v = latLonToVec3(lat, lon, len);
        return v;
    }

    getPlaneSyncData(): PlaneSyncData | null {
        return null;
    }
}

export class PCAProjection implements IProjection {
    private pcaManager: PCAManager;

    constructor(pcaManager: PCAManager) {
        this.pcaManager = pcaManager;
    }

    getPcaManager(): PCAManager {
        return this.pcaManager;
    }

    project(v: Vector3): [number, number] {
        let [ nx, ny ] = this.pcaManager.project(v);
        nx = clamp(nx, -1, 1);
        ny = clamp(ny, -1, 1);
        return [nx, ny];
    }

    inverse(nx: number, ny: number, existing: Vector3): Vector3 {
        return this.pcaManager.inverseWithSignedDistance(nx, ny, existing);
    }

    getPlaneSyncData(): PlaneSyncData | null {
        const mean = this.pcaManager.getMean();
        const normal = this.pcaManager.getNormal();
        return {
            mean: { x: mean.x, y: mean.y, z: mean.z },
            normal: { x: normal.x, y: normal.y, z: normal.z }
        }
    }
}

export class VerticalPlaneProjection implements IProjection {
    private origin = new Vector3(0, 0, 0);
    private normal = new Vector3(0, 0, 1);
    private u = new Vector3(1, 0, 0);
    private v = new Vector3(0, 1, 0);
    private scaleU = 5;
    private scaleV = 5;

    project(point: Vector3): [number, number] {
        const relative = point.subtract(this.origin);
        const distToPlane = Vector3.Dot(relative, this.normal);
        const projected = relative.subtract(this.normal.scale(distToPlane));
        const uCoord = Vector3.Dot(projected, this.u) / this.scaleU;
        const vCoord = Vector3.Dot(projected, this.v) / this.scaleV;
        return [uCoord, vCoord];
    }

    inverse(nx: number, ny: number, existing: Vector3): Vector3 {
        const uComp = this.u.scale(nx * this.scaleU);
        const vComp = this.v.scale(ny * this.scaleV);
        const pointOnPlane = this.origin.add(uComp).add(vComp);
        // Preserve distance from plane
        const existingRelative = existing.subtract(this.origin);
        const distToPlane = Vector3.Dot(existingRelative, this.normal);
        const finalPoint = pointOnPlane.add(this.normal.scale(distToPlane));
        return finalPoint;
    }

    getPlaneSyncData(): PlaneSyncData | null {
        return {
            mean: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
            normal: { x: this.normal.x, y: this.normal.y, z: this.normal.z }
        }
    }
}

export class HorizontalPlaneProjection implements IProjection {
    private origin = new Vector3(0, 0, 0);
    private normal = new Vector3(0, 1, 0);
    private u = new Vector3(1, 0, 0);
    private v = new Vector3(0, 0, 1);
    private scaleU = 5;
    private scaleV = 5;

    project(point: Vector3): [number, number] {
        const relative = point.subtract(this.origin);
        const distToPlane = Vector3.Dot(relative, this.normal);
        const projected = relative.subtract(this.normal.scale(distToPlane));
        const uCoord = Vector3.Dot(projected, this.u) / this.scaleU;
        const vCoord = Vector3.Dot(projected, this.v) / this.scaleV;
        return [uCoord, vCoord];
    }

    inverse(nx: number, ny: number, existing: Vector3): Vector3 {
        const uComp = this.u.scale(nx * this.scaleU);
        const vComp = this.v.scale(ny * this.scaleV);
        const pointOnPlane = this.origin.add(uComp).add(vComp);
        // Preserve distance from plane
        const existingRelative = existing.subtract(this.origin);
        const distToPlane = Vector3.Dot(existingRelative, this.normal);
        const finalPoint = pointOnPlane.add(this.normal.scale(distToPlane));
        return finalPoint;
    }

    getPlaneSyncData(): PlaneSyncData | null {
        return {
            mean: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
            normal: { x: this.normal.x, y: this.normal.y, z: this.normal.z }
        }
    }
}


export class ProjectionManager {
    private equirectangularProjection = new EquirectangularProjection();
    private pcaProjection = new PCAProjection(new PCAManager);
    private verticalPlaneProjection = new VerticalPlaneProjection();
    private horizontalPlaneProjection = new HorizontalPlaneProjection();

    private currentProjectionType: "equirectangular" | "pca" | "vertical" | "horizontal"

    constructor (projectionType: "equirectangular" | "pca" | "vertical" | "horizontal") {
        this.currentProjectionType = projectionType;
    }

    getCurrentProjection() : IProjection {
        if (this.currentProjectionType == "equirectangular") {
            return this.equirectangularProjection;
        } else if (this.currentProjectionType == "pca") {
            return this.pcaProjection;
        } else if (this.currentProjectionType == "vertical") {
            return this.verticalPlaneProjection;
        } else {
            return this.horizontalPlaneProjection;
        }
    }

    setCurrentProjectionType(projectionType: "equirectangular" | "pca" | "vertical" | "horizontal") {
        this.currentProjectionType = projectionType;
    }

    cycleProjection(syncManager: SyncManager2D) {
        if (this.currentProjectionType == "equirectangular") {
            this.currentProjectionType = "pca";
            // update PCA if switching to it
            const pcaProjection = this.getCurrentProjection() as PCAProjection;
            pcaProjection.getPcaManager().update(
                syncManager.getRemotePoints()
                .map(d => new Vector3(d.position.x, d.position.y, d.position.z))
            )
        } else if (this.currentProjectionType == "pca") {
            this.currentProjectionType = "vertical";
        } else if (this.currentProjectionType == "vertical") {
            this.currentProjectionType = "horizontal"
        } else {
            this.currentProjectionType = "equirectangular"
        }

        const planeData = this.getCurrentProjection().getPlaneSyncData();
        if (planeData) {
            syncManager.updatePlaneSyncData(planeData);
        }
    }

    project(v: Vector3): [number, number] {
        return this.getCurrentProjection().project(v);
    }

    inverse(nx: number, ny: number, existing: Vector3): Vector3 {
        return this.getCurrentProjection().inverse(nx, ny, existing);
    }
}
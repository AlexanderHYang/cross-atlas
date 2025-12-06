import { Vector3 } from '@babylonjs/core'
import { getNormal } from './pca'
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
    // default to horizontal plane
    private planarProjection: PlanarProjection = new PlanarProjection(new Vector3(1,0,0), new Vector3(0,0,1), 5);

    project(v: Vector3): [number, number] {
        return this.planarProjection.project(v);
    }

    inverse(nx: number, ny: number, existing: Vector3): Vector3 {
        return this.planarProjection.inverse(nx, ny, existing);
    }

    getPlaneSyncData(): PlaneSyncData | null {
        return this.planarProjection.getPlaneSyncData();
    }

    updatePCA(points: Array<Vector3 | number[]>) {
        const normal = getNormal(points);
        if (normal) {
            // get u vector which is has no Y component (to keep it horizontal)
            let u = Vector3.Cross(normal, new Vector3(0,1,0));
            let v;
            if (u.lengthSquared() === 0) {
                // normal was vertical, use default horizontal plane
                u = new Vector3(1,0,0);
                v = new Vector3(0,0,1);
            } else {
                u.normalize();
                v = Vector3.Cross(normal, u).normalize();
            }
            this.planarProjection = new PlanarProjection(u, v, 5);
        } else {
            console.warn("PCAProjection.updatePCA: could not compute normal from points");
        }
    }
}

// Simple planar projection, assumes the following:
// 1. Center is at origin.
// 2. Scale is not done per-axis, instead a uniform scale factor is used in all directions.
export class PlanarProjection implements IProjection {
    private u: Vector3;
    private v: Vector3;
    private scale: number;

    private readonly origin: Vector3 = new Vector3(0, 0, 0);

    constructor(u: Vector3, v: Vector3, scale: number) {
        this.u = u;
        this.v = v;
        this.scale = scale;
    }

    getNormal(): Vector3 {
        const n = Vector3.Cross(this.u, this.v);
        n.normalize();
        return n;
    }

    project(point: Vector3): [number, number] {
        const relative = point.subtract(this.origin);
        const normal = this.getNormal();
        const distToPlane = Vector3.Dot(relative, normal);
        const projected = relative.subtract(normal.scale(distToPlane));
        const uCoord = Vector3.Dot(projected, this.u) / this.scale;
        const vCoord = Vector3.Dot(projected, this.v) / this.scale;
        return [uCoord, vCoord];
    }

    inverse(nx: number, ny: number, existing: Vector3): Vector3 {
        const uComp = this.u.scale(nx * this.scale);
        const vComp = this.v.scale(ny * this.scale);
        const pointOnPlane = this.origin.add(uComp).add(vComp);
        // Preserve distance from plane
        const existingRelative = existing.subtract(this.origin);
        const normal = this.getNormal();
        const distToPlane = Vector3.Dot(existingRelative, normal);
        const finalPoint = pointOnPlane.add(normal.scale(distToPlane));
        return finalPoint;
    }

    getPlaneSyncData(): PlaneSyncData | null {
        const normal = this.getNormal();
        return {
            mean: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
            normal: { x: normal.x, y: normal.y, z: normal.z }
        }
    }
}


export class ProjectionManager {
    private equirectangularProjection = new EquirectangularProjection();
    private pcaProjection = new PCAProjection();
    private verticalPlaneProjection = new PlanarProjection(new Vector3(1, 0, 0), new Vector3(0, 1, 0), 5);
    private horizontalPlaneProjection = new PlanarProjection(new Vector3(1, 0, 0), new Vector3(0, 0, 1), 5);

    private currentProjectionType: "equirectangular" | "pca" | "vertical" | "horizontal"

    constructor (projectionType: "equirectangular" | "pca" | "vertical" | "horizontal") {
        console.log("Initializing ProjectionManager with type:", projectionType);
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

    getCurrentProjectionType(): "equirectangular" | "pca" | "vertical" | "horizontal" {
        return this.currentProjectionType;
    }

    setCurrentProjectionType(projectionType: "equirectangular" | "pca" | "vertical" | "horizontal") {
        this.currentProjectionType = projectionType;
    }

    cycleProjection(syncManager: SyncManager2D) {
        if (this.currentProjectionType == "equirectangular") {
            this.currentProjectionType = "pca";
            // update PCA if switching to it
            const pcaProjection = this.getCurrentProjection() as PCAProjection;
            pcaProjection.updatePCA(
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
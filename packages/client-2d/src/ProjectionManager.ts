import { Vector3 } from '@babylonjs/core'
import { PCAManager } from './PCAManager'
import { clamp, equirectangularNormalizedXY, inverseEquirectangularNormalizedXY, latLonToVec3, vec3ToLatLon } from '../../shared/src/projection'

export interface IProjection {
    // project 3D -> normalized 2D
    project(v: Vector3, existing: Vector3): [number, number]
    // inverse 2D -> 3D
    inverse(nx: number, ny: number, existing: Vector3): Vector3
}

export class EquirectangularProjection implements IProjection {
    project(v: Vector3, existing: Vector3): [number, number] {
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
}

export class PCAProjection implements IProjection {
    private pcaManager: PCAManager;

    constructor(pcaManager: PCAManager) {
        this.pcaManager = pcaManager;
    }

    getPcaManager(): PCAManager {
        return this.pcaManager;
    }

    project(v: Vector3, existing: Vector3): [number, number] {
        let [ nx, ny ] = this.pcaManager.project(v);
        nx = clamp(nx, -1, 1);
        ny = clamp(ny, -1, 1);
        return [nx, ny];
    }

    inverse(nx: number, ny: number, existing: Vector3): Vector3 {
        return this.pcaManager.inverseWithSignedDistance(nx, ny, existing);
    }
}

export class VerticalPlaneProjection implements IProjection {
    private origin = new Vector3(0, 0, 0);
    private normal = new Vector3(0, 0, 1);
    private u = new Vector3(1, 0, 0);
    private v = new Vector3(0, 1, 0);
    private scaleU = 1;
    private scaleV = 1;

    project(point: Vector3, existing: Vector3): [number, number] {
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
}

export class HorizontalPlaneProjection implements IProjection {
    private origin = new Vector3(0, 0, 0);
    private normal = new Vector3(0, 1, 0);
    private u = new Vector3(1, 0, 0);
    private v = new Vector3(0, 0, 1);
    private scaleU = 1;
    private scaleV = 1;

    project(point: Vector3, existing: Vector3): [number, number] {
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
}


export class ProjectionManager implements IProjection {
    private projections: IProjection[] = [
        new EquirectangularProjection(),
        new PCAProjection(new PCAManager()),
        new VerticalPlaneProjection(),
        new HorizontalPlaneProjection()
    ]
    private currentIndex: number = 0;

    updatePCAData(points: Vector3[]) {
        const pcaProj = this.projections[1] as PCAProjection;
        pcaProj.getPcaManager().update(points);
    }

    cycleProjection() {
        this.currentIndex = (this.currentIndex + 1) % this.projections.length;
    }

    project(v: Vector3, existing: Vector3): [number, number] {
        return this.projections[this.currentIndex].project(v, existing);
    }

    inverse(nx: number, ny: number, existing: Vector3): Vector3 {
        return this.projections[this.currentIndex].inverse(nx, ny, existing);
    }
}
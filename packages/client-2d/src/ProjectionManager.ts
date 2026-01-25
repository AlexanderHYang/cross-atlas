import { Vector3 } from "@babylonjs/core";
import { getNormal } from "./pca";
import { clamp, equirectangularNormalizedXY, vec3ToLatLon } from "../../shared/src/projection";
import { SyncManager2D } from "./SyncManager2D";
import { PlaneSyncData } from "../../shared/src/sync";
import { layoutType } from "../../shared/src/defaultPoints";
import { LANDMARK_POS } from "../../shared/src/angularPointSelection";

const DEFAULT_PLANAR_SCALE = 3.0;

// Target RMS spread for scale normalization (can be tuned for viewport fit)
const TARGET_RMS_SPREAD = 0.63;

export interface IProjection {
    // project 3D -> normalized 2D
    project(v: Vector3): [number, number];
    getPlaneSyncData(): PlaneSyncData | null;
}

export class EquirectangularProjection implements IProjection {
    project(v: Vector3): [number, number] {
        const { lat, lon } = vec3ToLatLon(v);
        const { nx, ny } = equirectangularNormalizedXY(lat, lon);
        return [nx, ny];
    }

    getPlaneSyncData(): PlaneSyncData | null {
        return null;
    }
}

export class PCAProjection implements IProjection {
    // default to horizontal plane
    private planarProjection: PlanarProjection = new PlanarProjection(
        new Vector3(1, 0, 0),
        new Vector3(0, 0, 1),
    );

    project(v: Vector3): [number, number] {
        return this.planarProjection.project(v);
    }

    getPlaneSyncData(): PlaneSyncData | null {
        return this.planarProjection.getPlaneSyncData();
    }

    updatePCA(points: Array<Vector3 | number[]>) {
        const normal = getNormal(points);
        if (normal) {
            // get u vector which has no Y component (to keep it horizontal)
            let u = Vector3.Cross(normal, new Vector3(0, 1, 0));
            let v;
            if (u.lengthSquared() === 0) {
                // normal was vertical, use default horizontal plane
                console.warn(
                    "PCAProjection.updatePCA: normal is vertical, using a horizontal plane",
                );
                u = new Vector3(1, 0, 0);
                v = new Vector3(0, 0, 1);
            } else {
                u.normalize();
                v = Vector3.Cross(normal, u).normalize();
                if (v.y < 0) {
                    v = v.scale(-1);
                }

                // this isnt really working, not sure how to make horizontal not flipped sometimes
                if (u.z > 0) {
                    u = u.scale(-1);
                }
            }
            this.planarProjection = new PlanarProjection(u, v);
        } else {
            console.warn("PCAProjection.updatePCA: could not compute normal from points");
        }
        console.log("PCAProjection.updatePCA: updated planar projection:", this.planarProjection);
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

    constructor(u: Vector3, v: Vector3) {
        this.u = u;
        this.v = v;
        this.scale = DEFAULT_PLANAR_SCALE;
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

    getPlaneSyncData(): PlaneSyncData | null {
        const normal = this.getNormal();
        return {
            mean: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
            normal: { x: normal.x, y: normal.y, z: normal.z },
        };
    }
}

export class ProjectionManager {
    private equirectangularProjection = new EquirectangularProjection();
    private pcaProjection = new PCAProjection();
    private verticalPlaneProjection = new PlanarProjection(
        new Vector3(0, 0, -1),
        new Vector3(0, 1, 0),
    );
    private horizontalPlaneProjection = new PlanarProjection(
        new Vector3(0, 0, -1),
        new Vector3(1, 0, 0),
    );

    private currentProjectionType: "equirectangular" | "pca" | "vertical" | "horizontal";

    // Cached scale factors for each projection type (computed via RMS normalization)
    private scaleFactors: Map<string, number> = new Map();
    // Cached landmark 2D position for each projection type
    private landmarkProjections: Map<string, [number, number]> = new Map();

    constructor(projectionType: "equirectangular" | "pca" | "vertical" | "horizontal") {
        console.log("Initializing ProjectionManager with type:", projectionType);
        this.currentProjectionType = projectionType;
    }

    getCurrentProjection(): IProjection {
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

    setCurrentProjectionType(
        projectionType: "equirectangular" | "pca" | "vertical" | "horizontal",
    ) {
        this.currentProjectionType = projectionType;
    }

    cycleProjection(syncManager: SyncManager2D) {
        if (this.currentProjectionType == "equirectangular") {
            this.currentProjectionType = "pca";
            // update PCA if switching to it
            const pcaProjection = this.getCurrentProjection() as PCAProjection;
            pcaProjection.updatePCA(syncManager.getLocalPoints().map((d) => d.pos3d));
        } else if (this.currentProjectionType == "pca") {
            this.currentProjectionType = "vertical";
        } else if (this.currentProjectionType == "vertical") {
            this.currentProjectionType = "horizontal";
        } else {
            this.currentProjectionType = "equirectangular";
        }

        // Recompute scale factors after changing projection
        this.computeScaleFactors(syncManager.getLocalPoints().map((d) => d.pos3d));

        const planeData = this.getCurrentProjection().getPlaneSyncData();
        if (planeData) {
            syncManager.updatePlaneSyncData(planeData);
        }
    }

    /**
     * Compute scale factors for all projection types using RMS radius normalization.
     * This ensures all projections have the same global scale around the landmark.
     *
     * @param points3d - Array of 3D point positions
     */
    computeScaleFactors(points3d: Vector3[]) {
        const projectionTypes: Array<"equirectangular" | "pca" | "vertical" | "horizontal"> = [
            "equirectangular",
            "pca",
            "vertical",
            "horizontal",
        ];

        // Project landmark position for each projection type
        const landmarkPos3d = LANDMARK_POS.clone();

        for (const projType of projectionTypes) {
            const projection = this.getProjectionByType(projType);
            const landmarkUV = projection.project(landmarkPos3d);
            this.landmarkProjections.set(projType, landmarkUV);

            // Compute RMS distance from landmark for this projection
            let sumSquaredDist = 0;
            let count = 0;

            for (const pos3d of points3d) {
                const [ux, uy] = projection.project(pos3d);
                const dx = ux - landmarkUV[0];
                const dy = uy - landmarkUV[1];
                sumSquaredDist += dx * dx + dy * dy;
                count++;
            }

            const rmsRadius = count > 0 ? Math.sqrt(sumSquaredDist / count) : 1;

            // Compute scale factor to achieve target spread
            // scaleFactor = targetRMS / currentRMS
            const scaleFactor = rmsRadius > 0.0001 ? TARGET_RMS_SPREAD / rmsRadius : 1;
            this.scaleFactors.set(projType, scaleFactor);

            console.log(
                `[ProjectionManager] ${projType}: RMS radius = ${rmsRadius.toFixed(4)}, scale factor = ${scaleFactor.toFixed(4)}`,
            );
        }
    }

    /**
     * Get projection instance by type.
     */
    private getProjectionByType(
        projType: "equirectangular" | "pca" | "vertical" | "horizontal",
    ): IProjection {
        switch (projType) {
            case "equirectangular":
                return this.equirectangularProjection;
            case "pca":
                return this.pcaProjection;
            case "vertical":
                return this.verticalPlaneProjection;
            case "horizontal":
                return this.horizontalPlaneProjection;
        }
    }

    project(v: Vector3): [number, number] {
        const [rawX, rawY] = this.getCurrentProjection().project(v);

        // Apply scale normalization if scale factors have been computed
        const scaleFactor = this.scaleFactors.get(this.currentProjectionType);
        const landmarkUV = this.landmarkProjections.get(this.currentProjectionType);

        let x = rawX;
        let y = rawY;

        if (scaleFactor !== undefined && landmarkUV !== undefined) {
            // Scale relative to landmark: u' = u_L + scaleFactor * (u - u_L)
            const [lx, ly] = landmarkUV;
            x = lx + scaleFactor * (rawX - lx);
            y = ly + scaleFactor * (rawY - ly);
        }

        // special case for planar layout and horizontal projection
        if (layoutType === "planar" && this.currentProjectionType === "horizontal") {
            return [x, 0];
        } else {
            return [x, y];
        }
    }
}

import { Vector3 } from "@babylonjs/core";
import { Chart, ChartSyncData } from "../../shared/src/Chart";
import { randomUUID } from "crypto";
import { SyncManager, Vector3SyncData } from "@shared/src/SyncManager";
import { SyncManager2D } from "./SyncManager2D";
import { equirectangularNormalizedXY, inverseEquirectangularNormalizedXY, latLonToVec3 } from "@shared/src/projection";

export class Chart2D {
    id: string;
    chart: Chart
    onLocalChange: () => void;

    // 2d specific stuff
    nx: number = 0
    ny: number = 0


    constructor(chart: Chart, syncManager: SyncManager2D) {
        this.id = randomUUID();
        this.chart = chart;
        this.onLocalChange = () => {
            syncManager.transactChartUpdate(this);
        };
    }

    public applyRemoteData(remoteData: ChartSyncData) {
        console.log("applying remote data to chart", this.id);

        const x = remoteData.position.x
        const y = remoteData.position.y
        const z = remoteData.position.z
        const lat = Math.asin(Math.max(-1, Math.min(1, y)))
        const lon = Math.atan2(z, x)
        const { nx, ny } = equirectangularNormalizedXY(lat, lon)
        this.nx = nx
        this.ny = ny
    }

    public getLocalData(existing: ChartSyncData): ChartSyncData {
        // equirectangular projection of (nx, ny)
        const { lat, lon } = inverseEquirectangularNormalizedXY(this.nx, this.ny)
        const v = latLonToVec3(lat, lon, 1)

        // use existing vector length (from origin)
        const existingVec = new Vector3(existing.position.x, existing.position.y, existing.position.z)
        v.scaleInPlace(existingVec.length())

        const pos: Vector3SyncData = { x: v.x, y: v.y, z: v.z }
        return { id: this.id, position: pos }
    }
}
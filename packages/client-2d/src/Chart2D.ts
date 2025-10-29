import { Vector3 } from "@babylonjs/core";
import { Chart, ChartSyncData, Vector3SyncData } from "../../shared/src/Chart";
import { SyncManager2D } from "./SyncManager2D";
import { equirectangularNormalizedXY, inverseEquirectangularNormalizedXY, latLonToVec3, vec3ToLatLon } from "../../shared/src/projection";

export class Chart2D {
    id: string;
    // chart: Chart // TODO: remove this until actually used
    onLocalChange: () => void;

    // 2d specific stuff
    nx: number = 0
    ny: number = 0


    constructor(id: string, syncManager: SyncManager2D) { // TODO: "add chart: Chart here" when ready
        this.id = id;
        // this.chart = chart; // TODO: remove this until actually used
        this.onLocalChange = () => {
            syncManager.transactChartUpdate(this);
        };
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
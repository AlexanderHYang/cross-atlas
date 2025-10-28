import { Vector3 } from "@babylonjs/core";
import { Chart, ChartSyncData } from "../../shared/src/Chart";
import { Vector3SyncData } from "@shared/src/SyncManager";
import { SyncManager3D } from "./SyncManager3D";

export class Chart3D {
    id: string;
    chart: Chart
    onLocalChange: () => void;

    constructor(id: string, chart: Chart, syncManager: SyncManager3D) {
        this.id = id
        this.chart = chart;
        this.onLocalChange = () => {
            syncManager.transactChartUpdate(this);
        };

        // listen to chart drag events
        this.chart._positionBehavior.onPositionChangedObservable.add(() => {
            this.onLocalChange();
        });
    }

    public applyRemoteData(remoteData: ChartSyncData) {
        console.log("applying remote data to chart", this.id);
        const pos = new Vector3(remoteData.position.x, remoteData.position.y, remoteData.position.z);
        this.chart.setPosition(pos);
    }

    public getLocalData(existing: ChartSyncData): ChartSyncData {
        const pos = this.chart.getPosition();
        const vectorData: Vector3SyncData = { x: pos.x, y: pos.y, z: pos.z };
        return { id: this.id, position: vectorData };
    }
}
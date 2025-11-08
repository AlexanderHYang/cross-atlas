import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3, SixDofDragBehavior } from "@babylonjs/core";
import { Vector3SyncData, PointSyncData } from "../../shared/src/sync";
import { SyncManager3D } from "./SyncManager3D";

export class Point3D {
    id: string;
    mesh: Mesh;
    onLocalChange: () => void;
    private positionBehavior: SixDofDragBehavior;

    constructor(id: string, scene: Scene, syncManager: SyncManager3D, initialPosition?: Vector3) {
        this.id = id;

        // create a simple sphere to represent the point
        const sphere = MeshBuilder.CreateSphere(`point_${id}`, { diameter: 0.2 }, scene);
        const mat = new StandardMaterial(`pointmat_${id}`, scene);
        mat.diffuseColor = new Color3(1, 0.2, 0.2);
        sphere.material = mat;
        this.mesh = sphere;

        if (initialPosition) {
            this.mesh.position = initialPosition.clone();
        }

        // drag behavior
        this.positionBehavior = new SixDofDragBehavior();
        this.positionBehavior.faceCameraOnDragStart = true;
        this.positionBehavior.rotateAroundYOnly = true;
        this.positionBehavior.dragDeltaRatio = 1.0;
        this.mesh.addBehavior(this.positionBehavior);

        // wire up sync callback
        this.onLocalChange = () => {
            syncManager.transactChartUpdate(this as any);
        };

        // notify when local position changes
        this.positionBehavior.onPositionChangedObservable.add(() => {
            this.onLocalChange();
        });
    }

    public applyRemoteData(remoteData: PointSyncData) {
        const pos = new Vector3(remoteData.position.x, remoteData.position.y, remoteData.position.z);
        this.mesh.position.copyFrom(pos);
    }

    public getLocalData(existing: PointSyncData): PointSyncData {
        const pos = this.mesh.position;
        const vectorData: Vector3SyncData = { x: pos.x, y: pos.y, z: pos.z };
        return { id: this.id, position: vectorData, color: existing.color};
    }
}

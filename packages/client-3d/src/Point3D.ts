import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3, SixDofDragBehavior } from "@babylonjs/core";
import { Vector3SyncData, PointSyncData } from "../../shared/src/sync";
import { SyncManager3D } from "./SyncManager3D";

export type Point3DOptions = {
    color?: Color3;
    draggable?: boolean;
};

export class Point3D {
    id: string;
    mesh: Mesh;
    color: Color3;
    onLocalChange: () => void;
    private positionBehavior?: SixDofDragBehavior;
    private material: StandardMaterial;
    private defaultColor: Color3;
    private flashHandle: number | null = null;

    constructor(
        id: string,
        scene: Scene,
        syncManager: SyncManager3D,
        initialPosition?: Vector3,
        options?: Point3DOptions
    ) {
        this.id = id;
        this.color = options?.color ?? Color3.White();

        // create a simple sphere to represent the point
        const sphere = MeshBuilder.CreateSphere(`point_${id}`, { diameter: 0.2 }, scene);
        const mat = new StandardMaterial(`pointmat_${id}`, scene);
        mat.diffuseColor = this.color;
        sphere.material = mat;
        this.mesh = sphere;
        this.material = mat;
        this.defaultColor = this.color.clone();

        if (initialPosition) {
            this.mesh.position = initialPosition.clone();
        }

        const canDrag = options?.draggable ?? true;
        this.mesh.isPickable = canDrag;
        if (canDrag) {
            this.positionBehavior = new SixDofDragBehavior();
            this.positionBehavior.faceCameraOnDragStart = true;
            this.positionBehavior.rotateAroundYOnly = true;
            this.positionBehavior.dragDeltaRatio = 1.0;
            this.mesh.addBehavior(this.positionBehavior);
        }

        // wire up sync callback
        this.onLocalChange = () => {
            syncManager.transactPointUpdate(this);
        };

        if (this.positionBehavior) {
            // notify when local position changes
            this.positionBehavior.onPositionChangedObservable.add(() => {
                this.onLocalChange();
            });
        }
    }

    public applyRemoteData(remoteData: PointSyncData) {
        const pos = new Vector3(remoteData.position.x, remoteData.position.y, remoteData.position.z);
        this.mesh.position.copyFrom(pos);
        if (remoteData.color) {
            this.material.diffuseColor.set(remoteData.color.x, remoteData.color.y, remoteData.color.z);
            this.defaultColor = this.material.diffuseColor.clone();
        }
    }

    public getLocalData(existing: PointSyncData): PointSyncData {
        const pos = this.mesh.position;
        const vectorData: Vector3SyncData = { x: pos.x, y: pos.y, z: pos.z };
        const color = { x: this.material.diffuseColor.r, y: this.material.diffuseColor.g, z: this.material.diffuseColor.b };
        return { id: this.id, position: vectorData, color: color };
    }

    private applyColor(color: Color3) {
        this.material.diffuseColor = color.clone();
    }

    public setPermanentColor(color: Color3) {
        this.defaultColor = color.clone();
        this.applyColor(this.defaultColor);
    }

    public resetColor() {
        this.applyColor(this.defaultColor);
    }

    public flashColor(color: Color3, durationMs: number) {
        if (this.flashHandle !== null) {
            window.clearTimeout(this.flashHandle);
            this.flashHandle = null;
        }
        this.applyColor(color);
        this.flashHandle = window.setTimeout(() => {
            this.resetColor();
            this.flashHandle = null;
        }, durationMs);
    }
}

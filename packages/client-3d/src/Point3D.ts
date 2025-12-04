import {
    Scene,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    SixDofDragBehavior,
} from "@babylonjs/core";
import { Vector3SyncData, PointSyncData } from "../../shared/src/sync";
import { SyncManager3D } from "./SyncManager3D";

export type Point3DOptions = {
    color?: Color3;
    draggable?: boolean;
    selectable?: boolean;
};

export class Point3D {
    id: string;
    mesh: Mesh;
    color: Color3;
    onLocalChange: () => void;
    private positionBehavior?: SixDofDragBehavior;
    private material: StandardMaterial;
    private defaultColor: Color3;
    private baseColor: Color3;
    private flashHandle: number | null = null;
    private localOverrideColor: Color3 | null = null;
    private selectable: boolean;

    constructor(
        id: string,
        scene: Scene,
        syncManager: SyncManager3D,
        initialPosition?: Vector3,
        options?: Point3DOptions
    ) {
        this.id = id;
        this.color = options?.color ?? Color3.White();
        this.selectable = options?.selectable ?? true;

        // create a simple primitive to represent the point (landmark is a cube)
        const primitive =
            id === "point3"
                ? MeshBuilder.CreateBox(`point_${id}`, { size: 0.2 }, scene)
                : MeshBuilder.CreateSphere(`point_${id}`, { diameter: 0.2 }, scene);
        const mat = new StandardMaterial(`pointmat_${id}`, scene);
        mat.diffuseColor = this.color;
        primitive.material = mat;
        this.mesh = primitive;
        this.material = mat;
        this.baseColor = this.color.clone();
        this.defaultColor = this.color.clone();

        if (initialPosition) {
            this.mesh.position = initialPosition.clone();
        }

        const canDrag = options?.draggable ?? true;
        this.mesh.isPickable = this.selectable;
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
        const pos = new Vector3(
            remoteData.position.x,
            remoteData.position.y,
            remoteData.position.z
        );
        this.mesh.position.copyFrom(pos);
        // Skip applying remote color if we're currently flashing or showing a local override
        if (remoteData.color && this.flashHandle === null && !this.localOverrideColor) {
            this.material.diffuseColor.set(
                remoteData.color.x,
                remoteData.color.y,
                remoteData.color.z
            );
        }
    }

    public getLocalData(existing?: PointSyncData): PointSyncData {
        const pos = this.mesh.position;
        const vectorData: Vector3SyncData = { x: pos.x, y: pos.y, z: pos.z };
        const color = {
            x: this.material.diffuseColor.r,
            y: this.material.diffuseColor.g,
            z: this.material.diffuseColor.b,
        };
        return { id: this.id, position: vectorData, color: color };
    }

    private applyColor(color: Color3) {
        this.material.diffuseColor = color.clone();
    }

    public setLocalOverrideColor(color: Color3) {
        if (!this.localOverrideColor) {
            this.localOverrideColor = this.material.diffuseColor.clone();
        }
        this.material.diffuseColor = color.clone();
    }

    public setPermanentColor(color: Color3) {
        this.baseColor = color.clone();
        this.defaultColor = color.clone();
        this.applyColor(this.defaultColor);
        this.onLocalChange();
    }

    public setDisplayColor(color: Color3) {
        this.applyColor(color);
        this.onLocalChange();
    }

    public setSelectable(selectable: boolean) {
        this.selectable = selectable;
        this.mesh.isPickable = selectable;
    }

    public isSelectable(): boolean {
        return this.selectable;
    }

    public resetToBaseColor() {
        this.defaultColor = this.baseColor.clone();
        this.applyColor(this.defaultColor);
        this.onLocalChange();
        this.localOverrideColor = null;
        this.setSelectable(true);
    }

    public clearLocalOverrideColor() {
        if (this.localOverrideColor) {
            this.material.diffuseColor = this.localOverrideColor.clone();
            this.localOverrideColor = null;
        }
    }

    public getDefaultColor(): Color3 {
        return this.defaultColor.clone();
    }

    public resetColor() {
        this.applyColor(this.defaultColor);
    }

    public flashColorSynced(color: Color3, durationMs: number) {
        const wasSelectable = this.selectable;
        this.setSelectable(false);
        if (this.flashHandle !== null) {
            window.clearTimeout(this.flashHandle);
            this.flashHandle = null;
        }
        this.applyColor(color);
        this.onLocalChange();
        this.flashHandle = window.setTimeout(() => {
            this.resetToBaseColor();
            this.setSelectable(wasSelectable);
            this.onLocalChange();
            this.flashHandle = null;
        }, durationMs);
    }
}

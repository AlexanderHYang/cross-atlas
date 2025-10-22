import * as BABYLON from "@babylonjs/core";
import { IPoint } from "../../shared/src/IPoint";
import { MetadataSyncData, PointSyncData } from "../../shared/src/SyncManager";

export class Point3D implements IPoint {
    id: string
    mesh: BABYLON.Mesh
    onLocalChange?: () => void
    ignoreRemote = false
    static nextId = 1

    constructor(scene: BABYLON.Scene) {
        this.id = `point${Point3D.nextId++}`
        this.mesh = BABYLON.MeshBuilder.CreateSphere(this.id, { diameter: 0.3 }, undefined)
        const mat = new BABYLON.StandardMaterial(`${this.id}-mat`, undefined)
        mat.diffuseColor = BABYLON.Color3.Random();
        this.mesh.material = mat
        
        const dragBehavior = new BABYLON.SixDofDragBehavior()
        dragBehavior.onPositionChangedObservable.add((eventData) => {
            this.onLocalChange?.()
        })
        this.mesh.addBehavior(dragBehavior)
    }

    getLocalData(existing: PointSyncData, metadata: MetadataSyncData): PointSyncData {
        const pos = this.mesh.position
        return {
            id: this.id,
            position: { x: pos.x, y: pos.y, z: pos.z },
        }
    }

    applyRemoteData(data: PointSyncData) {
        const pos = new BABYLON.Vector3(data.position.x, data.position.y, data.position.z)
        this.mesh.position = pos
    }
}
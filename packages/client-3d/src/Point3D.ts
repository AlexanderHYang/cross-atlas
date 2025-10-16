import * as BABYLON from "@babylonjs/core";
import { IPoint } from "../../shared/src/IPoint";
import { PointSyncData, SyncManager, Vector3SyncData } from "../../shared/src/SyncManager";

const BIG_RADIUS = 1.5; // TODO: get from env

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
            this.mesh.position.scaleInPlace(BIG_RADIUS / this.mesh.position.length())
            this.onLocalChange?.()
        })
        this.mesh.addBehavior(dragBehavior)
    }

    getLocalData(): PointSyncData {
        const pos = this.mesh.position.normalize()
        return {
            id: this.id,
            position: { x: pos.x, y: pos.y, z: pos.z },
        }
    }

    applyRemoteData(data: PointSyncData) {
        const pos = new BABYLON.Vector3(BIG_RADIUS * data.position.x, BIG_RADIUS * data.position.y, BIG_RADIUS * data.position.z)
        this.mesh.position = pos
    }
}
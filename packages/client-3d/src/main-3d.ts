import { sceneManager } from "./SceneManager";
import { SyncManager3D } from "./SyncManager3D";
import { Point3D } from "./Point3D";
import { Vector3, Color3, PointerEventTypes } from "@babylonjs/core";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import { initWebXR } from "./xr/webxrExperience";
import { DEFAULT_POINT_CONFIGS, DEFAULT_SPHERE_RADIUS } from "../../shared/src/defaultPoints";
import { TaskColorConfig3D } from "../../shared/src/tasks";
import { Logger3D } from "./Logger3d";
import { TaskController3D } from "./tasks/taskController3D";

// initialize scene
const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
sceneManager.init(canvas);
const scene = sceneManager.getScene();

const xrExperience = await initWebXR(scene);

const env = sceneManager.createEnvironment({ bigRadius: DEFAULT_SPHERE_RADIUS });
const { bigRadius, plane } = env;

const liftOffset = 0.5;
const sphereCenter = new Vector3(0, liftOffset, 0);

// create SyncManager
const pointsByMeshId = new Map<string, Point3D>();
const pointsById = new Map<string, Point3D>();
const syncManager3D = await SyncManager3D.create(plane);

// create Logger3D
const logger3D = new Logger3D(syncManager3D, xrExperience!);

// create simple 3D points and add them to sync manager
for (const cfg of DEFAULT_POINT_CONFIGS) {
    const direction = new Vector3(cfg.direction.x, cfg.direction.y, cfg.direction.z);
    if (direction.lengthSquared() === 0) {
        continue;
    }
    const initialPosition = direction.normalize().scale(bigRadius).add(sphereCenter);
    const color = cfg.color ? new Color3(cfg.color.x, cfg.color.y, cfg.color.z) : undefined;
    const point = new Point3D(cfg.id, scene, syncManager3D, initialPosition, {
        color,
        draggable: cfg.draggable,
        selectable: cfg.selectable,
    });
    syncManager3D.registerPoint(point);
    pointsByMeshId.set(point.mesh.id, point);
    pointsById.set(point.id, point);
}

const successColor = Color3.FromHexString("#2ecc71");
const errorColor = Color3.FromHexString("#c0392b");
const colorConfig3D: TaskColorConfig3D = {
    success: successColor,
    error: errorColor,
};

const taskController3D = new TaskController3D({
    syncManager: syncManager3D,
    pointsById,
    colorConfig: colorConfig3D,
    successColor,
    errorColor,
});

scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type !== PointerEventTypes.POINTERPICK) {
        return;
    }
    const pickInfo = pointerInfo.pickInfo;
    if (!pickInfo?.hit || !pickInfo.pickedMesh) {
        return;
    }
    const point = pointsByMeshId.get(pickInfo.pickedMesh.id);
    if (!point) {
        console.log("Clicked mesh but no point found:", pickInfo.pickedMesh.id);
        return;
    }
    console.debug("3D Point clicked:", point.id);
    if (!point.isSelectable()) {
        return;
    }
    taskController3D.handlePointSelection(point);
});

setupXRTaskInteractions(xrExperience);
syncManager3D.onTaskStateChange(taskController3D.handleTaskStateChange);

function setupXRTaskInteractions(xr: WebXRDefaultExperience | null) {
    const pointerSelection = xr?.pointerSelection;
    // @ts-ignore
    const selectionObservable = pointerSelection?.onSelectionObservable;
    if (!selectionObservable) {
        console.warn("XR pointer selection not available; task interactions disabled");
        return;
    }

    // @ts-ignore
    selectionObservable.add((event) => {
        const pickInfo = (event as any)?.pickInfo ?? (event as any)?.pointerInfo?.pickInfo;
        if (!pickInfo?.hit || !pickInfo.pickedMesh) {
            return;
        }
        const point = pointsByMeshId.get(pickInfo.pickedMesh.id);
        if (!point) {
            return;
        }
        taskController3D.handlePointSelection(point);
    });
}

sceneManager.getEngine().runRenderLoop(() => {
    // render the scene
    scene.render();
});
window.addEventListener("resize", () => sceneManager.getEngine().resize());

// toggle projection plane with 'p'
window.addEventListener("keydown", (ev) => {
    if (ev.key === "p" || ev.key === "P") {
        console.log("Toggling projection plane visibility");
        plane.isVisible = !plane.isVisible;
    }
});

import { sceneManager } from "./SceneManager";
import { SyncManager3D } from "./SyncManager3D";
import { Point3D } from "./Point3D";
import { Vector3, Color3, PointerEventTypes } from "@babylonjs/core";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import { initWebXR } from "./xr/webxrExperience";
import { DEFAULT_POINT_CONFIGS, DEFAULT_SPHERE_RADIUS } from "../../shared/src/defaultPoints";

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
let trialTransitionHandle: number | null = null;
let lastTrial: number | null = null;

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
    console.log("3D Point clicked:", point.id);
    handlePointSelection(point);
});

setupXRTaskInteractions(xrExperience);
syncManager3D.onTaskStateChange((task) => {
    handleTaskStateChange(task);
});

function handlePointSelection(point: Point3D) {
    const task = syncManager3D.getCurrentTask();
    if (!task || task.completed) {
        return;
    }

    const trial = task.trial ?? 1;

    // Task 1 logic: Trials 1 or 3 - 3D user matches the 2D-highlighted point.
    if (trial === 1 || trial === 3) {
        if (!task.targetPointId) return;
        if (point.id === task.targetPointId) {
            point.setDisplayColor(successColor);
            syncManager3D.markGuessTrialSuccess(task.id);
            scheduleNextTrialFrom3D(trial, task.id);
        } else {
            point.flashColorSynced(errorColor, 1000);
        }
        return;
    }

    // Trials 2 or 4 are driven by 2D clicks; ignore 3D selections in Task 1.
    if (trial === 2 || trial === 4) {
        return;
    }

    // Task 2 logic: Trials 5/6 - collaborative trial
    if (trial === 5 || trial === 6) {
        console.log("Task 2 click detected. Point:", point.id, "Target:", task.targetPointId3D);
        if (!task.targetPointId3D) {
            console.warn("Task 2: No targetPointId3D set!");
            return;
        }
        // Ignore clicks on the other player's target (shown in green locally)
        if (point.id === task.targetPointId) {
            return;
        }
        const isCorrect = point.id === task.targetPointId3D;
        console.log("Task 2: Is correct?", isCorrect);
        if (isCorrect) {
            point.setDisplayColor(successColor);
        } else {
            point.flashColorSynced(errorColor, 1000);
        }
        syncManager3D.handleTask2Click3D(isCorrect, task.id);
    }
}

function setupXRTaskInteractions(xr: WebXRDefaultExperience | null) {
    const pointerSelection = xr?.pointerSelection;
    const selectionObservable = pointerSelection?.onSelectionObservable;
    if (!selectionObservable) {
        console.warn("XR pointer selection not available; task interactions disabled");
        return;
    }

    selectionObservable.add((event) => {
        const pickInfo = (event as any)?.pickInfo ?? (event as any)?.pointerInfo?.pickInfo;
        if (!pickInfo?.hit || !pickInfo.pickedMesh) {
            return;
        }
        const point = pointsByMeshId.get(pickInfo.pickedMesh.id);
        if (!point) {
            return;
        }
        handlePointSelection(point);
    });
}

function handleTaskStateChange(task: ReturnType<typeof syncManager3D.getCurrentTask>) {
    const trial = task?.trial ?? 1;
    console.log("3D Task state changed:", {
        trial,
        targetPointId: task?.targetPointId,
        targetPointId3D: task?.targetPointId3D,
        clicked2D: task?.clicked2D,
        clicked3D: task?.clicked3D,
    });

    clearLocalHints();

    if (lastTrial !== trial && task?.feedback === "none") {
        resetAllPointColors();
    }
    lastTrial = trial;

    if (trial === 2 || trial === 4) {
        applyTrial2Visuals(task);
    } else if (trial === 5 || trial === 6) {
        applyTask2Visuals(task);
    }
}

function clearLocalHints() {
    for (const p of pointsById.values()) {
        p.clearLocalOverrideColor();
    }
}

function applyTask2Visuals(task: ReturnType<typeof syncManager3D.getCurrentTask>) {
    if (!task || (task.trial !== 5 && task.trial !== 6)) {
        return;
    }

    // Show the other player's target (2D target) locally in green without syncing
    if (task.targetPointId) {
        const partnerTarget = pointsById.get(task.targetPointId);
        partnerTarget?.setLocalOverrideColor(successColor);
    }

    // Keep showing synced success on the 3D user's own target after a correct click
    if (task.clicked3D && task.targetPointId3D) {
        const targetPoint = pointsById.get(task.targetPointId3D);
        if (!targetPoint) {
            console.warn("Task 2: Target point not found:", task.targetPointId3D);
            return;
        }
        targetPoint.setDisplayColor(successColor);
        console.log("Task 2: Showing green sphere after correct click:", task.targetPointId3D);
    }
}

function applyTrial2Visuals(task: ReturnType<typeof syncManager3D.getCurrentTask>) {
    const trial = task?.trial ?? 1;
    if (!task || (trial !== 2 && trial !== 4) || !task.targetPointId) {
        return;
    }

    if (task.feedback === "none") {
        resetAllPointColors();
    }

    const targetPoint = pointsById.get(task.targetPointId);
    if (!targetPoint) {
        return;
    }

    if (task.feedback === "none" || task.feedback === "success") {
        targetPoint.setDisplayColor(successColor);
    }
}

function resetAllPointColors() {
    for (const p of pointsById.values()) {
        p.resetToBaseColor();
    }
}

function scheduleNextTrialFrom3D(currentTrial: number, taskId: string) {
    if (trialTransitionHandle !== null) {
        window.clearTimeout(trialTransitionHandle);
    }
    trialTransitionHandle = window.setTimeout(() => {
        trialTransitionHandle = null;
        if (currentTrial === 1) {
            syncManager3D.setTrial(2, taskId);
        } else if (currentTrial === 3) {
            syncManager3D.setTrial(4, taskId);
        }
    }, 2000);
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

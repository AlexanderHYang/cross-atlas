import { sceneManager } from "./SceneManager";
import { SyncManager3D } from "./SyncManager3D";
import { Point3D } from "./Point3D";
import { Vector3, Color3, PointerEventTypes } from "@babylonjs/core";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import { initWebXR } from "./xr/webxrExperience";
import {
    DEFAULT_POINT_CONFIGS,
    DEFAULT_SPHERE_RADIUS,
    getDefaultPointConfig,
} from "../../shared/src/defaultPoints";
import {
    TaskColorConfig3D,
    applyTaskVisuals3D,
    evaluateSelection3D,
    processTrial7ErrorFlash3D,
} from "../../shared/src/tasks";
import { Logger3D } from "./Logger3d";

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
let trialTransitionHandle: number | null = null;
let lastTrial: number | null = null;
let lastColorPairIndex: number | null = null;
let lastProcessedErrorPointId2D: string | null = null;
let flashingPointId3D: string | null = null;
const colorConfig3D: TaskColorConfig3D = {
    success: successColor,
    error: errorColor,
};

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

    const selection = evaluateSelection3D(task, point.id, colorConfig3D);
    if (!selection.handled) {
        return;
    }

    if (selection.isCorrect) {
        const color = selection.successColor ?? successColor;
        point.setDisplayColor(color);
        if (selection.lockOnSuccess) {
            point.setSelectable(false);
        }
    } else {
        const flashColor = selection.errorColor ?? errorColor;
        const duration = selection.flashDurationMs ?? 800;
        if (selection.stateUpdate === "task3") {
            flashingPointId3D = point.id;
        }
        point.flashColorSynced(flashColor, duration);
        if (selection.stateUpdate === "task3") {
            setTimeout(() => {
                if (flashingPointId3D === point.id) {
                    flashingPointId3D = null;
                }
            }, duration + 50);
        }
    }

    switch (selection.stateUpdate) {
        case "task1":
            if (selection.isCorrect) {
                syncManager3D.markGuessTrialSuccess(task.id);
                if (selection.advanceTrial) {
                    scheduleNextTrialFrom3D(task.trial, task.id);
                }
            }
            break;
        case "task2":
            syncManager3D.handleTask2Click3D(!!selection.isCorrect, task.id);
            break;
        case "task3":
            syncManager3D.handleTrial7Click3D(!!selection.isCorrect, point.id, task.id);
            break;
    }
}

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
        handlePointSelection(point);
    });
}

function handleTaskStateChange(task: ReturnType<typeof syncManager3D.getCurrentTask>) {
    const trial = task?.trial ?? 1;
    console.debug("3D Task state changed:", {
        trial,
        targetPointId2D: task?.targetPointId2D,
        targetPointId3D: task?.targetPointId3D,
        clicked2D: task?.clicked2D,
        clicked3D: task?.clicked3D,
    });

    if (trial !== 7) {
        clearLocalHints();
        flashingPointId3D = null;
    }

    const colorPairIndex = task?.colorPairIndex ?? null;
    const isNewPair =
        trial === 7 && colorPairIndex !== null && colorPairIndex !== lastColorPairIndex;

    if (
        trial !== 7 &&
        (lastTrial !== trial || isNewPair) &&
        task?.feedback === "none" &&
        !task?.clicked2D &&
        !task?.clicked3D
    ) {
        resetAllPointColors();
    }

    // When entering Trial 7, clear any lingering Task 2 highlights
    if (trial === 7 && lastTrial !== 7) {
        resetAllPointColors();
        clearLocalHints();
    }

    lastTrial = trial;
    lastColorPairIndex = colorPairIndex;

    applyTaskVisuals3D(task, pointsById, colorConfig3D, {
        flashingPointId: flashingPointId3D,
        resetAllPointColors,
    });

    if (trial === 7) {
        lastProcessedErrorPointId2D = processTrial7ErrorFlash3D(
            task,
            pointsById,
            errorColor,
            lastProcessedErrorPointId2D
        );
    } else {
        lastProcessedErrorPointId2D = null;
    }
}

function clearLocalHints() {
    for (const p of pointsById.values()) {
        p.clearLocalOverrideColor();
    }
}

function resetAllPointColors() {
    for (const p of pointsById.values()) {
        const cfg = getDefaultPointConfig(p.id);
        if (cfg?.selectable === false) {
            if (cfg.color) {
                const base = new Color3(cfg.color.x, cfg.color.y, cfg.color.z);
                p.setPermanentColor(base);
            }
            p.setSelectable(false);
            continue;
        }
        p.resetToBaseColor();
        p.setSelectable(true);
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

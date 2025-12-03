import { sceneManager } from "./SceneManager";
import { SyncManager3D } from "./SyncManager3D";
import { Point3D } from "./Point3D";
import { Vector3, Color3, PointerEventTypes } from "@babylonjs/core";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import { initWebXR } from "./xr/webxrExperience";
import { DEFAULT_POINT_CONFIGS, DEFAULT_SPHERE_RADIUS } from "../../shared/src/defaultPoints";
import { getColorPairByKey } from "../../shared/src/trial7ColorPairs";

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
let lastColorPairIndex: number | null = null;
let lastProcessedErrorPointId2D: string | null = null;

function hexToColor3(hex: string) {
    return Color3.FromHexString(hex);
}

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

    const trial = task.trial ?? 1;

    // Task 1 logic: Trials 1 or 3 - 3D user matches the 2D-highlighted point.
    if (trial === 1 || trial === 3) {
        if (!task.targetPointId2D) return;
        if (point.id === task.targetPointId2D) {
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

    // Trial 7: color-paired collaborative round
    if (trial === 7) {
        if (!task.targetPointId3D) {
            console.warn("Trial 7: No targetPointId3D set!");
            return;
        }
        if (point.id === task.targetPointId2D) {
            // Ignore clicks on 2D player's target
            return;
        }
        const pair = getColorPairByKey(
            task.trial7Assignments?.[task.colorPairIndex ?? 0]?.key ?? task.colorPairKey
        );
        const ownColor = pair ? hexToColor3(pair.hex3D) : successColor;
        const isCorrect = point.id === task.targetPointId3D;
        if (isCorrect) {
            point.setDisplayColor(ownColor);
            point.setSelectable(false);
        } else {
            point.setLocalOverrideColor(errorColor);
            setTimeout(() => point.clearLocalOverrideColor(), 800);
        }
        syncManager3D.handleTrial7Click3D(isCorrect, point.id, task.id);
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
        if (point.id === task.targetPointId2D) {
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
        targetPointId2D: task?.targetPointId2D,
        targetPointId3D: task?.targetPointId3D,
        clicked2D: task?.clicked2D,
        clicked3D: task?.clicked3D,
    });

    if (trial !== 7) {
        clearLocalHints();
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
    lastTrial = trial;
    lastColorPairIndex = colorPairIndex;

    if (trial === 2 || trial === 4) {
        applyTrial2Visuals(task);
    } else if (trial === 5 || trial === 6) {
        applyTask2Visuals(task);
    } else if (trial === 7) {
        applyTrial7Visuals(task);
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
    if (task.targetPointId2D) {
        const partnerTarget = pointsById.get(task.targetPointId2D);
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

function applyTrial7Visuals(task: ReturnType<typeof syncManager3D.getCurrentTask>) {
    if (!task || task.trial !== 7) {
        return;
    }

    // Show the 2D player's targets locally so VR knows what PC should click
    if (task.trial7Assignments) {
        for (const entry of task.trial7Assignments) {
            const partnerPoint = pointsById.get(entry.point2D);
            if (partnerPoint) {
                partnerPoint.setSelectable(false);
            }

            const pair = getColorPairByKey(entry.key);
            if (partnerPoint && pair) {
                const partnerColor = hexToColor3(pair.hex2D);
                partnerPoint.setLocalOverrideColor(partnerColor);
            }
        }
    }

    applyCompletedTrial7Pairs(task);

    // Sync error flash from 2D side to 3D side
    if (task.errorPointId2D && task.errorPointId2D !== lastProcessedErrorPointId2D) {
        lastProcessedErrorPointId2D = task.errorPointId2D;
        const errorPoint = pointsById.get(task.errorPointId2D);
        if (errorPoint) {
            errorPoint.flashColorSynced(errorColor, 800);
        }
    } else if (!task.errorPointId2D) {
        lastProcessedErrorPointId2D = null;
    }
}

function applyTrial2Visuals(task: ReturnType<typeof syncManager3D.getCurrentTask>) {
    const trial = task?.trial ?? 1;
    if (!task || (trial !== 2 && trial !== 4) || !task.targetPointId2D) {
        return;
    }

    if (task.feedback === "none") {
        resetAllPointColors();
    }

    const targetPoint = pointsById.get(task.targetPointId2D);
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
        p.setSelectable(true);
    }
}

function applyCompletedTrial7Pairs(task: ReturnType<typeof syncManager3D.getCurrentTask>) {
    if (!task || task.trial !== 7 || !task.trial7Assignments) return;

    for (const entry of task.trial7Assignments) {
        const fullySolved = entry.done2D && entry.done3D;
        if (!fullySolved) continue;
        const point = pointsById.get(entry.point3D);
        const pair = getColorPairByKey(entry.key);
        if (point && pair) {
            point.clearLocalOverrideColor();
            const color = hexToColor3(pair.hex3D);
            point.setPermanentColor(color);
            point.setSelectable(false);
        }
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

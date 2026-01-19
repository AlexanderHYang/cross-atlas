import { sceneManager } from "./SceneManager";
import { SyncManager3D } from "./SyncManager3D";
import { Point3D } from "./Point3D";
import { Vector3, Color3, HighlightLayer, PointerEventTypes } from "@babylonjs/core";
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
const highlighter = new HighlightLayer("highlighter", scene);
highlighter.innerGlow = true;
highlighter.outerGlow = true;
highlighter.blurHorizontalSize = 1.5;
highlighter.blurVerticalSize = 1.5;

const liftOffset = 0.5;
const env = sceneManager.createEnvironment({ bigRadius: DEFAULT_SPHERE_RADIUS });
const { bigRadius, plane } = env;

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

const landmarkPoint = pointsById.get("landmark");
const landmarkTarget = landmarkPoint?.mesh?.position;
const STUDY_START_CLICKS = 1;
const STUDY_SUCCESS_GLOW_MS = 1000;
const CALIBRATION_CLICKS = 1;
const CALIBRATION_ANGLE_DEG = 10;
const CALIBRATION_FEEDBACK_MS = 1000;
let studyStarted = syncManager3D.isStudyStarted();
let studyActivated = false;
let landmarkClickStreak = 0;
let calibrationPending = syncManager3D.isCalibrationPending();
let calibrationActive = false;
let calibrationClickStreak = 0;
const landmarkSelectableAfterStart = landmarkPoint?.isSelectable() ?? true;

if (landmarkPoint) {
    landmarkPoint.setSelectable(true);
    if (!studyStarted) {
        highlighter.addMesh(landmarkPoint.mesh, Color3.White());
    } else {
        landmarkPoint.setSelectable(landmarkSelectableAfterStart);
    }
}

// initialize XR now that we know the landmark target
const xrExperience = await initWebXR(scene, liftOffset, landmarkTarget);

// create Logger3D
const logger3D = new Logger3D(syncManager3D, xrExperience!);

const successColor = Color3.FromHexString("#2ecc71");
const errorColor = Color3.FromHexString("#c0392b");
const colorConfig3D: TaskColorConfig3D = {
    success: successColor,
    error: errorColor,
};

const taskController3D = new TaskController3D({
    syncManager: syncManager3D,
    logger: logger3D,
    pointsById,
    colorConfig: colorConfig3D,
    successColor,
    errorColor,
});

function activateStudy() {
    if (studyActivated) {
        return;
    }
    studyActivated = true;
    logger3D.setLoggingEnabled(true);
    syncManager3D.onTaskStateChange(taskController3D.handleTaskStateChange);
}

function beginCalibration() {
    if (!landmarkPoint) {
        return;
    }
    calibrationActive = true;
    calibrationClickStreak = 0;
    taskController3D.setCalibrationActive(true);
    landmarkPoint.setSelectable(true);
    highlighter.removeMesh(landmarkPoint.mesh);
    highlighter.addMesh(landmarkPoint.mesh, Color3.White());
}

function endCalibrationSuccess() {
    if (!landmarkPoint) {
        return;
    }
    calibrationActive = false;
    calibrationClickStreak = 0;
    highlighter.removeMesh(landmarkPoint.mesh);
    highlighter.addMesh(landmarkPoint.mesh, Color3.Green());
    window.setTimeout(() => {
        highlighter.removeMesh(landmarkPoint.mesh);
        landmarkPoint.setSelectable(landmarkSelectableAfterStart);
    }, CALIBRATION_FEEDBACK_MS);
    syncManager3D.completeCalibration();
}

function showCalibrationError() {
    if (!landmarkPoint) {
        return;
    }
    calibrationClickStreak = 0;
    highlighter.removeMesh(landmarkPoint.mesh);
    highlighter.addMesh(landmarkPoint.mesh, Color3.Red());
    window.setTimeout(() => {
        highlighter.removeMesh(landmarkPoint.mesh);
        highlighter.addMesh(landmarkPoint.mesh, Color3.White());
    }, CALIBRATION_FEEDBACK_MS);
}

function isLookingAtLandmark(): boolean {
    if (!landmarkPoint) {
        return false;
    }
    const camera = xrExperience?.baseExperience.camera;
    if (!camera) {
        return false;
    }
    const forward = camera.getForwardRay().direction.normalize();
    const toLandmark = landmarkPoint.mesh.position.subtract(camera.position).normalize();
    const dot = Math.min(1, Math.max(-1, Vector3.Dot(forward, toLandmark)));
    const angleDeg = Math.acos(dot) * (180 / Math.PI);
    return angleDeg <= CALIBRATION_ANGLE_DEG;
}

function startStudy() {
    if (studyStarted) {
        return;
    }
    studyStarted = true;
    landmarkClickStreak = 0;
    if (landmarkPoint) {
        highlighter.removeMesh(landmarkPoint.mesh);
        highlighter.addMesh(landmarkPoint.mesh, Color3.Green());
        window.setTimeout(() => {
            highlighter.removeMesh(landmarkPoint.mesh);
        }, STUDY_SUCCESS_GLOW_MS);
        landmarkPoint.setSelectable(landmarkSelectableAfterStart);
    }
    syncManager3D.setCalibrationPending(false);
    syncManager3D.setStudyStarted(true);
    activateStudy();
}

function handlePointSelection(point: Point3D) {
    if (!studyStarted) {
        if (point.id === "landmark") {
            landmarkClickStreak += 1;
            if (landmarkClickStreak >= STUDY_START_CLICKS) {
                startStudy();
            }
        } else {
            landmarkClickStreak = 0;
        }
        return;
    }
    if (calibrationActive) {
        if (point.id !== "landmark") {
            calibrationClickStreak = 0;
            return;
        }
        if (!isLookingAtLandmark()) {
            showCalibrationError();
            return;
        }
        calibrationClickStreak += 1;
        if (calibrationClickStreak >= CALIBRATION_CLICKS) {
            endCalibrationSuccess();
        }
        return;
    }
    if (!point.isSelectable()) {
        return;
    }
    taskController3D.handlePointSelection(point);
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
    handlePointSelection(point);
});

setupXRTaskInteractions(xrExperience);

if (studyStarted) {
    activateStudy();
}

syncManager3D.onCalibrationPendingChange((pending) => {
    calibrationPending = pending;
    if (!studyStarted) {
        return;
    }
    if (calibrationPending) {
        beginCalibration();
    } else {
        calibrationActive = false;
        calibrationClickStreak = 0;
        taskController3D.setCalibrationActive(false);
        if (landmarkPoint) {
            landmarkPoint.setSelectable(landmarkSelectableAfterStart);
        }
    }
});

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

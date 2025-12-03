import { Vector3 } from "@babylonjs/core";
import { Point2D } from "./Point2D";
import { SyncManager2D } from "./SyncManager2D";
import { equirectangularNormalizedXY, vec3ToLatLon } from "../../shared/src/projection";
import { DEFAULT_POINT_CONFIGS, DEFAULT_SPHERE_RADIUS } from "../../shared/src/defaultPoints";
import { getTaskAndTrial } from "../../shared/src/task";
import { TRIAL7_COLOR_PAIRS, getColorPairByKey } from "../../shared/src/trial7ColorPairs";

const DASHBOARD_BG = "#828485ff";

// Create a single canvas UI for all points (centered, not full screen)
const canvas = document.createElement("canvas");
canvas.id = "points-canvas";
canvas.style.position = "absolute";
canvas.style.left = "50%";
canvas.style.top = "50%";
canvas.style.transform = "translate(-50%, -50%)";
canvas.style.display = "block";
canvas.style.background = DASHBOARD_BG;
canvas.style.touchAction = "none";
canvas.style.border = "4px solid #333"; // visible border
canvas.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
document.body.style.margin = "0";
document.body.style.background = DASHBOARD_BG;
document.body.appendChild(canvas);

const style = document.createElement("style");
style.textContent = `
html, body { height:100%; background: ${DASHBOARD_BG}; }
#points-canvas { display:block; }
#trial-box {
	position: absolute;
	top: 16px;
	left: 16px;
	padding: 8px 12px;
	background: rgba(0,0,0,0.35);
	color: #fff;
	font-family: sans-serif;
	border: 1px solid #444;
	border-radius: 6px;
	box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
#instruction-box {
	position: absolute;
	top: 16px;
	left: 180px;
	padding: 8px 12px;
	background: rgba(0,0,0,0.35);
	color: #fff;
	font-family: sans-serif;
	border: 1px solid #444;
	border-radius: 6px;
	box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
`;
document.head.appendChild(style);

const ctx = canvas.getContext("2d")!;
const SUCCESS_COLOR_VEC = new Vector3(0x2e / 255, 0xcc / 255, 0x71 / 255);
const ERROR_COLOR_VEC = new Vector3(0xc0 / 255, 0x39 / 255, 0x2b / 255);
let lastTrial: number | null = null;
let lastProcessedErrorPointId3D: string | null = null;

function hexToVector3(hex: string) {
    const trimmed = hex.replace("#", "");
    const bigint = Number.parseInt(trimmed, 16);
    return new Vector3(
        ((bigint >> 16) & 255) / 255,
        ((bigint >> 8) & 255) / 255,
        (bigint & 255) / 255
    );
}

const trialBox = document.createElement("div");
trialBox.id = "trial-box";
trialBox.textContent = "Trial 1";
document.body.appendChild(trialBox);

const instructionBox = document.createElement("div");
instructionBox.id = "instruction-box";
instructionBox.textContent = "Waiting for trial 7";
document.body.appendChild(instructionBox);

// define projection mode
let projectionMode: "equirectangular" | "pca" = "equirectangular";
export function getProjectionMode() {
    return projectionMode;
}
export function setProjectionMode(mode: "equirectangular" | "pca") {
    projectionMode = mode;
}

// create SyncManager
const syncManager: SyncManager2D = await SyncManager2D.create();

// If no points exist, create defaults that match the 3D scene
if (syncManager.getLocalPoints().length === 0) {
    for (const cfg of DEFAULT_POINT_CONFIGS) {
        const point = new Point2D(cfg.id, syncManager);
        point.setRadiusHint(DEFAULT_SPHERE_RADIUS);
        point.applyDefaultConfig(cfg);
        const direction = new Vector3(cfg.direction.x, cfg.direction.y, cfg.direction.z);
        if (direction.lengthSquared() === 0) {
            continue;
        }
        const normalized = direction.normalize();
        const { lat, lon } = vec3ToLatLon(normalized);
        const { nx, ny } = equirectangularNormalizedXY(lat, lon);
        point.nx = nx;
        point.ny = ny;
        syncManager.registerPoint(point);
    }
}

syncManager.ensureTaskTarget();
syncManager.onTaskStateChange(handleTaskStateChange);

window.addEventListener("keydown", (ev) => {
    if (ev.key === "p" || ev.key === "P") {
        if (projectionMode === "equirectangular") {
            setProjectionMode("pca");
            // syncManager.getPCAManager().update(
            // 		syncManager.getRemotePoints()
            // 		.map(d => new Vector3(d.position.x, d.position.y, d.position.z))
            // 	)
            syncManager.updatePCA();
            console.log("Switched to PCA projection mode");
        } else {
            setProjectionMode("equirectangular");
            console.log("Switched to Equirectangular projection mode");
        }
        for (const p of syncManager.getLocalPoints()) {
            // re-apply local data to update nx,ny based on new PCA
            const remoteData = syncManager.getRemotePointById(p.id);
            if (remoteData) {
                p.applyRemoteData(remoteData, syncManager.getPCAManager());
            }
        }
    }
});

let width = 0,
    height = 0;
function resize() {
    const dpr = window.devicePixelRatio || 1;
    // Make canvas a large but not full-screen area, centered with margins
    const maxW = Math.max(400, Math.min(window.innerWidth - 120, 1200));
    const maxH = Math.max(300, Math.min(window.innerHeight - 120, 800));
    width = Math.floor(maxW);
    height = Math.floor(maxH);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// Define draggable rectangle (10% padding)
function getBounds() {
    const pad = 0.0;
    return {
        x: width * pad,
        y: height * pad,
        w: width * (1 - pad * 2),
        h: height * (1 - pad * 2),
    };
}

// Draw loop
function drawAll() {
    // clear
    ctx.clearRect(0, 0, width, height);
    // background fill
    ctx.fillStyle = DASHBOARD_BG;
    ctx.fillRect(0, 0, width, height);

    // draw bounds
    const b = getBounds();
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);

    // draw points
    const points = syncManager.getLocalPoints();
    const taskState = syncManager.getCurrentTask();
    for (const p of points) {
        const trial = taskState?.trial ?? 1;
        let isTarget = false;
        let hideColor = false;
        let overrideColor: typeof SUCCESS_COLOR_VEC | null = null;

        if (taskState && trial >= 1 && trial <= 4) {
            // Task 1 logic
            isTarget = (trial === 1 || trial === 3) && taskState.targetPointId2D === p.id;
            hideColor =
                (trial === 2 || trial === 4) &&
                taskState.targetPointId2D === p.id &&
                taskState.feedback !== "success";
            overrideColor = isTarget ? SUCCESS_COLOR_VEC : null;
        } else if (taskState && (trial === 5 || trial === 6)) {
            // Task 2 logic: show the OTHER player's target in green locally
            const partnerTargetId = taskState.targetPointId3D;
            const ownTargetId = taskState.targetPointId2D;
            if (partnerTargetId && partnerTargetId === p.id) {
                overrideColor = SUCCESS_COLOR_VEC;
            } else if (taskState.clicked2D && ownTargetId === p.id) {
                overrideColor = SUCCESS_COLOR_VEC;
            }
        } else if (taskState && trial === 7 && taskState.trial7Assignments) {
            const partnerAssignment = taskState.trial7Assignments.find((a) => a.point3D === p.id);
            if (partnerAssignment) {
                const pair = getColorPairByKey(partnerAssignment.key);
                if (pair) {
                    overrideColor = hexToVector3(pair.hex3D);
                }
            }
        }

        const isCompleted = !!taskState?.completed;
        p.draw(ctx, width, height, isTarget, isCompleted, hideColor, overrideColor);
    }
}

let dragging: Point2D | null = null;
let dragMoved = false;
function clampToBounds(px: number, py: number) {
    const b = getBounds();
    const clampedX = Math.min(b.x + b.w, Math.max(b.x, px));
    const clampedY = Math.min(b.y + b.h, Math.max(b.y, py));
    return { x: clampedX, y: clampedY };
}

canvas.addEventListener("pointerdown", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const points = syncManager.getLocalPoints();
    // hit test reverse order so last drawn (if ordering matters) is on top
    for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        if (p.hitTest(px, py, width, height)) {
            if (p.isDraggable()) {
                dragging = p;
                dragMoved = false;
                try {
                    canvas.setPointerCapture(ev.pointerId);
                } catch {}
            }
            break;
        }
    }
});

canvas.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    dragMoved = true;
    const rect = canvas.getBoundingClientRect();
    let px = ev.clientX - rect.left;
    let py = ev.clientY - rect.top;
    const c = clampToBounds(px, py);
    px = c.x;
    py = c.y;
    dragging.setFromPixel(px, py, width, height);
    drawAll();
});

canvas.addEventListener("pointerup", (ev) => {
    const wasDragging = !!dragging;
    if (dragging) {
        try {
            canvas.releasePointerCapture(ev.pointerId);
        } catch {}
        dragging = null;
    }

    const shouldTreatAsClick = !wasDragging || !dragMoved;
    dragMoved = false;
    if (!shouldTreatAsClick) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    tryHandle2DSelection(px, py);
});

function tryHandle2DSelection(px: number, py: number) {
    const taskState = syncManager.getCurrentTask();
    const trial = taskState?.trial ?? 1;

    // Task 1 logic
    if (
        taskState &&
        trial >= 2 &&
        trial <= 4 &&
        !taskState.completed &&
        taskState.targetPointId2D
    ) {
        const points = syncManager.getLocalPoints();
        for (let i = points.length - 1; i >= 0; i--) {
            const p = points[i];
            if (p.hitTest(px, py, width, height)) {
                console.debug("2D Point clicked:", p.id);
                const isCorrect = p.id === taskState.targetPointId2D;
                if (isCorrect) {
                    p.setDisplayColor(SUCCESS_COLOR_VEC);
                } else {
                    p.flashColorSync(ERROR_COLOR_VEC, 800);
                }
                syncManager.setTrial2SelectionResult(isCorrect, taskState.id);
                break;
            }
        }
        return;
    }

    // Task 2 logic
    if (
        taskState &&
        (trial === 5 || trial === 6) &&
        !taskState.completed &&
        taskState.targetPointId2D
    ) {
        console.log("Task 2 2D click detected");
        const points = syncManager.getLocalPoints();
        for (let i = points.length - 1; i >= 0; i--) {
            const p = points[i];
            if (p.hitTest(px, py, width, height)) {
                // Ignore clicks on the partner's green target
                if (taskState.targetPointId3D && p.id === taskState.targetPointId3D) {
                    return;
                }
                console.log(
                    "Task 2 2D: Clicked point:",
                    p.id,
                    "Target:",
                    taskState.targetPointId2D
                );
                const isCorrect = p.id === taskState.targetPointId2D;
                console.log("Task 2 2D: Is correct?", isCorrect);
                if (isCorrect) {
                    p.setDisplayColor(SUCCESS_COLOR_VEC);
                } else {
                    p.flashColorSync(ERROR_COLOR_VEC, 800);
                }
                syncManager.handleTask2Click2D(isCorrect, taskState.id);
                break;
            }
        }
        return;
    }

    if (taskState && trial === 7 && !taskState.completed && taskState.targetPointId2D) {
        const pair = getColorPairByKey(taskState.colorPairKey);
        const ownColor = pair ? hexToVector3(pair.hex2D) : SUCCESS_COLOR_VEC;
        const points = syncManager.getLocalPoints();
        for (let i = points.length - 1; i >= 0; i--) {
            const p = points[i];
            if (!p.hitTest(px, py, width, height)) continue;

            // Ignore clicks on the 3D partner's target
            if (taskState.targetPointId3D && p.id === taskState.targetPointId3D) {
                return;
            }

            const isCorrect = p.id === taskState.targetPointId2D;
            if (isCorrect) {
                p.setDisplayColor(ownColor);
                p.setSelectable(false);
                drawAll();
            } else {
                const original = p.getBaseColor();
                p.setColor(ERROR_COLOR_VEC);
                drawAll();
                setTimeout(() => {
                    p.setColor(original);
                    drawAll();
                }, 800);
            }
            syncManager.handleTrial7Click2D(isCorrect, p.id, taskState.id);
            break;
        }
        return;
    }
}

// animate
function loop() {
    drawAll();
    requestAnimationFrame(loop);
}
loop();

function handleTaskStateChange(taskState: ReturnType<typeof syncManager.getCurrentTask>) {
    const trial = taskState?.trial ?? 1;
    const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(trial);
    const label = `Task ${taskNumber}: Trial ${trialNumber}/${totalTrials}`;
    trialBox.textContent = label;
    if (taskState?.trial === 7) {
        const activeIndex = taskState.colorPairIndex ?? 0;
        const pair = getColorPairByKey(
            taskState.trial7Assignments?.[activeIndex]?.key ?? taskState.colorPairKey
        );
        if (pair) {
            instructionBox.textContent = `Find ${pair.name2D}`;
        } else {
            instructionBox.textContent = "Match the instructed colors";
        }
    } else {
        instructionBox.textContent = "";
    }
    console.log("2D Task state changed:", {
        trial,
        targetPointId2D: taskState?.targetPointId2D,
        targetPointId3D: taskState?.targetPointId3D,
        clicked2D: taskState?.clicked2D,
        clicked3D: taskState?.clicked3D,
    });

    // Sync error flash from 3D side to 2D side for Trial 7
    if (
        trial === 7 &&
        taskState?.errorPointId3D &&
        taskState.errorPointId3D !== lastProcessedErrorPointId3D
    ) {
        lastProcessedErrorPointId3D = taskState.errorPointId3D;
        const points = syncManager.getLocalPoints();
        const errorPoint = points.find((p) => p.id === taskState.errorPointId3D);
        if (errorPoint) {
            errorPoint.flashColorSync(ERROR_COLOR_VEC, 800);
        }
    } else if (!taskState?.errorPointId3D) {
        lastProcessedErrorPointId3D = null;
    }

    applyCompletedTrial7Pairs(taskState);
    ensureActiveTrial7TargetSelectable(taskState);

    lastTrial = trial;
}

function applyCompletedTrial7Pairs(taskState: ReturnType<typeof syncManager.getCurrentTask>) {
    if (!taskState || taskState.trial !== 7 || !taskState.trial7Assignments) return;

    const points = syncManager.getLocalPoints();
    for (const entry of taskState.trial7Assignments) {
        const fullySolved = entry.done2D && entry.done3D;
        if (!fullySolved) continue;
        const point = points.find((p) => p.id === entry.point2D);
        const partnerPoint = points.find((p) => p.id === entry.point3D);
        const pair = getColorPairByKey(entry.key);
        if (point && pair) {
            const color = hexToVector3(pair.hex2D);
            point.setBaseColor(color);
            point.setDisplayColor(color);
            point.setSelectable(false);
        }
        if (partnerPoint && pair) {
            const partnerColor = hexToVector3(pair.hex3D);
            partnerPoint.setBaseColor(partnerColor);
            partnerPoint.setDisplayColor(partnerColor);
            partnerPoint.setSelectable(false);
        }
    }
}

function ensureActiveTrial7TargetSelectable(
    taskState: ReturnType<typeof syncManager.getCurrentTask>
) {
    if (!taskState || taskState.trial !== 7 || !taskState.trial7Assignments) return;
    const activeIndex = taskState.colorPairIndex ?? 0;
    const active = taskState.trial7Assignments[activeIndex];
    if (!active) return;

    // Only re-enable the active 2D target; partner targets stay locked
    const points = syncManager.getLocalPoints();
    const point = points.find((p) => p.id === active.point2D);
    if (point && !active.done2D) {
        point.setSelectable(true);
    }
}

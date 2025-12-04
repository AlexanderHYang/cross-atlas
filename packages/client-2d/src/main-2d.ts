import { Vector3 } from "@babylonjs/core";
import { Point2D } from "./Point2D";
import { SyncManager2D } from "./SyncManager2D";
import { equirectangularNormalizedXY, vec3ToLatLon } from "../../shared/src/projection";
import { DEFAULT_POINT_CONFIGS, DEFAULT_SPHERE_RADIUS } from "../../shared/src/defaultPoints";
import {
    TaskColorConfig2D,
    applyTaskVisuals2D,
    evaluateSelection2D,
    getInstructionForTask,
    getPointVisual2D,
    getTaskAndTrial,
    processTrial7ErrorFlash2D,
} from "../../shared/src/tasks";

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
let lastProcessedErrorPointId3D: string | null = null;
const colorConfig2D: TaskColorConfig2D = {
    success: SUCCESS_COLOR_VEC,
    error: ERROR_COLOR_VEC,
};

const trialBox = document.createElement("div");
trialBox.id = "trial-box";
trialBox.textContent = "Trial 1";
document.body.appendChild(trialBox);

const instructionBox = document.createElement("div");
instructionBox.id = "instruction-box";
instructionBox.style.display = "none";
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
        const visuals = getPointVisual2D(taskState, p.id, colorConfig2D);
        const isCompleted = !!taskState?.completed;
        p.draw(
            ctx,
            width,
            height,
            visuals.isTarget,
            isCompleted,
            visuals.hideColor,
            visuals.overrideColor
        );
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
    const points = syncManager.getLocalPoints();
    let clicked: Point2D | null = null;
    for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        if (p.hitTest(px, py, width, height)) {
            clicked = p;
            break;
        }
    }

    if (!clicked) return;

    const selection = evaluateSelection2D(taskState, clicked.id, colorConfig2D);
    if (!selection.handled) {
        return;
    }

    if (selection.isCorrect) {
        const color = selection.successColor ?? SUCCESS_COLOR_VEC;
        clicked.setDisplayColor(color);
        if (selection.lockOnSuccess) {
            clicked.setSelectable(false);
        }
        drawAll();
    } else {
        const errorColor = selection.errorColor ?? ERROR_COLOR_VEC;
        const duration = selection.errorFlashDurationMs ?? 800;

        clicked.flashColorSync(errorColor, duration);
    }

    syncManager.handleSelection2D(clicked.id);
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
    const instruction = getInstructionForTask(taskState);
    if (instruction.visible) {
        instructionBox.style.display = "block";
        if (instruction.html) {
            instructionBox.innerHTML = instruction.html;
        } else {
            instructionBox.textContent = instruction.text ?? "";
        }
    } else {
        instructionBox.textContent = "";
        instructionBox.style.display = "none";
    }
    console.debug("2D Task state changed:", {
        trial,
        targetPointId2D: taskState?.targetPointId2D,
        targetPointId3D: taskState?.targetPointId3D,
        clicked2D: taskState?.clicked2D,
        clicked3D: taskState?.clicked3D,
    });

    if (trial === 7) {
        lastProcessedErrorPointId3D = processTrial7ErrorFlash2D(
            taskState,
            syncManager.getLocalPoints(),
            ERROR_COLOR_VEC,
            lastProcessedErrorPointId3D
        );
    } else {
        lastProcessedErrorPointId3D = null;
    }

    applyTaskVisuals2D(taskState, syncManager.getLocalPoints());
}

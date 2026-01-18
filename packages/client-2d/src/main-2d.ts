import { Logger, Vector3 } from "@babylonjs/core";
import { Point2D } from "./Point2D";
import { SyncManager2D } from "./SyncManager2D";
import { equirectangularNormalizedXY, vec3ToLatLon } from "../../shared/src/projection";
import { DEFAULT_POINT_CONFIGS, DEFAULT_SPHERE_RADIUS } from "../../shared/src/defaultPoints";
import {
    TaskColorConfig2D,
    TaskState,
    determineNextAction,
    getPointVisual2D,
    getTaskAndTrial,
} from "../../shared/src/tasks";
import { Logger2D } from "./Logger2d";
import { TaskController2D } from "./tasks/taskController2D";

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

// create SyncManager
const syncManager: SyncManager2D = await SyncManager2D.create();

// create logger
const logger2d = new Logger2D(syncManager);

const taskController2D = new TaskController2D({
    syncManager,
    colorConfig: colorConfig2D,
    successColor: SUCCESS_COLOR_VEC,
    errorColor: ERROR_COLOR_VEC,
    ui: { trialBox, instructionBox },
    drawAll,
});

// Create defaults that match the 3D scene
for (const cfg of DEFAULT_POINT_CONFIGS) {
    const point = new Point2D(cfg.id, syncManager);
    point.applyDefaultConfig(cfg);

    // note: apply default config already sets pos3d, however the pos3d in DEFAULT_POINT_CONFIGS
    // is actually incorrect and is un-normalized, so I'm manually applying that here.
    // In the future we should consider streamlining the point initialization process

    const direction = new Vector3(cfg.direction.x, cfg.direction.y, cfg.direction.z);
    const normalized = direction.normalize();
    point.pos3d = normalized;
    console.log(point.pos3d.length());

    const [nx, ny] = syncManager.getProjectionManager().project(point.pos3d);
    point.nx = nx;
    point.ny = ny;
    syncManager.registerPoint(point);
}

let studyStarted = syncManager.isStudyStarted();
let calibrationPending = syncManager.isCalibrationPending();
function setWaitingUI() {
    trialBox.textContent = "Waiting for 3D user to initialize the study";
    instructionBox.textContent = "";
    instructionBox.style.display = "none";
}
function setCalibrationUI() {
    trialBox.textContent = "Waiting for 3D user to recalibrate";
    instructionBox.textContent = "";
    instructionBox.style.display = "none";
}

if (!studyStarted) {
    setWaitingUI();
    logger2d.addLogEvent({
        eventName: "awaiting_start_sequence",
        eventDetails: { status: "waiting" },
    });
}

syncManager.onStudyStartedChange((started) => {
    studyStarted = started;
    if (!started) {
        setWaitingUI();
        return;
    }
    logger2d.addLogEvent({
        eventName: "start_sequence_completed",
        eventDetails: { status: "started" },
    });
    syncManager.ensureTaskTarget();
    const currentTask = syncManager.getCurrentTask();
    if (currentTask) {
        const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(currentTask.trial);
        logger2d.setTrialContext(taskNumber, trialNumber, totalTrials);
        taskController2D.handleTaskStateChange(currentTask);
    }
});

syncManager.onCalibrationPendingChange((pending) => {
    calibrationPending = pending;
    if (!studyStarted) {
        return;
    }
    if (pending) {
        setCalibrationUI();
        return;
    }
    syncManager.resetForNextTrial();
    const currentTask = syncManager.getCurrentTask();
    if (currentTask) {
        taskController2D.handleTaskStateChange(currentTask);
    }
});

syncManager.onTaskStateChange((taskState) => {
    if (!studyStarted || calibrationPending) {
        return;
    }
    taskController2D.handleTaskStateChange(taskState);
});

let lastTaskState: TaskState | null = null;
syncManager.onTaskStateChange((taskState) => {
    if (!taskState) {
        lastTaskState = taskState;
        return;
    }

    if (!studyStarted || calibrationPending) {
        lastTaskState = taskState;
        return;
    }

    const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(taskState.trial);
    logger2d.setTrialContext(taskNumber, trialNumber, totalTrials);

    const completedSuccessfully =
        taskState.feedback === "success" && taskState.completed && !lastTaskState?.completed;

    if (completedSuccessfully) {
        const action = determineNextAction(taskState);
        if (taskState.trial !== 7 || action.action === "all-complete") {
            logger2d.logTrialEnd(taskNumber, trialNumber, totalTrials);
        }
        if (action.action === "all-complete") {
            logger2d.finalizeStudy();
        }
    }

    lastTaskState = taskState;
});

window.addEventListener("keydown", (ev) => {
    if (ev.key === "p" || ev.key === "P") {
        syncManager.getProjectionManager().cycleProjection(syncManager);
        for (const p of syncManager.getLocalPoints()) {
            const [nx, ny] = syncManager.getProjectionManager().project(p.pos3d);
            p.nx = nx;
            p.ny = ny;
        }

        const projectionType = syncManager.getProjectionManager().getCurrentProjectionType();
        console.log(`[2D] Projection switched to: ${projectionType}`);
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
    const taskState = studyStarted && !calibrationPending ? syncManager.getCurrentTask() : null;
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
    if (!studyStarted || calibrationPending) {
        return;
    }
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

canvas.addEventListener("pointerup", (ev) => {
    if (!studyStarted || calibrationPending) {
        return;
    }
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
    if (!studyStarted || calibrationPending) {
        return;
    }
    taskController2D.tryHandleSelection(px, py, width, height);
}

// animate
function loop() {
    drawAll();
    requestAnimationFrame(loop);
}
loop();

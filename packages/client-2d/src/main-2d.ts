import { Logger, Vector3 } from "@babylonjs/core";
import { Point2D } from "./Point2D";
import { SyncManager2D } from "./SyncManager2D";
import { PCAProjection } from "./ProjectionManager";
import {
    DEFAULT_POINT_CONFIGS,
    DEFAULT_SPHERE_RADIUS,
    getDefaultPointConfig,
} from "../../shared/src/defaultPoints";
import { LANDMARK_POS } from "../../shared/src/angularPointSelection";
import {
    TaskColorConfig2D,
    TaskState,
    determineNextAction,
    getPointVisual2D,
    getTaskAndTrial,
    parseTaskSelection,
    setTaskFlowConfig,
} from "../../shared/src/tasks";
import { Logger2D } from "./Logger2d";
import { TaskController2D } from "./tasks/taskController2D";
import {
    parseCounterbalanceFlag,
    setCounterbalanceConfig,
    isCounterbalanceEnabled,
    getCurrentCounterbalanceProjection,
    advanceToNextProjection,
    hasMoreProjections,
    getCurrentProjectionIndex,
    getTotalProjections,
    isProjectionTransitioning,
    setProjectionTransitioning,
} from "../../shared/src/counterbalance";

const DASHBOARD_BG = "#707070";

// Create a single canvas UI for all points (centered, not full screen)
const canvas = document.createElement("canvas");
canvas.id = "points-canvas";
canvas.style.position = "absolute";
canvas.style.left = "50%";
canvas.style.transform = "translate(-50%, -50%)";
canvas.style.display = "block";
canvas.style.background = DASHBOARD_BG;
canvas.style.touchAction = "none";
canvas.style.border = "2px solid rgba(100, 180, 255, 0.5)";
canvas.style.borderRadius = "15px";
canvas.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255, 255, 255, 0.05)";
document.body.style.margin = "0";
document.body.style.background = DASHBOARD_BG;
document.body.appendChild(canvas);

const style = document.createElement("style");
style.textContent = `
html, body { height:100%; background: ${DASHBOARD_BG}; }
#points-canvas { display:block; }
#trial-box {
	position: absolute;
	top: 25px;
	left: 16px;
	padding: 10px 14px;
	background: linear-gradient(135deg, rgba(60, 120, 180, 0.4), rgba(40, 80, 140, 0.4));
	color: #e0f0ff;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
	font-weight: 500;
	border: 1.5px solid rgba(100, 180, 255, 0.5);
	border-radius: 8px;
	box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.1);
	font-size: 16px;
	line-height: 1.5;
	letter-spacing: 0.3px;
}
#instruction-box {
	position: absolute;
	top: 25px;
	left: 220px;
	padding: 10px 14px;
	background: linear-gradient(135deg, rgba(60, 120, 180, 0.4), rgba(40, 80, 140, 0.4));
	color: #e0f0ff;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
	font-weight: 500;
	border: 1.5px solid rgba(100, 180, 255, 0.5);
	border-radius: 8px;
	box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.1);
	font-size: 16px;
	line-height: 1.5;
	letter-spacing: 0.3px;
}
#info-box {
	position: absolute;
	top: 25px;
	right: 16px;
	padding: 10px 14px;
	background: linear-gradient(135deg, rgba(60, 120, 180, 0.4), rgba(40, 80, 140, 0.4));
	color: #e0f0ff;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
	font-weight: 500;
	border: 1.5px solid rgba(100, 180, 255, 0.5);
	border-radius: 8px;
	box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.1);
	text-align: right;
	font-size: 16px;
	line-height: 1.5;
	letter-spacing: 0.3px;
}
`;
document.head.appendChild(style);

const ctx = canvas.getContext("2d")!;
const TOP_UI_HEIGHT = 80;
const TOP_UI_GAP = 12;
const SUCCESS_COLOR_VEC = new Vector3(0x2e / 255, 0xcc / 255, 0x71 / 255);
const ERROR_COLOR_VEC = new Vector3(0xc0 / 255, 0x39 / 255, 0x2b / 255);
const colorConfig2D: TaskColorConfig2D = {
    success: SUCCESS_COLOR_VEC,
    error: ERROR_COLOR_VEC,
};

const tasksFlag = (import.meta.env.VITE_TASKS as string | undefined)?.trim();
const tasksConfig = parseTaskSelection(tasksFlag);
if (tasksConfig) {
    setTaskFlowConfig(tasksConfig);
}

// Initialize counterbalance if flag is provided
const counterbalanceFlag = (import.meta.env.VITE_COUNTERBALANCE as string | undefined)?.trim();
const counterbalanceSequence = parseCounterbalanceFlag(counterbalanceFlag);
if (counterbalanceSequence) {
    setCounterbalanceConfig(counterbalanceSequence);
}

const trialBox = document.createElement("div");
trialBox.id = "trial-box";
trialBox.textContent = "Trial 1";
document.body.appendChild(trialBox);

const instructionBox = document.createElement("div");
instructionBox.id = "instruction-box";
instructionBox.style.display = "none";
document.body.appendChild(instructionBox);

const infoBox = document.createElement("div");
infoBox.id = "info-box";
infoBox.innerHTML =
    "Layout: <span style='color: #a8d5ff;'>spherical</span> <span style='opacity: 0.5; margin: 0 8px;'>|</span> Projection: <span style='color: #a8d5ff;'>equirectangular</span>";
document.body.appendChild(infoBox);

// create SyncManager
const syncManager: SyncManager2D = await SyncManager2D.create();

let initialProjectionOverride: ReturnType<typeof getCurrentCounterbalanceProjection> = null;
// If counterbalance is enabled, set the initial projection from the sequence
if (isCounterbalanceEnabled()) {
    initialProjectionOverride = getCurrentCounterbalanceProjection();
    if (initialProjectionOverride) {
        console.log(`[Counterbalance] Setting initial projection: ${initialProjectionOverride}`);
    }
}

// Get layout type for info box
const layoutEnv = (import.meta.env.VITE_LAYOUT_TYPE as string | undefined)?.trim();
const layoutType = layoutEnv || "spherical";

// Helper to compute y-offset for semiSpherical + horizontal layout
function getYOffset(): number {
    const projectionType = syncManager.getProjectionManager().getCurrentProjectionType();
    return layoutType === "semiSpherical" && projectionType === "horizontal" ? 50 : 0;
}

const updateInfoBox = () => {
    const projectionType = syncManager.getProjectionManager().getCurrentProjectionType();
    infoBox.innerHTML = `Layout: <span style='color: #a8d5ff;'>${layoutType}</span> <span style='opacity: 0.5; margin: 0 8px;'>|</span> Projection: <span style='color: #a8d5ff;'>${projectionType}</span>`;
};
updateInfoBox();

// create logger
const logger2d = new Logger2D(syncManager);

const taskController2D = new TaskController2D({
    syncManager,
    logger: logger2d,
    colorConfig: colorConfig2D,
    successColor: SUCCESS_COLOR_VEC,
    errorColor: ERROR_COLOR_VEC,
    ui: { trialBox, instructionBox },
    drawAll,
});

const HARD_THRESHOLD_DEGREES = 60;
const AVERAGE_THRESHOLD_DEGREES = 45;
const ANGLE_PRECISION = 2;
const loggedSelectionTasks = new Set<number>();

function getAngularDistanceDegrees(pointId: string): number | null {
    const config = getDefaultPointConfig(pointId);
    if (!config) {
        return null;
    }
    const position = new Vector3(config.direction.x, config.direction.y, config.direction.z);
    const angularRad = Vector3.GetAngleBetweenVectors(position, LANDMARK_POS, Vector3.Up());
    const degrees = Math.abs((angularRad * 180) / Math.PI);
    return Number.parseFloat(degrees.toFixed(ANGLE_PRECISION));
}

function classifyDifficulty(degrees: number | null): "easy" | "average" | "hard" | "unknown" {
    if (degrees === null || !Number.isFinite(degrees)) {
        return "unknown";
    }
    if (degrees > HARD_THRESHOLD_DEGREES) {
        return "hard";
    }
    if (degrees >= AVERAGE_THRESHOLD_DEGREES) {
        return "average";
    }
    return "easy";
}

function logPointSelectionIfNeeded(taskState: TaskState, taskNumber: number) {
    if (loggedSelectionTasks.has(taskNumber)) {
        return;
    }
    if (!taskState.preselectedPointIds?.length) {
        return;
    }
    const pointDetails = taskState.preselectedPointIds.map((pointId) => {
        const degrees = getAngularDistanceDegrees(pointId);
        return {
            pointId,
            degrees,
            difficulty: classifyDifficulty(degrees),
        };
    });
    const cumulativeDegrees = pointDetails.reduce((sum, entry) => sum + (entry.degrees ?? 0), 0);
    logger2d.logPointSelection({
        taskNumber,
        pointIds: taskState.preselectedPointIds,
        cumulativeDegrees: Number.parseFloat(cumulativeDegrees.toFixed(ANGLE_PRECISION)),
        points: pointDetails,
    });
    loggedSelectionTasks.add(taskNumber);
}

// Create defaults that match the 3D scene
for (const cfg of DEFAULT_POINT_CONFIGS) {
    const point = new Point2D(cfg.id, syncManager);
    point.applyDefaultConfig(cfg);

    // Use raw coordinates from config, scaled uniformly to match 3D
    const direction = new Vector3(cfg.direction.x, cfg.direction.y, cfg.direction.z);
    // point.pos3d = direction.scale(DEFAULT_SPHERE_RADIUS);
    point.pos3d = direction;

    // Register point without projection coords yet (will set after scale normalization)
    point.nx = 0;
    point.ny = 0;
    syncManager.registerPoint(point);
}

// If using PCA projection, update the principal components with all points
if (syncManager.getProjectionManager().getCurrentProjectionType() === "pca") {
    const pcaProjection = syncManager
        .getProjectionManager()
        .getCurrentProjection() as PCAProjection;
    pcaProjection.updatePCA(syncManager.getLocalPoints().map((p) => p.pos3d));
}

// Compute scale factors for all projections based on 3D point positions
// This ensures consistent scale across all projection types (RMS normalization)
syncManager
    .getProjectionManager()
    .computeScaleFactors(syncManager.getLocalPoints().map((p) => p.pos3d));

// Now compute projected 2D coordinates with scale normalization applied
for (const p of syncManager.getLocalPoints()) {
    const [nx, ny] = syncManager.getProjectionManager().project(p.pos3d.clone());
    p.nx = nx;
    p.ny = ny;
}

let studyStarted = syncManager.isStudyStarted();
let calibrationPending = syncManager.isCalibrationPending();
let awaitingNextTaskState = false;
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
        syncManager.resetPointsToDefaultConfig();
        setWaitingUI();
        return;
    }

    if (isCounterbalanceEnabled() && isProjectionTransitioning()) {
        const nextProjection =
            getCurrentCounterbalanceProjection() ??
            syncManager.getProjectionManager().getCurrentProjectionType();
        const projIndex = getCurrentProjectionIndex();
        const totalProj = getTotalProjections();

        logger2d.resetForNewProjection();
        loggedSelectionTasks.clear();
        syncManager.switchProjectionAndRestartTasks(nextProjection);
        updateInfoBox();
        instructionBox.style.display = "none";

        console.log(
            `[Counterbalance] Started projection ${projIndex + 1}/${totalProj}: ${nextProjection}`,
        );
        setProjectionTransitioning(false);
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
        logPointSelectionIfNeeded(currentTask, taskNumber);
    }
});

syncManager.onTaskStateChange((taskState) => {
    if (!studyStarted) {
        return;
    }
    if (taskState) {
        const { taskNumber } = getTaskAndTrial(taskState.trial);
        logPointSelectionIfNeeded(taskState, taskNumber);
    }
    logger2d.logTaskLifecycle(taskState);
});

syncManager.onCalibrationPendingChange((pending) => {
    calibrationPending = pending;
    if (!studyStarted) {
        return;
    }
    if (pending) {
        awaitingNextTaskState = false;
        setCalibrationUI();
        return;
    }

    syncManager.resetForNextTrial();
    awaitingNextTaskState = true;
});

syncManager.onTaskStateChange((taskState) => {
    if (!studyStarted || calibrationPending) {
        return;
    }
    if (awaitingNextTaskState) {
        awaitingNextTaskState = false;
    }
    // Don't update UI during projection transitions to preserve transition message
    if (isProjectionTransitioning()) {
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

    if (taskState.trial === 7 && taskState.trial7Assignments) {
        const previousAssignments = lastTaskState?.trial7Assignments ?? [];
        const previousByKey = new Map(previousAssignments.map((entry) => [entry.key, entry]));
        const totalPairs = taskState.trial7Assignments.length;
        const solvedCount = taskState.trial7Assignments.filter(
            (entry) => entry.done2D && entry.done3D,
        ).length;

        taskState.trial7Assignments.forEach((entry, index) => {
            const prev = previousByKey.get(entry.key);
            const prevDone2D = prev?.done2D ?? false;
            const prevDone3D = prev?.done3D ?? false;
            const nowDone2D = !!entry.done2D;
            const nowDone3D = !!entry.done3D;

            if (nowDone2D && !prevDone2D) {
                logger2d.logTask3PointSolved({
                    pairKey: entry.key,
                    pairIndex: index,
                    side: "2d",
                    solvedCount,
                    totalPairs,
                });
            }

            if (nowDone3D && !prevDone3D) {
                logger2d.logTask3PointSolved({
                    pairKey: entry.key,
                    pairIndex: index,
                    side: "3d",
                    solvedCount,
                    totalPairs,
                });
            }

            if (nowDone2D && nowDone3D && !(prevDone2D && prevDone3D)) {
                logger2d.logTask3PairSolved({
                    pairKey: entry.key,
                    pairIndex: index,
                    solvedCount,
                    totalPairs,
                });
            }
        });
    }

    const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(taskState.trial);
    logger2d.setTrialContext(taskNumber, trialNumber, totalTrials);

    const completedSuccessfully =
        taskState.feedback === "success" && taskState.completed && !lastTaskState?.completed;

    if (completedSuccessfully) {
        const action = determineNextAction(taskState);

        // Log trial end for all completed trials (including trial 4)
        if (taskState.trial !== 7 || action.action === "all-complete") {
            logger2d.logTrialEnd(taskNumber, trialNumber, totalTrials);
        }

        // Handle counterbalance projection transitions
        if (action.action === "all-complete") {
            // Check if counterbalance mode is enabled and there are more projections
            if (isCounterbalanceEnabled() && hasMoreProjections() && !isProjectionTransitioning()) {
                // Set transitioning flag to prevent race conditions
                setProjectionTransitioning(true);

                const currentProjection = syncManager
                    .getProjectionManager()
                    .getCurrentProjectionType();
                const currentProjIndex = getCurrentProjectionIndex();
                const totalProj = getTotalProjections();
                const nextProjection = advanceToNextProjection();

                // Finalize current projection with old-style summary
                logger2d.finalizeProjection(currentProjection, currentProjIndex + 1, totalProj);

                if (nextProjection) {
                    // Hide trial box during transition
                    trialBox.style.display = "none";

                    // Move instruction box to left position during transition
                    instructionBox.style.left = "16px";

                    // Set up countdown timer
                    let countdown = 10;
                    const updateTransitionMessage = () => {
                        instructionBox.innerHTML = `Projection ${currentProjIndex + 1} of ${totalProj} complete <span style='opacity: 0.5; margin: 0 8px;'>|</span> Starting next projection (<span style='color: #a8d5ff;'>${nextProjection}</span>) in ${countdown}s`;
                    };
                    updateTransitionMessage();
                    instructionBox.style.display = "block";

                    const countdownInterval = window.setInterval(() => {
                        countdown--;
                        if (countdown > 0) {
                            updateTransitionMessage();
                        } else {
                            window.clearInterval(countdownInterval);
                        }
                    }, 1000);

                    // Leave a transition gap before applying the next projection and restarting
                    window.setTimeout(() => {
                        window.clearInterval(countdownInterval);
                        syncManager.applyProjection(nextProjection);
                        updateInfoBox();

                        // Restore instruction box position
                        instructionBox.style.left = "220px";

                        // Show trial box again
                        trialBox.style.display = "block";

                        // Restart the study start sequence; on start completion we restart tasks
                        syncManager.setStudyStarted(false);
                    }, 10000);
                }

                lastTaskState = taskState;
                return;
            }

            // All projections complete (or not in counterbalance mode)
            if (isCounterbalanceEnabled()) {
                // Finalize last projection
                const currentProjection = syncManager
                    .getProjectionManager()
                    .getCurrentProjectionType();
                const currentProjIndex = getCurrentProjectionIndex();
                const totalProj = getTotalProjections();
                logger2d.finalizeProjection(currentProjection, currentProjIndex + 1, totalProj);
                logger2d.finalizeCounterbalanceStudy();

                // Hide trial box and move instruction box to left
                trialBox.style.display = "none";
                instructionBox.style.left = "16px";
                instructionBox.innerHTML = `<span style='color: #2ecc71; font-weight: 600;'>Study complete <span style='opacity: 0.5; margin: 0 8px;'>|</span> All ${totalProj} projections finished</span>`;
            } else {
                // Hide trial box and move instruction box to left
                trialBox.style.display = "none";
                instructionBox.style.left = "16px";
                instructionBox.innerHTML = `<span style='color: #2ecc71; font-weight: 600;'>Session complete</span>`;
                logger2d.finalizeStudy();
            }
            instructionBox.style.display = "block";
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
        updateInfoBox();
    }
});

let width = 0,
    height = 0;
function resize() {
    const dpr = window.devicePixelRatio || 1;
    // Make canvas a large but not full-screen area, centered with margins
    const maxW = Math.max(500, Math.min(window.innerWidth - 80, 1700));
    const reservedTop = TOP_UI_HEIGHT;
    const availableHeight = Math.max(200, window.innerHeight - reservedTop - TOP_UI_GAP - 40);
    const maxH = Math.max(300, Math.min(availableHeight, 1400));
    width = Math.floor(maxW);
    height = Math.floor(maxH);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.top = `${reservedTop + TOP_UI_GAP + height / 2}px`;
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
    const taskState =
        studyStarted && !calibrationPending && !awaitingNextTaskState
            ? syncManager.getCurrentTask()
            : null;
    const yOffset = getYOffset();
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
            visuals.overrideColor,
            visuals.glowColor,
            yOffset,
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
    const yOffset = getYOffset();
    // hit test reverse order so last drawn (if ordering matters) is on top
    for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        if (p.hitTest(px, py, width, height, yOffset)) {
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
    taskController2D.tryHandleSelection(px, py, width, height, getYOffset());
}

// animate
function loop() {
    drawAll();
    requestAnimationFrame(loop);
}
loop();

import * as Y from "yjs";
import { PlaneSyncData, PointSyncData } from "../../shared/src/sync";
import { Point2D } from "./Point2D";
import { WebsocketProvider } from "y-websocket";
import {
    TaskState,
    TASK_COLLECTION,
    TASK1_ID,
    TASK2_ID,
    TASK3_ID,
    TASK_META_COLLECTION,
    TaskMeta,
    TaskId,
    createTaskState,
    TRANSITION_DELAY_MS,
    getTaskFlowState,
    getTaskIdFromFlowState,
    determineNextAction,
    createNextState,
    createInitialTask1State,
    createInitialTask2State,
    createInitialTask3State,
    logTaskLifecycle,
    handleTask1Selection2D,
    handleTask2Selection2D,
    handleTask3Selection2D,
    isTask1Trial,
    isTask2Trial,
    isTask3Trial,
    getFirstEnabledTask,
    type PointIdProvider,
} from "../../shared/src/tasks";
import { DEFAULT_POINT_CONFIGS, getDefaultPointConfig } from "../../shared/src/defaultPoints";
import { selectPointsByAngularDistance } from "../../shared/src/angularPointSelection";
import {
    getPrecomputedTrialSelection,
    isRandomSelectionEnabled,
} from "../../shared/src/pointSelections";
import type { ProjectionType } from "../../shared/src/pointSelections";
import {
    getCurrentCounterbalanceProjection,
    isCounterbalanceEnabled,
    syncCounterbalanceIndex,
} from "../../shared/src/counterbalance";
import { Vector3 } from "@babylonjs/core";
import { PCAProjection, ProjectionManager } from "./ProjectionManager";
import { TimedLogEvent } from "../../shared/src/logging";

const TASK3_NEUTRAL_COLOR = new Vector3(1, 1, 1);
const CALIBRATION_DELAY_MS = 1000;

export class SyncManager2D implements PointIdProvider {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;

    private localPointsById: Map<string, Point2D>;

    private syncedPointDataMap: Y.Map<PointSyncData>;
    private logArray: Y.Array<TimedLogEvent>;
    private taskMap: Y.Map<TaskState>;
    private taskMetaMap: Y.Map<TaskMeta>;
    private syncedPCADataMap: Y.Map<PlaneSyncData>;

    private projectionManager;
    private currentTask: TaskState | null = null;
    private lastLoggedTask: TaskState | null = null;
    private taskListeners: Set<(task: TaskState | null) => void> = new Set();
    private studyListeners: Set<(started: boolean) => void> = new Set();
    private calibrationListeners: Set<(pending: boolean) => void> = new Set();
    private activeTaskId: TaskId = TASK1_ID;
    private transitionTimeout: number | null = null;
    private updatingMeta = false;
    private studyStarted = false;
    private calibrationPending = false;

    private constructor() {
        // 1) connect to websocket provider
        this.ydoc = new Y.Doc();
        const defaultProtocol = window.location.protocol === "https:" ? "wss" : "ws";
        const protocol =
            (import.meta.env.VITE_YJS_PROTOCOL as string | undefined) ??
            (import.meta.env.VITE_Y_WEBSOCKET_PROTOCOL as string | undefined) ??
            defaultProtocol;
        const hostname = window.location.hostname || "127.0.0.1";
        const normalizedHost =
            hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
        const port =
            Number.parseInt(import.meta.env.VITE_YJS_PORT ?? "", 10) ||
            Number.parseInt(import.meta.env.VITE_Y_WEBSOCKET_PORT ?? "", 10) ||
            1234;
        const websocketUrl = `${protocol}://${normalizedHost}:${port}`;

        this.provider = new WebsocketProvider(websocketUrl, "chart-room", this.ydoc);

        // 2) create local state maps
        this.localPointsById = new Map<string, Point2D>();
        this.syncedPointDataMap = this.ydoc.getMap("charts") as Y.Map<PointSyncData>;
        this.logArray = this.ydoc.getArray("logArray") as Y.Array<TimedLogEvent>;
        this.taskMap = this.ydoc.getMap(TASK_COLLECTION) as Y.Map<TaskState>;
        this.taskMetaMap = this.ydoc.getMap(TASK_META_COLLECTION) as Y.Map<TaskMeta>;
        this.syncedPCADataMap = this.ydoc.getMap("pca") as Y.Map<PlaneSyncData>;

        // 3) initialize projection manager
        const projectionOption = import.meta.env.VITE_PROJECTION;
        let projectionType: "equirectangular" | "pca" | "vertical" | "horizontal" =
            "equirectangular";
        if (projectionOption === "pca") {
            projectionType = "pca";
        } else if (projectionOption === "vertical") {
            projectionType = "vertical";
        } else if (projectionOption === "horizontal") {
            projectionType = "horizontal";
        }
        this.projectionManager = new ProjectionManager(projectionType);
    }

    private getSelectionProjection(): ProjectionType {
        return this.projectionManager.getCurrentProjectionType();
    }

    private setProjectionMeta(projectionType: ProjectionType) {
        this.updatingMeta = true;
        this.taskMetaMap.set("projection", { projectionType });
        this.updatingMeta = false;
    }

    public applyProjection(projectionType: ProjectionType) {
        console.log(`[SyncManager2D] Applying projection: ${projectionType}`);

        this.projectionManager.setCurrentProjectionType(projectionType);
        this.setProjectionMeta(projectionType);

        if (projectionType === "pca") {
            const pcaProjection = this.projectionManager.getCurrentProjection() as PCAProjection;
            pcaProjection.updatePCA(this.getLocalPoints().map((d) => d.pos3d));
        }

        this.projectionManager.computeScaleFactors(this.getLocalPoints().map((d) => d.pos3d));

        const planeData = this.projectionManager.getCurrentProjection().getPlaneSyncData();
        if (planeData) {
            this.updatePlaneSyncData(planeData);
        }

        for (const p of this.getLocalPoints()) {
            const [nx, ny] = this.projectionManager.project(p.pos3d);
            p.nx = nx;
            p.ny = ny;
        }
    }

    private normalizeTaskState(task: TaskState | null | undefined): TaskState | null {
        if (!task) return null;
        const trial = (task as any).trial ?? (task as any).stage ?? 1;
        const hintSide = task.hintSide ?? "2d";
        const feedback = task.feedback ?? "none";
        const completed = task.completed ?? false;
        const clicked2D = task.clicked2D ?? false;
        const clicked3D = task.clicked3D ?? false;
        const targetPointId3D = task.targetPointId3D;
        const errorPointId2D = task.errorPointId2D ?? null;
        const errorPointId3D = task.errorPointId3D ?? null;
        const colorPairKey = task.colorPairKey;
        const colorPairIndex = task.colorPairIndex;
        const trial7Assignments = task.trial7Assignments ?? [];
        const preselectedPointIds = task.preselectedPointIds ?? [];
        const preselectedIndex = task.preselectedIndex ?? 0;

        if (
            trial === (task as any).trial &&
            hintSide === task.hintSide &&
            feedback === task.feedback &&
            completed === task.completed &&
            clicked2D === task.clicked2D &&
            clicked3D === task.clicked3D &&
            targetPointId3D === task.targetPointId3D &&
            errorPointId2D === task.errorPointId2D &&
            errorPointId3D === task.errorPointId3D &&
            colorPairKey === task.colorPairKey &&
            colorPairIndex === task.colorPairIndex &&
            trial7Assignments === task.trial7Assignments
        ) {
            return task;
        }

        return {
            id: task.id,
            targetPointId2D: task.targetPointId2D,
            trial,
            hintSide,
            feedback,
            completed,
            clicked2D,
            clicked3D,
            targetPointId3D,
            errorPointId2D,
            errorPointId3D,
            colorPairKey,
            colorPairIndex,
            trial7Assignments,
            preselectedPointIds,
            preselectedIndex,
        };
    }

    private waitForInitialSync(): Promise<void> {
        return new Promise((resolve) => {
            this.provider.once("sync", () => {
                console.log("Initializing points from remote");
                for (const c of this.syncedPointDataMap.values()) {
                    const p = new Point2D(c.id, this);
                    p.applyDefaultConfig();
                    p.applyRemoteData(c);
                    console.log("initializing point from remote:", c);
                    // if (p.hasLockedColor() || p.hasPositionLock()) {
                    //     this.transactPointUpdate(p);
                    // }
                    if (p.hasLockedColor()) {
                        this.transactPointUpdate(p);
                    }
                    this.localPointsById.set(p.id, p);
                }
                resolve();
            });
        });
    }

    public getLogArray(): Y.Array<TimedLogEvent> {
        return this.logArray;
    }

    private logLifecycle(next: TaskState | null) {
        logTaskLifecycle(this.lastLoggedTask, next, "2D");
        this.lastLoggedTask = next;
    }

    private setActiveTask(taskId: TaskId) {
        this.activeTaskId = taskId;
        this.updatingMeta = true;
        this.taskMetaMap.set("active", { activeTaskId: taskId });
        this.updatingMeta = false;
    }

    private initializeRemoteObserver() {
        this.syncedPointDataMap.observe((event, transaction) => {
            for (const key of event.keysChanged) {
                const remoteData = this.syncedPointDataMap.get(key)!;
                const point = this.localPointsById.get(key)!;
                // skip changes originated from this local point update
                if (transaction.origin === point) {
                    continue;
                }

                // apply remote data to local point
                point.applyRemoteData(remoteData);
                // if (point.hasLockedColor() || point.hasPositionLock()) {
                //     this.transactPointUpdate(point);
                // }
                if (point.hasLockedColor()) {
                    this.transactPointUpdate(point);
                }
            }
        });

        this.taskMetaMap.observe(() => {
            if (this.updatingMeta) return;
            const meta = this.taskMetaMap.get("active");
            if (meta?.activeTaskId) {
                this.activeTaskId = meta.activeTaskId;
                const raw = this.taskMap.get(this.activeTaskId);
                const normalized = this.normalizeTaskState(raw);
                if (normalized && raw && normalized !== raw) {
                    this.taskMap.set(this.activeTaskId, normalized);
                }
                this.currentTask = normalized;
                this.logLifecycle(this.currentTask);
                this.notifyTaskListeners();
            }

            const studyMeta = this.taskMetaMap.get("study");
            this.updateStudyStarted(!!studyMeta?.studyStarted);

            const calibrationMeta = this.taskMetaMap.get("calibration");
            this.updateCalibrationPending(!!calibrationMeta?.calibrationPending);
        });

        this.taskMap.observe(() => {
            const raw = this.taskMap.get(this.activeTaskId);
            const normalized = this.normalizeTaskState(raw);
            if (normalized && raw && normalized !== raw) {
                this.taskMap.set(this.activeTaskId, normalized);
            }
            this.currentTask = normalized;
            this.logLifecycle(this.currentTask);
            this.notifyTaskListeners();
        });
    }

    private initializeProjection() {
        // if PCA then update it with any remote points
        if (this.projectionManager.getCurrentProjectionType() === "pca") {
            const pcaProjection = this.projectionManager.getCurrentProjection() as PCAProjection;
            pcaProjection.updatePCA(this.getLocalPoints().map((d) => d.pos3d));
        }

        // update PCA plane data if applicable
        const pcaPlaneData = this.projectionManager.getCurrentProjection().getPlaneSyncData();
        if (pcaPlaneData) {
            this.updatePlaneSyncData(pcaPlaneData);
        }
    }

    private initializeSelectionProjection() {
        const projectionMeta = this.taskMetaMap.get("projection");
        const counterbalanceProjection = isCounterbalanceEnabled()
            ? getCurrentCounterbalanceProjection()
            : null;
        const desiredProjection =
            projectionMeta?.projectionType ??
            counterbalanceProjection ??
            this.projectionManager.getCurrentProjectionType();

        if (desiredProjection && desiredProjection !== this.projectionManager.getCurrentProjectionType()) {
            this.projectionManager.setCurrentProjectionType(desiredProjection);
        }
        if (desiredProjection && isCounterbalanceEnabled()) {
            syncCounterbalanceIndex(desiredProjection);
        }
        if (desiredProjection && (!projectionMeta || projectionMeta.projectionType !== desiredProjection)) {
            this.setProjectionMeta(desiredProjection);
        }
    }

    public static async create(): Promise<SyncManager2D> {
        const manager = new SyncManager2D();
        await manager.waitForInitialSync();
        manager.initializeRemoteObserver();
        const meta = manager.taskMetaMap.get("active");
        manager.activeTaskId = meta?.activeTaskId ?? TASK2_ID;
        if (!meta) {
            manager.taskMetaMap.set("active", { activeTaskId: manager.activeTaskId });
        }
        manager.currentTask = manager.normalizeTaskState(manager.taskMap.get(manager.activeTaskId));
        manager.studyStarted = !!manager.taskMetaMap.get("study")?.studyStarted;
        manager.calibrationPending = !!manager.taskMetaMap.get("calibration")?.calibrationPending;
        if (!manager.taskMetaMap.get("calibration")) {
            manager.taskMetaMap.set("calibration", { calibrationPending: false });
            manager.calibrationPending = false;
        }
        manager.initializeSelectionProjection();
        if (manager.studyStarted) {
            if (!manager.currentTask || !manager.currentTask.targetPointId2D) {
                manager.ensureTaskTarget(manager.activeTaskId);
            } else {
                manager.logLifecycle(manager.currentTask);
            }
        }
        if (manager.studyStarted && manager.currentTask?.trial === 7) {
            manager.setNeutralColorsForTask3(manager.currentTask.trial7Assignments);
        }
        manager.notifyTaskListeners();

        manager.initializeProjection();

        return manager;
    }

    public transactPointUpdate(point: Point2D) {
        console.debug("Transacting point update for", point.id);
        this.ydoc.transact(() => {
            this.syncedPointDataMap.set(point.id, point.getLocalData());
        }, point);
    }

    public registerPoint(point: Point2D) {
        console.debug("registering point", point.id);
        this.localPointsById.set(point.id, point);

        // if remote exists, apply it without re-emitting
        const remote = this.syncedPointDataMap.get(point.id);
        if (remote) {
            console.log("applying existing remote data to newly registered point", point.id);
            point.applyRemoteData(remote);
            if (point.hasLockedColor()) {
                this.transactPointUpdate(point);
            }
        } else {
            // first writer writes initial state
            console.debug("no existing remote data for point", point.id);
            this.transactPointUpdate(point);
        }
    }

    public updatePlaneSyncData(planeData: PlaneSyncData) {
        this.ydoc.transact(() => {
            this.syncedPCADataMap.set("pca", planeData);
        }, this);
    }

    public getLocalPoints(): Point2D[] {
        return Array.from(this.localPointsById.values());
    }
    public getRemotePoints(): PointSyncData[] {
        return Array.from(this.syncedPointDataMap.values());
    }
    public getRemotePointById(id: string): PointSyncData | undefined {
        return this.syncedPointDataMap.get(id);
    }
    public getProjectionManager(): ProjectionManager {
        return this.projectionManager;
    }

    // PointIdProvider interface implementation
    public pickAngularDistributedIds(count: number): string[] {
        return selectPointsByAngularDistance(DEFAULT_POINT_CONFIGS, count);
    }

    public ensureTaskTarget(taskId: TaskId = this.activeTaskId) {
        if (!this.studyStarted) {
            return this.currentTask;
        }
        const meta = this.taskMetaMap.get("active");
        if (meta?.activeTaskId) {
            this.activeTaskId = meta.activeTaskId;
        }

        const existing = this.normalizeTaskState(this.taskMap.get(this.activeTaskId));
        if (existing && existing.targetPointId2D) {
            if (existing !== this.taskMap.get(this.activeTaskId)) {
                this.taskMap.set(this.activeTaskId, existing);
            }
            this.currentTask = existing;
            this.notifyTaskListeners();
            return existing;
        }

        // Start with the first enabled task based on flow config
        const firstTask = getFirstEnabledTask();
        if (!firstTask) {
            console.warn("No tasks enabled in flow config!");
            return this.currentTask;
        }

        if (firstTask === TASK1_ID) {
            this.startTask1();
        } else if (firstTask === TASK2_ID) {
            this.startTask2();
        } else if (firstTask === TASK3_ID) {
            this.startTask3();
        }
        return this.currentTask;
    }

    /**
     * Start Task 1 from the beginning
     */
    private startTask1() {
        this.resetAllPointColors();

        const taskState = createInitialTask1State(this, {
            projection: this.getSelectionProjection(),
        });
        console.log("Initial Task 1 state:", taskState);
        console.log(taskState.preselectedIndex, taskState.preselectedPointIds);
        if (!taskState) {
            console.warn("Unable to start Task 1: no selectable points");
            return;
        }

        this.taskMap.set(TASK1_ID, taskState);
        this.currentTask = taskState;
        this.setActiveTask(TASK1_ID);
        this.notifyTaskListeners();
    }

    /**
     * Start Task 2 from the beginning
     */
    private startTask2() {
        this.resetAllPointColors();

        const taskState = createInitialTask2State(this, {
            projection: this.getSelectionProjection(),
        });
        if (!taskState) {
            console.warn("Unable to start Task 2: no selectable points");
            return;
        }

        this.taskMap.set(TASK2_ID, taskState);
        this.currentTask = taskState;
        this.setActiveTask(TASK2_ID);
        this.notifyTaskListeners();
    }

    /**
     * Start Task 3 from the beginning
     */
    private startTask3() {
        this.resetAllPointColors();

        const taskState = createInitialTask3State(this, 5, {
            projection: this.getSelectionProjection(),
        });
        if (!taskState) {
            console.warn("Unable to start Task 3: not enough selectable points");
            return;
        }

        this.setNeutralColorsForTask3(taskState.trial7Assignments);
        this.taskMap.set(TASK3_ID, taskState);
        this.currentTask = taskState;
        this.setActiveTask(TASK3_ID);
        this.notifyTaskListeners();
    }

    /**
     * Handle selection from 2D side - unified handler for all tasks
     */
    public handleSelection2D(selectedPointId: string) {
        const existing = this.normalizeTaskState(this.taskMap.get(this.activeTaskId));
        if (!existing || existing.completed) return { isCorrect: false };

        const trial = existing.trial;
        let result: {
            updated: TaskState;
            isCorrect: boolean;
            shouldTransition?: boolean;
            shouldAdvancePair?: boolean;
        };

        if (isTask1Trial(trial)) {
            // Task 1: Only trials 2 and 4 are handled by 2D
            const task1Result = handleTask1Selection2D(existing, selectedPointId);
            result = { ...task1Result, shouldAdvancePair: false };
        } else if (isTask2Trial(trial)) {
            const task2Result = handleTask2Selection2D(existing, selectedPointId);
            result = { ...task2Result, shouldAdvancePair: false };
        } else if (isTask3Trial(trial)) {
            const task3Result = handleTask3Selection2D(existing, selectedPointId);
            result = {
                updated: task3Result.updated,
                isCorrect: task3Result.isCorrect,
                shouldTransition: task3Result.shouldAdvancePair,
                shouldAdvancePair: task3Result.shouldAdvancePair,
            };
        } else {
            return { isCorrect: false };
        }

        // Update state
        this.taskMap.set(this.activeTaskId, result.updated);
        this.currentTask = result.updated;
        this.notifyTaskListeners();

        // Schedule transition if needed
        if (result.shouldTransition || result.shouldAdvancePair) {
            this.scheduleNextTransition(result.updated);
        }

        return { isCorrect: result.isCorrect };
    }

    /**
     * Legacy method - redirects to handleSelection2D
     */
    public setTrial2SelectionResult(isCorrect: boolean, taskId: string = TASK1_ID) {
        // This method is called with the result already computed
        // We need to handle it differently - update state directly
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (!existing) return;
        const trial = existing.trial ?? 1;
        if ((trial !== 2 && trial !== 4) || !existing.targetPointId2D) return;
        if (existing.completed && existing.feedback === "success") return;

        const feedback = isCorrect ? "success" : "error";
        const updated: TaskState = {
            ...existing,
            feedback,
            completed: isCorrect,
        };
        this.taskMap.set(taskId, updated);
        this.currentTask = updated;
        this.notifyTaskListeners();

        if (isCorrect) {
            this.scheduleNextTransition(updated);
        }
    }

    /**
     * Handle Task 2 collaborative trial clicks from the 2D side.
     */
    public handleTask2Click2D(
        isCorrect: boolean,
        selectedPointId: string,
        taskId: string = TASK2_ID
    ) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (
            !existing ||
            (existing.trial !== 5 && existing.trial !== 6) ||
            !existing.targetPointId2D
        )
            return;
        if (existing.completed || existing.clicked2D) return;

        const updated: TaskState = {
            ...existing,
            clicked2D: isCorrect,
            feedback: !isCorrect ? "error" : existing.clicked3D ? "success" : "none",
            completed: isCorrect && !!existing.clicked3D,
            errorPointId2D: !isCorrect ? selectedPointId : null,
        };

        this.taskMap.set(taskId, updated);
        this.currentTask = updated;
        this.notifyTaskListeners();

        if (updated.completed) {
            this.scheduleNextTransition(updated);
        }
    }

    public handleTrial7Click2D(
        isCorrect: boolean,
        selectedPointId: string,
        taskId: string = TASK3_ID,
    ) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (!existing || existing.trial !== 7 || !existing.trial7Assignments) return;
        if (existing.completed) return;

        const result = handleTask3Selection2D(existing, selectedPointId);
        const updated = result.updated;

        this.taskMap.set(taskId, updated);
        this.currentTask = updated;
        this.notifyTaskListeners();

        if (updated.completed) {
            this.scheduleNextTransition(updated);
        }
    }

    private resetAllPointColors() {
        for (const p of this.localPointsById.values()) {
            p.clearErrorHighlight();
            const cfg = getDefaultPointConfig(p.id);
            if (cfg?.selectable === false) {
                if (cfg.color) {
                    const base = new Vector3(cfg.color.x, cfg.color.y, cfg.color.z);
                    p.setBaseColor(base);
                    p.setDisplayColor(base);
                }
                p.setSelectable(false);
                continue;
            }
            p.resetToBaseColor();
            p.setSelectable(true);
            this.transactPointUpdate(p);
        }
    }

    public resetForNextTrial() {
        this.resetAllPointColors();
    }

    public resetPointsToDefaultConfig() {
        for (const p of this.localPointsById.values()) {
            p.clearErrorHighlight();
            const cfg = getDefaultPointConfig(p.id);
            const baseColor = cfg?.color
                ? new Vector3(cfg.color.x, cfg.color.y, cfg.color.z)
                : new Vector3(1, 1, 1);
            const draggable = cfg?.draggable !== false;
            const selectable = cfg?.selectable !== false;
            p.setDraggable(draggable);
            p.setSelectable(selectable);
            p.setBaseColor(baseColor);
            p.setDisplayColor(baseColor);
            p.clearLockedColor();
            if (cfg) {
                p.pos3d = new Vector3(cfg.direction.x, cfg.direction.y, cfg.direction.z);
            }
        }
    }

    public resetTask3NeutralColors(assignments?: TaskState["trial7Assignments"] | null) {
        this.setNeutralColorsForTask3(assignments);
    }

    private setNeutralColorsForTask3(assignments?: TaskState["trial7Assignments"] | null) {
        const solvedIds = new Set<string>();
        if (assignments) {
            for (const entry of assignments) {
                if (entry.done2D && entry.done3D) {
                    solvedIds.add(entry.point2D);
                    solvedIds.add(entry.point3D);
                }
            }
        }

        for (const p of this.localPointsById.values()) {
            const cfg = getDefaultPointConfig(p.id);
            if (cfg?.selectable === false) {
                if (cfg.color) {
                    const base = new Vector3(cfg.color.x, cfg.color.y, cfg.color.z);
                    p.setBaseColor(base);
                    p.setDisplayColor(base);
                }
                p.setSelectable(false);
                continue;
            }
            if (solvedIds.has(p.id)) continue;
            p.setBaseColor(TASK3_NEUTRAL_COLOR);
            p.setDisplayColor(TASK3_NEUTRAL_COLOR);
            p.setSelectable(true);
        }
    }

    public setTrial(trial: 1 | 2 | 3 | 4, taskId: string = TASK1_ID) {
        this.setActiveTask(taskId as TaskId);
        this.resetAllPointColors();

        const precomputed = !isRandomSelectionEnabled()
            ? getPrecomputedTrialSelection(trial, { projection: this.getSelectionProjection() })
            : null;
        const pointIds = precomputed ?? this.pickAngularDistributedIds(1);
        const randomId = pointIds[0];

        const hintSide = trial === 1 || trial === 3 ? "2d" : "3d";
        const taskState = createTaskState(taskId, randomId, trial, hintSide);
        this.taskMap.set(taskId, taskState);
        this.currentTask = taskState;
        this.notifyTaskListeners();
    }

    /**
     * Unified transition scheduler - handles all task/trial transitions
     */
    private scheduleNextTransition(completedTask: TaskState) {
        if (this.transitionTimeout !== null) {
            window.clearTimeout(this.transitionTimeout);
            this.transitionTimeout = null;
        }

        const preAction = determineNextAction(completedTask);
        if (preAction.action === "all-complete") {
            return;
        }
        if (preAction.action !== "advance-pair") {
            if (!this.calibrationPending) {
                window.setTimeout(() => {
                    if (this.calibrationPending) {
                        return;
                    }
                    this.setCalibrationPending(true, completedTask);
                }, CALIBRATION_DELAY_MS);
            }
            return;
        }

        this.transitionTimeout = window.setTimeout(() => {
            this.transitionTimeout = null;

            // Verify the task is still completed
            const latest = this.normalizeTaskState(this.taskMap.get(completedTask.id));
            if (!latest || !latest.completed) {
                return;
            }

            // Determine what to do next
            const action = determineNextAction(latest);
            console.log(
                `[2D] Transition action: ${action.action}`,
                action.nextTaskId ? `-> ${action.nextTaskId}` : "",
            );

            switch (action.action) {
                case "next-trial": {
                    this.resetAllPointColors();
                    const nextState = createNextState(latest, action, this, {
                        projection: this.getSelectionProjection(),
                    });
                    if (nextState) {
                        const taskId = getTaskIdFromFlowState(getTaskFlowState(nextState));
                        this.setActiveTask(taskId);
                        this.taskMap.set(taskId, nextState);
                        this.currentTask = nextState;
                        this.notifyTaskListeners();
                    }
                    break;
                }
                case "next-task": {
                    if (action.nextTaskId === TASK2_ID) {
                        console.log("🎉 Task 1 complete! Starting Task 2...");
                        this.startTask2();
                    } else if (action.nextTaskId === TASK3_ID) {
                        console.log("🎉 Task 2 complete! Starting Task 3...");
                        this.startTask3();
                    }
                    break;
                }
                case "advance-pair": {
                    const nextState = createNextState(latest, action, this, {
                        projection: this.getSelectionProjection(),
                    });
                    if (nextState) {
                        this.taskMap.set(TASK3_ID, nextState);
                        this.currentTask = nextState;
                        this.notifyTaskListeners();
                    }
                    break;
                }
                case "all-complete": {
                    console.log("🎉🎉🎉 All tasks complete!");
                    break;
                }
            }
        }, TRANSITION_DELAY_MS);
    }

    private notifyTaskListeners() {
        for (const listener of this.taskListeners) {
            listener(this.currentTask);
        }
    }

    private updateStudyStarted(started: boolean) {
        if (this.studyStarted === started) {
            return;
        }
        this.studyStarted = started;
        for (const listener of this.studyListeners) {
            listener(started);
        }
    }

    private updateCalibrationPending(pending: boolean) {
        if (this.calibrationPending === pending) {
            return;
        }
        this.calibrationPending = pending;
        for (const listener of this.calibrationListeners) {
            listener(pending);
        }
    }

    public onTaskStateChange(listener: (task: TaskState | null) => void) {
        this.taskListeners.add(listener);
        listener(this.currentTask);
        return () => {
            this.taskListeners.delete(listener);
        };
    }

    public onStudyStartedChange(listener: (started: boolean) => void) {
        this.studyListeners.add(listener);
        listener(this.studyStarted);
        return () => {
            this.studyListeners.delete(listener);
        };
    }

    public isStudyStarted(): boolean {
        return this.studyStarted;
    }

    public setStudyStarted(started: boolean) {
        if (this.studyStarted === started) {
            return;
        }
        this.updatingMeta = true;
        this.taskMetaMap.set("study", { studyStarted: started });
        this.updatingMeta = false;
        this.updateStudyStarted(started);
    }

    public onCalibrationPendingChange(listener: (pending: boolean) => void) {
        this.calibrationListeners.add(listener);
        listener(this.calibrationPending);
        return () => {
            this.calibrationListeners.delete(listener);
        };
    }

    public isCalibrationPending(): boolean {
        return this.calibrationPending;
    }

    public setCalibrationPending(pending: boolean, taskState?: TaskState) {
        if (this.calibrationPending === pending) {
            return;
        }
        const payload: TaskMeta = { calibrationPending: pending };
        if (pending && taskState) {
            payload.calibrationTaskId = taskState.id as TaskId;
            payload.calibrationTrial = taskState.trial;

            // Neutralize the just-completed task state so highlights from the previous
            // trial do not re-appear during calibration. Keep identifiers/trial numbers
            // so flow decisions still work after calibration.
            const neutralized: TaskState = {
                ...taskState,
                targetPointId2D: null,
                targetPointId3D: null,
                feedback: "none",
                clicked2D: false,
                clicked3D: false,
                errorPointId2D: null,
                errorPointId3D: null,
            };
            this.taskMap.set(taskState.id as TaskId, neutralized);
            this.currentTask = neutralized;
        }
        this.updatingMeta = true;
        this.taskMetaMap.set("calibration", payload);
        this.updatingMeta = false;
        this.updateCalibrationPending(pending);
    }

    public getCurrentTask(): TaskState | null {
        return this.currentTask;
    }

    /**
     * Switch to a new projection and restart the task flow from the beginning.
     * Used for counterbalance mode where participants complete all tasks multiple times
     * with different projections.
     */
    public switchProjectionAndRestartTasks(
        projectionType: "equirectangular" | "pca" | "vertical" | "horizontal",
    ) {
        console.log(
            `[SyncManager2D] Switching to projection: ${projectionType} and restarting tasks`,
        );

        this.applyProjection(projectionType);

        // Start fresh from Task 1
        const firstTask = getFirstEnabledTask();
        if (firstTask === TASK1_ID) {
            this.startTask1();
        } else if (firstTask === TASK2_ID) {
            this.startTask2();
        } else if (firstTask === TASK3_ID) {
            this.startTask3();
        }
    }
}

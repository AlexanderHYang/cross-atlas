import * as BABYLON from "@babylonjs/core";
import * as Y from "yjs";
import { PlaneSyncData, PointSyncData } from "../../shared/src/sync";
import { Point3D } from "./Point3D";
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
    TRANSITION_DELAY_MS,
    getTaskFlowState,
    getTaskIdFromFlowState,
    determineNextAction,
    createNextState,
    createInitialTask2State,
    createInitialTask3State,
    logTaskLifecycle,
    handleTask1Selection3D,
    handleTask2Selection3D,
    handleTask3Selection3D,
    isTask1Trial,
    isTask2Trial,
    isTask3Trial,
    type PointIdProvider,
} from "../../shared/src/tasks";
import { DEFAULT_POINT_CONFIGS, getDefaultPointConfig } from "../../shared/src/defaultPoints";
import { selectPointsByAngularDistance } from "../../shared/src/angularPointSelection";
import {
    getPrecomputedTrialSelection,
    isRandomSelectionEnabled,
} from "../../shared/src/pointSelections";
import type { ProjectionType } from "../../shared/src/pointSelections";
import { TimedLogEvent } from "../../shared/src/logging";

const TASK3_NEUTRAL_COLOR = new BABYLON.Color3(1, 1, 1);
const CALIBRATION_DELAY_MS = 1000;

export class SyncManager3D implements PointIdProvider {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;

    private localPointsById: Map<string, Point3D>;
    private syncedPointDataMap: Y.Map<PointSyncData>;
    private logArray: Y.Array<TimedLogEvent>;
    private taskMap: Y.Map<TaskState>;
    private taskMetaMap: Y.Map<TaskMeta>;
    private currentTask: TaskState | null = null;
    private lastLoggedTask: TaskState | null = null;
    private taskListeners: Set<(task: TaskState | null) => void> = new Set();
    private syncedPCADataMap: Y.Map<PlaneSyncData>;
    private transitionTimeout: number | null = null;
    private activeTaskId: TaskId = TASK1_ID;
    private updatingMeta = false;
    private studyStarted = false;
    private calibrationPending = false;
    private calibrationListeners: Set<(pending: boolean) => void> = new Set();
    private studyListeners: Set<(started: boolean) => void> = new Set();
    private currentProjectionType: ProjectionType = "equirectangular";
    private pendingCalibrationCompletion = false;

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
        this.localPointsById = new Map<string, Point3D>();
        this.syncedPointDataMap = this.ydoc.getMap("charts") as Y.Map<PointSyncData>;
        this.logArray = this.ydoc.getArray("logArray") as Y.Array<TimedLogEvent>;
        this.taskMap = this.ydoc.getMap(TASK_COLLECTION) as Y.Map<TaskState>;
        this.taskMetaMap = this.ydoc.getMap(TASK_META_COLLECTION) as Y.Map<TaskMeta>;
        this.syncedPCADataMap = this.ydoc.getMap("pca") as Y.Map<PlaneSyncData>;

        const projectionOption = import.meta.env.VITE_PROJECTION;
        if (projectionOption === "pca") {
            this.currentProjectionType = "pca";
        } else if (projectionOption === "vertical") {
            this.currentProjectionType = "vertical";
        } else if (projectionOption === "horizontal") {
            this.currentProjectionType = "horizontal";
        }

        // this might be unneeded?
        // 3) initialize existing remote charts
        // this.provider.once("sync", () => {
        //     console.log("initializing charts from remote");
        //     for (const c of this.syncedChartDataMap.values()) {
        //         if (this.localChartsById.has(c.id)) {
        //             continue;
        //         }
        //         const randomChart = new Chart('line', this.scene);
        //         const chart3d = new Chart3D(c.id, randomChart, this);
        //         console.log("initializing chart from remote:", c);
        //         this.localChartsById.set(chart3d.id, chart3d);
        //     }
        // });
    }

    private waitForInitialSync(): Promise<void> {
        return new Promise((resolve) => {
            this.provider.once("sync", () => {
                resolve();
            });
        });
    }

    public getLogArray(): Y.Array<TimedLogEvent> {
        return this.logArray;
    }

    private logLifecycle(next: TaskState | null) {
        logTaskLifecycle(this.lastLoggedTask, next, "3D");
        this.lastLoggedTask = next;
    }

    private setActiveTask(taskId: TaskId) {
        this.activeTaskId = taskId;
        this.updatingMeta = true;
        this.taskMetaMap.set("active", { activeTaskId: taskId });
        this.updatingMeta = false;
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
            trial7Assignments === task.trial7Assignments &&
            preselectedPointIds === task.preselectedPointIds &&
            preselectedIndex === task.preselectedIndex
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

    private getSelectionProjection(): ProjectionType {
        return this.currentProjectionType;
    }

    private initializeRemoteObserver(plane: BABYLON.Mesh) {
        this.syncedPointDataMap.observe((event, transaction) => {
            for (const key of event.keysChanged) {
                const remoteData = this.syncedPointDataMap.get(key);
                if (!remoteData) {
                    continue;
                }
                const point = this.localPointsById.get(key);
                if (!point) {
                    continue;
                }

                // skip changes originated from this local point update
                if (transaction.origin === point) {
                    continue;
                }

                // apply remote data to local point
                point.applyRemoteData(remoteData);
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

            const projectionMeta = this.taskMetaMap.get("projection");
            if (projectionMeta?.projectionType) {
                this.currentProjectionType = projectionMeta.projectionType;
            }
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

            if (
                !this.calibrationPending &&
                this.pendingCalibrationCompletion &&
                this.currentTask?.completed
            ) {
                this.pendingCalibrationCompletion = false;
                this.scheduleNextTransition(this.currentTask, { skipCalibration: true });
            }
        });

        this.syncedPCADataMap.observe((event) => {
            // currently only one PCA entry expected with key "pca"
            for (const key of event.keysChanged) {
                const pcaData = this.syncedPCADataMap.get(key);
                this.applyPCADataToPlane(plane, pcaData);
            }
        });
    }

    public static async create(plane: BABYLON.Mesh): Promise<SyncManager3D> {
        const manager = new SyncManager3D();
        await manager.waitForInitialSync();
        manager.applyPlaneFromExistingPCAData(plane);
        manager.initializeRemoteObserver(plane);
        const meta = manager.taskMetaMap.get("active");
        manager.activeTaskId = meta?.activeTaskId ?? TASK2_ID;
        if (!meta) {
            manager.taskMetaMap.set("active", { activeTaskId: manager.activeTaskId });
        }
        manager.currentTask = manager.normalizeTaskState(manager.taskMap.get(manager.activeTaskId));
        manager.studyStarted = !!manager.taskMetaMap.get("study")?.studyStarted;
        if (!manager.taskMetaMap.get("study")) {
            manager.taskMetaMap.set("study", { studyStarted: false });
            manager.studyStarted = false;
        }
        manager.calibrationPending = !!manager.taskMetaMap.get("calibration")?.calibrationPending;
        if (!manager.taskMetaMap.get("calibration")) {
            manager.taskMetaMap.set("calibration", { calibrationPending: false });
            manager.calibrationPending = false;
        }
        const projectionMeta = manager.taskMetaMap.get("projection");
        if (projectionMeta?.projectionType) {
            manager.currentProjectionType = projectionMeta.projectionType;
        }
        if (!manager.currentTask) {
            manager.taskMap.set(manager.activeTaskId, {
                id: manager.activeTaskId,
                targetPointId2D: null, // todo: is this right?
                trial: 1,
                hintSide: "2d",
                feedback: "none",
                completed: false,
            });
            manager.currentTask = manager.normalizeTaskState(
                manager.taskMap.get(manager.activeTaskId)
            );
        } else {
            manager.logLifecycle(manager.currentTask);
        }
        if (manager.currentTask?.trial === 7) {
            manager.setNeutralColorsForTask3(manager.currentTask.trial7Assignments);
        }
        manager.notifyTaskListeners();
        return manager;
    }

    public transactPointUpdate(point: Point3D) {
        console.debug("Transacting point update for", point.id);
        this.ydoc.transact(() => {
            this.syncedPointDataMap.set(point.id, point.getLocalData());
        }, point);
    }

    public registerPoint(point: Point3D) {
        console.debug("registering point", point.id);

        if (this.localPointsById.has(point.id)) {
            console.warn("Point with id", point.id, "is already registered.");
            return;
        }
        this.localPointsById.set(point.id, point);

        // if remote exists, apply it without re-emitting
        const remote = this.syncedPointDataMap.get(point.id);
        if (remote) {
            console.debug("applying existing remote data to newly registered point", point.id);
            point.applyRemoteData(remote);
            this.transactPointUpdate(point);
        } else {
            // first writer writes initial state
            console.debug("no existing remote data for point", point.id);
            this.transactPointUpdate(point);
        }
    }

    private notifyTaskListeners() {
        for (const listener of this.taskListeners) {
            listener(this.currentTask);
        }
    }

    public onTaskStateChange(listener: (task: TaskState | null) => void) {
        this.taskListeners.add(listener);
        listener(this.currentTask);
        return () => {
            this.taskListeners.delete(listener);
        };
    }

    public onCalibrationPendingChange(listener: (pending: boolean) => void) {
        this.calibrationListeners.add(listener);
        listener(this.calibrationPending);
        return () => {
            this.calibrationListeners.delete(listener);
        };
    }

    public onStudyStartedChange(listener: (started: boolean) => void) {
        this.studyListeners.add(listener);
        listener(this.studyStarted);
        return () => {
            this.studyListeners.delete(listener);
        };
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

    public isStudyStarted(): boolean {
        return this.studyStarted;
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

            // Neutralize the completed task state so old highlights don't flash during calibration.
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

    public completeCalibration() {
        if (!this.calibrationPending) {
            return;
        }
        this.setCalibrationPending(false);
        const latest = this.currentTask
            ? this.normalizeTaskState(this.currentTask)
            : this.normalizeTaskState(this.taskMap.get(this.activeTaskId));
        if (!latest || !latest.completed) {
            this.pendingCalibrationCompletion = true;
            return;
        }
        this.pendingCalibrationCompletion = false;
        this.scheduleNextTransition(latest, { skipCalibration: true });
    }

    public getCurrentTask(): TaskState | null {
        return this.currentTask;
    }

    // PointIdProvider interface implementation
    public pickAngularDistributedIds(count: number): string[] {
        return selectPointsByAngularDistance(DEFAULT_POINT_CONFIGS, count);
    }

    /**
     * Handle successful 3D selection in Task 1 (trials 1 or 3)
     */
    public markGuessTrialSuccess(taskId: string = TASK1_ID) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (!existing) return;
        const trial = existing.trial ?? 1;
        if (trial !== 1 && trial !== 3) return;

        const updated: TaskState = {
            ...existing,
            feedback: "success",
            completed: true,
        };
        this.taskMap.set(taskId, updated);
        this.currentTask = updated;
        this.notifyTaskListeners();

        // Schedule transition to next trial
        this.scheduleNextTransition(updated);
    }

    /**
     * Handle Task 1 trial clicks from the 3D side (trials 1 or 3).
     * Updates error sync on incorrect clicks so both sides show the same error sphere.
     */
    public handleTask1Click3D(
        isCorrect: boolean,
        selectedPointId: string,
        taskId: string = TASK1_ID
    ) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (!existing || (existing.trial !== 1 && existing.trial !== 3)) return;
        if (existing.completed) return;

        const result = handleTask1Selection3D(existing, selectedPointId);
        const updated = result.updated;

        this.taskMap.set(taskId, updated);
        this.currentTask = updated;
        this.notifyTaskListeners();

        if (result.shouldTransition) {
            this.scheduleNextTransition(updated);
        }
    }

    /**
     * Handle Task 2 collaborative trial clicks from the 3D side.
     */
    public handleTask2Click3D(
        isCorrect: boolean,
        selectedPointId: string,
        taskId: string = TASK2_ID
    ) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (
            !existing ||
            (existing.trial !== 5 && existing.trial !== 6) ||
            !existing.targetPointId3D
        )
            return;
        if (existing.completed || existing.clicked3D) return;

        const updated: TaskState = {
            ...existing,
            clicked3D: isCorrect,
            feedback: !isCorrect ? "error" : existing.clicked2D ? "success" : "none",
            completed: isCorrect && !!existing.clicked2D,
            errorPointId3D: !isCorrect ? selectedPointId : null,
        };

        this.taskMap.set(taskId, updated);
        this.currentTask = updated;
        this.notifyTaskListeners();

        if (updated.completed) {
            this.scheduleNextTransition(updated);
        }
    }

    public handleTrial7Click3D(
        isCorrect: boolean,
        selectedPointId: string,
        taskId: string = TASK3_ID
    ) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (!existing || existing.trial !== 7 || !existing.trial7Assignments) return;
        if (existing.completed) return;

        const result = handleTask3Selection3D(existing, selectedPointId);
        const updated = result.updated;

        this.taskMap.set(taskId, updated);
        this.currentTask = updated;
        this.notifyTaskListeners();

        if (updated.completed) {
            this.scheduleNextTransition(updated);
        }
    }

    public setTrial(trial: 1 | 2 | 3 | 4, taskId: string = TASK1_ID) {
        this.setActiveTask(taskId as TaskId);
        const precomputed = !isRandomSelectionEnabled()
            ? getPrecomputedTrialSelection(trial, { projection: this.getSelectionProjection() })
            : null;
        const pointIds = precomputed ?? this.pickAngularDistributedIds(1);
        const nextTarget = pointIds[0];

        const hintSide = trial === 1 || trial === 3 ? "2d" : "3d";
        const nextState: TaskState = {
            id: taskId,
            targetPointId2D: nextTarget,
            trial,
            hintSide,
            feedback: "none",
            completed: false,
        };
        this.taskMap.set(taskId, nextState);
        this.currentTask = nextState;
        this.notifyTaskListeners();
    }

    /**
     * Unified transition scheduler - handles all task/trial transitions
     */
    private scheduleNextTransition(
        completedTask: TaskState,
        options?: { skipCalibration?: boolean }
    ) {
        if (this.transitionTimeout !== null) {
            window.clearTimeout(this.transitionTimeout);
            this.transitionTimeout = null;
        }

        if (!options?.skipCalibration) {
            const action = determineNextAction(completedTask);
            if (action.action === "all-complete") {
                return;
            }
            if (action.action !== "advance-pair") {
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
                `[3D] Transition action: ${action.action}`,
                action.nextTaskId ? `-> ${action.nextTaskId}` : ""
            );

            switch (action.action) {
                case "next-trial": {
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

    /**
     * Start Task 2 from the beginning
     */
    private startTask2() {
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
                    const base = new BABYLON.Color3(cfg.color.x, cfg.color.y, cfg.color.z);
                    p.setPermanentColor(base);
                }
                p.setSelectable(false);
                continue;
            }
            if (solvedIds.has(p.id)) continue;
            p.setPermanentColor(TASK3_NEUTRAL_COLOR);
            p.setSelectable(true);
        }
    }

    private applyPlaneFromExistingPCAData(plane: BABYLON.Mesh) {
        const existing = this.syncedPCADataMap.get("pca");
        this.applyPCADataToPlane(plane, existing);
    }

    private applyPCADataToPlane(plane: BABYLON.Mesh, data: PlaneSyncData | undefined) {
        if (!data) {
            return;
        }

        plane.position.set(data.mean.x, data.mean.y, data.mean.z);
        const normalVec = new BABYLON.Vector3(data.normal.x, data.normal.y, data.normal.z);
        if (normalVec.lengthSquared() === 0) {
            return;
        }

        plane.setDirection(normalVec.normalize());
        console.log("Updated PCA plane from sync:", data);
    }
}

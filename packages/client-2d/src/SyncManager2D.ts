import * as Y from "yjs";
import { PlaneSyncData, PointSyncData } from "../../shared/src/sync";
import { Point2D } from "./Point2D";
import { WebsocketProvider } from "y-websocket";
import { PCAManager } from "./PCAManager";
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
import { getDefaultPointConfig } from "../../shared/src/defaultPoints";
import { Vector3 } from "@babylonjs/core";
import { ProjectionManager } from "./ProjectionManager";

const TASK3_NEUTRAL_COLOR = new Vector3(1, 1, 1);

export class SyncManager2D implements PointIdProvider {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;

    private localPointsById: Map<string, Point2D>;

    private syncedPointDataMap: Y.Map<PointSyncData>;
    private taskMap: Y.Map<TaskState>;
    private taskMetaMap: Y.Map<TaskMeta>;
    private syncedPCADataMap: Y.Map<PlaneSyncData>;

    private projectionManager = new ProjectionManager();
    private currentTask: TaskState | null = null;
    private lastLoggedTask: TaskState | null = null;
    private taskListeners: Set<(task: TaskState | null) => void> = new Set();
    private activeTaskId: TaskId = TASK1_ID;
    private transitionTimeout: number | null = null;
    private updatingMeta = false;

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
        this.taskMap = this.ydoc.getMap(TASK_COLLECTION) as Y.Map<TaskState>;
        this.taskMetaMap = this.ydoc.getMap(TASK_META_COLLECTION) as Y.Map<TaskMeta>;
        this.syncedPCADataMap = this.ydoc.getMap("pca") as Y.Map<PlaneSyncData>;
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
        };
    }

    private waitForInitialSync(): Promise<void> {
        return new Promise((resolve) => {
            this.provider.once("sync", () => {
                console.log("Initializing points from remote");
                for (const c of this.syncedPointDataMap.values()) {
                    const p = new Point2D(c.id, this);
                    p.applyDefaultConfig();
                    p.applyRemoteData(c, this.projectionManager);
                    console.log("initializing point from remote:", c);
                    if (p.hasLockedColor() || p.hasPositionLock()) {
                        this.transactPointUpdate(p);
                    }
                    this.localPointsById.set(p.id, p);
                }
                resolve();
            });
        });
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
                point.applyRemoteData(remoteData, this.projectionManager);
                if (point.hasLockedColor() || point.hasPositionLock()) {
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
        if (!manager.currentTask || !manager.currentTask.targetPointId2D) {
            manager.ensureTaskTarget(manager.activeTaskId);
        } else {
            manager.logLifecycle(manager.currentTask);
        }
        if (manager.currentTask?.trial === 7) {
            manager.setNeutralColorsForTask3(manager.currentTask.trial7Assignments);
        }
        manager.notifyTaskListeners();
        return manager;
    }

    public transactPointUpdate(point: Point2D) {
        console.debug("Transacting point update for", point.id);
        this.ydoc.transact(() => {
            const existing = this.syncedPointDataMap.get(point.id);
            this.syncedPointDataMap.set(point.id, point.getLocalData(existing, this.projectionManager));
        }, point);
    }

    public registerPoint(point: Point2D) {
        console.debug("registering point", point.id);

        if (this.localPointsById.has(point.id)) {
            console.warn("Point with id", point.id, "is already registered.");
            return;
        }
        this.localPointsById.set(point.id, point);
        point.applyDefaultConfig();

        // if remote exists, apply it without re-emitting
        const remote = this.syncedPointDataMap.get(point.id);
        if (remote) {
            console.log("applying existing remote data to newly registered point", point.id);
            point.applyRemoteData(remote, this.projectionManager);
            if (point.hasLockedColor() || point.hasPositionLock()) {
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
    public pickRandomTargetId(): string | null {
        const candidateIds = Array.from(this.localPointsById.values())
            .filter((pt) => {
                const cfg = getDefaultPointConfig(pt.id);
                if (cfg && cfg.selectable === false) {
                    return false;
                }
                return true;
            })
            .map((pt) => pt.id);

        if (candidateIds.length === 0) {
            return null;
        }

        const randomId = candidateIds[Math.floor(Math.random() * candidateIds.length)];
        return randomId;
    }

    public pickDistinctTargetIds(count: number): string[] | null {
        const candidateIds = Array.from(this.localPointsById.values())
            .filter((pt) => {
                const cfg = getDefaultPointConfig(pt.id);
                if (cfg && cfg.selectable === false) {
                    return false;
                }
                return true;
            })
            .map((pt) => pt.id);

        if (candidateIds.length < count) {
            return null;
        }

        // Shuffle and take first `count` elements
        const shuffled = [...candidateIds].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    public ensureTaskTarget(taskId: TaskId = this.activeTaskId) {
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
        this.setActiveTask(TASK1_ID);
        this.resetAllPointColors();

        const taskState = createInitialTask1State(this);
        if (!taskState) {
            console.warn("Unable to start Task 1: no selectable points");
            return;
        }

        this.taskMap.set(TASK1_ID, taskState);
        this.currentTask = taskState;
        this.notifyTaskListeners();
    }

    /**
     * Start Task 2 from the beginning
     */
    private startTask2() {
        this.setActiveTask(TASK2_ID);
        this.resetAllPointColors();

        const taskState = createInitialTask2State(this);
        if (!taskState) {
            console.warn("Unable to start Task 2: no selectable points");
            return;
        }

        this.taskMap.set(TASK2_ID, taskState);
        this.currentTask = taskState;
        this.notifyTaskListeners();
    }

    /**
     * Start Task 3 from the beginning
     */
    private startTask3() {
        this.setActiveTask(TASK3_ID);
        this.resetAllPointColors();

        const taskState = createInitialTask3State(this);
        if (!taskState) {
            console.warn("Unable to start Task 3: not enough selectable points");
            return;
        }

        this.setNeutralColorsForTask3(taskState.trial7Assignments);
        this.taskMap.set(TASK3_ID, taskState);
        this.currentTask = taskState;
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

        // Clear trial 7 error after the flash so repeated incorrect clicks still sync
        if (isTask3Trial(trial) && !result.isCorrect) {
            const errorId = selectedPointId;
            window.setTimeout(() => {
                const latest = this.normalizeTaskState(this.taskMap.get(this.activeTaskId));
                if (!latest || latest.trial !== 7) return;
                if (latest.errorPointId2D !== errorId) return;
                const cleared: TaskState = { ...latest, errorPointId2D: null };
                this.taskMap.set(this.activeTaskId, cleared);
                this.currentTask = cleared;
                this.notifyTaskListeners();
            }, result.updated.errorPointId2D ? 850 : 850);
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
    public handleTask2Click2D(isCorrect: boolean, taskId: string = TASK2_ID) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (
            !existing ||
            (existing.trial !== 5 && existing.trial !== 6) ||
            !existing.targetPointId2D
        )
            return;
        if (existing.completed) return;

        const updated: TaskState = {
            ...existing,
            clicked2D: isCorrect,
            feedback: !isCorrect ? "error" : existing.clicked3D ? "success" : "none",
            completed: isCorrect && !!existing.clicked3D,
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
        taskId: string = TASK3_ID
    ) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (!existing || existing.trial !== 7 || !existing.trial7Assignments) return;
        if (existing.completed) return;

        const result = handleTask3Selection2D(existing, selectedPointId);
        const updated = result.updated;

        this.taskMap.set(taskId, updated);
        this.currentTask = updated;
        this.notifyTaskListeners();

        if (!result.isCorrect) {
            window.setTimeout(() => {
                const latest = this.normalizeTaskState(this.taskMap.get(taskId));
                if (!latest || latest.trial !== 7) return;
                if (latest.errorPointId2D !== selectedPointId) return;
                const cleared: TaskState = { ...latest, errorPointId2D: null };
                this.taskMap.set(taskId, cleared);
                this.currentTask = cleared;
                this.notifyTaskListeners();
            }, 850);
        }

        if (updated.completed) {
            this.scheduleNextTransition(updated);
        }
    }

    private resetAllPointColors() {
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
            p.resetToBaseColor();
            p.setSelectable(true);
        }
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

        const randomId = this.pickRandomTargetId();
        if (!randomId) {
            return;
        }

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
                action.nextTaskId ? `-> ${action.nextTaskId}` : ""
            );

            switch (action.action) {
                case "next-trial": {
                    this.resetAllPointColors();
                    const nextState = createNextState(latest, action, this);
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
                    const nextState = createNextState(latest, action, this);
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

    public onTaskStateChange(listener: (task: TaskState | null) => void) {
        this.taskListeners.add(listener);
        listener(this.currentTask);
        return () => {
            this.taskListeners.delete(listener);
        };
    }

    public getCurrentTask(): TaskState | null {
        return this.currentTask;
    }
}

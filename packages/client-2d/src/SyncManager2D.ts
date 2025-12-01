import * as Y from "yjs";
import { PCASyncData, PointSyncData } from "../../shared/src/sync";
import { Point2D } from "./Point2D";
import { WebsocketProvider } from "y-websocket";
import { PCAManager } from "./PCAManager";
import { TaskState, TASK_COLLECTION, TASK1_ID, createTaskState } from "../../shared/src/task";
import { getDefaultPointConfig } from "../../shared/src/defaultPoints";
import { Vector3 } from "@babylonjs/core";

export class SyncManager2D {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;

    private localPointsById: Map<string, Point2D>;

    private syncedPointDataMap: Y.Map<PointSyncData>;
    private taskMap: Y.Map<TaskState>;
    private syncedPCADataMap: Y.Map<PCASyncData>;

    private pcaManager = new PCAManager(3);
    private currentTask: TaskState | null = null;
    private taskListeners: Set<(task: TaskState | null) => void> = new Set();

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
        this.syncedPCADataMap = this.ydoc.getMap("pca") as Y.Map<PCASyncData>;
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

        if (
            trial === (task as any).trial &&
            hintSide === task.hintSide &&
            feedback === task.feedback &&
            completed === task.completed &&
            clicked2D === task.clicked2D &&
            clicked3D === task.clicked3D &&
            targetPointId3D === task.targetPointId3D
        ) {
            return task;
        }

        return {
            id: task.id,
            targetPointId: task.targetPointId,
            trial,
            hintSide,
            feedback,
            completed,
            clicked2D,
            clicked3D,
            targetPointId3D,
        };
    }

    private waitForInitialSync(): Promise<void> {
        return new Promise((resolve) => {
            this.provider.once("sync", () => {
                console.log("initializing points from remote");
                for (const c of this.syncedPointDataMap.values()) {
                    const p = new Point2D(c.id, this);
                    p.applyDefaultConfig();
                    p.applyRemoteData(c, this.pcaManager);
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
                point.applyRemoteData(remoteData, this.pcaManager);
                if (point.hasLockedColor() || point.hasPositionLock()) {
                    this.transactPointUpdate(point);
                }
            }
        });

        this.taskMap.observe(() => {
            const raw = this.taskMap.get(TASK1_ID);
            const normalized = this.normalizeTaskState(raw);
            if (normalized && raw && normalized !== raw) {
                this.taskMap.set(TASK1_ID, normalized);
            }
            this.currentTask = normalized;
            this.notifyTaskListeners();
        });
    }

    public static async create(): Promise<SyncManager2D> {
        const manager = new SyncManager2D();
        await manager.waitForInitialSync();
        manager.initializeRemoteObserver();
        manager.currentTask = manager.normalizeTaskState(manager.taskMap.get(TASK1_ID));
        manager.notifyTaskListeners();
        return manager;
    }

    public transactPointUpdate(point: Point2D) {
        console.log("transacting point update for", point.id);
        this.ydoc.transact(() => {
            const existing = this.syncedPointDataMap.get(point.id);
            this.syncedPointDataMap.set(point.id, point.getLocalData(existing, this.pcaManager));
        }, point);
    }

    public registerPoint(point: Point2D) {
        console.log("registering point", point.id);

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
            point.applyRemoteData(remote, this.pcaManager);
            if (point.hasLockedColor() || point.hasPositionLock()) {
                this.transactPointUpdate(point);
            }
        } else {
            // first writer writes initial state
            console.log("no existing remote data for point", point.id);
            this.transactPointUpdate(point);
        }
    }

    public updatePCA() {
        // first update PCA based on all remote points
        this.pcaManager.update(
            this.getRemotePoints().map((d) => new Vector3(d.position.x, d.position.y, d.position.z))
        );

        // then transact PCA data
        const mean = this.pcaManager.getMean();
        const normal = this.pcaManager.getNormal();
        this.ydoc.transact(() => {
            this.syncedPCADataMap.set("pca", {
                mean: { x: mean.x, y: mean.y, z: mean.z },
                normal: { x: normal.x, y: normal.y, z: normal.z },
            });
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
    public getPCAManager(): PCAManager {
        return this.pcaManager;
    }

    private pickRandomTargetId() {
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

    public ensureTaskTarget(taskId: string = TASK1_ID) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (existing && existing.targetPointId) {
            if (existing !== this.taskMap.get(taskId)) {
                this.taskMap.set(taskId, existing);
            }
            this.currentTask = existing;
            this.notifyTaskListeners();
            return existing;
        }

        this.setTrial(1, taskId);
        return this.currentTask;
    }

    public setTrial2SelectionResult(isCorrect: boolean, taskId: string = TASK1_ID) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (!existing) return;
        const trial = existing.trial ?? 1;
        if ((trial !== 2 && trial !== 4) || !existing.targetPointId) return;
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
            const nextTrial: 1 | 2 | 3 | 4 | "collab" = trial === 2 ? 3 : "collab";
            window.setTimeout(() => {
                if (nextTrial === "collab") {
                    this.startCollaborativeTrial(taskId);
                } else {
                    this.setTrial(nextTrial, taskId);
                }
            }, 2000);
        }
    }

    /**
     * Handle Task 2 collaborative trial clicks from the 2D side.
     */
    public handleTask2Click2D(isCorrect: boolean, taskId: string = TASK1_ID) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (!existing || (existing.trial !== 5 && existing.trial !== 6) || !existing.targetPointId) return;
        if (existing.completed) return;

        const updated: TaskState = {
            ...existing,
            clicked2D: isCorrect,
            feedback: !isCorrect ? "error" : existing.clicked3D ? "success" : "none",
            completed: isCorrect && !!existing.clicked3D,
        };

        if (updated.completed) {
            console.log("🎉 TRIAL 5 COMPLETED! Both sides clicked correctly.");
            if (existing.trial === 5) {
                this.scheduleTrial6Repeat(updated);
            }
        }

        this.taskMap.set(taskId, updated);
        this.currentTask = updated;
        this.notifyTaskListeners();
    }

    private resetAllPointColors() {
        for (const p of this.localPointsById.values()) {
            p.resetToBaseColor();
        }
    }

    public setTrial(trial: 1 | 2 | 3 | 4, taskId: string = TASK1_ID) {
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

    private startCollaborativeTrial(taskId: string = TASK1_ID) {
        const target2D = this.pickRandomTargetId();
        const target3D = this.pickRandomTargetId();
        if (!target2D || !target3D) {
            console.warn("Unable to start collaborative trial: missing targets");
            return;
        }
        this.resetAllPointColors();
        const taskState = createTaskState(taskId, target2D, 5, "both", target3D);
        this.taskMap.set(taskId, taskState);
        this.currentTask = taskState;
        this.notifyTaskListeners();
    }

    private scheduleTrial6Repeat(completedTask: TaskState) {
        window.setTimeout(() => {
            const latest = this.normalizeTaskState(this.taskMap.get(completedTask.id));
            if (!latest || !latest.completed || latest.trial !== 5) {
                return;
            }
            const nextTarget2D = this.pickRandomTargetId();
            const nextTarget3D = this.pickRandomTargetId();
            if (!nextTarget2D || !nextTarget3D) {
                console.warn("Unable to schedule trial 6: missing targets");
                return;
            }
            this.resetAllPointColors();
            const next: TaskState = {
                ...latest,
                targetPointId: nextTarget2D,
                targetPointId3D: nextTarget3D,
                trial: 6,
                hintSide: "both",
                feedback: "none",
                completed: false,
                clicked2D: false,
                clicked3D: false,
            };
            this.taskMap.set(completedTask.id, next);
            this.currentTask = next;
            this.notifyTaskListeners();
        }, 2000);
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

import * as Y from "yjs";
import { PlaneSyncData, PointSyncData } from "../../shared/src/sync";
import { Point2D } from "./Point2D";
import { WebsocketProvider } from "y-websocket";
import { PCAManager } from "./PCAManager";
import { TaskState, TASK_COLLECTION, TASK1_ID, createTaskState } from "../../shared/src/task";
import { getDefaultPointConfig } from "../../shared/src/defaultPoints";
import { Vector3 } from "@babylonjs/core";
import { ProjectionManager } from "./ProjectionManager";

export class SyncManager2D {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;

    private localPointsById: Map<string, Point2D>;

    private syncedPointDataMap: Y.Map<PointSyncData>;
    private taskMap: Y.Map<TaskState>;
    private syncedPCADataMap: Y.Map<PlaneSyncData>;

    private projectionManager = new ProjectionManager();
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
        this.syncedPCADataMap = this.ydoc.getMap("pca") as Y.Map<PlaneSyncData>;
    }

    private waitForInitialSync(): Promise<void> {
        return new Promise((resolve) => {
            this.provider.once("sync", () => {
                console.log("initializing points from remote");
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

        this.taskMap.observe(() => {
            this.currentTask = this.taskMap.get(TASK1_ID) ?? null;
            this.notifyTaskListeners();
        });
    }

    public static async create(): Promise<SyncManager2D> {
        const manager = new SyncManager2D();
        await manager.waitForInitialSync();
        manager.initializeRemoteObserver();
        manager.currentTask = manager.taskMap.get(TASK1_ID) ?? null;
        manager.notifyTaskListeners();
        return manager;
    }

    public transactPointUpdate(point: Point2D) {
        console.log("transacting point update for", point.id);
        this.ydoc.transact(() => {
            const existing = this.syncedPointDataMap.get(point.id);
            this.syncedPointDataMap.set(point.id, point.getLocalData(existing, this.projectionManager));
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
            point.applyRemoteData(remote, this.projectionManager);
            if (point.hasLockedColor() || point.hasPositionLock()) {
                this.transactPointUpdate(point);
            }
        } else {
            // first writer writes initial state
            console.log("no existing remote data for point", point.id);
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

    public ensureTaskTarget(taskId: string = TASK1_ID) {
        const existing = this.taskMap.get(taskId);
        if (existing && existing.targetPointId) {
            this.currentTask = existing;
            this.notifyTaskListeners();
            return existing;
        }

        const candidateIds = Array.from(this.localPointsById.values())
            .filter((pt) => {
                const cfg = getDefaultPointConfig(pt.id);
                if (cfg && cfg.draggable === false) {
                    return false;
                }
                return true;
            })
            .map((pt) => pt.id);

        if (candidateIds.length === 0) {
            return null;
        }

        const randomId = candidateIds[Math.floor(Math.random() * candidateIds.length)];
        const taskState = createTaskState(taskId, randomId);
        this.taskMap.set(taskId, taskState);
        this.currentTask = taskState;
        this.notifyTaskListeners();
        return taskState;
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

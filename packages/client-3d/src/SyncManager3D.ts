import * as BABYLON from "@babylonjs/core";
import * as Y from "yjs";
import { PCASyncData, PointSyncData } from "../../shared/src/sync";
import { Point3D } from "./Point3D";
import { WebsocketProvider } from "y-websocket";
import { TaskState, TASK_COLLECTION, TASK1_ID } from "../../shared/src/task";
import { getDefaultPointConfig } from "../../shared/src/defaultPoints";

export class SyncManager3D {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;

    private localPointsById: Map<string, Point3D>;
    private syncedPointDataMap: Y.Map<PointSyncData>;
    private taskMap: Y.Map<TaskState>;
    private currentTask: TaskState | null = null;
    private taskListeners: Set<(task: TaskState | null) => void> = new Set();
    private syncedPCADataMap: Y.Map<PCASyncData>;

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
        this.taskMap = this.ydoc.getMap(TASK_COLLECTION) as Y.Map<TaskState>;
        this.syncedPCADataMap = this.ydoc.getMap("pca") as Y.Map<PCASyncData>;

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

    private normalizeTaskState(task: TaskState | null | undefined): TaskState | null {
        if (!task) return null;
        const stage = task.stage ?? 1;
        const hintSide = task.hintSide ?? "2d";
        const feedback = task.feedback ?? "none";
        const completed = task.completed ?? false;

        if (
            stage === task.stage &&
            hintSide === task.hintSide &&
            feedback === task.feedback &&
            completed === task.completed
        ) {
            return task;
        }

        return {
            id: task.id,
            targetPointId: task.targetPointId,
            stage,
            hintSide,
            feedback,
            completed
        };
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

        this.taskMap.observe(() => {
            const raw = this.taskMap.get(TASK1_ID);
            const normalized = this.normalizeTaskState(raw);
            if (normalized && raw && normalized !== raw) {
                this.taskMap.set(TASK1_ID, normalized);
            }
            this.currentTask = normalized;
            this.notifyTaskListeners();
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
        manager.currentTask = manager.normalizeTaskState(manager.taskMap.get(TASK1_ID));
        manager.notifyTaskListeners();
        return manager;
    }

    public transactPointUpdate(point: Point3D) {
        console.log("transacting point update for", point.id);
        this.ydoc.transact(() => {
            const existing = this.syncedPointDataMap.get(point.id);
            this.syncedPointDataMap.set(point.id, point.getLocalData(existing));
        }, point);
    }

    public registerPoint(point: Point3D) {
        console.log("registering point", point.id);

        if (this.localPointsById.has(point.id)) {
            console.warn("Point with id", point.id, "is already registered.");
            return;
        }
        this.localPointsById.set(point.id, point);

        // if remote exists, apply it without re-emitting
        const remote = this.syncedPointDataMap.get(point.id);
        if (remote) {
            console.log("applying existing remote data to newly registered point", point.id);
            point.applyRemoteData(remote);
            this.transactPointUpdate(point);
        } else {
            // first writer writes initial state
            console.log("no existing remote data for point", point.id);
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

    public getCurrentTask(): TaskState | null {
        return this.currentTask;
    }

    private pick2DClickableTargetId() {
        const candidateIds = Array.from(this.localPointsById.keys()).filter((id) => {
            const cfg = getDefaultPointConfig(id);
            if (cfg && cfg.selectable === false) {
                return false;
            }
            return true;
        });
        if (candidateIds.length === 0) {
            return null;
        }
        const randomId = candidateIds[Math.floor(Math.random() * candidateIds.length)];
        return randomId;
    }

    public markGuessStageSuccess(taskId: string = TASK1_ID) {
        const existing = this.normalizeTaskState(this.taskMap.get(taskId));
        if (!existing) return;
        const stage = existing.stage ?? 1;
        if (stage !== 1 && stage !== 3) return;

        const updated: TaskState = {
            ...existing,
            feedback: "success",
            completed: true
        };
        this.taskMap.set(taskId, updated);
        this.currentTask = updated;
        this.notifyTaskListeners();
    }

    public setStage(stage: 1 | 2 | 3 | 4, taskId: string = TASK1_ID) {
        const nextTarget = this.pick2DClickableTargetId();
        if (!nextTarget) return;

        const hintSide = stage === 1 || stage === 3 ? "2d" : "3d";
        const nextState: TaskState = {
            id: taskId,
            targetPointId: nextTarget,
            stage,
            hintSide,
            feedback: "none",
            completed: false
        };
        this.taskMap.set(taskId, nextState);
        this.currentTask = nextState;
        this.notifyTaskListeners();
    }

    private applyPlaneFromExistingPCAData(plane: BABYLON.Mesh) {
        const existing = this.syncedPCADataMap.get("pca");
        this.applyPCADataToPlane(plane, existing);
    }

    private applyPCADataToPlane(plane: BABYLON.Mesh, data: PCASyncData | undefined) {
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

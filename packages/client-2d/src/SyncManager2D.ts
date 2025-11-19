import * as Y from "yjs";
import { PCASyncData, PointSyncData } from "../../shared/src/sync";
import { Point2D } from "./Point2D";
import { WebsocketProvider } from "y-websocket";
import { PCAManager } from "./PCAManager";
import { Vector3 } from "@babylonjs/core";

export class SyncManager2D {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;

    private localPointsById: Map<string, Point2D>;

    private syncedPointDataMap: Y.Map<PointSyncData>;
    private syncedPCADataMap: Y.Map<PCASyncData>;

    private pcaManager = new PCAManager(3);

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
        this.syncedPCADataMap = this.ydoc.getMap("pca") as Y.Map<PCASyncData>;
    }

    private waitForInitialSync(): Promise<void> {
        return new Promise((resolve) => {
            this.provider.once("sync", () => {
                console.log("initializing points from remote");
                for (const c of this.syncedPointDataMap.values()) {
                    const p = new Point2D(c.id, this);
                    p.applyRemoteData(c, this.pcaManager);
                    console.log("initializing point from remote:", c);
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
            }
        });
    }

    public static async create(): Promise<SyncManager2D> {
        const manager = new SyncManager2D();
        await manager.waitForInitialSync();
        manager.initializeRemoteObserver();
        return manager;
    }

    public transactPointUpdate(point: Point2D) {
        console.log("transacting point update for", point.id);
        this.ydoc.transact(() => {
            const existing = this.syncedPointDataMap.get(point.id);
            this.syncedPointDataMap.set(point.id, point.getLocalData(existing!, this.pcaManager));
        }, point);
    }

    public registerPoint(point: Point2D) {
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
            point.applyRemoteData(remote, this.pcaManager);
        } else {
            // first writer writes initial state
            console.log("no existing remote data for point", point.id);
            this.transactPointUpdate(point);
        }
    }

    public updatePCA() {
        // first update PCA based on all remote points
        this.pcaManager.update(
            this.getRemotePoints().map(
                (d) => new Vector3(d.position.x, d.position.y, d.position.z)
            )
        );

        // then transact PCA data
        const mean = this.pcaManager.getMean();
        const normal = this.pcaManager.getNormal();
        this.ydoc.transact(() => {
            this.syncedPCADataMap.set("pca", {
                mean: { x: mean.x, y: mean.y, z: mean.z },
                normal: { x: normal.x, y: normal.y, z: normal.z }
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
}
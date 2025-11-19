import * as BABYLON from "@babylonjs/core";
import * as Y from "yjs";
import { PCASyncData, PointSyncData } from "../../shared/src/sync";
import { Point3D } from "./Point3D";
import { WebsocketProvider } from "y-websocket";
import { SceneManager } from "./SceneManager";

export class SyncManager3D {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;

    private localPointsById: Map<string, Point3D>;
    private syncedPointDataMap: Y.Map<PointSyncData>;
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

    private initializeRemoteObserver(plane: BABYLON.Mesh) {
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
            }
        });

        this.syncedPCADataMap.observe((event, transaction) => {
            // currently only one PCA entry expected with key "pca"
            for (const key of event.keysChanged) {
                const pcaData = this.syncedPCADataMap.get(key)!;
                console.log("Received updated PCA data from remote:", pcaData);

                plane.position.set(pcaData.mean.x, pcaData.mean.y, pcaData.mean.z);

                const normalVec = new BABYLON.Vector3(pcaData.normal.x, pcaData.normal.y, pcaData.normal.z).normalize();
                plane.setDirection(normalVec);
            }
        });
    }

    public static async create(plane: BABYLON.Mesh): Promise<SyncManager3D> {
        const manager = new SyncManager3D();
        await manager.waitForInitialSync();
        manager.initializeRemoteObserver(plane);
        return manager;
    }

    public transactPointUpdate(point: Point3D) {
        console.log("transacting point update for", point.id);
        this.ydoc.transact(() => {
            const existing = this.syncedPointDataMap.get(point.id);
            this.syncedPointDataMap.set(point.id, point.getLocalData(existing!));
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
        } else {
            // first writer writes initial state
            console.log("no existing remote data for point", point.id);
            this.transactPointUpdate(point);
        }
    }
}

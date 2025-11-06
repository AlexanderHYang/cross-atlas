import * as Y from "yjs";
import { Chart, ChartSyncData } from "../../shared/src/Chart";
import { Chart3D } from "./Chart3D";
import { WebsocketProvider } from "y-websocket";
import { Scene } from "@babylonjs/core";

export class SyncManager3D {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;

    private localChartsById: Map<string, Chart3D>;
    private syncedChartDataMap: Y.Map<ChartSyncData>;

    private scene: Scene;

    private constructor(scene: Scene) {
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
        this.localChartsById = new Map<string, Chart3D>();
        this.syncedChartDataMap = this.ydoc.getMap("charts") as Y.Map<ChartSyncData>;

        // 3) store relevant scene data
        this.scene = scene;

        // 4) initialize existing remote charts
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

    private initializeRemoteObserver() {
        this.syncedChartDataMap.observe((event, transaction) => {
            for (const key of event.keysChanged) {
                const remoteData = this.syncedChartDataMap.get(key)!;
                const chart = this.localChartsById.get(key)!;

                // skip changes originated from this local chart update
                if (transaction.origin === chart) {
                    continue;
                }

                // apply remote data to local chart
                chart.applyRemoteData(remoteData);
            }
        });
    }

    public static async create(scene: Scene): Promise<SyncManager3D> {
        const manager = new SyncManager3D(scene);
        await manager.waitForInitialSync();
        manager.initializeRemoteObserver();
        return manager;
    }

    public transactChartUpdate(chart: Chart3D) {
        console.log("transacting chart update for", chart.id);
        this.ydoc.transact(() => {
            const existing = this.syncedChartDataMap.get(chart.id);
            this.syncedChartDataMap.set(chart.id, chart.getLocalData(existing!));
        }, chart);
    }

    public registerChart(chart: Chart3D) {
        console.log("registering chart", chart.id);

        if (this.localChartsById.has(chart.id)) {
            console.warn("Chart with id", chart.id, "is already registered.");
            return;
        }
        this.localChartsById.set(chart.id, chart);

        // if remote exists, apply it without re-emitting
        const remote = this.syncedChartDataMap.get(chart.id);
        if (remote) {
            console.log("applying existing remote data to newly registered chart", chart.id);
            chart.applyRemoteData(remote);
        } else {
            // first writer writes initial state
            console.log("no existing remote data for chart", chart.id);
            this.transactChartUpdate(chart);
        }
    }
}

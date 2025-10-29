import * as Y from "yjs";
import { Chart, ChartSyncData } from "../../shared/src/Chart";
import { Chart2D } from "./Chart2D";
import { WebsocketProvider } from "y-websocket";
import { Scene } from "@babylonjs/core";

export class SyncManager2D {
    private ydoc: Y.Doc;
    private provider: WebsocketProvider;

    private localChartsById: Map<string, Chart2D>;
    private syncedChartDataMap: Y.Map<ChartSyncData>;

    private constructor() {
        // 1) connect to websocket provider
        this.ydoc = new Y.Doc();
        this.provider = new WebsocketProvider("ws://localhost:1234", "chart-room", this.ydoc);

        // 2) create local state maps
        this.localChartsById = new Map<string, Chart2D>();
        this.syncedChartDataMap = this.ydoc.getMap("charts") as Y.Map<ChartSyncData>;
    }

    private waitForInitialSync(): Promise<void> {
        return new Promise((resolve) => {
            this.provider.once("sync", () => {
                console.log("initializing charts from remote");
                for (const c of this.syncedChartDataMap.values()) {
                    const chart2d = new Chart2D(c.id, this);
                    chart2d.applyRemoteData(c);
                    console.log("initializing chart from remote:", c);
                    this.localChartsById.set(chart2d.id, chart2d);
                }
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

    public static async create(): Promise<SyncManager2D> {
        const manager = new SyncManager2D();
        await manager.waitForInitialSync();
        manager.initializeRemoteObserver();
        return manager;
    }

    public transactChartUpdate(chart: Chart2D) {
        console.log("transacting chart update for chart", chart.id);
        this.ydoc.transact(() => {
            const existing = this.syncedChartDataMap.get(chart.id);
            this.syncedChartDataMap.set(chart.id, chart.getLocalData(existing!));
        }, chart);
    }

    public registerChart(chart: Chart2D) {
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

    public getLocalCharts(): Chart2D[] {
        return Array.from(this.localChartsById.values());
    }
}
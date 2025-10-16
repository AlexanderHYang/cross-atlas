import { IPoint } from "./IPoint";
import { SyncManager } from "./SyncManager";

export interface IPointManager {
    points: Map<string, IPoint>
    
    setSyncManager(syncManager: SyncManager): void
    addPoint(id: string): void
    removePoint(id: string): void
    getPoint(id: string): IPoint | undefined
}
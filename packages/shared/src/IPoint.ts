import { MetadataSyncData, PointSyncData } from "./SyncManager";

export interface IPoint {
    id: string

    // Return the canonical payload that SyncManager should store/send.
    // Use PointSyncData so the payload can grow (position, color, rotation, ...).
    getLocalData(existing: PointSyncData, metadata: MetadataSyncData): PointSyncData

    // Apply a canonical payload received from the network.
    applyRemoteData(data: PointSyncData, metadata: MetadataSyncData): void

    // Hook for sync manager to call on local changes
    onLocalChange?: () => void

    // Flag to ignore applying remote changes (to avoid feedback loops)
    ignoreRemote: boolean
}
export type Vector3SyncData = {
    x: number;
    y: number;
    z: number;
};
export type PointSyncData = {
    id: string;
    color: Vector3SyncData;
};

export type PlaneSyncData = {
    mean: Vector3SyncData;
    normal: Vector3SyncData;
}
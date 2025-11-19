export type Vector3SyncData = {
    x: number;
    y: number;
    z: number;
};
export type PointSyncData = {
    id: string;
    position: Vector3SyncData;
    color: Vector3SyncData;
};

export type PCASyncData = {
    mean: Vector3SyncData;
    normal: Vector3SyncData;
}
import { Vector3SyncData } from "./sync";

export type DefaultPointConfig = {
    id: string;
    /**
     * Normalized direction vector pointing to the spot on the sphere.
     * Magnitude does not matter; values are normalized at runtime.
     */
    direction: Vector3SyncData;
    /**
     * Optional color hint for this point. Defaults to white if not provided.
     */
    color?: Vector3SyncData;
    /**
     * Whether this point can be dragged locally. Defaults to true.
     */
    draggable?: boolean;
    /**
     * Whether this point can be selected/clicked. Defaults to true.
     */
    selectable?: boolean;
};

export const DEFAULT_SPHERE_RADIUS = 3;

export const DEFAULT_POINT_CONFIGS: DefaultPointConfig[] = [
    { id: "point1", direction: { x: 0, y: 1, z: 0 }, draggable: false }, // north pole
    { id: "point2", direction: { x: 0, y: -1, z: 0 }, draggable: false }, // south pole
    {
        id: "landmark",
        direction: { x: 1, y: 0, z: 0 },
        color: { x: 0, y: 0, z: 1 },
        draggable: false,
        selectable: false,
    }, // landmark (centered, non-interactable)
    { id: "point4", direction: { x: -1, y: 0, z: 0 }, draggable: false },
    { id: "point5", direction: { x: 0, y: 0, z: 1 }, draggable: false },
    { id: "point6", direction: { x: 0, y: 0, z: -1 }, draggable: false },
    { id: "point7", direction: { x: 1, y: 1, z: 0 }, draggable: false },
    { id: "point8", direction: { x: 1, y: -1, z: 0 }, draggable: false },
    { id: "point9", direction: { x: -1, y: 1, z: 0 }, draggable: false },
    { id: "point10", direction: { x: -1, y: -1, z: 0 }, draggable: false },
    { id: "point11", direction: { x: 1, y: 0, z: 1 }, draggable: false },
    { id: "point12", direction: { x: 1, y: 0, z: -1 }, draggable: false },
    { id: "point13", direction: { x: -1, y: 0, z: 1 }, draggable: false },
    { id: "point14", direction: { x: -1, y: 0, z: -1 }, draggable: false },
    { id: "point15", direction: { x: 0, y: 1, z: 1 }, draggable: false },
    { id: "point16", direction: { x: 0, y: 1, z: -1 }, draggable: false },
    { id: "point17", direction: { x: 0, y: -1, z: 1 }, draggable: false },
    { id: "point18", direction: { x: 0, y: -1, z: -1 }, draggable: false },
    { id: "point19", direction: { x: 1, y: 1, z: 1 }, draggable: false },
    { id: "point20", direction: { x: -1, y: 1, z: 1 }, draggable: false },
    { id: "point21", direction: { x: 1, y: -1, z: 1 }, draggable: false },
    { id: "point22", direction: { x: 1, y: 1, z: -1 }, draggable: false },
    { id: "point23", direction: { x: -1, y: -1, z: 1 }, draggable: false },
    { id: "point24", direction: { x: -1, y: 1, z: -1 }, draggable: false },
    { id: "point25", direction: { x: 1, y: -1, z: -1 }, draggable: false },
    { id: "point26", direction: { x: -1, y: -1, z: -1 }, draggable: false },
    { id: "point27", direction: { x: 0.5, y: 0.707, z: 0.5 }, draggable: false },
    { id: "point28", direction: { x: -0.5, y: 0.707, z: 0.5 }, draggable: false },
    { id: "point29", direction: { x: 0.5, y: 0.707, z: -0.5 }, draggable: false },
    { id: "point30", direction: { x: -0.5, y: 0.707, z: -0.5 }, draggable: false },
];

const CONFIG_MAP = new Map(DEFAULT_POINT_CONFIGS.map((cfg) => [cfg.id, cfg]));

export function getDefaultPointConfig(id: string): DefaultPointConfig | undefined {
    return CONFIG_MAP.get(id);
}

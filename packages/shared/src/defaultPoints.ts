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
   * Optional normalized 2D coordinates ([-1,1]) where this point should be locked
   * in the dashboard UI.
   */
  locked2dPosition?: { nx: number; ny: number };
};

export const DEFAULT_SPHERE_RADIUS = 3;

export const DEFAULT_POINT_CONFIGS: DefaultPointConfig[] = [
  { id: "point1", direction: { x: 0, y: 1, z: 0 } },   // north pole
  { id: "point2", direction: { x: 0, y: -1, z: 0 } },  // south pole
  { id: "point3", direction: { x: 1, y: 0, z: 0 }, color: { x: 0, y: 0, z: 1 }, draggable: false, locked2dPosition: { nx: 0, ny: 0 } },   // landmark (centered)
  { id: "point4", direction: { x: -1, y: 0, z: 0 } },  // west
  { id: "point5", direction: { x: 0, y: 0, z: 1 } },   // forward
  { id: "point6", direction: { x: 0, y: 0, z: -1 } },  // backward
];

const CONFIG_MAP = new Map(DEFAULT_POINT_CONFIGS.map(cfg => [cfg.id, cfg]));

export function getDefaultPointConfig(id: string): DefaultPointConfig | undefined {
  return CONFIG_MAP.get(id);
}

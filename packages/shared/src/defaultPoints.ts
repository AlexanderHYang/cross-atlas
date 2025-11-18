import { Vector3SyncData } from "./sync";

export type DefaultPointConfig = {
  id: string;
  /**
   * Normalized direction vector pointing to the spot on the sphere.
   * Magnitude does not matter; values are normalized at runtime.
   */
  direction: Vector3SyncData;
};

export const DEFAULT_SPHERE_RADIUS = 3;

export const DEFAULT_POINT_CONFIGS: DefaultPointConfig[] = [
  { id: "point1", direction: { x: 0, y: 1, z: 0 } },   // north pole
  { id: "point2", direction: { x: 0, y: -1, z: 0 } },  // south pole
  { id: "point3", direction: { x: 1, y: 0, z: 0 } },   // east
  { id: "point4", direction: { x: -1, y: 0, z: 0 } },  // west
  { id: "point5", direction: { x: 0, y: 0, z: 1 } },   // forward
  { id: "point6", direction: { x: 0, y: 0, z: -1 } },  // backward
];

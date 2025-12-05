import { Vector3 } from '@babylonjs/core'
import { PCA } from 'ml-pca'
import { Matrix } from 'ml-matrix'

export type ProjectionType = 'equirectangular' | 'pca'
let _projectionType: ProjectionType = 'equirectangular'

export function getProjectionType(): ProjectionType {
  return _projectionType
}
export function setProjectionType(newType: ProjectionType) {
  _projectionType = newType
}

export const maxLat = 89 * Math.PI / 180 // radians
export const maxY = Math.log(Math.tan(Math.PI / 4 + maxLat / 2))

export function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v))
}

// Equirectangular helper: latitude & longitude in radians -> normalized [-1,1]
// lon maps linearly: -PI..PI -> -1..1
// lat maps linearly: -PI/2..PI/2 -> -1..1 (clamped to maxLat)
export function equirectangularNormalizedXY(latRad: number, lonRad: number) {
  const lat = clamp(latRad, -maxLat, maxLat)
  const nx = - lonRad / Math.PI
    const ny = lat / (Math.PI / 2)
    return { nx, ny }
}

// Inverse Equirectangular: normalized XY [-1,1] -> lat/lon (radians)
export function inverseEquirectangularNormalizedXY(nx: number, ny: number) {
  // inverse of the equirectangular mapping
  const lon = -nx * Math.PI
    const lat = clamp(ny, -1, 1) * (Math.PI / 2)
    return { lat, lon }
}

export function latLonToVec3(lat: number, lon: number, radius: number) {
  const y = Math.sin(lat) * radius
  const r = Math.cos(lat) * radius
  const x = Math.cos(lon) * r
  const z = Math.sin(lon) * r
  return new Vector3(x, y, z)
}

export function projectOntoSphere(point: Vector3, radius: number) {
  const dir = point.clone()
  dir.normalize()
  return dir.scale(radius)
}

// Utility: convert a Vector3 on/near sphere to lat/lon (radians)
// assumes vector is in same space as latLonToVec3 (y up)
export function vec3ToLatLon(v: Vector3) {
    const r = v.length()
    if (r === 0) return { lat: 0, lon: 0 }
    const p = v.normalize()
    const lat = Math.asin(clamp(p.y, -1, 1))
    const lon = Math.atan2(p.z, p.x)
    return { lat, lon, radius: r }
}
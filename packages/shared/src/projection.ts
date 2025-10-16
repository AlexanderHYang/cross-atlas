import { Vector3 } from '@babylonjs/core'

export const maxLat = 89 * Math.PI / 180 // radians
export const maxY = Math.log(Math.tan(Math.PI / 4 + maxLat / 2))

function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v))
}

// Mercator helper: take latitude & longitude in radians -> normalized [-1,1]
export function mercatorNormalizedXY(latRad: number, lonRad: number) {
  const lat = clamp(latRad, -maxLat, maxLat)
  const x = lonRad
  const y = Math.log(Math.tan(Math.PI / 4 + lat / 2))
  const nx = x / Math.PI
  const ny = y / maxY
  return { nx, ny }
}

// Inverse Mercator: normalized XY [-1,1] -> lat/lon (radians)
export function inverseMercatorNormalizedXY(nx: number, ny: number) {
  const lon = nx * Math.PI
  const y = ny * maxY
  const lat = 2 * Math.atan(Math.exp(y)) - Math.PI / 2
  return { lat, lon }
}

// Equirectangular helper: latitude & longitude in radians -> normalized [-1,1]
// lon maps linearly: -PI..PI -> -1..1
// lat maps linearly: -PI/2..PI/2 -> -1..1 (clamped to maxLat)
export function equirectangularNormalizedXY(latRad: number, lonRad: number) {
    const lat = clamp(latRad, -maxLat, maxLat)
  // flip sign so longitude increases map to +x on the 2D plane consistently
  const nx = -lonRad / Math.PI
    const ny = lat / (Math.PI / 2)
    return { nx, ny }
}

// Inverse Equirectangular: normalized XY [-1,1] -> lat/lon (radians)
export function inverseEquirectangularNormalizedXY(nx: number, ny: number) {
  // inverse of the flipped equirectangular mapping
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

// Projection mode: spherical (equirectangular/mercator mapping) or planar (orthographic onto plane)
export enum ProjectionMode {
  Spherical = 'spherical',
  Planar = 'planar',
}

let _currentProjectionMode: ProjectionMode = ProjectionMode.Spherical
type ModeListener = (mode: ProjectionMode) => void
const _modeListeners: ModeListener[] = []

export function getProjectionMode() {
  return _currentProjectionMode
}

export function setProjectionMode(mode: ProjectionMode) {
  if (_currentProjectionMode === mode) return
  _currentProjectionMode = mode
  for (const l of _modeListeners) l(mode)
}

export function toggleProjectionMode() {
  setProjectionMode(_currentProjectionMode === ProjectionMode.Spherical ? ProjectionMode.Planar : ProjectionMode.Spherical)
}

export function onProjectionModeChange(fn: ModeListener) {
  _modeListeners.push(fn)
  return () => {
    const idx = _modeListeners.indexOf(fn)
    if (idx >= 0) _modeListeners.splice(idx, 1)
  }
}

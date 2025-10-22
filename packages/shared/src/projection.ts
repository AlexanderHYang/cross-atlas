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
  const nx = lonRad / Math.PI
    const ny = lat / (Math.PI / 2)
    return { nx, ny }
}

// Inverse Equirectangular: normalized XY [-1,1] -> lat/lon (radians)
export function inverseEquirectangularNormalizedXY(nx: number, ny: number) {
  // inverse of the equirectangular mapping
  const lon = nx * Math.PI
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


// PCA
let _pcaAvailable = false // whether PCA computation has been done
let _pcaInstance: PCA | null = null // cached PCA instance

export function updatePCAPlane(points: Vector3[] | number[][]) {
  if (!points || points.length === 0) {
    console.warn('updatePCAPlane: no points provided')
    _pcaAvailable = false
    _pcaInstance = null
    return
  }

  // construct the matrix
  const mat: number[][] = []
  for (const p of points) {
    if (p instanceof Vector3) {
      mat.push([p.x, p.y, p.z])
    } else if (Array.isArray(p) && p.length === 3) {
      mat.push(p)
    } else {
      console.warn('updatePCAPlane: invalid point format:', p)
    }
  }

  if (mat.length === 0) {
    console.warn('updatePCAPlane: no valid points after processing')
    _pcaAvailable = false
    _pcaInstance = null
    return
  }

  while (mat.length < 3) {
    mat.push([0, 0, 0])
  }

  // compute PCA
  _pcaInstance = new PCA(mat, { center: true, scale: false })
  _pcaAvailable = true
}

export function projectPCA(point: Vector3): [number, number] {
  if (!_pcaAvailable || !_pcaInstance) {
    console.error('projectPCA: PCA not available, call updatePCAPlane first')
  }

  const projected = _pcaInstance?.predict([[point.x, point.y, point.z]])
  if (!projected || projected.rows === 0) {
    throw new Error('projectPCA: PCA projection failed')
  }

  const coords = projected.getRow(0)
  if (coords.length < 2) {
    throw new Error('projectPCA: PCA projection returned insufficient dimensions')
  }

  return [coords[0], coords[1]]
}

export function inverseProjectPCA(x: number, y: number): Vector3 {
  if (!_pcaAvailable || !_pcaInstance) {
    console.error('inverseProjectPCA: PCA not available, call updatePCAPlane first')
  }

  const reconstructed = _pcaInstance?.invert(new Matrix([[x, y]]))
  if (!reconstructed || reconstructed.rows === 0) {
    throw new Error('inverseProjectPCA: PCA inverse projection failed')
  }
  
  const coords = reconstructed.getRow(0)
  if (coords.length < 3) {
    throw new Error('inverseProjectPCA: PCA inverse projection returned insufficient dimensions')
  }

  return new Vector3(coords[0], coords[1], coords[2])
}
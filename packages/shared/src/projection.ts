import { Vector3 } from '@babylonjs/core'
import { PCA } from 'ml-pca'
import { Matrix } from 'ml-matrix'
import { SyncManager } from './SyncManager'

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

export function updatePCAPlane(points: Vector3[] | number[][], syncManager: SyncManager) {
  if (!points || points.length === 0) {
    console.warn('updatePCAPlane: no points provided')
    _pcaAvailable = false
    _pcaInstance = null
    return
  }

  const means = [0,0,0]
  let validPointCount = 0

  // construct the matrix
  const mat: number[][] = []
  for (const p of points) {
    if (p instanceof Vector3) {
      mat.push([p.x, p.y, p.z])
      means[0] += p.x
      means[1] += p.y
      means[2] += p.z
      validPointCount++
    } else if (Array.isArray(p) && p.length === 3) {
      mat.push(p)
      means[0] += p[0]
      means[1] += p[1]
      means[2] += p[2]
      validPointCount++
    } else {
      console.warn('updatePCAPlane: invalid point format:', p)
    }
  }

  means[0] /= validPointCount
  means[1] /= validPointCount
  means[2] /= validPointCount

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

  // extract normal (3rd principal component)
  const components = _pcaInstance.getEigenvectors()
  if (components.columns < 3) {
    console.warn('updatePCAPlane: PCA returned insufficient components')
    return
  }
  const normal = components.getColumn(2)
  const normalVec = new Vector3(normal[0], normal[1], normal[2]).normalize()

  syncManager.syncedMetadataMap.set('metadata', {
    pcaPlaneNormal: { x: normalVec.x, y: normalVec.y, z: normalVec.z },
    pcaPlaneMean: { x: means[0], y: means[1], z: means[2] },
  })
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

export function projectAlongNormalToSphere(point: Vector3, radius: number = 1.0) {
  if (!_pcaAvailable || !_pcaInstance) {
    console.error('projectAlongNormalToSphere: PCA not available, call updatePCAPlane first')
  }

  // get normal vector
  const components = _pcaInstance?.getEigenvectors()
  if (!components || components.columns < 3) {
    throw new Error('projectAlongNormalToSphere: PCA returned insufficient components')
  }
  const normalArr = components.getColumn(2) // third principal component
  const normal = new Vector3(normalArr[0], normalArr[1], normalArr[2]).normalize()

  // Solve || p + t*n ||^2 = r^2  -> t^2 + 2*(p·n)*t + (p·p - r^2) = 0
  const pDotN = Vector3.Dot(point, normal)
  const pLen2 = point.lengthSquared()
  const disc = pDotN * pDotN + radius * radius - pLen2

  const EPS = 1e-9
  if (disc < -EPS) {
    // no real intersection (numerical or geometric). Fallback: radial project to sphere
    return point.length() === 0 ? normal.scale(radius) : point.normalize().scale(radius)
  }

  const sqrtD = Math.sqrt(Math.max(0, disc))
  const t1 = -pDotN + sqrtD
  const t2 = -pDotN - sqrtD

  // Choose intersection:
  // - default: pick the intersection closest to the original point (min |t|)
  // - if you want to always go in the +normal direction, uncomment preferPositive logic
  let t = Math.abs(t1) < Math.abs(t2) ? t1 : t2

  const intersection = point.add(normal.scale(t))
  return intersection.normalize().scale(radius)
}
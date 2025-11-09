import { PCA } from 'ml-pca'
import { Matrix } from 'ml-matrix'
import { Vector3 } from '@babylonjs/core'

/**
 * PCAManager encapsulates PCA state for the 2D client.
 * It mirrors the PCA-related logic from shared/projection.ts but keeps
 * the state local to the 2D client and exposes a small API:
 *
 * - update(points)
 * - project(point) -> [x,y]
 * - inverse(x,y) -> Vector3
 * - projectAlongNormal(point, radius)
 */
export class PCAManager {
  private _pcaInstance: PCA | null = null
  private _available: boolean = false
  private _mean: number[] = [0, 0, 0]

  public isAvailable() {
    return this._available && this._pcaInstance !== null
  }

  public getMean(): Vector3 {
    return new Vector3(this._mean[0], this._mean[1], this._mean[2])
  }

  /**
   * Update PCA state from an array of points. Each point may be a
   * Babylon Vector3 or a number[] tuple [x,y,z].
   */
  public update(points: Array<Vector3 | number[]>) {
    if (!points || points.length === 0) {
      this._pcaInstance = null
      this._available = false
      this._mean = [0, 0, 0]
      console.error('PCAManager.update() failed: no points provided')
      return
    }

    const mat: number[][] = []
    const means = [0, 0, 0]
    let validCount = 0

    for (const p of points) {
      if (p instanceof Vector3) {
        mat.push([p.x, p.y, p.z])
        means[0] += p.x; means[1] += p.y; means[2] += p.z
        validCount++
      } else if (Array.isArray(p) && p.length === 3) {
        mat.push([p[0], p[1], p[2]])
        means[0] += p[0]; means[1] += p[1]; means[2] += p[2]
        validCount++
      } else {
        // ignore invalid entries
      }
    }

    if (validCount === 0) {
      this._pcaInstance = null
      this._available = false
      this._mean = [0, 0, 0]
      console.error('PCAManager.update() failed: no valid points provided')
      return
    }

    means[0] /= validCount; means[1] /= validCount; means[2] /= validCount

    // Ensure at least 3 rows for PCA stability
    while (mat.length < 3) mat.push([0, 0, 0])

    this._pcaInstance = new PCA(mat, { center: true, scale: false })
    this._available = true
    this._mean = means
  }

  /** Project a 3D point into the PCA 2D coordinate space. */
  public project(point: Vector3): [number, number] {
    if (!this._pcaInstance) throw new Error('PCA not available')
    const projected = this._pcaInstance.predict([[point.x, point.y, point.z]])
    if (!projected || projected.rows === 0) throw new Error('PCA projection failed')
    const coords = projected.getRow(0)
    if (coords.length < 2) throw new Error('PCA projection returned insufficient dimensions')
    return [coords[0], coords[1]]
  }

  /** Inverse-project PCA coords back to 3D vector. */
  public inverse(x: number, y: number): Vector3 {
    if (!this._pcaInstance) throw new Error('PCA not available')
    const reconstructed = this._pcaInstance.invert(new Matrix([[x, y]]))
    if (!reconstructed || reconstructed.rows === 0) throw new Error('PCA inverse projection failed')
    const coords = reconstructed.getRow(0)
    if (coords.length < 3) throw new Error('PCA inverse returned insufficient dimensions')
    return new Vector3(coords[0], coords[1], coords[2])
  }

  /**
   * Inverse-project PCA coords back to 3D vector, but preserve the signed
   * distance of an existing vector from the PCA plane. This shifts the
   * reconstructed plane point along the PCA normal by the signed distance
   * between `existingVec` and the PCA plane (defined by the mean and normal).
   */
  public inverseWithSignedDistance(x: number, y: number, existingVec: Vector3): Vector3 {
    if (!this._pcaInstance) throw new Error('PCA not available')

    // reconstruct plane point from PCA coords
    const planePoint = this.inverse(x, y)

    // mean of the PCA plane
    const mean = this.getMean()

    // PCA normal is the 3rd principal component
    const components = this._pcaInstance.getEigenvectors()
    if (!components || components.columns < 3) {
      // fallback: return radial projection preserving distance along radial direction
      const signedDist = Vector3.Dot(existingVec.subtract(mean), existingVec.normalize())
      return planePoint.add(existingVec.normalize().scale(signedDist))
    }
    const normalArr = components.getColumn(2)
    const normal = new Vector3(normalArr[0], normalArr[1], normalArr[2]).normalize()

    // signed distance from existingVec to PCA plane along normal
    const signedDist = Vector3.Dot(existingVec.subtract(mean), normal)

    // shift plane reconstruction by same signed distance along normal
    const shifted = planePoint.add(normal.scale(signedDist))
    return shifted
  }

  /**
   * Project a point along the PCA normal vector onto a sphere of given radius.
   * Uses PCA eigenvectors to compute the normal (3rd principal component).
   */
//   public projectAlongNormalToSphere(point: Vector3, radius: number = 1.0): Vector3 {
//     if (!this._pcaInstance) {
//       // fallback to radial projection
//       return point.length() === 0 ? new Vector3(radius, 0, 0) : point.normalize().scale(radius)
//     }

//     const components = this._pcaInstance.getEigenvectors()
//     if (!components || components.columns < 3) {
//       return point.length() === 0 ? new Vector3(radius, 0, 0) : point.normalize().scale(radius)
//     }
//     const normalArr = components.getColumn(2)
//     const normal = new Vector3(normalArr[0], normalArr[1], normalArr[2]).normalize()

//     // Solve || p + t*n ||^2 = r^2
//     const pDotN = Vector3.Dot(point, normal)
//     const pLen2 = point.lengthSquared()
//     const disc = pDotN * pDotN + radius * radius - pLen2

//     const EPS = 1e-9
//     if (disc < -EPS) {
//       return point.length() === 0 ? normal.scale(radius) : point.normalize().scale(radius)
//     }

//     const sqrtD = Math.sqrt(Math.max(0, disc))
//     const t1 = -pDotN + sqrtD
//     const t2 = -pDotN - sqrtD
//     const t = Math.abs(t1) < Math.abs(t2) ? t1 : t2
//     const intersection = point.add(normal.scale(t))
//     return intersection.normalize().scale(radius)
//   }
}

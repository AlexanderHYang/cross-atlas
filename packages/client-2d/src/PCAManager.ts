import { PCA } from 'ml-pca'
import { Matrix } from 'ml-matrix'
import { Vector3 } from '@babylonjs/core'

/**
 * PCAManager encapsulates PCA state for the 2D client.
 * It keeps the state local to the 2D client and exposes a small API
 */
export class PCAManager {
  private _pcaInstance: PCA | null = null
  private _available: boolean = false
  private _mean: number[] = [0, 0, 0]
  // per-axis scales for PCA axes 0 and 1 (used to normalize to approx [-1,1])
  private _scales: [number, number] = [1, 1]
  // half-extent of the target PCA plane in output coordinates. Defaults to 1.
  private _planeSize: number = 1

  public isAvailable() {
    return this._available && this._pcaInstance !== null
  }

  public getMean(): Vector3 {
    return new Vector3(this._mean[0], this._mean[1], this._mean[2])
  }

  public getNormal(): Vector3 {
    if (this._pcaInstance) {
      const components = this._pcaInstance.getEigenvectors()
      if (components && components.columns >= 3) {
        const normalArr = components.getColumn(2)
        return new Vector3(normalArr[0], normalArr[1], normalArr[2]).normalize()
      }
    }
    return new Vector3(0, 0, 1)
  }

  /**
   * Create a PCAManager.
   * @param planeSize the half-extent of the 2D PCA plane in output coordinates. 
   * For example, planeSize=1 maps PCA axes roughly to [-1,1]. Pass 2 to map to [-2,2].
   */
  constructor(planeSize: number = 1) {
    this._planeSize = isFinite(planeSize) && planeSize > 0 ? planeSize : 1
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
    // compute per-axis scales so projected coords can be normalized to roughly [-planeSize,planeSize]
    try {
      const projected = this._pcaInstance.predict(mat)
      let maxAbs0 = 0
      let maxAbs1 = 0
      for (let i = 0; i < projected.rows; i++) {
        const row = projected.getRow(i)
        if (row.length >= 1) maxAbs0 = Math.max(maxAbs0, Math.abs(row[0]))
        if (row.length >= 2) maxAbs1 = Math.max(maxAbs1, Math.abs(row[1]))
      }
      if (!isFinite(maxAbs0) || maxAbs0 === 0) maxAbs0 = 1
      if (!isFinite(maxAbs1) || maxAbs1 === 0) maxAbs1 = 1
      this._scales = [maxAbs0, maxAbs1]
    } catch (e) {
      this._scales = [1, 1]
      console.warn('PCAManager.update(): failed to compute projection scales, using defaults', e)
    }
  }

  /** Project a 3D point into the PCA 2D coordinate space. */
  public project(point: Vector3): [number, number] {
    if (!this._pcaInstance) throw new Error('PCA not available')
    const projected = this._pcaInstance.predict([[point.x, point.y, point.z]])
    if (!projected || projected.rows === 0) throw new Error('PCA projection failed')
    const coords = projected.getRow(0)
    if (coords.length < 2) throw new Error('PCA projection returned insufficient dimensions')
    const sx = this._scales[0] || 1
    const sy = this._scales[1] || 1
    const px = this._planeSize
    // Return normalized PCA coords in approximately [-1, 1].
    // NOTE: planeSize is NOT applied here so nx/ny remain in [-1,1].
    return [coords[0] / sx / px, coords[1] / sy / px]
  }

  /** Inverse-project PCA coords back to 3D vector. */
  public inverse(x: number, y: number): Vector3 {
    if (!this._pcaInstance) throw new Error('PCA not available')
    // Interpret x,y as normalized coords in [-1,1]. First reconstruct the
    // 3D plane point from PCA coords (without scaling), then scale the 3D
    // displacement from the PCA mean by `planeSize`. This ensures a uniform
    // magnification of the 3D in-plane distance from the mean.
    const planePoint = this._inverseRaw(x, y)
    const ps = this._planeSize || 1
    if (ps === 1) return planePoint
    const mean = this.getMean()
    // scaled = mean + (planePoint - mean) * ps
    return mean.add(planePoint.subtract(mean).scale(ps))
  }

  /**
   * Reconstruct the 3D point on the PCA plane for normalized coords x,y in [-1,1]
   * without applying the `planeSize` scaling. This is a helper used by
   * `inverse()` and `inverseWithSignedDistance()`.
   */
  private _inverseRaw(x: number, y: number): Vector3 {
    if (!this._pcaInstance) throw new Error('PCA not available')
    const sx = this._scales[0] || 1
    const sy = this._scales[1] || 1
    // raw PCA coords = normalized * scale
    const denorm = new Matrix([[ x * sx, y * sy ]])
    const reconstructed = this._pcaInstance.invert(denorm)
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

    // Use raw (unscaled) plane point first, then apply planeSize scaling
    const rawPlanePoint = this._inverseRaw(x, y)
    const ps = this._planeSize || 1
    const planePoint = ps === 1 ? rawPlanePoint : this.getMean().add(rawPlanePoint.subtract(this.getMean()).scale(ps))

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
}

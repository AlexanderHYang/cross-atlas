import type { IPoint } from '../../shared/src/IPoint'
import type { PointSyncData, Vector3SyncData } from '../../shared/src/SyncManager'
import { inverseEquirectangularNormalizedXY, equirectangularNormalizedXY, latLonToVec3 } from '../../shared/src/projection'

export class Point2D implements IPoint {
  id: string
  // normalized equirectangular coords [-1,1]
  nx = 0
  ny = 0
  color = '#ff0000'
  radius = 8
  onLocalChange?: () => void
  ignoreRemote = false

  constructor(id?: string, nx = 0, ny = 0, color = '#ff0000') {
    this.id = id ?? `pt2d_${Math.random().toString(36).slice(2,8)}`
    this.nx = nx
    this.ny = ny
    this.color = color
  }

  // Called by SyncManager to read canonical payload
  getLocalData(): PointSyncData {
    // convert normalized equirectangular (nx,ny) to normalized 3D vector
    const { lat, lon } = inverseEquirectangularNormalizedXY(this.nx, this.ny)
    const v = latLonToVec3(lat, lon, 1)
    const pos: Vector3SyncData = { x: v.x, y: v.y, z: v.z }
    return { id: this.id, position: pos }
  }

  // Called by SyncManager to apply remote payload
  applyRemoteData(data: PointSyncData) {
    if (!data || !data.position) return
    // convert normalized 3D -> equirectangular nx,ny
    const x = data.position.x
    const y = data.position.y
    const z = data.position.z
    // lat = asin(y), lon = atan2(z,x)
    const lat = Math.asin(Math.max(-1, Math.min(1, y)))
    const lon = Math.atan2(z, x)
    const { nx, ny } = equirectangularNormalizedXY(lat, lon)
    this.nx = nx
    this.ny = ny
  }

  // draw on a canvas context (cx,cy are pixel coords)
  draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const x = ((this.nx + 1) / 2) * width
    const y = ((1 - (this.ny + 1) / 2)) * height
    ctx.beginPath()
    ctx.fillStyle = this.color
    ctx.arc(x, y, this.radius, 0, Math.PI * 2)
    ctx.fill()
  }

  // hit test pixel coords
  hitTest(px: number, py: number, width: number, height: number) {
    const x = ((this.nx + 1) / 2) * width
    const y = ((1 - (this.ny + 1) / 2)) * height
    const dx = px - x
    const dy = py - y
    return dx * dx + dy * dy <= this.radius * this.radius
  }

  // set normalized coords from pixel coords
  setFromPixel(px: number, py: number, width: number, height: number, skipSync = false) {
    const nx = (px / width) * 2 - 1
    const ny = ((height - py) / height) * 2 - 1
    this.nx = nx
    this.ny = ny
    if (!skipSync && this.onLocalChange) this.onLocalChange()
  }
}

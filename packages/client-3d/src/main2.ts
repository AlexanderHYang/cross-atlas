import { sceneManager } from './SceneManager'
import { SyncManager3D } from './SyncManager3D'
import { Point3D } from './Point3D'
import { Vector3 } from '@babylonjs/core'
import { initWebXR } from './xr/webxrExperience'
import { DEFAULT_POINT_CONFIGS, DEFAULT_SPHERE_RADIUS } from '../../shared/src/defaultPoints'

// initialize scene
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement
sceneManager.init(canvas)
const scene = sceneManager.getScene()

void initWebXR(scene)

const env = sceneManager.createEnvironment({ bigRadius: DEFAULT_SPHERE_RADIUS })
const { bigRadius, plane } = env

const liftOffset = 0.5
const sphereCenter = new Vector3(0, liftOffset, 0)


// create SyncManager
const syncManager3D = await SyncManager3D.create()

// create simple 3D points and add them to sync manager
for (const cfg of DEFAULT_POINT_CONFIGS) {
  const direction = new Vector3(cfg.direction.x, cfg.direction.y, cfg.direction.z)
  if (direction.lengthSquared() === 0) {
    continue
  }
  const initialPosition = direction.normalize().scale(bigRadius).add(sphereCenter)
  const point = new Point3D(cfg.id, scene, syncManager3D, initialPosition)
  syncManager3D.registerPoint(point)
}


sceneManager.getEngine().runRenderLoop(() => {
  // render the scene
  scene.render()
})
window.addEventListener('resize', () => sceneManager.getEngine().resize())

// toggle projection plane with 'p'
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'p' || ev.key === 'P') {
    console.log('Toggling projection plane visibility')
    plane.isVisible = !plane.isVisible
  }
})

import { sceneManager } from './SceneManager'
import { SyncManager3D } from './SyncManager3D'
import { Point3D } from './Point3D'
import { Vector3 } from '@babylonjs/core'
import { initWebXR } from './xr/webxrExperience'

// initialize scene
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement
sceneManager.init(canvas)
const scene = sceneManager.getScene()

void initWebXR(scene)

const env = sceneManager.createEnvironment({ bigRadius: 3.0 })
const { bigSphere, bigRadius, ground, plane, planeWidth, planeHeight } = env
console.log(bigRadius)


// create SyncManager
const syncManager3D = await SyncManager3D.create(plane)

// create simple 3D points and add them to sync manager
const p1 = new Point3D("point1", scene, syncManager3D, new Vector3(0, bigRadius, 0))
syncManager3D.registerPoint(p1)

const p2 = new Point3D("point2", scene, syncManager3D, new Vector3(0, -bigRadius, 0))
syncManager3D.registerPoint(p2)

const p3 = new Point3D("point3", scene, syncManager3D, new Vector3(bigRadius, 0, 0))
syncManager3D.registerPoint(p3)


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

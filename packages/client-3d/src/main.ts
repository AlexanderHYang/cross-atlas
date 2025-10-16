import { sceneManager } from './SceneManager'
import { SyncManager } from '../../shared/src/SyncManager'
import { Point3D } from './Point3D'

// initialize scene
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement
sceneManager.init(canvas)
const scene = sceneManager.getScene()

const env = sceneManager.createEnvironment({ bigRadius: 1.5 })
const { bigSphere, bigRadius, ground, plane, planeWidth, planeHeight } = env


// Create SyncManager
const syncManager = new SyncManager()

// create a 3d point and add it to sync manager
const point3D = new Point3D(scene)
// point3D.setPosition({ x: bigRadius, y: 0, z: 0 }) // start at "north pole"
syncManager.registerPoint(point3D)




sceneManager.getEngine().runRenderLoop(() => {
  // render the scene
  scene.render()
})
window.addEventListener('resize', () => sceneManager.getEngine().resize())

// toggle projection mode with 'p'
// window.addEventListener('keydown', (ev) => {
//   if (ev.key === 'p' || ev.key === 'P') {
//     toggleProjectionMode()
//     console.log('Projection mode is now', getProjectionMode())
//   }
// })

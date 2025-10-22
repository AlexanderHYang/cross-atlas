import { sceneManager } from './SceneManager'
import { SyncManager } from '../../shared/src/SyncManager'
import { Point3D } from './Point3D'
import { Vector3 } from '@babylonjs/core'

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

syncManager.syncedMetadataMap.observe((event) => {
  console.log('Metadata changed:', event)
  for (const key of event.keysChanged) {
    const metadata = syncManager.syncedMetadataMap.get(key)
    if (metadata?.pcaPlaneNormal) {
      const normalData = metadata.pcaPlaneNormal
      const normalVec = new Vector3(normalData.x, normalData.y, normalData.z)
      plane.setDirection(normalVec)
      plane.position = Vector3.Zero()
      console.log('Updated PCA plane normal to', normalVec)
    }
  }
})



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

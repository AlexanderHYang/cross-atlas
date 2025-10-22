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
const p1 = new Point3D(scene)
syncManager.registerPoint(p1)
const p2 = new Point3D(scene)
p2.mesh.position = new Vector3(1, 0, 0).scale(bigRadius)
syncManager.registerPoint(p2)

function observeMetadataChanges() {
  syncManager.syncedMetadataMap.observe((event) => {
    console.log('Metadata changed:', event)
    for (const key of event.keysChanged) {
      const metadata = syncManager.syncedMetadataMap.get(key)
      if (metadata?.pcaPlaneNormal && metadata?.pcaPlaneMean) {
        const normalData = metadata.pcaPlaneNormal
        const normalVec = new Vector3(normalData.x, normalData.y, normalData.z)
        plane.setDirection(normalVec)

        const meanData = metadata.pcaPlaneMean
        const meanVec = new Vector3(meanData.x, meanData.y, meanData.z)
        plane.position = meanVec

        console.log('Updated projection plane to normal', normalVec, 'and mean', meanVec)
      }
    }
  })
}
observeMetadataChanges()


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

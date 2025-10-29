import { sceneManager } from './SceneManager'
import { SyncManager3D } from './SyncManager3D'
import { Chart3D } from './Chart3D'
import { Vector3 } from '@babylonjs/core'
import { Chart } from '../../shared/src/Chart'

// initialize scene
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement
sceneManager.init(canvas)
const scene = sceneManager.getScene()

const env = sceneManager.createEnvironment({ bigRadius: 3.0 })
const { bigSphere, bigRadius, ground, plane, planeWidth, planeHeight } = env
console.log(bigRadius)


// create SyncManager
const syncManager3D = await SyncManager3D.create(scene)

// create a 3d chart and add it to sync manager
const chart1 = new Chart3D("chart1", new Chart('line', scene), syncManager3D)
chart1.chart.setPosition(new Vector3(0, bigRadius, 0))
syncManager3D.registerChart(chart1)

const chart2 = new Chart3D("chart2", new Chart('line', scene), syncManager3D)
chart2.chart.setPosition(new Vector3(0, -bigRadius, 0))
syncManager3D.registerChart(chart2)

const chart3 = new Chart3D("chart3", new Chart('line', scene), syncManager3D)
chart3.chart.setPosition(new Vector3(bigRadius, 0, 0))
syncManager3D.registerChart(chart3)


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

import { sceneManager } from './SceneManager'
import { SyncManager3D } from './SyncManager3D'
import { Point3D } from './Point3D'
import { Vector3, Color3, PointerEventTypes } from '@babylonjs/core'
import type { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience'
import { initWebXR } from './xr/webxrExperience'
import { DEFAULT_POINT_CONFIGS, DEFAULT_SPHERE_RADIUS } from '../../shared/src/defaultPoints'

// initialize scene
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement
sceneManager.init(canvas)
const scene = sceneManager.getScene()

const xrExperience = await initWebXR(scene)

const env = sceneManager.createEnvironment({ bigRadius: DEFAULT_SPHERE_RADIUS })
const { bigRadius, plane } = env

const liftOffset = 0.5
const sphereCenter = new Vector3(0, liftOffset, 0)


// create SyncManager
const pointsByMeshId = new Map<string, Point3D>()
const pointsById = new Map<string, Point3D>()
const syncManager3D = await SyncManager3D.create(plane)

// create simple 3D points and add them to sync manager
for (const cfg of DEFAULT_POINT_CONFIGS) {
  const direction = new Vector3(cfg.direction.x, cfg.direction.y, cfg.direction.z)
  if (direction.lengthSquared() === 0) {
    continue
  }
  const initialPosition = direction.normalize().scale(bigRadius).add(sphereCenter)
  const color = cfg.color ? new Color3(cfg.color.x, cfg.color.y, cfg.color.z) : undefined
  const point = new Point3D(cfg.id, scene, syncManager3D, initialPosition, {
    color,
    draggable: cfg.draggable,
    selectable: cfg.selectable,
  })
  syncManager3D.registerPoint(point)
  pointsByMeshId.set(point.mesh.id, point)
  pointsById.set(point.id, point)
}

const successColor = Color3.FromHexString('#2ecc71')
const errorColor = Color3.FromHexString('#c0392b')
let stageTransitionHandle: number | null = null
let lastStage: number | null = null

scene.onPointerObservable.add((pointerInfo) => {
  if (pointerInfo.type !== PointerEventTypes.POINTERPICK) {
    return
  }
  const pickInfo = pointerInfo.pickInfo
  if (!pickInfo?.hit || !pickInfo.pickedMesh) {
    return
  }
  const point = pointsByMeshId.get(pickInfo.pickedMesh.id)
  if (!point) {
    return
  }
  handlePointSelection(point)
})

setupXRTaskInteractions(xrExperience)
syncManager3D.onTaskStateChange((task) => {
  handleTaskStateChange(task)
})

function handlePointSelection(point: Point3D) {
  const task = syncManager3D.getCurrentTask()
  if (!task || !task.targetPointId || task.completed) {
    return
  }

  const stage = task.stage ?? 1

  // Stage 1 or 3: 3D user matches the 2D-highlighted point.
  if (stage === 1 || stage === 3) {
    if (point.id === task.targetPointId) {
      point.setDisplayColor(successColor)
      syncManager3D.markGuessStageSuccess(task.id)
      scheduleNextStageFrom3D(stage, task.id)
    } else {
      point.flashColorSynced(errorColor, 1000)
    }
    return
  }

  // Stage 2 is driven by 2D clicks; ignore 3D selections.
}

function setupXRTaskInteractions(xr: WebXRDefaultExperience | null) {
  const pointerSelection = xr?.pointerSelection
  const selectionObservable = pointerSelection?.onSelectionObservable
  if (!selectionObservable) {
    console.warn('XR pointer selection not available; task interactions disabled')
    return
  }

  selectionObservable.add((event) => {
    const pickInfo = (event as any)?.pickInfo ?? (event as any)?.pointerInfo?.pickInfo
    if (!pickInfo?.hit || !pickInfo.pickedMesh) {
      return
    }
    const point = pointsByMeshId.get(pickInfo.pickedMesh.id)
    if (!point) {
      return
    }
    handlePointSelection(point)
  })
}

function handleTaskStateChange(task: ReturnType<typeof syncManager3D.getCurrentTask>) {
  const stage = task?.stage ?? 1
  if (lastStage !== stage && task?.feedback === 'none') {
    resetAllPointColors()
  }
  lastStage = stage
  if (stage === 2 || stage === 4) {
    applyStage2Visuals(task)
  }
}

function applyStage2Visuals(task: ReturnType<typeof syncManager3D.getCurrentTask>) {
  const stage = task?.stage ?? 1
  if (!task || (stage !== 2 && stage !== 4) || !task.targetPointId) {
    return
  }

  if (task.feedback === 'none') {
    resetAllPointColors()
  }

  const targetPoint = pointsById.get(task.targetPointId)
  if (!targetPoint) {
    return
  }

  if (task.feedback === 'none' || task.feedback === 'success') {
    targetPoint.setDisplayColor(successColor)
  }
}

function resetAllPointColors() {
  for (const p of pointsById.values()) {
    p.resetToBaseColor()
  }
}

function scheduleNextStageFrom3D(currentStage: number, taskId: string) {
  if (stageTransitionHandle !== null) {
    window.clearTimeout(stageTransitionHandle)
  }
  stageTransitionHandle = window.setTimeout(() => {
    stageTransitionHandle = null
    if (currentStage === 1) {
      syncManager3D.setStage(2, taskId)
    } else if (currentStage === 3) {
      syncManager3D.setStage(4, taskId)
    }
  }, 1000)
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

import {
    Engine,
    Scene,
    ArcRotateCamera,
    Vector3,
    HemisphericLight,
    DirectionalLight,
    MeshBuilder,
    Color3,
} from '@babylonjs/core'
import { GridMaterial } from '@babylonjs/materials'
import * as BABYLON from '@babylonjs/core'

export class SceneManager {
    public engine!: Engine
    public scene!: Scene
    public camera!: ArcRotateCamera
    
    init(canvas: HTMLCanvasElement) {
        this.engine = new Engine(canvas, true)
        this.scene = new Scene(this.engine)
        
        this.camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 10, Vector3.Zero(), this.scene)
        this.camera.attachControl(canvas, true)
        
        const hemi = new HemisphericLight('h', new Vector3(0, 1, 0), this.scene)
        hemi.intensity = 0.8

        const keyLight = new DirectionalLight('key', new Vector3(-0.4, -1, -0.3), this.scene)
        keyLight.position = new Vector3(4, 8, 4)
        keyLight.intensity = 0.45
        keyLight.diffuse = new Color3(1, 0.98, 0.92)
        
        this.engine.runRenderLoop(() => this.scene.render())
        window.addEventListener('resize', () => this.engine.resize())
        
        return this
    }
    
    getScene() {
        if (!this.scene) throw new Error('SceneManager not initialized')
            return this.scene
    }
    
    getEngine() {
        if (!this.engine) throw new Error('SceneManager not initialized')
            return this.engine
    }
    
    getCamera() {
        if (!this.camera) throw new Error('SceneManager not initialized')
            return this.camera
    }
    
    createEnvironment(opts: { bigRadius?: number } = {}) {
        const scene = this.getScene()
        const bigRadius = opts.bigRadius ?? 1.5

        const planeWidth = 4 * bigRadius
        const planeHeight = 4 * bigRadius
        const plane = MeshBuilder.CreatePlane('mercPlane', { width: planeWidth, height: planeHeight }, scene)
        const planeMat = new GridMaterial('planeMat', scene)
        planeMat.lineColor = new Color3(0.6, 0.6, 0.8)
        planeMat.mainColor = new Color3(0.4, 0.4, 0.6)
        planeMat.opacity = 0.8
        planeMat.backFaceCulling = false
        plane.material = planeMat

        plane.position = new Vector3(0, 0, 0)
        plane.rotation = new Vector3(0, 0, 0)
        plane.isPickable = false
        plane.isVisible = false
        
        return { bigRadius, plane, planeWidth, planeHeight }
    }
}

export const sceneManager = new SceneManager()

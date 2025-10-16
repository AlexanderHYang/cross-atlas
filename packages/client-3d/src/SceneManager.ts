import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core'
import { GridMaterial } from '@babylonjs/materials'

export class SceneManager {
    public engine!: Engine
    public scene!: Scene
    public camera!: ArcRotateCamera
    
    init(canvas: HTMLCanvasElement) {
        this.engine = new Engine(canvas, true)
        this.scene = new Scene(this.engine)
        
        this.camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 10, Vector3.Zero(), this.scene)
        this.camera.attachControl(canvas, true)
        
        new HemisphericLight('h', new Vector3(0, 1, 0), this.scene)
        
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
        
        const bigSphere = MeshBuilder.CreateSphere('big', { diameter: bigRadius * 2, segments: 32 }, scene)
        const bigMat = new StandardMaterial('bigMat', scene)
        bigMat.diffuseColor = new Color3(0.6, 0.7, 1)
        bigMat.alpha = 0.25
        bigMat.specularColor = new Color3(0.3, 0.3, 0.4)
        bigSphere.material = bigMat
        bigSphere.isPickable = false
        
        const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene)
        ground.position.y = -1.5
        const groundMat = new GridMaterial('groundMat', scene)
        groundMat.opacity = 0.8
        ground.material = groundMat
        
        const planeWidth = 4 * bigRadius
        const planeHeight = 4 * bigRadius
        const planeX = 4 * bigRadius
        const plane = MeshBuilder.CreatePlane('mercPlane', { width: planeWidth, height: planeHeight }, scene)
        plane.position = new Vector3(planeX, 0, 0)
        plane.rotation = new Vector3(0, Math.PI / 2, 0)
        const planeMat = new GridMaterial('planeMat', scene)
        planeMat.mainColor = new Color3(0.3, 0.3, 0.3)
        plane.material = planeMat
        
        return { bigSphere, bigRadius, ground, plane, planeWidth, planeHeight }
    }
}

export const sceneManager = new SceneManager()
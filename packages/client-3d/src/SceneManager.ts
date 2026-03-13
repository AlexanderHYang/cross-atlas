import {
    Engine,
    Scene,
    ArcRotateCamera,
    Vector3,
    HemisphericLight,
    DirectionalLight,
    MeshBuilder,
    Color3,
    StandardMaterial,
    TransformNode,
} from '@babylonjs/core'
import { GridMaterial } from '@babylonjs/materials'
import * as BABYLON from '@babylonjs/core'
import type { LayoutType } from '../../shared/src/defaultPoints'

const CURVATURE_GUIDE_COLOR = Color3.FromHexString('#f2a65a')
const CURVATURE_GUIDE_LINE_ALPHA = 0.65
const CURVATURE_GUIDE_MINOR_LINE_ALPHA = 0.16
const HALF_PI = Math.PI / 2
const FULL_PI = Math.PI

function createSphericalPoint(
    center: Vector3,
    radius: number,
    latitude: number,
    longitude: number,
) {
    const cosLatitude = Math.cos(latitude)
    return new Vector3(
        center.x + radius * cosLatitude * Math.cos(longitude),
        center.y + radius * Math.sin(latitude),
        center.z + radius * cosLatitude * Math.sin(longitude),
    )
}

function buildLatitudePath(
    center: Vector3,
    radius: number,
    latitude: number,
    longitudeStart: number,
    longitudeEnd: number,
    segments: number,
) {
    const points: Vector3[] = []
    for (let i = 0; i <= segments; i++) {
        const t = i / segments
        const longitude = longitudeStart + (longitudeEnd - longitudeStart) * t
        points.push(createSphericalPoint(center, radius, latitude, longitude))
    }
    return points
}

function buildLongitudePath(
    center: Vector3,
    radius: number,
    longitude: number,
    latitudeStart: number,
    latitudeEnd: number,
    segments: number,
) {
    const points: Vector3[] = []
    for (let i = 0; i <= segments; i++) {
        const t = i / segments
        const latitude = latitudeStart + (latitudeEnd - latitudeStart) * t
        points.push(createSphericalPoint(center, radius, latitude, longitude))
    }
    return points
}

function createGuideLine(
    scene: Scene,
    root: TransformNode,
    name: string,
    points: Vector3[],
    alpha = CURVATURE_GUIDE_LINE_ALPHA,
) {
    const line = MeshBuilder.CreateLines(name, { points, useVertexAlpha: true }, scene)
    line.color = CURVATURE_GUIDE_COLOR
    line.alpha = alpha
    line.parent = root
    line.isPickable = false
    return line
}

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

    createCurvatureGuide(opts: { layout: LayoutType; radius: number; center: Vector3 }) {
        const scene = this.getScene()
        const root = new TransformNode('curvatureGuideRoot', scene)
        const { layout, radius, center } = opts

        if (layout === 'planar') {
            const guidePlane = MeshBuilder.CreatePlane(
                'curvaturePlane',
                { width: radius * 2.2, height: radius * 2.2 },
                scene,
            )
            const guideMat = new GridMaterial('curvaturePlaneMat', scene)
            guideMat.lineColor = CURVATURE_GUIDE_COLOR
            guideMat.mainColor = CURVATURE_GUIDE_COLOR.scale(0.15)
            guideMat.opacity = 0.8
            guideMat.backFaceCulling = false
            guideMat.majorUnitFrequency = 4
            guideMat.minorUnitVisibility = 0.35
            guideMat.gridRatio = 0.5
            guidePlane.material = guideMat
            guidePlane.position = center.add(new Vector3(radius, 0, 0))
            guidePlane.rotation = new Vector3(0, HALF_PI, 0)
            guidePlane.parent = root
            guidePlane.isPickable = false
        } else {
            const longitudeStart = layout === 'hemispherical' ? -HALF_PI : -FULL_PI
            const longitudeEnd = layout === 'hemispherical' ? HALF_PI : FULL_PI
            const majorLatitudes = [-60, -30, 0, 30, 60].map((deg) => (deg * Math.PI) / 180)
            const minorLatitudes = [-75, -45, -15, 15, 45, 75].map((deg) => (deg * Math.PI) / 180)
            const majorLongitudes =
                layout === 'hemispherical'
                    ? [-90, -45, 0, 45, 90]
                    : [-135, -90, -45, 0, 45, 90, 135]
            const minorLongitudes =
                layout === 'hemispherical'
                    ? [-67.5, -22.5, 22.5, 67.5]
                    : [-157.5, -112.5, -67.5, -22.5, 22.5, 67.5, 112.5, 157.5]

            const ribbon = MeshBuilder.CreateRibbon(
                'curvatureSurface',
                {
                    pathArray: Array.from({ length: 19 }, (_, index) => {
                        const latitude = -HALF_PI + (FULL_PI * index) / 18
                        return buildLatitudePath(center, radius, latitude, longitudeStart, longitudeEnd, 64)
                    }),
                    sideOrientation: BABYLON.Mesh.DOUBLESIDE,
                },
                scene,
            )
            const surfaceMat = new StandardMaterial('curvatureSurfaceMat', scene)
            surfaceMat.diffuseColor = CURVATURE_GUIDE_COLOR.scale(0.45)
            surfaceMat.emissiveColor = CURVATURE_GUIDE_COLOR.scale(0.2)
            surfaceMat.alpha = 0.02
            surfaceMat.backFaceCulling = false
            surfaceMat.disableLighting = true
            surfaceMat.forceDepthWrite = false
            ribbon.material = surfaceMat
            ribbon.parent = root
            ribbon.isPickable = false

            minorLatitudes.forEach((latitude, index) => {
                createGuideLine(
                    scene,
                    root,
                    `curvatureLatitudeMinor${index}`,
                    buildLatitudePath(center, radius, latitude, longitudeStart, longitudeEnd, 96),
                    CURVATURE_GUIDE_MINOR_LINE_ALPHA,
                )
            })

            minorLongitudes.forEach((longitudeDeg, index) => {
                createGuideLine(
                    scene,
                    root,
                    `curvatureLongitudeMinor${index}`,
                    buildLongitudePath(
                        center,
                        radius,
                        (longitudeDeg * Math.PI) / 180,
                        -HALF_PI,
                        HALF_PI,
                        72,
                    ),
                    CURVATURE_GUIDE_MINOR_LINE_ALPHA,
                )
            })

            majorLatitudes.forEach((latitude, index) => {
                createGuideLine(
                    scene,
                    root,
                    `curvatureLatitude${index}`,
                    buildLatitudePath(center, radius, latitude, longitudeStart, longitudeEnd, 96),
                )
            })

            majorLongitudes.forEach((longitudeDeg, index) => {
                createGuideLine(
                    scene,
                    root,
                    `curvatureLongitude${index}`,
                    buildLongitudePath(
                        center,
                        radius,
                        (longitudeDeg * Math.PI) / 180,
                        -HALF_PI,
                        HALF_PI,
                        72,
                    ),
                )
            })

            if (layout === 'hemispherical') {
                createGuideLine(
                    scene,
                    root,
                    'curvatureHemisphereRim',
                    Array.from({ length: 97 }, (_, index) => {
                        const angle = (Math.PI * 2 * index) / 96
                        return new Vector3(
                            center.x,
                            center.y + radius * Math.cos(angle),
                            center.z + radius * Math.sin(angle),
                        )
                    }),
                )
            }
        }

        root.setEnabled(false)
        return root
    }
}

export const sceneManager = new SceneManager()

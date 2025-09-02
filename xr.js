import * as BABYLON from "@babylonjs/core";
import * as GUI3D from "@babylonjs/gui/3D";
import * as GUI from "@babylonjs/gui";
import { setLayout, addChart, removeChart } from "./layout.js";

export async function setupWebXR(scene) {
   
    // initialize XR
    const xr = await scene.createDefaultXRExperienceAsync({
        optionalFeatures: true,
    });

    const xrFeatureManager = xr.baseExperience.featuresManager;
    const xrHandFeature = xrFeatureManager.enableFeature(
        BABYLON.WebXRFeatureName.HAND_TRACKING,
        "latest",
        {
            xrInput: xr.input,
        }
    );

    const manager = new GUI3D.GUI3DManager(scene);

    // Hand Menu
    const handMenu = new GUI.HandMenu(xr.baseExperience, "menu");
    const handConstraintBehavior = handMenu.handConstraintBehavior;
    handConstraintBehavior.palmUpStrictness = 0.8;
    handConstraintBehavior.handConstraintVisibility = BABYLON.HandConstraintVisibility.PALM_UP;
    handConstraintBehavior.targetZone = BABYLON.HandConstraintZone.ULNAR_SIDE;
    handConstraintBehavior.nodeOrientationMode = BABYLON.HandConstraintOrientation.HAND_ROTATION;
    handConstraintBehavior.targetOffset = 0.15;
    handConstraintBehavior.handedness = "left";
    handMenu.columns = 2;
    manager.addControl(handMenu);
    handMenu.backPlateMargin = 0.1;
    handMenu.scaling = new BABYLON.Vector3(0.06, 0.06, 0.06);

    // Helper function to create UI buttons for handMenu
    const createButton = (name, text, shareMaterial = true) => {
        const button = new GUI.TouchHolographicButton(name, shareMaterial);
        button.text = text;
        handMenu.addButton(button);
        return button;
    };

    const planeBtn = createButton("planeBtn", "Plane");
    planeBtn.onPointerUpObservable.add(() => setLayout(0));

    const cylinderBtn = createButton("cylinderBtn", "Cylinder");
    cylinderBtn.onPointerUpObservable.add(() => setLayout(1));

    const sphereBtn = createButton("sphereBtn", "Sphere");
    sphereBtn.onPointerUpObservable.add(() => setLayout(2));

    const addChartBtn = createButton("addChartBtn", "Add Chart");
    addChartBtn.onPointerUpObservable.add(() => addChart(scene));

    const removeChartBtn = createButton("removeChartBtn", "Remove Chart");
    removeChartBtn.onPointerUpObservable.add(() => removeChart(scene));

    return xr;
}

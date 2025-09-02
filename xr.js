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

    // Floating menu in VR environment
    const panel = new GUI3D.PlanePanel();
    panel.margin = 0.2;
    panel.position = new BABYLON.Vector3(0, 1.5, 2.5); // Floating in front of user
    panel.scaling = new BABYLON.Vector3(0.5, 0.5, 0.5);
    manager.addControl(panel);

    // Helper function to create UI buttons for floating menu
    const createButton = (name, text, shareMaterial = true) => {
        const button = new GUI3D.HolographicButton(name, shareMaterial);
        button.text = text;
        panel.addControl(button);
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

import * as BABYLON from "@babylonjs/core";
import * as GUI3D from "@babylonjs/gui/3D";
import * as GUI from "@babylonjs/gui";
import { setLayout, addChart, removeChart } from "./layout.js";

export async function setupWebXR(scene) {
    // --- WebXR Initialization ---
    const xr = await scene.createDefaultXRExperienceAsync({
        uiOptions: {
            sessionMode: "immersive-vr",
            referenceSpaceType: "local-floor",
        },
        optionalFeatures: true,
    });

    // Enable hand tracking if available
    if (xr && xr.baseExperience && xr.baseExperience.featuresManager) {
        try {
            await xr.baseExperience.featuresManager.enableFeature(
                BABYLON.WebXRFeatureName.HAND_TRACKING,
                "latest",
                { xrInput: xr.input }
            );
        } catch (e) {
            // Hand tracking not available
        }
    }

    // Create a floating 2D panel in 3D space
    const panelWidth = 1.2; // meters
    const panelHeight = 0.9; // meters
    const panelMesh = BABYLON.MeshBuilder.CreatePlane(
        "authoringPanelMesh",
        { width: panelWidth, height: panelHeight },
        scene
    );
    panelMesh.position = new BABYLON.Vector3(0, 1.5, 1.5); // 1.5m in front of user, 1.5m high
    panelMesh.rotation = new BABYLON.Vector3(0, Math.PI, 0); // face the user

    // Attach GUI to the mesh
    const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(panelMesh, 1200, 900); // 1200x900 px

    // Panel background
    const authoringPanel = new GUI.Rectangle();
    authoringPanel.width = 1;
    authoringPanel.height = 1;
    authoringPanel.cornerRadius = 40;
    authoringPanel.color = "#aaa";
    authoringPanel.thickness = 4;
    authoringPanel.background = "#222e";
    advancedTexture.addControl(authoringPanel);

    // StackPanel for vertical layout
    const authoringStack = new GUI.StackPanel();
    authoringStack.isVertical = true;
    authoringStack.paddingTop = "40px";
    authoringStack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    authoringStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    authoringPanel.addControl(authoringStack);

    // Label
    const label = new GUI.TextBlock();
    label.text = "Authoring Panel";
    label.height = "40px";
    label.color = "white";
    label.fontSize = 28;
    label.marginBottom = "18px";
    authoringStack.addControl(label);

    // --- Layout Sliders Section ---
    const slidersSection = new GUI.StackPanel();
    slidersSection.isVertical = true;
    slidersSection.width = 0.9;
    slidersSection.paddingBottom = "10px";
    slidersSection.background = "#222c";
    slidersSection.cornerRadius = 18;
    slidersSection.thickness = 0;
    slidersSection.marginBottom = "18px";

    // Slider helper
    function addSlider(labelText, min, max, value, callback) {
        const sliderRow = new GUI.StackPanel();
        sliderRow.isVertical = false;
        sliderRow.height = "40px";
        sliderRow.width = 1;
        sliderRow.paddingBottom = "4px";

        const sliderLabel = new GUI.TextBlock();
        sliderLabel.text = labelText;
        sliderLabel.width = "120px";
        sliderLabel.color = "#fff";
        sliderLabel.fontSize = 18;
        sliderLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;

        const slider = new GUI.Slider();
        slider.minimum = min;
        slider.maximum = max;
        slider.value = value;
        slider.height = "18px";
        slider.width = "180px";
        slider.color = "#3a7";
        slider.background = "#444";
        slider.borderColor = "#aaa";
        slider.onValueChangedObservable.add(callback);

        const valueText = new GUI.TextBlock();
        valueText.text = value.toFixed(2);
        valueText.width = "50px";
        valueText.color = "#fff";
        valueText.fontSize = 16;
        valueText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        slider.onValueChangedObservable.add((v) => (valueText.text = v.toFixed(2)));

        sliderRow.addControl(sliderLabel);
        sliderRow.addControl(slider);
        sliderRow.addControl(valueText);
        slidersSection.addControl(sliderRow);
    }

    // Import layout update functions from layout.js
    // (Assumes setLayout, addChart, removeChart are imported, and layout.js exposes updateRows, updateCurve, updateMarginX, updateMarginY)
    // If not, you may need to re-export them from layout.js
    addSlider("Rows", 1, 8, 3, (v) => setLayout({ type: "rows", value: Math.floor(v) }));
    addSlider("Curvature", 0, 10, 5, (v) => setLayout({ type: "curve", value: v }));
    addSlider("Margin X", 0, 10, 0.5, (v) => setLayout({ type: "marginX", value: v }));
    addSlider("Margin Y", 0, 10, 0.5, (v) => setLayout({ type: "marginY", value: v }));
    authoringStack.addControl(slidersSection);

    // Chart type selection using radio buttons
    const chartTypes = [
        { label: "2D Bar Chart", value: "2d" },
        { label: "3D Bar Chart", value: "3d" },
        { label: "Pie Chart", value: "pie" },
        { label: "Line Chart", value: "line" },
    ];
    let selectedChartType = chartTypes[0].value;

    const radioPanel = new GUI.StackPanel();
    radioPanel.isVertical = true;
    radioPanel.width = 0.8;
    radioPanel.height = "120px";
    radioPanel.paddingBottom = "10px";
    radioPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    radioPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    radioPanel.marginBottom = "18px";

    chartTypes.forEach((type, idx) => {
        const radioBtn = new GUI.RadioButton();
        radioBtn.width = "24px";
        radioBtn.height = "24px";
        radioBtn.color = "#3a7";
        radioBtn.background = "#222";
        radioBtn.isChecked = idx === 0;
        radioBtn.onIsCheckedChangedObservable.add((state) => {
            if (state) selectedChartType = type.value;
        });

        const header = GUI.Control.AddHeader(radioBtn, type.label, "180px", {
            isHorizontal: true,
            controlFirst: true,
        });
        header.height = "32px";
        header.color = "#fff";
        header.fontSize = 18;
        radioPanel.addControl(header);
    });
    authoringStack.addControl(radioPanel);

    // Add Chart button
    const addBtn = GUI.Button.CreateSimpleButton("addChartBtn2D", "Add Chart");
    addBtn.width = "140px";
    addBtn.height = "40px";
    addBtn.color = "white";
    addBtn.background = "#3a7";
    addBtn.cornerRadius = 10;
    addBtn.thickness = 1.5;
    addBtn.fontSize = 20;
    addBtn.marginBottom = "12px";
    addBtn.onPointerUpObservable.add(() => {
        if (typeof addChart === "function") {
            addChart(scene, selectedChartType);
        }
    });
    authoringStack.addControl(addBtn);

    // Layout buttons (now 2D)
    const layoutBtnsPanel = new GUI.StackPanel();
    layoutBtnsPanel.isVertical = false;
    layoutBtnsPanel.height = "40px";
    layoutBtnsPanel.width = 1;
    layoutBtnsPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    layoutBtnsPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    layoutBtnsPanel.marginBottom = "12px";

    const planeBtn = GUI.Button.CreateSimpleButton("planeBtn", "Plane");
    planeBtn.width = "100px";
    planeBtn.height = "36px";
    planeBtn.color = "white";
    planeBtn.background = "#444";
    planeBtn.cornerRadius = 8;
    planeBtn.thickness = 1.2;
    planeBtn.fontSize = 16;
    planeBtn.marginRight = "8px";
    planeBtn.onPointerUpObservable.add(() => setLayout(0));
    layoutBtnsPanel.addControl(planeBtn);

    const cylinderBtn = GUI.Button.CreateSimpleButton("cylinderBtn", "Cylinder");
    cylinderBtn.width = "100px";
    cylinderBtn.height = "36px";
    cylinderBtn.color = "white";
    cylinderBtn.background = "#444";
    cylinderBtn.cornerRadius = 8;
    cylinderBtn.thickness = 1.2;
    cylinderBtn.fontSize = 16;
    cylinderBtn.marginRight = "8px";
    cylinderBtn.onPointerUpObservable.add(() => setLayout(1));
    layoutBtnsPanel.addControl(cylinderBtn);

    const sphereBtn = GUI.Button.CreateSimpleButton("sphereBtn", "Sphere");
    sphereBtn.width = "100px";
    sphereBtn.height = "36px";
    sphereBtn.color = "white";
    sphereBtn.background = "#444";
    sphereBtn.cornerRadius = 8;
    sphereBtn.thickness = 1.2;
    sphereBtn.fontSize = 16;
    sphereBtn.onPointerUpObservable.add(() => setLayout(2));
    layoutBtnsPanel.addControl(sphereBtn);
    authoringStack.addControl(layoutBtnsPanel);

    // Remove Chart button
    const removeChartBtn = GUI.Button.CreateSimpleButton("removeChartBtn", "Remove Chart");
    removeChartBtn.width = "140px";
    removeChartBtn.height = "40px";
    removeChartBtn.color = "white";
    removeChartBtn.background = "#a33";
    removeChartBtn.cornerRadius = 10;
    removeChartBtn.thickness = 1.5;
    removeChartBtn.fontSize = 20;
    removeChartBtn.marginTop = "8px";
    removeChartBtn.onPointerUpObservable.add(() => removeChart(scene));
    authoringStack.addControl(removeChartBtn);
    // Make the panel always face the active camera (WebXR or ArcRotate)
    scene.onBeforeRenderObservable.add(() => {
        let xrCamera = scene.activeCamera;
        if (xrCamera) {
            panelMesh.lookAt(xrCamera.position, 0, Math.PI, 0);
        }
    });
    return xr;
}

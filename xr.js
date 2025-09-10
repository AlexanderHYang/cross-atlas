import * as BABYLON from "@babylonjs/core";
import * as GUI3D from "@babylonjs/gui/3D";
import * as GUI from "@babylonjs/gui";
import { setLayout, addChart, removeChart } from "./layout.js";

export async function setupWebXR(scene) {
    // --- WebXR Initialization ---
    const xr = await scene.createDefaultXRExperienceAsync({
        uiOptions: { sessionMode: "immersive-vr", referenceSpaceType: "local-floor" },
        optionalFeatures: true,
    });

    const xrSessionManager = xr.baseExperience.sessionManager;

    xrSessionManager.onXRFrameObservable.addOnce(() => {
        xr.baseExperience.camera.position.set(0, 0.5, 1);
        xr.baseExperience.camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    });

    xrSessionManager.onXRSessionInit.add(() => {
        currentlyInXr = true;
        currCam = xr.baseExperience.camera;
        console.log("XR Session Initialized");
    });
    xrSessionManager.onXRSessionEnded.add(() => {
        currentlyInXr = false;
        currCam = camera;
        console.log("XR Session Ended");
    });

    // Hand tracking (best-effort)
    if (xr && xr.baseExperience && xr.baseExperience.featuresManager) {
        try {
            await xr.baseExperience.featuresManager.enableFeature(
                BABYLON.WebXRFeatureName.HAND_TRACKING,
                "latest",
                { xrInput: xr.input }
            );
        } catch (e) {
            // ignore if not available
        }
    }

    // --- THEME ---
    const THEME = {
        panelBg: "#1f2937dd",
        panelStroke: "#2f3a4a",
        text: "#ffffff",
        subText: "#d1d5db",
        sliderBar: "#374151",
        sliderFill: "#7ac6af",
        sliderThumb: "#e5e7eb",
        mint: "#7ac6af",
        grayBtn: "#3a3f47",
        grayBtnTxt: "#e5e7eb",
        danger: "#cf4d4d",
        valueBoxBg: "#111827",
        valueBoxTx: "#e5e7eb",
        radioFill: "#7ac6af",
    };

    // --- Panel Mesh (floating 2D panel in 3D) ---
    const panelWidth = 1.2; // meters
    const panelHeight = 0.9; // meters
    const panelMesh = BABYLON.MeshBuilder.CreatePlane(
        "authoringPanelMesh",
        { width: panelWidth, height: panelHeight },
        scene
    );
    panelMesh.position = new BABYLON.Vector3(-1, 1.5, 0.1);

    const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(panelMesh, 1200, 900, true);
    // optional: match mock’s look
    // advancedTexture.rootContainer.fontFamily = "Inter, system-ui, -apple-system, Segoe UI";

    // Panel container
    const authoringPanel = new GUI.Rectangle("authoringPanel");
    authoringPanel.width = 1;
    authoringPanel.height = 1;
    authoringPanel.cornerRadius = 36;
    authoringPanel.thickness = 2;
    authoringPanel.color = THEME.panelStroke;
    authoringPanel.background = THEME.panelBg;
    authoringPanel.shadowBlur = 24;
    authoringPanel.shadowOffsetX = 0;
    authoringPanel.shadowOffsetY = 8;
    authoringPanel.shadowColor = "#00000088";
    advancedTexture.addControl(authoringPanel);

    // Stack layout
    const authoringStack = new GUI.StackPanel("authoringStack");
    authoringStack.isVertical = true;
    authoringStack.paddingTop = "28px";
    authoringStack.paddingLeft = "28px";
    authoringStack.paddingRight = "28px";
    authoringStack.width = 1;
    authoringPanel.addControl(authoringStack);

    // Title
    const title = new GUI.TextBlock("title", "Authoring Panel");
    title.height = "64px";
    title.color = THEME.text;
    title.fontSize = 48;
    title.fontStyle = "bold";
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    title.paddingBottom = "16px";
    authoringStack.addControl(title);

    // Group section helper
    function makeSection() {
        const r = new GUI.Rectangle();
        r.width = 1;
        r.thickness = 0;
        r.background = "#111827cc";
        r.cornerRadius = 18;
        r.paddingTop = "12px";
        r.paddingBottom = "12px";
        r.paddingLeft = "16px";
        r.paddingRight = "16px";
        r.height = "auto";
        r.adaptHeightToChildren = true;
        r.marginBottom = "16px";
        return r;
    }

    // Slider row helper (Label | Slider | Value box)
    function addSliderRow(parent, labelText, min, max, value, callback) {
        const row = new GUI.StackPanel();
        row.isVertical = false;
        row.height = "60px";
        row.width = 1;
        row.spacing = 8;

        const label = new GUI.TextBlock();
        label.text = labelText;
        label.width = "220px";
        label.color = THEME.text;
        label.fontSize = 30;
        label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;

        const slider = new GUI.Slider();
        slider.minimum = min;
        slider.maximum = max;
        slider.value = value;
        slider.height = "16px";
        slider.width = "68%";
        slider.background = THEME.sliderBar;
        slider.color = THEME.sliderFill;
        slider.isThumbClamped = true;
        slider.borderColor = THEME.sliderBar;
        slider.thumbWidth = 28;
        slider.thumbHeight = 28;
        slider.isPointerBlocker = true;

        const valueBox = new GUI.Rectangle();
        valueBox.width = "80px";
        valueBox.height = "44px";
        valueBox.cornerRadius = 12;
        valueBox.thickness = 0;
        valueBox.background = THEME.valueBoxBg;
        const valueText = new GUI.TextBlock();
        valueText.text = Number(value).toFixed(2).replace(/\.00$/, "");
        valueText.color = THEME.valueBoxTx;
        valueText.fontSize = 26;
        valueBox.addControl(valueText);

        slider.onValueChangedObservable.add(function (v) {
            var out = labelText === "Rows" ? Math.floor(v) : v;
            valueText.text =
                labelText === "Rows" ? String(out) : Number(out).toFixed(2).replace(/\.00$/, "");
            callback(out);
        });

        row.addControl(label);
        row.addControl(slider);
        row.addControl(valueBox);
        parent.addControl(row);
    }

    // --- Sliders Section (Rows, Curvature, Margin X, Margin Y) ---
    const slidersSection = makeSection();
    authoringStack.addControl(slidersSection);

    const slidersStack = new GUI.StackPanel();
    slidersStack.isVertical = true;
    slidersStack.width = 1;
    slidersStack.spacing = 6;
    slidersSection.addControl(slidersStack);

    addSliderRow(slidersStack, "Rows", 1, 8, 3, function (v) {
        setLayout({ type: "rows", value: Math.floor(v) });
    });
    addSliderRow(slidersStack, "Curvature", 0, 10, 5, function (v) {
        setLayout({ type: "curve", value: v });
    });
    addSliderRow(slidersStack, "Margin X", 0, 10, 0.5, function (v) {
        setLayout({ type: "marginX", value: v });
    });
    addSliderRow(slidersStack, "Margin Y", 0, 10, 0.5, function (v) {
        setLayout({ type: "marginY", value: v });
    });

    // --- Chart Type Radios ---
    const radioSection = makeSection();
    authoringStack.addControl(radioSection);

    const radioStack = new GUI.StackPanel();
    radioStack.isVertical = true;
    radioStack.width = 1;
    radioStack.spacing = 6;
    radioSection.addControl(radioStack);

    const chartTypes = [
        { label: "2D Bar Chart", value: "2d" },
        { label: "3D Bar Chart", value: "3d" },
        { label: "Pie Chart", value: "pie" },
        { label: "Line Chart", value: "line" },
    ];
    var selectedChartType = chartTypes[0].value;

    function addRadioRow(text, isChecked, onCheck) {
        const row = new GUI.StackPanel();
        row.isVertical = false;
        row.height = "48px";
        row.width = 1;
        row.spacing = 10;

        const radio = new GUI.RadioButton();
        radio.width = "32px";
        radio.height = "32px";
        radio.color = THEME.radioFill; // ring
        radio.background = "#111827";
        radio.isChecked = isChecked;
        radio.group = "chartTypes";

        radio.onIsCheckedChangedObservable.add(function (state) {
            if (state) radio.color = THEME.radioFill;
        });
        radio.onPointerUpObservable.add(function () {
            onCheck();
        });

        const label = new GUI.TextBlock();
        label.text = text;
        label.color = THEME.text;
        label.fontSize = 28;
        label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;

        row.addControl(radio);
        row.addControl(label);
        radioStack.addControl(row);
    }

    chartTypes.forEach(function (type, i) {
        addRadioRow(type.label, i === 0, function () {
            selectedChartType = type.value;
        });
    });

    // --- Primary "Add Chart" button ---
    const addBtn = GUI.Button.CreateSimpleButton("addChartBtn", "Add Chart");
    addBtn.width = "220px";
    addBtn.height = "60px";
    addBtn.color = "#0b1a14";
    addBtn.background = THEME.mint;
    addBtn.cornerRadius = 16;
    addBtn.thickness = 0;
    addBtn.fontSize = 32;
    addBtn.marginTop = "8px";
    addBtn.onPointerUpObservable.add(function () {
        if (typeof addChart === "function") addChart(scene, selectedChartType);
    });
    authoringStack.addControl(addBtn);

    // --- Layout Mode buttons (Plane | Cylinder | Sphere) ---
    const layoutSection = makeSection();
    authoringStack.addControl(layoutSection);

    const layoutRow = new GUI.StackPanel();
    layoutRow.isVertical = false;
    layoutRow.height = "44px";
    layoutRow.width = 1;
    layoutRow.spacing = 10;
    layoutRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    layoutSection.addControl(layoutRow);

    function makeGrayButton(id, text, onClick) {
        const b = GUI.Button.CreateSimpleButton(id, text);
        b.width = "180px";
        b.height = "54px";
        b.cornerRadius = 14;
        b.thickness = 0;
        b.background = THEME.grayBtn;
        b.color = THEME.grayBtnTxt;
        b.fontSize = 26;
        b.onPointerUpObservable.add(onClick);
        return b;
    }

    layoutRow.addControl(
        makeGrayButton("planeBtn", "Plane", function () {
            setLayout(0);
        })
    );
    layoutRow.addControl(
        makeGrayButton("cylinderBtn", "Cylinder", function () {
            setLayout(1);
        })
    );
    layoutRow.addControl(
        makeGrayButton("sphereBtn", "Sphere", function () {
            setLayout(2);
        })
    );

    // --- Danger "Remove Chart" button ---
    const removeBtn = GUI.Button.CreateSimpleButton("removeChartBtn", "Remove Chart");
    removeBtn.width = "220px";
    removeBtn.height = "60px";
    removeBtn.color = "#fff";
    removeBtn.background = THEME.danger;
    removeBtn.cornerRadius = 16;
    removeBtn.thickness = 0;
    removeBtn.fontSize = 32;
    removeBtn.marginTop = "12px";
    removeBtn.onPointerUpObservable.add(function () {
        removeChart(scene);
    });
    authoringStack.addControl(removeBtn);

    return xr;
}

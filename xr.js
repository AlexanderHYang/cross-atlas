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

    // VR camera initialization
    const xrSessionManager = xr.baseExperience.sessionManager;
    xrSessionManager.onXRFrameObservable.addOnce(() => {
        xr.baseExperience.camera.position.set(0.0, 2.0, -1);
        // xr.baseExperience.camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    });

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
    const panelWidth = 3.6; // meters (scaled 3x)
    const panelHeight = 2.7; // meters (scaled 3x)
    const panelMesh = BABYLON.MeshBuilder.CreatePlane(
        "authoringPanelMesh",
        { width: panelWidth, height: panelHeight },
        scene
    );

    panelMesh.position = new BABYLON.Vector3(-5, 1.5, 4);
    // panelMesh.lookAt(xr.baseExperience.camera.position);
    panelMesh.rotation = new BABYLON.Vector3(0, -Math.PI / 4, 0);

    const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(panelMesh, 3600, 2700, true);
    // optional: match mock’s look
    // advancedTexture.rootContainer.fontFamily = "Inter, system-ui, -apple-system, Segoe UI";

    // Panel container
    const authoringPanel = new GUI.Rectangle("authoringPanel");
    authoringPanel.width = 1;
    authoringPanel.height = 1;
    authoringPanel.cornerRadius = 108;
    authoringPanel.thickness = 6;
    authoringPanel.color = THEME.panelStroke;
    authoringPanel.background = THEME.panelBg;
    authoringPanel.shadowBlur = 72;
    authoringPanel.shadowOffsetX = 0;
    authoringPanel.shadowOffsetY = 24;
    authoringPanel.shadowColor = "#00000088";
    advancedTexture.addControl(authoringPanel);

    // Stack layout
    const authoringStack = new GUI.StackPanel("authoringStack");
    authoringStack.isVertical = true;
    authoringStack.paddingTop = `84px`;
    authoringStack.paddingLeft = `84px`;
    authoringStack.paddingRight = `84px`;
    authoringStack.width = 1;
    authoringPanel.addControl(authoringStack);

    // Title
    const title = new GUI.TextBlock("title", "Authoring Panel");
    title.height = `192px`;
    title.color = THEME.text;
    title.fontSize = 144;
    title.fontStyle = "bold";
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    title.paddingBottom = `48px`;
    authoringStack.addControl(title);

    // Group section helper
    function makeSection() {
        const r = new GUI.Rectangle();
        r.width = 1;
        r.thickness = 0;
        r.background = "#111827cc";
        r.cornerRadius = 54;
        r.paddingTop = `36px`;
        r.paddingBottom = `36px`;
        r.paddingLeft = `48px`;
        r.paddingRight = `48px`;
        r.height = "auto";
        r.adaptHeightToChildren = true;
        r.marginBottom = `48px`;
        return r;
    }

    // Slider row helper (Label | Slider | Value box)
    function addSliderRow(parent, labelText, min, max, value, callback) {
        const row = new GUI.StackPanel();
        row.isVertical = false;
        row.height = `180px`;
        row.width = 1;
        row.spacing = 24;

        const label = new GUI.TextBlock();
        label.text = labelText;
        label.width = `660px`;
        label.color = THEME.text;
        label.fontSize = 90;
        label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;

        const slider = new GUI.Slider();
        slider.minimum = min;
        slider.maximum = max;
        slider.value = value;
        slider.height = `48px`;
        slider.width = "68%";
        slider.background = THEME.sliderBar;
        slider.color = THEME.sliderFill;
        slider.isThumbClamped = true;
        slider.borderColor = THEME.sliderBar;
        slider.thumbWidth = 84;
        slider.thumbHeight = 84;
        slider.isPointerBlocker = true;

        const valueBox = new GUI.Rectangle();
        valueBox.width = `240px`;
        valueBox.height = `132px`;
        valueBox.cornerRadius = 36;
        valueBox.thickness = 0;
        valueBox.background = THEME.valueBoxBg;
        const valueText = new GUI.TextBlock();
        valueText.text = Number(value).toFixed(2).replace(/\.00$/, "");
        valueText.color = THEME.valueBoxTx;
        valueText.fontSize = 78;
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
        row.height = `144px`;
        row.width = 1;
        row.spacing = 30;

        const radio = new GUI.RadioButton();
        radio.width = `96px`;
        radio.height = `96px`;
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
        label.fontSize = 84;
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
    addBtn.width = `660px`;
    addBtn.height = `180px`;
    addBtn.color = "#0b1a14";
    addBtn.background = THEME.mint;
    addBtn.cornerRadius = 48;
    addBtn.thickness = 0;
    addBtn.fontSize = 96;
    addBtn.marginTop = `24px`;
    addBtn.onPointerUpObservable.add(function () {
        if (typeof addChart === "function") addChart(scene, selectedChartType);
    });
    authoringStack.addControl(addBtn);

    // --- Layout Mode buttons (Plane | Cylinder | Sphere) ---
    const layoutSection = makeSection();
    authoringStack.addControl(layoutSection);

    const layoutRow = new GUI.StackPanel();
    layoutRow.isVertical = false;
    layoutRow.height = `132px`;
    layoutRow.width = 1;
    layoutRow.spacing = 30;
    layoutRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    layoutSection.addControl(layoutRow);

    function makeGrayButton(id, text, onClick) {
        const b = GUI.Button.CreateSimpleButton(id, text);
        b.width = `540px`;
        b.height = `162px`;
        b.cornerRadius = 42;
        b.thickness = 0;
        b.background = THEME.grayBtn;
        b.color = THEME.grayBtnTxt;
        b.fontSize = 78;
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
    removeBtn.width = `660px`;
    removeBtn.height = `180px`;
    removeBtn.color = "#fff";
    removeBtn.background = THEME.danger;
    removeBtn.cornerRadius = 48;
    removeBtn.thickness = 0;
    removeBtn.fontSize = 96;
    removeBtn.marginTop = `24px`;
    removeBtn.onPointerUpObservable.add(function () {
        removeChart(scene);
    });
    authoringStack.addControl(removeBtn);

    return xr;
}

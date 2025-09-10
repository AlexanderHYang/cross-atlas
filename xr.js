import * as BABYLON from "@babylonjs/core";
import * as GUI3D from "@babylonjs/gui/3D";
import * as GUI from "@babylonjs/gui";
import {
    setLayout,
    addChart,
    removeChart,
    updateRows,
    updateCurve,
    updateMarginX,
    updateMarginY,
} from "./layout.js";

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
    const panelWidth = 3; // meters (scaled 3x)
    const panelHeight = 3.5; // meters (scaled 3x)
    const panelMesh = BABYLON.MeshBuilder.CreatePlane(
        "authoringPanelMesh",
        { width: panelWidth, height: panelHeight },
        scene
    );

    panelMesh.position = new BABYLON.Vector3(-5, 1.5, 4);
    // panelMesh.lookAt(xr.baseExperience.camera.position);
    panelMesh.rotation = new BABYLON.Vector3(0, -Math.PI / 4, 0);

    const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(panelMesh, 3000, 3500, true);
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
    title.height = `220px`;
    title.color = THEME.text;
    title.fontSize = 160;
    title.fontStyle = "bold";
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
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
        r.paddingTop = `48px`;
        r.paddingBottom = `48px`;
        r.paddingLeft = `60px`;
        r.paddingRight = `60px`;
        r.height = "auto";
        r.adaptHeightToChildren = true;
        r.marginBottom = `48px`;
        return r;
    }

    // Slider row helper (Label | Slider | Value box)
    function addSliderRow(parent, labelText, min, max, value, callback) {
        const row = new GUI.StackPanel();
        row.isVertical = false;
        row.height = `220px`;
        row.width = 1;
        row.spacing = 48;
        row.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

        const label = new GUI.TextBlock();
        label.text = labelText;
        label.width = `660px`;
        label.color = THEME.text;
        label.fontSize = 90;
        // label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;

        const slider = new GUI.Slider();
        slider.minimum = min;
        slider.maximum = max;
        slider.value = value;
        slider.height = `48px`;
        slider.width = "2000px";
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
    slidersStack.spacing = 24;
    slidersStack.paddingTop = "24px";
    slidersStack.paddingBottom = "24px";
    slidersSection.addControl(slidersStack);

    // Slider callbacks now use the update functions from layout.js
    addSliderRow(slidersStack, "Rows", 1, 8, 3, updateRows);
    addSliderRow(slidersStack, "Curvature", 0, 10, 5, updateCurve);
    addSliderRow(slidersStack, "Margin X", 0, 10, 0.5, updateMarginX);
    addSliderRow(slidersStack, "Margin Y", 0, 10, 0.5, updateMarginY);

    // --- Chart Type Radios ---
    const radioSection = makeSection();
    authoringStack.addControl(radioSection);

    const radioStack = new GUI.StackPanel();
    radioStack.isVertical = true;
    radioStack.width = 1;
    radioStack.spacing = 24;
    radioStack.paddingTop = "24px";
    radioStack.paddingBottom = "24px";
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
        row.height = `180px`;
        row.width = "2400px";
        row.spacing = 48;
        row.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        row.paddingLeft = "150px";

        const radio = new GUI.RadioButton();
        radio.width = `108px`;
        radio.height = `108px`;
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

    const spacer1 = new GUI.Rectangle();
    spacer1.height = "30px";
    spacer1.thickness = 0;
    spacer1.background = "";
    spacer1.isHitTestVisible = false;
    authoringStack.addControl(spacer1);

    // --- Add/Remove Chart buttons section (like layout row) ---
    const chartButtonsSection = makeSection();
    chartButtonsSection.background = "";
    authoringStack.addControl(chartButtonsSection);

    // Spacer between button row and layout row
    const spacer2 = new GUI.Rectangle();
    spacer2.height = "30px";
    spacer2.thickness = 0;
    spacer2.background = "";
    spacer2.isHitTestVisible = false;
    authoringStack.addControl(spacer2);

    const chartButtonsRow = new GUI.StackPanel();
    chartButtonsRow.isVertical = false;
    chartButtonsRow.height = `300px`;
    // chartButtonsRow.width not set so it sizes to content
    chartButtonsRow.spacing = 72;
    chartButtonsRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    chartButtonsSection.addControl(chartButtonsRow);

    const addBtn = GUI.Button.CreateSimpleButton("addChartBtn", "Add Chart");
    addBtn.width = `1200px`;
    addBtn.height = `300px`;
    addBtn.color = "#0b1a14";
    addBtn.background = THEME.mint;
    addBtn.cornerRadius = 100;
    addBtn.thickness = 0;
    addBtn.fontSize = 128;
    addBtn.marginTop = `0px`;
    addBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    addBtn.onPointerUpObservable.add(function () {
        if (typeof addChart === "function") addChart(scene, selectedChartType);
    });

    const removeBtn = GUI.Button.CreateSimpleButton("removeChartBtn", "Remove Chart");
    removeBtn.width = `1200px`;
    removeBtn.height = `300px`;
    removeBtn.color = "#fff";
    removeBtn.background = THEME.danger;
    removeBtn.cornerRadius = 100;
    removeBtn.thickness = 0;
    removeBtn.fontSize = 128;
    removeBtn.marginTop = `0px`;
    removeBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    removeBtn.onPointerUpObservable.add(function () {
        removeChart(scene);
    });

    chartButtonsRow.addControl(addBtn);
    chartButtonsRow.addControl(removeBtn);

    // --- Layout Mode buttons (Plane | Cylinder | Sphere) ---
    const layoutSection = makeSection();
    layoutSection.background = "";
    authoringStack.addControl(layoutSection);

    const layoutRow = new GUI.StackPanel();
    layoutRow.isVertical = false;
    layoutRow.height = `240px`;
    // layoutRow.width not set so it sizes to content
    layoutRow.spacing = 72;
    layoutRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    layoutSection.addControl(layoutRow);

    function makeGrayButton(id, text, onClick) {
        const b = GUI.Button.CreateSimpleButton(id, text);
        b.width = `900px`;
        b.height = `240px`;
        b.cornerRadius = 80;
        b.thickness = 0;
        b.background = THEME.grayBtn;
        b.color = THEME.grayBtnTxt;
        b.fontSize = 128;
        b.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
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

    return xr;
}

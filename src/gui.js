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
    DEFAULT_ROWS,
    DEFAULT_CURVE,
    DEFAULT_MARGIN,
    updateAxis,
    DEFAULT_AXIS,
} from "./vis-layout.js";

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

    // Disable hand mesh, controller only
    try {
        const fm = xr.baseExperience?.featuresManager;
        if (fm) {
            fm.disableFeature(BABYLON.WebXRFeatureName.HAND_TRACKING);
        }
    } catch {}

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
    const panelWidth = 3;
    const panelHeight = 3.5;
    const panelMesh = BABYLON.MeshBuilder.CreatePlane(
        "authoringPanelMesh",
        { width: panelWidth, height: panelHeight },
        scene
    );

    panelMesh.position = new BABYLON.Vector3(-5, 1.5, 4);
    // panelMesh.lookAt(xr.baseExperience.camera.position);
    panelMesh.rotation = new BABYLON.Vector3(0, -Math.PI / 4, 0);

    // Position for debugging
    // panelMesh.position = new BABYLON.Vector3(0, 1.5, 4);

    const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(panelMesh, 3000, 3500, true);

    // Panel container
    const authoringPanel = new GUI.Rectangle("authoringPanel");
    authoringPanel.width = 1;
    authoringPanel.height = 1;
    authoringPanel.cornerRadius = 150;
    authoringPanel.thickness = 6;
    authoringPanel.color = THEME.panelStroke;
    authoringPanel.background = THEME.panelBg;
    advancedTexture.addControl(authoringPanel);

    const requestPanelResize = () => {};

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
        row.spacing = 60;
        row.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        row.paddingLeft = "60px";
        row.paddingRight = "60px";

        const label = new GUI.TextBlock();
        label.text = labelText;
        label.width = `500px`;
        label.color = THEME.text;
        label.fontSize = 90;
        label.paddingLeft = "100px";
        label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

        const slider = new GUI.Slider();
        slider.minimum = min;
        slider.maximum = max;
        slider.value = value;
        slider.height = `48px`;
        slider.width = "1600px";
        slider.background = THEME.sliderBar;
        slider.color = THEME.sliderFill;
        slider.isThumbClamped = true;
        slider.borderColor = THEME.sliderBar;
        slider.thumbWidth = 84;
        slider.thumbHeight = 84;
        slider.paddingLeft = "100px";
        slider.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        slider.isPointerBlocker = true;

        const valueBox = new GUI.Rectangle();
        valueBox.width = `280px`;
        valueBox.height = `132px`;
        valueBox.cornerRadius = 36;
        valueBox.thickness = 0;
        valueBox.background = THEME.valueBoxBg;
        valueBox.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

        const valueText = new GUI.TextBlock();
        valueText.text = Number(value).toFixed(2).replace(/\.00$/, "");
        valueText.color = THEME.valueBoxTx;
        valueText.fontSize = 78;
        valueText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        valueText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
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
    addSliderRow(slidersStack, "Rows", 1, 8, DEFAULT_ROWS, updateRows);
    addSliderRow(slidersStack, "Curvature", 0, 10, DEFAULT_CURVE, updateCurve);
    addSliderRow(slidersStack, "Margin X", 0, 10, DEFAULT_MARGIN.x, updateMarginX);
    addSliderRow(slidersStack, "Margin Y", 0, 10, DEFAULT_MARGIN.y, updateMarginY);

    // --- Axis Orientation Dropdown ---
    const axisSection = makeSection();
    authoringStack.addControl(axisSection);

    const axisStack = new GUI.StackPanel();
    axisStack.isVertical = true;
    axisStack.width = 1;
    axisStack.spacing = 24;
    axisStack.paddingTop = "50px";
    axisStack.paddingBottom = "50px";
    axisSection.addControl(axisStack);

    const axisTitle = new GUI.TextBlock();
    axisTitle.text = "Axis Orientation";
    axisTitle.height = `150px`;
    axisTitle.color = THEME.text;
    axisTitle.fontSize = 110;
    axisTitle.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    axisTitle.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    axisTitle.paddingLeft = "150px";
    axisStack.addControl(axisTitle);

    const axisOptions = [
        { label: "Align to X Axis", value: "x" },
        { label: "Align to Y Axis", value: "y" },
        { label: "Align to Z Axis", value: "z" },
    ];
    let selectedAxis = DEFAULT_AXIS;

    const axisDropdownContainer = new GUI.StackPanel();
    axisDropdownContainer.isVertical = true;
    axisDropdownContainer.width = 1;
    axisDropdownContainer.spacing = 12;
    axisDropdownContainer.paddingLeft = "150px";
    axisDropdownContainer.paddingRight = "150px";
    axisDropdownContainer.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    axisStack.addControl(axisDropdownContainer);

    const dropdownRect = new GUI.Rectangle();
    dropdownRect.width = "2200px";
    dropdownRect.height = `180px`;
    dropdownRect.thickness = 0;
    dropdownRect.cornerRadius = 60;
    dropdownRect.background = "#111827";
    dropdownRect.isPointerBlocker = true;
    dropdownRect.zIndex = 10;
    axisDropdownContainer.addControl(dropdownRect);

    const dropdownContent = new GUI.StackPanel();
    dropdownContent.isVertical = false;
    dropdownContent.width = 1;
    dropdownContent.height = 1;
    dropdownContent.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    dropdownContent.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    dropdownContent.paddingLeft = "60px";
    dropdownContent.paddingRight = "60px";
    dropdownRect.addControl(dropdownContent);

    const selectedAxisText = new GUI.TextBlock();
    selectedAxisText.text =
        axisOptions.find((opt) => opt.value === selectedAxis)?.label ?? axisOptions[0].label;
    selectedAxisText.color = THEME.text;
    selectedAxisText.fontSize = 90;
    selectedAxisText.height = 1;
    selectedAxisText.width = "1800px";
    selectedAxisText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    selectedAxisText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    dropdownContent.addControl(selectedAxisText);

    const dropdownArrowText = new GUI.TextBlock();
    dropdownArrowText.text = "v";
    dropdownArrowText.color = THEME.subText;
    dropdownArrowText.fontSize = 90;
    dropdownArrowText.height = 1;
    dropdownArrowText.width = "200px";
    dropdownArrowText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    dropdownArrowText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    dropdownContent.addControl(dropdownArrowText);

    const listRect = new GUI.Rectangle();
    listRect.width = "2200px";
    listRect.thickness = 0;
    listRect.cornerRadius = 60;
    listRect.background = "#1f2937";
    listRect.adaptHeightToChildren = true;
    listRect.isPointerBlocker = true;
    listRect.isVisible = false;
    listRect.zIndex = 9;
    axisDropdownContainer.addControl(listRect);

    const optionsPanel = new GUI.StackPanel();
    optionsPanel.isVertical = true;
    optionsPanel.width = 1;
    optionsPanel.spacing = 12;
    optionsPanel.paddingTop = "24px";
    optionsPanel.paddingBottom = "24px";
    optionsPanel.paddingLeft = "24px";
    optionsPanel.paddingRight = "24px";
    listRect.addControl(optionsPanel);

    let axisDropdownOpen = false;
    const optionButtons = [];

    function setAxisDropdownOpen(open) {
        axisDropdownOpen = open;
        listRect.isVisible = open;
        dropdownArrowText.text = open ? "^" : "v";
        requestPanelResize();
    }

    function updateAxisButtonStyles() {
        optionButtons.forEach(({ value, button }) => {
            const isActive = value === selectedAxis;
            button.background = isActive ? THEME.sliderFill : THEME.sliderBar;
        });
    }

    dropdownRect.onPointerUpObservable.add(function () {
        setAxisDropdownOpen(!axisDropdownOpen);
    });

    axisOptions.forEach(function (axis) {
        const optionBtn = GUI.Button.CreateSimpleButton("axisOption_" + axis.value, axis.label);
        optionBtn.height = `160px`;
        optionBtn.fontSize = 84;
        optionBtn.color = THEME.text;
        optionBtn.paddingLeft = "24px";
        optionBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_STRETCH;
        optionBtn.cornerRadius = 48;
        optionBtn.thickness = 0;
        optionBtn.background = axis.value === selectedAxis ? THEME.sliderFill : THEME.sliderBar;
        optionBtn.onPointerEnterObservable.add(function () {
            if (axis.value !== selectedAxis) optionBtn.background = THEME.sliderFill;
        });
        optionBtn.onPointerOutObservable.add(function () {
            if (axis.value !== selectedAxis) optionBtn.background = THEME.sliderBar;
        });
        optionBtn.onPointerUpObservable.add(function () {
            if (selectedAxis === axis.value) {
                setAxisDropdownOpen(false);
                return;
            }
            selectedAxis = axis.value;
            selectedAxisText.text = axis.label;
            updateAxis(selectedAxis);
            updateAxisButtonStyles();
            setAxisDropdownOpen(false);
        });
        optionButtons.push({ value: axis.value, button: optionBtn });
        optionsPanel.addControl(optionBtn);
    });
    requestPanelResize();

    // --- Chart Type Dropdown ---
    const chartTypeSection = makeSection();
    authoringStack.addControl(chartTypeSection);

    const chartTypeStack = new GUI.StackPanel();
    chartTypeStack.isVertical = true;
    chartTypeStack.width = 1;
    chartTypeStack.spacing = 24;
    chartTypeStack.paddingTop = "50px";
    chartTypeStack.paddingBottom = "50px";
    chartTypeSection.addControl(chartTypeStack);

    const chartTypeLabel = new GUI.TextBlock();
    chartTypeLabel.text = "Chart Type";
    chartTypeLabel.color = THEME.text;
    chartTypeLabel.fontSize = 96;
    chartTypeLabel.paddingLeft = "150px";
    chartTypeLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    chartTypeLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    chartTypeStack.addControl(chartTypeLabel);

    const chartTypes = [
        { label: "2D Bar Chart", value: "2d" },
        { label: "3D Bar Chart", value: "3d" },
        { label: "3D Scatter Plot", value: "scatter" },
        { label: "Line Chart", value: "line" },
    ];
    var selectedChartType = chartTypes[0].value;

    const chartDropdownContainer = new GUI.StackPanel();
    chartDropdownContainer.isVertical = true;
    chartDropdownContainer.width = 1;
    chartDropdownContainer.spacing = 16;
    chartDropdownContainer.paddingLeft = "150px";
    chartDropdownContainer.paddingRight = "150px";
    chartDropdownContainer.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    chartTypeStack.addControl(chartDropdownContainer);

    const chartDropdownRect = new GUI.Rectangle();
    chartDropdownRect.width = "2200px";
    chartDropdownRect.height = `200px`;
    chartDropdownRect.thickness = 0;
    chartDropdownRect.cornerRadius = 96;
    chartDropdownRect.background = THEME.grayBtn;
    chartDropdownRect.isPointerBlocker = true;
    chartDropdownContainer.addControl(chartDropdownRect);

    const chartDropdownContent = new GUI.StackPanel();
    chartDropdownContent.isVertical = false;
    chartDropdownContent.width = 1;
    chartDropdownContent.height = 1;
    chartDropdownContent.paddingLeft = "72px";
    chartDropdownContent.paddingRight = "72px";
    chartDropdownContent.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    chartDropdownContent.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    chartDropdownRect.addControl(chartDropdownContent);

    const selectedChartText = new GUI.TextBlock();
    selectedChartText.text = chartTypes[0].label;
    selectedChartText.color = THEME.grayBtnTxt;
    selectedChartText.fontSize = 96;
    selectedChartText.height = 1;
    selectedChartText.width = "1800px";
    selectedChartText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    selectedChartText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    chartDropdownContent.addControl(selectedChartText);

    const chartDropdownArrow = new GUI.TextBlock();
    chartDropdownArrow.text = "v";
    chartDropdownArrow.color = THEME.subText;
    chartDropdownArrow.fontSize = 96;
    chartDropdownArrow.height = 1;
    chartDropdownArrow.width = "200px";
    chartDropdownArrow.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    chartDropdownArrow.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    chartDropdownContent.addControl(chartDropdownArrow);

    const chartDropdownListRect = new GUI.Rectangle();
    chartDropdownListRect.width = chartDropdownRect.width;
    chartDropdownListRect.thickness = 0;
    chartDropdownListRect.cornerRadius = 72;
    chartDropdownListRect.background = THEME.panelBg;
    chartDropdownListRect.adaptHeightToChildren = true;
    chartDropdownListRect.isVisible = false;
    chartDropdownListRect.isPointerBlocker = true;
    chartDropdownListRect.paddingTop = "18px";
    chartDropdownListRect.paddingBottom = "18px";
    chartDropdownListRect.paddingLeft = "24px";
    chartDropdownListRect.paddingRight = "24px";
    chartDropdownContainer.addControl(chartDropdownListRect);

    const chartDropdownList = new GUI.StackPanel();
    chartDropdownList.isVertical = true;
    chartDropdownList.width = 1;
    chartDropdownList.spacing = 12;
    chartDropdownListRect.addControl(chartDropdownList);

    let chartDropdownOpen = false;
    function setChartDropdownOpen(open) {
        chartDropdownOpen = open;
        chartDropdownListRect.isVisible = open;
        chartDropdownArrow.text = open ? "^" : "v";
        requestPanelResize();
    }

    chartDropdownRect.onPointerUpObservable.add(function () {
        setChartDropdownOpen(!chartDropdownOpen);
    });

    chartTypes.forEach(function (type) {
        const optionBtn = GUI.Button.CreateSimpleButton(`chartTypeOption-${type.value}`, type.label);
        optionBtn.height = `180px`;
        optionBtn.fontSize = 90;
        optionBtn.color = THEME.valueBoxTx;
        optionBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_STRETCH;
        optionBtn.cornerRadius = 72;
        optionBtn.thickness = 0;
        optionBtn.background = THEME.valueBoxBg;
        optionBtn.textBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        optionBtn.textBlock.paddingLeft = "48px";
        optionBtn.onPointerEnterObservable.add(function () {
            optionBtn.background = THEME.grayBtn;
        });
        optionBtn.onPointerOutObservable.add(function () {
            optionBtn.background = THEME.valueBoxBg;
        });
        optionBtn.onPointerUpObservable.add(function () {
            selectedChartType = type.value;
            selectedChartText.text = type.label;
            setChartDropdownOpen(false);
            optionBtn.background = THEME.valueBoxBg;
        });
        chartDropdownList.addControl(optionBtn);
    });

    requestPanelResize();

    const spacer1 = new GUI.Rectangle();
    spacer1.height = "180px";
    spacer1.thickness = 0;
    spacer1.background = "";
    spacer1.isHitTestVisible = false;
    authoringStack.addControl(spacer1);

    // --- Add/Remove Chart buttons section (like layout row) ---
    const chartButtonsSection = makeSection();
    chartButtonsSection.background = "";
    chartButtonsSection.marginTop = "60px";
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
        // Only pie charts are not implemented yet
        if (selectedChartType === "pie") {
            console.log("Pie charts coming soon!");
            return;
        }
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
    layoutRow.width = 1;
    layoutRow.spacing = 72;
    layoutRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    layoutRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    layoutSection.addControl(layoutRow);

    function makeGrayButton(id, text, onClick) {
        const b = GUI.Button.CreateSimpleButton(id, text);
        b.width = `850px`;
        b.height = `240px`;
        b.cornerRadius = 80;
        b.thickness = 0;
        b.background = THEME.grayBtn;
        b.color = THEME.grayBtnTxt;
        b.fontSize = 128;
        b.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        b.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
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

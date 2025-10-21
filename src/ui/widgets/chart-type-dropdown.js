import * as GUI from "@babylonjs/gui";

export function createChartTypeDropdown(theme, chartTypes, requestPanelResize) {
    let selectedChart = chartTypes[0];
    let isOpen = false;

    const container = new GUI.StackPanel();
    container.isVertical = true;
    container.width = 1;
    container.spacing = 12;
    container.paddingLeft = "150px";
    container.paddingRight = "150px";
    container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;

    const buttonRect = buildButton(theme, selectedChart.label);
    container.addControl(buttonRect);

    const listRect = buildDropdownList(theme);
    container.addControl(listRect);

    const listStack = new GUI.StackPanel();
    listStack.isVertical = true;
    listStack.width = 1;
    listStack.spacing = 12;
    listStack.paddingTop = "24px";
    listStack.paddingBottom = "24px";
    listStack.paddingLeft = "24px";
    listStack.paddingRight = "24px";
    listRect.addControl(listStack);

    const buttonContent = buttonRect.children?.[0];
    const selectedLabel = buttonContent?.children?.[0];
    const arrow = buttonContent?.children?.[1];

    const optionButtons = chartTypes.map((type) => {
        const optionBtn = GUI.Button.CreateSimpleButton(`chartTypeOption-${type.value}`, type.label);
        optionBtn.height = "160px";
        optionBtn.fontSize = 84;
        optionBtn.color = theme.text;
        optionBtn.paddingLeft = "24px";
        optionBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_STRETCH;
        optionBtn.cornerRadius = 48;
        optionBtn.thickness = 0;
        optionBtn.background =
            type.value === selectedChart.value ? theme.sliderFill : theme.sliderBar;
        optionBtn.onPointerEnterObservable.add(() => {
            if (type.value !== selectedChart.value) optionBtn.background = theme.sliderFill;
        });
        optionBtn.onPointerOutObservable.add(() => {
            if (type.value !== selectedChart.value) optionBtn.background = theme.sliderBar;
        });
        optionBtn.onPointerUpObservable.add(() => {
            if (selectedChart.value === type.value) {
                toggleDropdown(false);
                return;
            }
            selectedChart = type;
            if (selectedLabel) selectedLabel.text = type.label;
            updateOptionStates(optionButtons, theme, selectedChart.value);
            toggleDropdown(false);
            if (typeof requestPanelResize === "function") requestPanelResize();
        });
        listStack.addControl(optionBtn);
        return { type, button: optionBtn };
    });

    buttonRect.onPointerUpObservable.add(() => {
        toggleDropdown(!isOpen);
    });

    function toggleDropdown(open) {
        isOpen = open;
        listRect.isVisible = open;
        if (arrow) arrow.text = open ? "^" : "v";
        if (typeof requestPanelResize === "function") requestPanelResize();
    }

    function updateOptionStates(options, palette, activeValue) {
        options.forEach(({ type, button }) => {
            const isActive = type.value === activeValue;
            button.background = isActive ? palette.sliderFill : palette.sliderBar;
        });
    }

    toggleDropdown(false);

    return {
        root: container,
        getSelection: () => selectedChart.value,
    };
}

function buildButton(theme, label) {
    const rect = new GUI.Rectangle();
    rect.width = "2200px";
    rect.height = "180px";
    rect.thickness = 0;
    rect.cornerRadius = 60;
    rect.background = "#111827";
    rect.isPointerBlocker = true;
    rect.zIndex = 10;

    const content = new GUI.StackPanel();
    content.isVertical = false;
    content.width = 1;
    content.height = 1;
    content.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    content.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    content.paddingLeft = "60px";
    content.paddingRight = "60px";
    rect.addControl(content);

    const selectedLabel = new GUI.TextBlock();
    selectedLabel.text = label;
    selectedLabel.color = theme.text;
    selectedLabel.fontSize = 90;
    selectedLabel.height = 1;
    selectedLabel.width = "1800px";
    selectedLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    selectedLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    content.addControl(selectedLabel);

    const arrow = new GUI.TextBlock();
    arrow.text = "v";
    arrow.color = theme.subText;
    arrow.fontSize = 90;
    arrow.height = 1;
    arrow.width = "200px";
    arrow.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    arrow.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    content.addControl(arrow);

    return rect;
}

function buildDropdownList(theme) {
    const rect = new GUI.Rectangle();
    rect.width = "2200px";
    rect.thickness = 0;
    rect.cornerRadius = 60;
    rect.background = "#1f2937";
    rect.adaptHeightToChildren = true;
    rect.isPointerBlocker = true;
    rect.zIndex = 9;
    return rect;
}

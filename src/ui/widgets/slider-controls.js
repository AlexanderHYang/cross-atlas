import * as GUI from "@babylonjs/gui";
import {
    updateRows,
    updateCurve,
    updateMarginX,
    updateMarginY,
    DEFAULT_ROWS,
    DEFAULT_CURVE,
    DEFAULT_MARGIN,
} from "../../core/layout-manager.js";

function addSliderRow(theme, parent, labelText, min, max, value, callback) {
    const row = new GUI.StackPanel();
    row.isVertical = false;
    row.height = "220px";
    row.width = 1;
    row.spacing = 60;
    row.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    row.paddingLeft = "60px";
    row.paddingRight = "60px";

    const label = new GUI.TextBlock();
    label.text = labelText;
    label.width = "500px";
    label.color = theme.text;
    label.fontSize = 90;
    label.paddingLeft = "100px";
    label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const slider = new GUI.Slider();
    slider.minimum = min;
    slider.maximum = max;
    slider.value = value;
    slider.height = "48px";
    slider.width = "1600px";
    slider.background = theme.sliderBar;
    slider.color = theme.sliderFill;
    slider.isThumbClamped = true;
    slider.borderColor = theme.sliderBar;
    slider.thumbWidth = 84;
    slider.thumbHeight = 84;
    slider.paddingLeft = "100px";
    slider.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    slider.isPointerBlocker = true;

    const valueBox = new GUI.Rectangle();
    valueBox.width = "280px";
    valueBox.height = "132px";
    valueBox.cornerRadius = 36;
    valueBox.thickness = 0;
    valueBox.background = theme.valueBoxBg;
    valueBox.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const valueText = new GUI.TextBlock();
    valueText.text = Number(value).toFixed(2).replace(/\.00$/, "");
    valueText.color = theme.valueBoxTx;
    valueText.fontSize = 78;
    valueText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    valueText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    valueBox.addControl(valueText);

    slider.onValueChangedObservable.add((sliderValue) => {
        const out = labelText === "Rows" ? Math.floor(sliderValue) : sliderValue;
        valueText.text =
            labelText === "Rows"
                ? String(out)
                : Number(out).toFixed(2).replace(/\.00$/, "");
        callback(out);
    });

    row.addControl(label);
    row.addControl(slider);
    row.addControl(valueBox);
    parent.addControl(row);
}

export function buildSlidersSection(theme, parent, createSection) {
    const section = createSection();
    parent.addControl(section);

    const slidersStack = new GUI.StackPanel();
    slidersStack.isVertical = true;
    slidersStack.width = 1;
    slidersStack.spacing = 24;
    slidersStack.paddingTop = "24px";
    slidersStack.paddingBottom = "24px";
    section.addControl(slidersStack);

    addSliderRow(theme, slidersStack, "Rows", 1, 8, DEFAULT_ROWS, updateRows);
    addSliderRow(theme, slidersStack, "Curvature", 0, 10, DEFAULT_CURVE, updateCurve);
    addSliderRow(theme, slidersStack, "Margin X", 0, 10, DEFAULT_MARGIN.x, updateMarginX);
    addSliderRow(theme, slidersStack, "Margin Y", 0, 10, DEFAULT_MARGIN.y, updateMarginY);
}

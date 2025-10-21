import * as GUI from "@babylonjs/gui";
import { addChart, removeChart } from "../../core/layout-manager.js";
import { applyButtonPreset } from "../style.js";

export function buildChartActionsSection(theme, parent, createSection, scene, getSelectedChartType) {
    const spacer = new GUI.Rectangle();
    spacer.height = "30px";
    spacer.thickness = 0;
    spacer.background = "";
    spacer.isHitTestVisible = false;
    parent.addControl(spacer);

    const section = createSection();
    section.background = "";
    section.marginTop = "60px";
    parent.addControl(section);

    const row = new GUI.StackPanel();
    row.isVertical = false;
    row.height = "300px";
    row.spacing = 72;
    row.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    section.addControl(row);

    const addBtn = GUI.Button.CreateSimpleButton("addChartBtn", "Add Chart");
    addBtn.width = "1200px";
    addBtn.height = "300px";
    applyButtonPreset(addBtn, "primary");
    addBtn.cornerRadius = 100;
    addBtn.thickness = 0;
    addBtn.fontSize = 128;
    addBtn.marginTop = "0px";
    addBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    addBtn.onPointerUpObservable.add(() => {
        addChart(scene, getSelectedChartType());
    });

    const removeBtn = GUI.Button.CreateSimpleButton("removeChartBtn", "Remove Chart");
    removeBtn.width = "1200px";
    removeBtn.height = "300px";
    applyButtonPreset(removeBtn, "danger");
    removeBtn.cornerRadius = 100;
    removeBtn.thickness = 0;
    removeBtn.fontSize = 128;
    removeBtn.marginTop = "0px";
    removeBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    removeBtn.onPointerUpObservable.add(() => {
        removeChart(scene);
    });

    row.addControl(addBtn);
    row.addControl(removeBtn);
}

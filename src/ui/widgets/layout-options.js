import * as GUI from "@babylonjs/gui";
import { setLayout } from "../../core/layout-manager.js";
import { applyButtonPreset } from "../style.js";

function makeGrayButton(theme, id, text, onClick) {
    const button = GUI.Button.CreateSimpleButton(id, text);
    button.width = "850px";
    button.height = "240px";
    button.cornerRadius = 80;
    button.thickness = 0;
    applyButtonPreset(button, "neutral");
    button.fontSize = 128;
    button.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    button.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    button.onPointerUpObservable.add(onClick);
    return button;
}

export function buildLayoutOptionsSection(theme, parent, createSection) {
    const section = createSection();
    section.background = "";
    parent.addControl(section);

    const layoutRow = new GUI.StackPanel();
    layoutRow.isVertical = false;
    layoutRow.height = "240px";
    layoutRow.paddingBottom = "100px";
    layoutRow.spacing = 72;
    layoutRow.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    layoutRow.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    section.addControl(layoutRow);

    layoutRow.addControl(
        makeGrayButton(theme, "planeBtn", "Plane", () => {
            setLayout(0);
        })
    );
    layoutRow.addControl(
        makeGrayButton(theme, "cylinderBtn", "Cylinder", () => {
            setLayout(1);
        })
    );
    layoutRow.addControl(
        makeGrayButton(theme, "sphereBtn", "Sphere", () => {
            setLayout(2);
        })
    );
}

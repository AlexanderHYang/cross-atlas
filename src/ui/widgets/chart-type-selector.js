import * as GUI from "@babylonjs/gui";
import { createChartTypeDropdown } from "./chart-type-dropdown.js";

const CHART_OPTIONS = [
    { label: "2D Bar Chart", value: "2d" },
    { label: "3D Bar Chart", value: "3d" },
    { label: "3D Scatter Plot", value: "scatter" },
    { label: "Line Chart", value: "line" },
];

export function buildChartTypeSection(theme, parent, createSection, requestPanelResize) {
    const section = createSection();
    parent.addControl(section);

    const column = new GUI.StackPanel();
    column.isVertical = true;
    column.width = 1;
    column.spacing = 24;
    column.paddingTop = "50px";
    column.paddingBottom = "50px";
    section.addControl(column);

    const heading = new GUI.TextBlock();
    heading.text = "Chart Type";
    heading.height = "150px";
    heading.color = theme.text;
    heading.fontSize = 110;
    heading.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    heading.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    heading.paddingLeft = "150px";
    column.addControl(heading);

    const dropdown = createChartTypeDropdown(theme, CHART_OPTIONS, requestPanelResize);
    column.addControl(dropdown.root);

    return {
        getSelectedChartType: () => dropdown.getSelection(),
    };
}

import * as GUI from "@babylonjs/gui";
import { initWebXR } from "../lib/xr/webxr-experience.js";
import { THEME } from "./style.js";
import { createAuthoringPanel, createSection } from "./panel-surface.js";
import { buildSlidersSection } from "./widgets/slider-controls.js";
import { buildChartTypeSection } from "./widgets/chart-type-selector.js";
import { buildChartActionsSection } from "./widgets/chart-actions.js";
import { buildLayoutOptionsSection } from "./widgets/layout-options.js";

export async function setupWebXR(scene) {
    const xr = await initWebXR(scene);

    const { authoringStack, requestPanelResize } = createAuthoringPanel(scene, THEME);

    const title = new GUI.TextBlock("title", "Authoring Panel");
    title.height = "220px";
    title.color = THEME.text;
    title.fontSize = 160;
    title.fontStyle = "bold";
    title.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    title.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    title.paddingBottom = "48px";
    authoringStack.addControl(title);

    buildSlidersSection(THEME, authoringStack, createSection);

    const { getSelectedChartType } = buildChartTypeSection(
        THEME,
        authoringStack,
        createSection,
        requestPanelResize
    );

    buildChartActionsSection(THEME, authoringStack, createSection, scene, getSelectedChartType);

    buildLayoutOptionsSection(THEME, authoringStack, createSection);

    return xr;
}

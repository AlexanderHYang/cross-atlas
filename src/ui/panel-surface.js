import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";

const BASE_PANEL_WIDTH = 3.2;
const BASE_PANEL_HEIGHT = 6.5;
const TEX_PX_PER_UNIT = 1000;

export function createAuthoringPanel(scene, theme) {
    const panelMesh = BABYLON.MeshBuilder.CreatePlane(
        "authoringPanelMesh",
        { width: BASE_PANEL_WIDTH, height: BASE_PANEL_HEIGHT },
        scene
    );

    panelMesh.position = new BABYLON.Vector3(-5, 1.5, 4);
    panelMesh.rotation = new BABYLON.Vector3(0, -Math.PI / 4, 0);

    const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(
        panelMesh,
        Math.round(BASE_PANEL_WIDTH * TEX_PX_PER_UNIT),
        Math.round(BASE_PANEL_HEIGHT * TEX_PX_PER_UNIT),
        true
    );

    const authoringPanel = new GUI.Rectangle("authoringPanel");
    authoringPanel.width = 1;
    authoringPanel.height = "auto";
    authoringPanel.adaptHeightToChildren = true;
    authoringPanel.cornerRadius = 150;
    authoringPanel.thickness = 6;
    authoringPanel.color = theme.panelStroke;
    authoringPanel.background = theme.panelBg;
    authoringPanel.paddingTop = "120px";
    authoringPanel.paddingBottom = "160px";
    authoringPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    authoringPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    authoringPanel.paddingLeft = "60px";
    authoringPanel.paddingRight = "60px";
    advancedTexture.addControl(authoringPanel);

    const requestPanelResize = () => {
        const BASE_TEX_W = Math.round(BASE_PANEL_WIDTH * TEX_PX_PER_UNIT);
        const BASE_TEX_H = Math.round(BASE_PANEL_HEIGHT * TEX_PX_PER_UNIT);
        const EXTRA_MARGIN_PX = 360;
        setTimeout(() => {
            const contentH = Math.ceil((authoringPanel.heightInPixels || 0) + EXTRA_MARGIN_PX);
            const targetTexH = Math.max(BASE_TEX_H, contentH);
            if (Math.abs(targetTexH - advancedTexture.getSize().height) > 5) {
                advancedTexture.scaleTo(BASE_TEX_W, targetTexH);
                panelMesh.scaling.y = targetTexH / BASE_TEX_H;
            }
        }, 0);
    };

    const authoringStack = new GUI.StackPanel("authoringStack");
    authoringStack.isVertical = true;
    authoringStack.paddingTop = "100px";
    authoringStack.paddingLeft = "84px";
    authoringStack.paddingRight = "84px";
    authoringStack.width = 1;
    authoringPanel.addControl(authoringStack);

    return {
        authoringStack,
        requestPanelResize,
        panelMesh,
        advancedTexture,
    };
}

export function createSection() {
    const rect = new GUI.Rectangle();
    rect.width = 1;
    rect.thickness = 0;
    rect.background = "#111827cc";
    rect.cornerRadius = 54;
    rect.paddingTop = "48px";
    rect.paddingBottom = "48px";
    rect.paddingLeft = "60px";
    rect.paddingRight = "60px";
    rect.height = "auto";
    rect.adaptHeightToChildren = true;
    rect.marginBottom = "48px";
    return rect;
}

import "@babylonjs/inspector";
import * as BABYLON from "@babylonjs/core";
import * as anu from "@jpmorganchase/anu";
import * as GUI from "@babylonjs/gui";
import * as d3 from "d3";
import { layout } from "./src/vis-layout.js";
import { setupWebXR } from "./src/gui.js";

const app = document.querySelector("#app");
const canvas = document.createElement("canvas");
app.appendChild(canvas);

const babylonEngine = new BABYLON.Engine(canvas, true);
const scene = layout(babylonEngine);

// Configure Babylon.js to only show error level logs
// BABYLON.Logger.LogLevels = BABYLON.Logger.ErrorLogLevel;

// initialize XR
setupWebXR(scene);

babylonEngine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener("resize", function () {
    babylonEngine.resize();
});

window.addEventListener("keydown", (ev) => {
    if (ev.key === "I") {
        if (scene.debugLayer.isVisible()) {
            scene.debugLayer.hide();
        } else {
            scene.debugLayer.show();
        }
    }
});
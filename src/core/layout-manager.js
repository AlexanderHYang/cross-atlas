import * as anu from "@jpmorganchase/anu";
import * as BABYLON from "@babylonjs/core";
import * as GUI3D from "@babylonjs/gui/3D";
import { createChart, createRandomCharts } from "../lib/charts/index.js";

export const DEFAULT_ROWS = 3;
export const DEFAULT_CURVE = 8;
export const DEFAULT_MARGIN = new BABYLON.Vector2(3, 0.5);

let rowsRef = DEFAULT_ROWS;
let curveRef = DEFAULT_CURVE;
let marginRef = DEFAULT_MARGIN.clone();
let layoutInstance = null;
let charts = [];

export function layout(engine) {
    const scene = new BABYLON.Scene(engine);
    new GUI3D.GUI3DManager(scene);
    new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 10, 0), scene);

    const camera = new BABYLON.ArcRotateCamera(
        "Camera",
        0,
        0,
        0,
        new BABYLON.Vector3(0, 2.5, 0),
        scene
    );
    camera.position = new BABYLON.Vector3(0, 2.5, -6);
    camera.wheelPrecision = 20;
    camera.minZ = 0;
    camera.attachControl(true);

    charts = createRandomCharts(scene, 15);

    layoutInstance = new anu.cylinderLayout(
        "Layout",
        {
            selection: anu.selectTag("chart", scene),
            rows: DEFAULT_ROWS,
            radius: DEFAULT_CURVE,
            margin: DEFAULT_MARGIN.clone(),
        },
        scene
    );

    rowsRef = DEFAULT_ROWS;
    curveRef = DEFAULT_CURVE;
    marginRef = DEFAULT_MARGIN.clone();

    return scene;
}

export function updateRows(val) {
    rowsRef = Math.floor(val);
    if (layoutInstance) {
        layoutInstance.attr("row", rowsRef);
    }
}

export function updateCurve(val) {
    curveRef = val;
    if (layoutInstance) {
        layoutInstance.attr("radius", curveRef);
    }
}

export function updateMarginX(val) {
    marginRef.x = val;
    if (layoutInstance) {
        layoutInstance.attr("margin", marginRef);
    }
}

export function updateMarginY(val) {
    marginRef.y = val;
    if (layoutInstance) {
        layoutInstance.attr("margin", marginRef);
    }
}

export function setLayout(val) {
    if (!layoutInstance) return;
    switch (val) {
        case 0:
            layoutInstance.planeLayout();
            break;
        case 1:
            layoutInstance.cylinderLayout();
            break;
        case 2:
            layoutInstance.sphereLayout();
            break;
        default:
            break;
    }
}

export function addChart(scene, chartType = "2d") {
    if (!layoutInstance) return;
    const chart = createChart(scene, chartType);
    if (!chart) return;
    charts.push(chart);
    layoutInstance.options.selection = anu.selectTag("chart", scene);
    layoutInstance.update();
}

export function removeChart(scene) {
    if (!layoutInstance || charts.length === 0) return;
    const chart = charts.pop();
    chart.dispose();
    layoutInstance.options.selection = anu.selectTag("chart", scene);
    layoutInstance.update();
}

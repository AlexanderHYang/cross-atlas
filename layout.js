// SPDX-License-Identifier: Apache-2.0
// Copyright : J.P. Morgan Chase & Co.

import * as anu from "@jpmorganchase/anu";
import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import * as GUI3D from "@babylonjs/gui/3D";
import * as d3 from "d3";
import data from "./data/cars.json" assert { type: "json" };

import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc"; // Replace WebsocketProvider with WebrtcProvider

// Create a shared Yjs doc
const ydoc = new Y.Doc();

// Connect to a WebRTC signaling server
// Replace the room name "crossdash-room" with your desired room name
const provider = new WebrtcProvider("crossdash-room", ydoc, {
    signaling: ["wss://signaling.yjs.dev"],
    peerOpts: {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" }
        ]
      }
    }
  });
  
const yState = ydoc.getMap("sliders");

console.log(provider.awareness.getStates());

export function layout(engine) {
    // Create an empty Scene
    const scene = new BABYLON.Scene(engine);
    const manager = new GUI3D.GUI3DManager(scene);

    // Add some lighting
    new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 10, 0), scene);

    // Add a camera that rotates around the origin and adjust its properties
    const camera = new BABYLON.ArcRotateCamera(
        "Camera",
        0,
        0,
        0,
        new BABYLON.Vector3(0, 2.5, 0),
        scene
    );
    camera.position = new BABYLON.Vector3(0, 2.5, -6); // Move camera closer to charts
    camera.wheelPrecision = 20;
    camera.minZ = 0;
    camera.attachControl(true);

    // To use layouts we need charts to begin with, generate 15 charts
    let allCharts = [];
    for (let i = 0; i < 15; i++) {
        let chart =
            Math.random() > 0.5
                ? make2Dchart(Math.random() * 100, scene)
                : make3Dchart(Math.random() * 100, scene);
        allCharts.push(chart);
    }

    // Layout variables
    let rows = 3;
    let curve = 5;
    let margin = new BABYLON.Vector2(0.5, 0.5);

    // Create the layout, specify the layout type, parent name, and layout configurations
    let layoutObj = new anu.cylinderLayout(
        "Layout",
        { selection: anu.selectTag("chart", scene), rows: rows, radius: curve, margin: margin },
        scene
    )
        .attr("row", rows)
        .attr("radius", curve)
        .attr("margin", margin);

    // Define functions to update layout properties which will be called from UI events
    const updateRows = (val) => {
        rows = Math.floor(val);
        layoutObj.attr("row", rows);
    };

    const updateCurve = (val) => {
        curve = val;
        layoutObj.attr("radius", curve);
    };

    const updateMarginX = (val) => {
        margin.x = val;
        layoutObj.attr("margin", margin);
    };

    const updateMarginY = (val) => {
        margin.y = val;
        layoutObj.attr("margin", margin);
    };

    // Sliders for rows, curve, marginX, marginY (spread horizontally)
    function bindSliderToYjs(label, min, max, initial, updateFn, position, key) {
        const slider = new GUI3D.Slider3D(label);
        slider.minimum = min;
        slider.maximum = max;
        slider.value = initial;
        slider.position = position;

        // Local → Remote
        slider.onValueChangedObservable.add((val) => {
            yState.set(key, val);
            updateFn(val);
        });

        // Remote → Local
        yState.observe((event) => {
            if (event.keysChanged.has(key)) {
                const newVal = yState.get(key);
                console.log(`Yjs state updated for ${key}:`, newVal);
                if (slider.value !== newVal) {
                    slider.value = newVal;
                    updateFn(newVal); // apply to Babylon layout
                }
            }
        });

        // Set initial state in Yjs if not yet present
        if (!yState.has(key)) {
            yState.set(key, initial);
        } else {
            // Apply existing Yjs value (e.g. when a new client joins)
            const val = yState.get(key);
            slider.value = val;
            updateFn(val);
        }

        manager.addControl(slider);
        const text = new GUI.TextBlock();
        text.text = label;
        slider.thumbContent = text;
        return slider;
    }

    bindSliderToYjs("Rows", 1, 8, rows, updateRows, new BABYLON.Vector3(-2.0, 0, 2.5), "rows");
    bindSliderToYjs("Curvature", 0, 10, curve, updateCurve, new BABYLON.Vector3(-1, 0, 2.5), "curve");
    bindSliderToYjs("Margin X", 0, 10, margin.x, updateMarginX, new BABYLON.Vector3(0, 0, 2.5), "marginX");
    bindSliderToYjs("Margin Y", 0, 10, margin.y, updateMarginY, new BABYLON.Vector3(1.0, 0, 2.5), "marginY");

    // Initialize globals for exported functions
    initLayoutGlobals(layoutObj, allCharts, scene);
    return scene;
}

// Exported functions for use in xr.js
let _layoutInstance = null;
let _sceneInstance = null;
let _allChartsInstance = null;
let _layoutObj = null;

export function setLayout(val) {
    if (_layoutObj) {
        switch (val) {
            case 0:
                _layoutObj.planeLayout();
                break;
            case 1:
                _layoutObj.cylinderLayout();
                break;
            case 2:
                _layoutObj.sphereLayout();
                break;
        }
    }
}

export function addChart(scene) {
    if (_allChartsInstance && _layoutObj) {
        let chart =
            Math.random() > 0.5
                ? make2Dchart(Math.random() * 100, scene)
                : make3Dchart(Math.random() * 100, scene);
        _allChartsInstance.push(chart);
        _layoutObj.options.selection = anu.selectTag("chart", scene);
        _layoutObj.update();
    }
}

export function removeChart(scene) {
    if (_allChartsInstance && _layoutObj && _allChartsInstance.length > 0) {
        _allChartsInstance[_allChartsInstance.length - 1].dispose();
        _allChartsInstance.pop();
        _layoutObj.options.selection = anu.selectTag("chart", scene);
        _layoutObj.update();
    }
}

// Patch the layout function to set instances for exported functions
export function initLayoutGlobals(layoutObj, allCharts, scene) {
    _layoutObj = layoutObj;
    _allChartsInstance = allCharts;
    _sceneInstance = scene;
}

//Code from 2D bar chart example
function make2Dchart(id, scene) {
    const cylinders = [...new Set(data.map((item) => item.Cylinders))].sort();
    let carsRollup = d3.flatRollup(
        data,
        (v) => {
            return {
                Horsepower: d3.mean(v, (d) => d.Horsepower),
                Miles_per_Gallon: d3.mean(v, (d) => d.Miles_per_Gallon),
            };
        },
        (d) => d.Cylinders
    );
    carsRollup = carsRollup.map(([Cylinders, Data]) => ({ Cylinders, ...Data }));

    const horsepowerMinMax = d3.extent([...new Set(carsRollup.map((item) => item.Horsepower))]);
    const MPGMinMax = d3.extent([...new Set(carsRollup.map((item) => item.Miles_per_Gallon))]);

    let scaleX = d3.scaleBand().domain(cylinders).range([-1, 1]).paddingInner(1).paddingOuter(0.5);
    let scaleY = d3.scaleLinear().domain(horsepowerMinMax).range([0, 2]).nice();
    let scaleC = d3
        .scaleSequential(anu.sequentialChromatic("Greens").toStandardMaterial())
        .domain(MPGMinMax);

    let CoT = anu.create("cot", "cot" + id);
    let chart = anu.selectName("cot" + id, scene);

    let bars = chart
        .bind("plane", { height: 1, width: 0.3, sideOrientation: 2 }, carsRollup)
        .positionX((d) => scaleX(d.Cylinders))
        .positionZ(-0.01)
        .scalingY((d) => scaleY(d.Horsepower))
        .positionY((d) => scaleY(d.Horsepower) / 2)
        .material((d, i) => scaleC(d.Miles_per_Gallon));

    anu.createAxes("myAxes", { scale: { x: scaleX, y: scaleY }, parent: chart });

    chart
        .scaling(
            BABYLON.Vector3.Maximize(BABYLON.Vector3.Random(), BABYLON.Vector3.One().scale(0.5))
        )
        .addTags("chart");
    return chart;
}

//Code from 3D bar chart example
function make3Dchart(id, scene) {
    const origin = [...new Set(data.map((item) => item.Origin))];
    const cylinders = [...new Set(data.map((item) => item.Cylinders))].sort().reverse();
    let carsRollup = d3.flatRollup(
        data,
        (v) => {
            return {
                Horsepower: d3.mean(v, (d) => d.Horsepower),
                Miles_per_Gallon: d3.mean(v, (d) => d.Miles_per_Gallon),
            };
        },
        (d) => d.Origin,
        (d) => d.Cylinders
    );
    carsRollup = carsRollup.map(([Origin, Cylinders, Data]) => ({ Origin, Cylinders, ...Data }));

    const horsepowerMinMax = d3.extent([...new Set(carsRollup.map((item) => item.Horsepower))]);
    const MPGMinMax = d3
        .extent([...new Set(carsRollup.map((item) => item.Miles_per_Gallon))])
        .reverse();

    let scaleX = d3.scaleBand().domain(cylinders).range([-1, 1]).paddingInner(1).paddingOuter(0.5);
    let scaleY = d3.scaleLinear().domain(horsepowerMinMax).range([0, 2]);
    let scaleZ = d3.scaleBand().domain(origin).range([-1, 1]).paddingInner(1).paddingOuter(0.5);
    let scaleC = d3
        .scaleSequential(anu.sequentialChromatic("OrRd").toStandardMaterial())
        .domain(MPGMinMax);

    let CoT = anu.create("cot", "cot" + id);
    let chart = anu.selectName("cot" + id, scene);

    let bars = chart
        .bind("box", { height: 1, width: 0.35, depth: 0.35 }, carsRollup)
        .positionX((d) => scaleX(d.Cylinders))
        .positionZ((d) => scaleZ(d.Origin))
        .scalingY((d) => scaleY(d.Horsepower))
        .positionY((d) => scaleY(d.Horsepower) / 2)
        .material((d, i) => scaleC(d.Miles_per_Gallon));

    anu.createAxes("myAxes", { scale: { x: scaleX, y: scaleY, z: scaleZ }, parent: chart });

    chart
        .scaling(
            BABYLON.Vector3.Maximize(BABYLON.Vector3.Random(), BABYLON.Vector3.One().scale(0.5))
        )
        .addTags("chart");
    return chart;
}

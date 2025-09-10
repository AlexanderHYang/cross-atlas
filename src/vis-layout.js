// SPDX-License-Identifier: Apache-2.0
// Copyright : J.P. Morgan Chase & Co.

import * as anu from "@jpmorganchase/anu";
import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import * as GUI3D from "@babylonjs/gui/3D";
import * as d3 from "d3";
import carData from "../data/cars.json" assert { type: "json" };
import penguinData from "../data/penguins.json" assert { type: "json" };

export function layout(engine) {
    //Create an empty Scene
    const scene = new BABYLON.Scene(engine);
    const manager = new GUI3D.GUI3DManager(scene);
    //Add some lighting
    new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 10, 0), scene);
    //Add a camera that rotates around the origin and adjust its properties
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

    //To use layouts we need charts to begin with, generate 15 charts
    let allCharts = [];
    for (let i = 0; i < 15; i++) {
        let chart =
            Math.random() > 0.5
                ? make2Dchart(Math.random() * 100, scene)
                : make3Dchart(Math.random() * 100, scene);
        allCharts.push(chart);
    }

    //Layout variables
    let rows = 3;
    let curve = 5;
    let margin = new BABYLON.Vector2(0.5, 0.5);

    //Create the layout, specify the layout type, parent name, and layout configurations
    let layoutObj = new anu.cylinderLayout(
        "Layout",
        { selection: anu.selectTag("chart", scene), rows: rows, radius: curve, margin: margin },
        scene
    )
        .attr("row", rows)
        .attr("radius", curve)
        .attr("margin", margin);

    // Set module-level refs for update functions
    _layoutObjRef = layoutObj;
    _rowsRef = rows;
    _curveRef = curve;
    _marginRef = { x: margin.x, y: margin.y };

    // All slider callbacks are now handled by the 2D panel in xr.js. No sliders are created here.

    // Initialize globals for exported functions
    initLayoutGlobals(layoutObj, allCharts, scene);
    return scene;
}
// Removed misplaced closing brace here

// Module-level refs for update functions
let _layoutObjRef = null;
let _rowsRef = 3;
let _curveRef = 5;
let _marginRef = { x: 0.5, y: 0.5 };

// Function definitions
function updateRows(val) {
    _rowsRef = Math.floor(val);
    if (_layoutObjRef) _layoutObjRef.attr("row", _rowsRef);
}

function updateCurve(val) {
    _curveRef = val;
    if (_layoutObjRef) _layoutObjRef.attr("radius", _curveRef);
}

function updateMarginX(val) {
    _marginRef.x = val;
    if (_layoutObjRef) _layoutObjRef.attr("margin", _marginRef);
}

function updateMarginY(val) {
    _marginRef.y = val;
    if (_layoutObjRef) _layoutObjRef.attr("margin", _marginRef);
}

// Exported functions for use in xr.js
let _layoutInstance = null;
let _sceneInstance = null;
let _allChartsInstance = null;
let _layoutObj = null;

// Export update functions at the top level
export { updateRows, updateCurve, updateMarginX, updateMarginY };

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

        // After layout is applied, rotate all pie charts to face forward
        const scene = _sceneInstance;
        if (scene) {
            const allCharts = anu.selectTag("chart", scene);
            allCharts.forEach((chart) => {
                // Check if this is a pie chart by looking for cylinder children with arc property
                const pieSegments = chart
                    .getChildMeshes()
                    .filter(
                        (mesh) =>
                            mesh.geometry &&
                            mesh.geometry.getClassName() === "CylinderGeometry" &&
                            mesh.metadata &&
                            mesh.metadata.arc
                    );

                if (pieSegments.length > 0) {
                    // This is a pie chart, rotate it to face forward
                    chart.rotation = new BABYLON.Vector3(-Math.PI / 2, 0, 0);
                }
            });
        }
    }
}

export function addChart(scene, chartType = "2d") {
    if (_allChartsInstance && _layoutObj) {
        let chart;
        const id = Math.random() * 100;

        switch (chartType) {
            case "2d":
                chart = make2Dchart(id, scene);
                break;
            case "3d":
                chart = make3Dchart(id, scene);
                break;
            case "line":
                chart = makeLineChart(id, scene);
                break;
            case "scatter":
                chart = makeScatterPlot(id, scene);
                break;
            default:
                chart = make2Dchart(id, scene); // fallback to 2D
        }

        if (chart) {
            _allChartsInstance.push(chart);
            _layoutObj.options.selection = anu.selectTag("chart", scene);
            _layoutObj.update();
        }
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

//Code for line chart
function makeLineChart(id, scene) {
    // Simulated stock data since we don't have the CSV
    const stockData = generateStockData();

    // Create D3 functions to parse time and date
    let dateFormat = d3.timeFormat("%Y");

    // Create scales
    let scaleX = d3
        .scaleTime()
        .domain(d3.extent(stockData, (d) => d.date))
        .range([-1, 1]);

    let scaleY = d3
        .scaleLinear()
        .domain([0, d3.max(stockData, (d) => d.price)])
        .range([-1, 1])
        .nice();

    // Color scale using Anu helper
    let scaleC = d3.scaleOrdinal(anu.ordinalChromatic("d310").toColor3());

    // Create paths for each stock symbol
    let paths = Object.values(
        stockData.reduce((acc, d) => {
            let position = new BABYLON.Vector3(scaleX(d.date), scaleY(d.price), 0);
            (acc[d.symbol] = acc[d.symbol] || []).push(position);
            return acc;
        }, {})
    );

    // Smooth the paths
    paths = paths.map((path) => BABYLON.Curve3.CreateCatmullRomSpline(path, 20, false).getPoints());

    // Create the chart container
    let CoT = anu.create("cot", "cot" + id);
    let chart = anu.selectName("cot" + id, scene);

    // Create tubes for each path
    let lines = chart.bind("tube", { path: (d) => d, radius: 0.005 }, paths).material((d, n, i) => {
        const material = new BABYLON.StandardMaterial("LineMaterial" + i);
        material.diffuseColor = scaleC(i);
        material.emissiveColor = scaleC(i).multiplyByFloats(0.25, 0.25, 0.25);
        material.specularColor = BABYLON.Color3.Black();
        return material;
    });

    // Add axes
    anu.createAxes("myAxes", {
        scale: { x: scaleX, y: scaleY },
        parent: chart,
        domainMaterialOptions: { width: 0.01 },
        labelTicks: { x: scaleX.ticks(d3.timeYear) },
        labelFormat: { x: dateFormat, y: (text) => "$" + text },
    });

    chart
        .scaling(
            BABYLON.Vector3.Maximize(BABYLON.Vector3.Random(), BABYLON.Vector3.One().scale(0.5))
        )
        .addTags("chart");
    return chart;
}

// Helper function to generate sample stock data
function generateStockData() {
    const symbols = ["AAPL", "GOOGL", "MSFT"];
    const data = [];
    const baseDate = new Date(2020, 0, 1);

    symbols.forEach((symbol) => {
        let price = 100 + Math.random() * 100;
        for (let i = 0; i < 365; i++) {
            data.push({
                symbol,
                date: new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000),
                price: price + (Math.random() - 0.5) * 10,
            });
            price += (Math.random() - 0.5) * 5;
        }
    });

    return data;
}

//Code from 2D bar chart example
function make2Dchart(id, scene) {
    const cylinders = [...new Set(carData.map((item) => item.Cylinders))].sort();
    let carsRollup = d3.flatRollup(
        carData,
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

// Pie chart implementation
function makeScatterPlot(id, scene) {
    // Create the D3 scales
    let scaleX = d3
        .scaleLinear()
        .domain(d3.extent(d3.map(penguinData, (d) => d["Beak Length (mm)"])))
        .range([-1, 1])
        .nice();

    let scaleY = d3
        .scaleLinear()
        .domain(d3.extent(d3.map(penguinData, (d) => d["Flipper Length (mm)"])))
        .range([-1, 1])
        .nice();

    let scaleZ = d3
        .scaleLinear()
        .domain(d3.extent(d3.map(penguinData, (d) => d["Beak Depth (mm)"])))
        .range([-1, 1])
        .nice();

    let scaleSize = d3
        .scaleLinear()
        .domain(d3.extent(d3.map(penguinData, (d) => d["Body Mass (g)"])))
        .range([0.02, 0.1]);

    // Color scale using Anu helper
    let scaleC = d3.scaleOrdinal(anu.ordinalChromatic("d310").toStandardMaterial());

    // Create the chart container
    let CoT = anu.create("cot", "cot" + id);
    let chart = anu.selectName("cot" + id, scene);

    // Create spheres for each data point
    let spheres = chart
        .bind("sphere", { diameter: (d) => scaleSize(d["Body Mass (g)"] ?? 0) }, penguinData)
        .position(
            (d) =>
                new BABYLON.Vector3(
                    scaleX(d["Beak Length (mm)"]),
                    scaleY(d["Flipper Length (mm)"]),
                    scaleZ(d["Beak Depth (mm)"])
                )
        )
        .material((d) => scaleC(d.Species));

    // Add axes
    anu.createAxes("myAxes", {
        scale: { x: scaleX, y: scaleY, z: scaleZ },
        parent: chart,
    });

    chart
        .scaling(
            BABYLON.Vector3.Maximize(BABYLON.Vector3.Random(), BABYLON.Vector3.One().scale(0.5))
        )
        .addTags("chart");

    return chart;
}

//Code from 3D bar chart example
function make3Dchart(id, scene) {
    const origin = [...new Set(carData.map((item) => item.Origin))];
    const cylinders = [...new Set(carData.map((item) => item.Cylinders))].sort().reverse();
    let carsRollup = d3.flatRollup(
        carData,
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

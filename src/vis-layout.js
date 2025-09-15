// SPDX-License-Identifier: Apache-2.0
// Copyright : J.P. Morgan Chase & Co.

import * as anu from "@jpmorganchase/anu";
import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import * as GUI3D from "@babylonjs/gui/3D";
import * as d3 from "d3";
import carData from "../data/cars.json" assert { type: "json" };
import penguinData from "../data/penguins.json" assert { type: "json" };

// Centralized layout defaults
export const DEFAULT_ROWS = 3;
export const DEFAULT_CURVE = 8;
export const DEFAULT_MARGIN = new BABYLON.Vector2(3, 0.5);
export const CHART_SCALE_FACTOR = 0.8;

// Module-level refs
let _rowsRef = DEFAULT_ROWS;
let _curveRef = DEFAULT_CURVE;
let _marginRef = DEFAULT_MARGIN.clone();
let _layoutObj = null;
let _allChartsInstance = null;
let _sceneInstance = null;

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
        const r = Math.random();
        let chart;
        const id = Math.random() * 100;
        if (r < 0.25) {
            chart = create2DBarChart(id, scene);
        } else if (r < 0.5) {
            chart = create3DBarChart(id, scene);
        } else if (r < 0.75) {
            chart = createScatterPlot(id, scene);
        } else {
            chart = createLineChart(id, scene);
        }
        allCharts.push(chart);
    }

    //Create the layout, specify the layout type, parent name, and layout configurations
    let layoutObj = new anu.cylinderLayout(
        "Layout",
        {
            selection: anu.selectTag("chart", scene),
            rows: DEFAULT_ROWS,
            radius: DEFAULT_CURVE,
            margin: DEFAULT_MARGIN.clone(),
        },
        scene
    );

    // Initialize module-level refs for GUI controls
    _layoutObj = layoutObj;
    _allChartsInstance = allCharts;
    _sceneInstance = scene;

    return scene;
}

// Function definitions
function updateRows(val) {
    _rowsRef = Math.floor(val);
    if (_layoutObj) _layoutObj.attr("row", _rowsRef);
}

function updateCurve(val) {
    _curveRef = val;
    if (_layoutObj) _layoutObj.attr("radius", _curveRef);
}

function updateMarginX(val) {
    _marginRef.x = val;
    if (_layoutObj) _layoutObj.attr("margin", _marginRef);
}

function updateMarginY(val) {
    _marginRef.y = val;
    if (_layoutObj) _layoutObj.attr("margin", _marginRef);
}

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
    }
}

export function addChart(scene, chartType = "2d") {
    if (_allChartsInstance && _layoutObj) {
        let chart;
        const id = Math.random() * 100;

        switch (chartType) {
            case "2d":
                chart = create2DBarChart(id, scene);
                break;
            case "3d":
                chart = create3DBarChart(id, scene);
                break;
            case "line":
                chart = createLineChart(id, scene);
                break;
            case "scatter":
                chart = createScatterPlot(id, scene);
                break;
            default:
                chart = create2DBarChart(id, scene); // fallback to 2D
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

//Code for line chart
function createLineChart(id, scene) {
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
        .range([0, 2])
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

    // Smooth the paths with fewer subdivisions
    paths = paths.map((path) => BABYLON.Curve3.CreateCatmullRomSpline(path, 10, false).getPoints());

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
    // Axes with grid disabled
    const axesOptionsLine = new anu.AxesConfig({ x: scaleX, y: scaleY });
    axesOptionsLine.parent = chart;
    axesOptionsLine.grid = false;
    axesOptionsLine.labelOptions = { size: 0.25 }; // increase label text size
    axesOptionsLine.domainMaterialOptions = { width: 0.01 };
    axesOptionsLine.labelTicks = { x: scaleX.ticks(d3.timeYear) };
    axesOptionsLine.labelFormat = { x: dateFormat, y: (text) => "$" + text };
    anu.createAxes("myAxes", axesOptionsLine);

    chart
        .scaling(BABYLON.Vector3.One().scale(CHART_SCALE_FACTOR))
        .addTags("chart")
        .addTags("LineChart");
    return chart;
}

// Helper function to generate sample stock data
function generateStockData() {
    const symbols = ["AAPL", "GOOGL", "MSFT"];
    const data = [];
    const baseDate = new Date(2020, 0, 1);

    symbols.forEach((symbol) => {
        let price = 100 + Math.random() * 100;
        // Generate weekly data points instead of daily (52 weeks)
        for (let i = 0; i < 52; i++) {
            data.push({
                symbol,
                date: new Date(baseDate.getTime() + i * 7 * 24 * 60 * 60 * 1000),
                price: price + (Math.random() - 0.5) * 10,
            });
            price += (Math.random() - 0.5) * 5;
        }
    });

    return data;
}

//Code from 2D bar chart example
function create2DBarChart(id, scene) {
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

    // Axes with label scaling (grid default = true)
    const axesOptions2D = new anu.AxesConfig({ x: scaleX, y: scaleY });
    axesOptions2D.parent = chart;
    axesOptions2D.labelOptions = { size: 0.25 };
    anu.createAxes("myAxes", axesOptions2D);

    const yOffset = -0.2;
    chart
        .scaling(BABYLON.Vector3.One().scale(CHART_SCALE_FACTOR))
        .addTags("chart")
        .addTags("2DBarChart")
        .positionUI({
            visibility: 0.6,
            width: 0.5,
            radius: 0.03,
            position: new BABYLON.Vector3(0, yOffset, 0),
        })
        .rotateUI({ visibility: 0.6, diameter: 0.08, position: new BABYLON.Vector3(0, yOffset, 0) })
        .scaleUI({
            visibility: 0.6,
            diameter: 0.08,
            minimum: 0.5,
            maximum: 2,
            position: new BABYLON.Vector3(0, yOffset + 0.025, 0),
        });

    return chart;
}

// Scatter Plot implementation
function createScatterPlot(id, scene) {
    // Create the D3 scales
    let scaleX = d3
        .scaleLinear()
        .domain(d3.extent(d3.map(penguinData, (d) => d["Beak Length (mm)"])))
        .range([-1, 1])
        .nice();

    let scaleY = d3
        .scaleLinear()
        .domain(d3.extent(d3.map(penguinData, (d) => d["Flipper Length (mm)"])))
        .range([0, 2])
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
    // Axes with grid disabled
    const axesOptionsScatter = new anu.AxesConfig({ x: scaleX, y: scaleY, z: scaleZ });
    axesOptionsScatter.parent = chart;
    axesOptionsScatter.grid = false;
    axesOptionsScatter.labelOptions = { size: 0.25 }; // increase label text size
    anu.createAxes("myAxes", axesOptionsScatter);

    chart
        .scaling(BABYLON.Vector3.One().scale(CHART_SCALE_FACTOR))
        .addTags("chart")
        .addTags("ScatterPlot");

    return chart;
}

//Code from 3D bar chart example
function create3DBarChart(id, scene) {
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
    let scaleZ = d3.scaleBand().domain(origin).range([0, 2]).paddingInner(1).paddingOuter(0.5);
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

    // Axes with label scaling (grid default = true)
    const axesOptions3D = new anu.AxesConfig({ x: scaleX, y: scaleY, z: scaleZ });
    axesOptions3D.parent = chart;
    axesOptions3D.labelOptions = { size: 0.25 };
    anu.createAxes("myAxes", axesOptions3D);

    chart
        .scaling(BABYLON.Vector3.One().scale(CHART_SCALE_FACTOR))
        .addTags("chart")
        .addTags("3DBarChart");

    console.log();
    return chart;
}

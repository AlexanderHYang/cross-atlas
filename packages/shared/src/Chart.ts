import * as anu from "@jpmorganchase/anu";
import * as BABYLON from "@babylonjs/core";
import * as d3 from "d3";
import carData from "../data/cars.json" assert { type: "json" };
import penguinData from "../data/penguins.json" assert { type: "json" };

// Centralized layout defaults
export const CHART_SCALE_FACTOR = 0.8;

export type ChartKind = 'line' | '2dbar' | 'scatter' | '3dbar';
export class Chart {
    scene: BABYLON.Scene;
    selection: anu.Selection;

    _positionBehavior: BABYLON.SixDofDragBehavior;
    _scaleBehavior: BABYLON.PointerDragBehavior;

    // Keep an internal counter to generate unique ids for created charts
    private static _nextId = 1;

    // constructor accepts a chart kind string and the scene; it creates the underlying anu selection
    constructor(kind: ChartKind, scene: BABYLON.Scene) {
        this.scene = scene;

        const id = `${kind}_${Chart._nextId++}`;

        switch (kind) {
            case 'line':
                this.selection = createLineChart(id, scene) as any;
                break;
            case '2dbar':
                this.selection = create2DBarChart(id, scene) as any;
                break;
            case 'scatter':
                this.selection = createScatterPlot(id, scene) as any;
                break;
            case '3dbar':
                this.selection = create3DBarChart(id, scene) as any;
                break;
            default:
                this.selection = createLineChart(id, scene) as any;
        }

        const yOffset = -0.2;
        const positionUiOptions = {
            name: id + "positionUI",
            visibility: 0.6,
            width: 0.5,
            radius: 0.03,
            position: new BABYLON.Vector3(0, yOffset, 0),
            behavior: new BABYLON.SixDofDragBehavior(),
        }
        this.selection.positionUI(positionUiOptions);
        this._positionBehavior = positionUiOptions.behavior;
        this._positionBehavior.faceCameraOnDragStart = true;
        this._positionBehavior.rotateAroundYOnly = true;

        const rotateUiOptions = {
            name: id + "rotateUI",
            visibility: 0.6,
            diameter: 0.08,
            position: new BABYLON.Vector3(0, yOffset, 0),
        }
        this.selection.rotateUI(rotateUiOptions);

        const scaleUiOptions = {
            name: id + "scaleUI",
            visibility: 0.6,
            diameter: 0.08,
            minimum: 0.5,
            maximum: 2,
            position: new BABYLON.Vector3(0, yOffset + 0.025, 0),
            behavior: new BABYLON.PointerDragBehavior({ dragAxis: new BABYLON.Vector3(0, 1, 0) }),
        }
        this.selection.scaleUI(scaleUiOptions);
        this._scaleBehavior = scaleUiOptions.behavior;
        this._scaleBehavior.moveAttached = false;
    }

    static makeLineChart(scene: BABYLON.Scene) {
        return new Chart('line', scene);
    }

    getPosition = (): BABYLON.Vector3 => {
        const data = this.selection.get("position")[0] as any;
        return new BABYLON.Vector3(data._x, data._y, data._z);
    }
    getRotation = (): BABYLON.Vector3 => {
        const data = this.selection.get("rotation")[0] as any;
        return new BABYLON.Vector3(data._x, data._y, data._z);
    }
    setPosition = (pos: BABYLON.Vector3) => {
        this.selection.position(pos);
    }
    setRotation = (rot: BABYLON.Vector3) => {
        this.selection.rotation(rot);
        this.selection.run((d,n,i) => {
            if ('rotationQuaternion' in n) {
                n.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(rot);
            }
        })
    }
    scale = (s: number) => {
        this.selection.scaling(BABYLON.Vector3.One().scale(s));
    }
}

// Code for line chart
function createLineChart(id: string, scene: BABYLON.Scene) {
    // Simulated stock data since we don't have the CSV
    const stockData = generateStockData();

    // Create D3 functions to parse time and date
    let dateFormat = d3.timeFormat("%Y");

    // Create scales
    let scaleX = d3
        .scaleTime()
        .domain(d3.extent(stockData, (d) => d.date) as any)
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
    paths = paths.map((path) => BABYLON.Curve3.CreateCatmullRomSpline(path as any, 10, false).getPoints());

    // Create the chart container
    let CoT = anu.create("cot", "cot" + id);
    let chart = anu.selectName("cot" + id, scene);

    // Create tubes for each path
    let lines = chart.bind("tube", { path: ((d: any) => d) as any, radius: 0.005 }, paths).material((d, n, i) => {
        const material = new BABYLON.StandardMaterial("LineMaterial" + i);
        material.diffuseColor = scaleC(i as any);
        material.emissiveColor = scaleC(i as any).multiplyByFloats(0.25, 0.25, 0.25);
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
    axesOptionsLine.labelTicks = { x: scaleX.ticks(d3.timeYear) as any };
    axesOptionsLine.labelFormat = { x: dateFormat as any, y: (text) => "$" + text };
    anu.createAxes("myAxes", axesOptionsLine);

    return chart;
}

// Helper function to generate sample stock data
function generateStockData() {
    const symbols = ["AAPL", "GOOGL", "MSFT"];
    const data = [] as any[];
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
function create2DBarChart(id: string, scene: BABYLON.Scene) {
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
    carsRollup = carsRollup.map(([Cylinders, Data]) => ({ Cylinders, ...Data })) as any;

    // @ts-ignore
    const horsepowerMinMax = d3.extent([...new Set(carsRollup.map((item) => item.Horsepower))]);
    // @ts-ignore
    const MPGMinMax = d3.extent([...new Set(carsRollup.map((item) => item.Miles_per_Gallon))]);

    let scaleX = d3.scaleBand().domain(cylinders as any).range([-1, 1]).paddingInner(1).paddingOuter(0.5);
    let scaleY = d3.scaleLinear().domain(horsepowerMinMax as any).range([0, 2]).nice();
    let scaleC = d3
        .scaleSequential(anu.sequentialChromatic("Greens").toStandardMaterial())
        .domain(MPGMinMax as any);

    let CoT = anu.create("cot", "cot" + id);
    let chart = anu.selectName("cot" + id, scene);

    let bars = chart
        .bind("plane", { height: 1, width: 0.3, sideOrientation: 2 }, carsRollup)
        .positionX((d) => scaleX(d.Cylinders) as any)
        .positionZ(-0.01)
        .scalingY((d) => scaleY(d.Horsepower))
        .positionY((d) => scaleY(d.Horsepower) / 2)
        .material((d, i) => scaleC(d.Miles_per_Gallon));

    // Axes with label scaling (grid default = true)
    const axesOptions2D = new anu.AxesConfig({ x: scaleX, y: scaleY });
    axesOptions2D.parent = chart;
    axesOptions2D.labelOptions = { size: 0.25 };
    anu.createAxes("myAxes", axesOptions2D);

    return chart;
}

// Scatter Plot implementation
function createScatterPlot(id: string, scene: BABYLON.Scene) {
    // Create the D3 scales
    let scaleX = d3
        .scaleLinear()
        // @ts-ignore
        .domain(d3.extent(d3.map(penguinData, (d) => d["Beak Length (mm)"])))
        .range([-1, 1])
        .nice();

    let scaleY = d3
        .scaleLinear()
        // @ts-ignore
        .domain(d3.extent(d3.map(penguinData, (d) => d["Flipper Length (mm)"])))
        .range([0, 2])
        .nice();

    let scaleZ = d3
        .scaleLinear()
        // @ts-ignore
        .domain(d3.extent(d3.map(penguinData, (d) => d["Beak Depth (mm)"])))
        .range([-1, 1])
        .nice();

    let scaleSize = d3
        .scaleLinear()
        // @ts-ignore
        .domain(d3.extent(d3.map(penguinData, (d) => d["Body Mass (g)"])))
        .range([0.02, 0.1]);

    // Color scale using Anu helper
    let scaleC = d3.scaleOrdinal(anu.ordinalChromatic("d310").toStandardMaterial());

    // Create the chart container
    let CoT = anu.create("cot", "cot" + id);
    let chart = anu.selectName("cot" + id, scene);

    // Create spheres for each data point
    let spheres = chart
        // @ts-ignore
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

    return chart;
}

//Code from 3D bar chart example
function create3DBarChart(id: string, scene: BABYLON.Scene) {
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
    // @ts-ignore
    carsRollup = carsRollup.map(([Origin, Cylinders, Data]) => ({ Origin, Cylinders, ...Data }));

    // @ts-ignore
    const horsepowerMinMax = d3.extent([...new Set(carsRollup.map((item) => item.Horsepower))]);
    const MPGMinMax = d3
        // @ts-ignore
        .extent([...new Set(carsRollup.map((item) => item.Miles_per_Gallon))])
        .reverse();

    // @ts-ignore
    let scaleX = d3.scaleBand().domain(cylinders).range([-1, 1]).paddingInner(1).paddingOuter(0.5);
    // @ts-ignore
    let scaleY = d3.scaleLinear().domain(horsepowerMinMax).range([0, 2]);
    let scaleZ = d3.scaleBand().domain(origin).range([0, 2]).paddingInner(1).paddingOuter(0.5);
    let scaleC = d3
        .scaleSequential(anu.sequentialChromatic("OrRd").toStandardMaterial())
        .domain(MPGMinMax);

    let CoT = anu.create("cot", "cot" + id);
    let chart = anu.selectName("cot" + id, scene);

    let bars = chart
        .bind("box", { height: 1, width: 0.35, depth: 0.35 }, carsRollup)
        // @ts-ignore
        .positionX((d) => scaleX(d.Cylinders))
        // @ts-ignore
        .positionZ((d) => scaleZ(d.Origin))
        .scalingY((d) => scaleY(d.Horsepower))
        .positionY((d) => scaleY(d.Horsepower) / 2)
        .material((d, i) => scaleC(d.Miles_per_Gallon));

    // Axes with label scaling (grid default = true)
    const axesOptions3D = new anu.AxesConfig({ x: scaleX, y: scaleY, z: scaleZ });
    axesOptions3D.parent = chart;
    axesOptions3D.labelOptions = { size: 0.25 };
    anu.createAxes("myAxes", axesOptions3D);

    return chart;
}
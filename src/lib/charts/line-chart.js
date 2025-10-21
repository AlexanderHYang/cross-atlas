import * as anu from "@jpmorganchase/anu";
import * as BABYLON from "@babylonjs/core";
import * as d3 from "d3";
import { CHART_SCALE_FACTOR } from "./shared.js";
import { generateSampleStockData } from "./stock-data.js";

export function createLineChart(scene, id) {
    const stockData = generateSampleStockData();
    const dateFormat = d3.timeFormat("%Y");

    const scaleX = d3
        .scaleTime()
        .domain(d3.extent(stockData, (d) => d.date))
        .range([-1, 1]);
    const scaleY = d3
        .scaleLinear()
        .domain([0, d3.max(stockData, (d) => d.price)])
        .range([0, 2])
        .nice();
    const scaleC = d3.scaleOrdinal(anu.ordinalChromatic("d310").toColor3());

    const paths = Object.values(
        stockData.reduce((acc, datum) => {
            const point = new BABYLON.Vector3(scaleX(datum.date), scaleY(datum.price), 0);
            (acc[datum.symbol] = acc[datum.symbol] || []).push(point);
            return acc;
        }, {})
    ).map((path) => BABYLON.Curve3.CreateCatmullRomSpline(path, 10, false).getPoints());

    anu.create("cot", `cot${id}`);
    const chart = anu.selectName(`cot${id}`, scene);

    chart.bind("tube", { path: (d) => d, radius: 0.005 }, paths).material((d, n, idx) => {
        const material = new BABYLON.StandardMaterial(`LineMaterial${idx}`);
        material.diffuseColor = scaleC(idx);
        material.emissiveColor = scaleC(idx).multiplyByFloats(0.25, 0.25, 0.25);
        material.specularColor = BABYLON.Color3.Black();
        return material;
    });

    const axesOptions = new anu.AxesConfig({ x: scaleX, y: scaleY });
    axesOptions.parent = chart;
    axesOptions.grid = false;
    axesOptions.labelOptions = { size: 0.25 };
    axesOptions.domainMaterialOptions = { width: 0.01 };
    axesOptions.labelTicks = { x: scaleX.ticks(d3.timeYear) };
    axesOptions.labelFormat = { x: dateFormat, y: (value) => `$${value}` };
    anu.createAxes("myAxes", axesOptions);

    const yOffset = -0.2;
    chart
        .scaling(BABYLON.Vector3.One().scale(CHART_SCALE_FACTOR))
        .addTags("chart")
        .addTags("LineChart")
        .positionUI({
            visibility: 0.6,
            width: 0.5,
            radius: 0.03,
            position: new BABYLON.Vector3(0, yOffset, 0),
        })
        .rotateUI({
            visibility: 0.6,
            diameter: 0.08,
            position: new BABYLON.Vector3(0, yOffset, 0),
        })
        .scaleUI({
            visibility: 0.6,
            diameter: 0.08,
            minimum: 0.5,
            maximum: 2,
            position: new BABYLON.Vector3(0, yOffset + 0.025, 0),
        });

    return chart;
}

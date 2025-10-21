import * as anu from "@jpmorganchase/anu";
import * as BABYLON from "@babylonjs/core";
import * as d3 from "d3";
import penguinData from "../../../data/penguins.json" assert { type: "json" };
import { CHART_SCALE_FACTOR } from "./shared.js";

export function createScatterChart(scene, id) {
    const scaleX = d3
        .scaleLinear()
        .domain(d3.extent(penguinData, (d) => d["Beak Length (mm)"]))
        .range([-1, 1])
        .nice();
    const scaleY = d3
        .scaleLinear()
        .domain(d3.extent(penguinData, (d) => d["Flipper Length (mm)"]))
        .range([0, 2])
        .nice();
    const scaleZ = d3
        .scaleLinear()
        .domain(d3.extent(penguinData, (d) => d["Beak Depth (mm)"]))
        .range([-1, 1])
        .nice();
    const scaleSize = d3
        .scaleLinear()
        .domain(d3.extent(penguinData, (d) => d["Body Mass (g)"]))
        .range([0.02, 0.1]);
    const scaleColor = d3.scaleOrdinal(anu.ordinalChromatic("d310").toStandardMaterial());

    anu.create("cot", `cot${id}`);
    const chart = anu.selectName(`cot${id}`, scene);

    chart
        .bind("sphere", { diameter: (d) => scaleSize(d["Body Mass (g)"] ?? 0) }, penguinData)
        .position(
            (d) =>
                new BABYLON.Vector3(
                    scaleX(d["Beak Length (mm)"]),
                    scaleY(d["Flipper Length (mm)"]),
                    scaleZ(d["Beak Depth (mm)"])
                )
        )
        .material((d) => scaleColor(d.Species));

    const axesOptions = new anu.AxesConfig({ x: scaleX, y: scaleY, z: scaleZ });
    axesOptions.parent = chart;
    axesOptions.grid = false;
    axesOptions.labelOptions = { size: 0.25 };
    anu.createAxes("myAxes", axesOptions);

    const yOffset = -0.2;
    chart
        .scaling(BABYLON.Vector3.One().scale(CHART_SCALE_FACTOR))
        .addTags("chart")
        .addTags("ScatterPlot")
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

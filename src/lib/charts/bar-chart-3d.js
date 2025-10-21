import * as anu from "@jpmorganchase/anu";
import * as BABYLON from "@babylonjs/core";
import * as d3 from "d3";
import carData from "../../../data/cars.json" assert { type: "json" };
import { CHART_SCALE_FACTOR } from "./shared.js";

export function create3DBarChart(scene, id) {
    const origins = [...new Set(carData.map((car) => car.Origin))];
    const cylinders = [...new Set(carData.map((car) => car.Cylinders))].sort().reverse();

    let carsRollup = d3.flatRollup(
        carData,
        (entries) => ({
            Horsepower: d3.mean(entries, (d) => d.Horsepower),
            Miles_per_Gallon: d3.mean(entries, (d) => d.Miles_per_Gallon),
        }),
        (entry) => entry.Origin,
        (entry) => entry.Cylinders
    );
    carsRollup = carsRollup.map(([Origin, Cylinders, Data]) => ({ Origin, Cylinders, ...Data }));

    const horsepowerRange = d3.extent(carsRollup, (item) => item.Horsepower);
    const mpgRange = d3.extent(carsRollup, (item) => item.Miles_per_Gallon).reverse();

    const scaleX = d3.scaleBand().domain(cylinders).range([-1, 1]).paddingInner(1).paddingOuter(0.5);
    const scaleY = d3.scaleLinear().domain(horsepowerRange).range([0, 2]);
    const scaleZ = d3.scaleBand().domain(origins).range([0, 2]).paddingInner(1).paddingOuter(0.5);
    const scaleC = d3
        .scaleSequential(anu.sequentialChromatic("OrRd").toStandardMaterial())
        .domain(mpgRange);

    anu.create("cot", `cot${id}`);
    const chart = anu.selectName(`cot${id}`, scene);

    chart
        .bind("box", { height: 1, width: 0.35, depth: 0.35 }, carsRollup)
        .positionX((d) => scaleX(d.Cylinders))
        .positionZ((d) => scaleZ(d.Origin))
        .scalingY((d) => scaleY(d.Horsepower))
        .positionY((d) => scaleY(d.Horsepower) / 2)
        .material((d) => scaleC(d.Miles_per_Gallon));

    const axesOptions = new anu.AxesConfig({ x: scaleX, y: scaleY, z: scaleZ });
    axesOptions.parent = chart;
    axesOptions.labelOptions = { size: 0.25 };
    anu.createAxes("myAxes", axesOptions);

    const yOffset = -0.2;
    chart
        .scaling(BABYLON.Vector3.One().scale(CHART_SCALE_FACTOR))
        .addTags("chart")
        .addTags("3DBarChart")
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

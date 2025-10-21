import { CHART_SCALE_FACTOR, generateChartId, pickRandomItem } from "./shared.js";
import { createLineChart } from "./line-chart.js";
import { create2DBarChart } from "./bar-chart-2d.js";
import { create3DBarChart } from "./bar-chart-3d.js";
import { createScatterChart } from "./scatter-chart.js";

const CHART_BUILDERS = {
    line: createLineChart,
    "2d": create2DBarChart,
    "3d": create3DBarChart,
    scatter: createScatterChart,
};

const CHART_TYPE_KEYS = Object.freeze(Object.keys(CHART_BUILDERS));

export { CHART_SCALE_FACTOR };
export const AVAILABLE_CHART_TYPES = CHART_TYPE_KEYS;

export function createChart(scene, chartType = "2d") {
    const id = generateChartId();
    const builder = CHART_BUILDERS[chartType] ?? CHART_BUILDERS["2d"];
    return builder(scene, id);
}

export function createRandomCharts(scene, count) {
    const charts = [];
    for (let idx = 0; idx < count; idx += 1) {
        const randomType = randomChartType();
        charts.push(createChart(scene, randomType));
    }
    return charts;
}

function randomChartType() {
    return pickRandomItem(CHART_TYPE_KEYS) ?? "2d";
}

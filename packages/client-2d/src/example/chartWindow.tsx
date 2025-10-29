import { getAllCharts } from '../src/core/layout-manager.js';

var charts = getAllCharts();

console.log(charts);

const chartWindow = {
    charts: charts,
    title: "2D Charts",
    description: "A collection of 2D charts.",
    icon: "chart-bar",
    layout: {
        type: "grid",
        columns: 4,
        gap: 12,
        // For 4 columns: flex: '1 1 calc(25% - 12px)'
        itemStyle: {
            flex: '1 1 calc(25% - 12px)',
            boxSizing: 'border-box' as const,
        }
    }
}

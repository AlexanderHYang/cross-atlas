export const CHART_SCALE_FACTOR = 0.8;

export function generateChartId() {
    return Math.random() * 100;
}

export function pickRandomItem(items) {
    if (!Array.isArray(items) || items.length === 0) return undefined;
    const index = Math.floor(Math.random() * items.length);
    return items[index];
}

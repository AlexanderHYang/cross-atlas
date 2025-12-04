export type Trial7ColorPair = {
    key: string;
    name2D: string;
    name3D: string;
    hex2D: string;
    hex3D: string;
};

// Distinctive non-red pairs for Trial 7 color matching
export const TRIAL7_COLOR_PAIRS: Trial7ColorPair[] = [
    { key: "yellow", name2D: "Yellow", name3D: "Yellow", hex2D: "#f6c90e", hex3D: "#f6c90e" },
    { key: "green", name2D: "Green", name3D: "Green", hex2D: "#27ae60", hex3D: "#27ae60" },
    { key: "blue", name2D: "Blue", name3D: "Blue", hex2D: "#2980b9", hex3D: "#2980b9" },
    { key: "brown", name2D: "Brown", name3D: "Brown", hex2D: "#8e5b3a", hex3D: "#8e5b3a" },
    { key: "pink", name2D: "Pink", name3D: "Pink", hex2D: "#ff66c4", hex3D: "#ff66c4" },
];

export function getColorPairByKey(key: string | undefined | null) {
    if (!key) return undefined;
    return TRIAL7_COLOR_PAIRS.find((pair) => pair.key === key);
}

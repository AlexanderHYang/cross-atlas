export type Trial7ColorPair = {
    key: string;
    name2D: string;
    name3D: string;
    hex2D: string;
    hex3D: string;
};

// Distinctive non-red pairs for Trial 7 color matching
export const TRIAL7_COLOR_PAIRS: Trial7ColorPair[] = [
    { key: "teal", name2D: "Teal", name3D: "Teal", hex2D: "#16a085", hex3D: "#16a085" },
    { key: "azure", name2D: "Azure", name3D: "Azure", hex2D: "#2980b9", hex3D: "#2980b9" },
    { key: "violet", name2D: "Violet", name3D: "Violet", hex2D: "#8e44ad", hex3D: "#8e44ad" },
    { key: "amber", name2D: "Amber", name3D: "Amber", hex2D: "#f6c90e", hex3D: "#f6c90e" },
    { key: "pink", name2D: "Pink", name3D: "Pink", hex2D: "#ff66c4", hex3D: "#ff66c4" },
];

export function getColorPairByKey(key: string | undefined | null) {
    if (!key) return undefined;
    return TRIAL7_COLOR_PAIRS.find((pair) => pair.key === key);
}

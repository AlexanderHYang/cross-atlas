import { Vector3SyncData } from "./sync";
import generatedConfigs from "../../../scripts/generated-point-configs.json";
import { isTrainingModeEnabled, getTrainingModeLayout } from "./trainingMode";

export type DefaultPointConfig = {
    id: string;
    /**
     * Normalized direction vector pointing to the spot on the sphere.
     * Magnitude does not matter; values are normalized at runtime.
     */
    direction: Vector3SyncData;
    /**
     * Optional color hint for this point. Defaults to white if not provided.
     */
    color?: Vector3SyncData;
    /**
     * Whether this point can be dragged locally. Defaults to true.
     */
    draggable?: boolean;
    /**
     * Whether this point can be selected/clicked. Defaults to true.
     */
    selectable?: boolean;
};

export const DEFAULT_SPHERE_RADIUS = 3;

export type LayoutType = "spherical" | "hemispherical" | "planar";
const allowedLayouts: LayoutType[] = ["spherical", "hemispherical", "planar"];
const layoutEnv = (import.meta.env.VITE_LAYOUT_TYPE ?? import.meta.env.VITE_LAYOUT) as
    | string
    | undefined;
const normalizedLayout = layoutEnv?.trim();

// Training mode forces planar layout
const resolvedLayout: LayoutType = isTrainingModeEnabled()
    ? getTrainingModeLayout()
    : allowedLayouts.includes(normalizedLayout as LayoutType)
      ? (normalizedLayout as LayoutType)
      : "spherical";

if (!isTrainingModeEnabled() && layoutEnv && resolvedLayout !== normalizedLayout) {
    console.warn(`[Layout] Invalid VITE_LAYOUT_TYPE="${layoutEnv}". Falling back to "spherical".`);
}

if (isTrainingModeEnabled()) {
    console.log(`[Training Mode] Layout forced to: ${resolvedLayout}`);
}

export const layoutType: LayoutType = resolvedLayout;
export const DEFAULT_POINT_CONFIGS: DefaultPointConfig[] = generatedConfigs[layoutType].map(
    (point, index) => ({
        id: `point${index + 1}`,
        direction: point,
        draggable: false,
    }),
);

// adjust landmark
DEFAULT_POINT_CONFIGS[0].id = "landmark";
DEFAULT_POINT_CONFIGS[0].color = { x: 0, y: 0, z: 1 };
DEFAULT_POINT_CONFIGS[0].selectable = false;

const CONFIG_MAP = new Map(DEFAULT_POINT_CONFIGS.map((cfg) => [cfg.id, cfg]));

export function getDefaultPointConfig(id: string): DefaultPointConfig | undefined {
    return CONFIG_MAP.get(id);
}

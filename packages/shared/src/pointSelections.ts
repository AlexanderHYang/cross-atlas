import selectionData from "../../../data/point-selections.json";
import { layoutType } from "./defaultPoints";

export type ProjectionType = "equirectangular" | "pca" | "vertical" | "horizontal";

type SelectionEntry = {
    layout: string;
    projection: ProjectionType;
    trial: number;
    points: string[];
};

const RANDOM_SELECTION_ENV = (import.meta.env.VITE_RANDOM_SELECTION as string | undefined)?.trim();
const PROJECTION_ENV = (import.meta.env.VITE_PROJECTION as string | undefined)?.trim();

const resolvedProjection: ProjectionType =
    PROJECTION_ENV === "pca" || PROJECTION_ENV === "vertical" || PROJECTION_ENV === "horizontal"
        ? PROJECTION_ENV
        : "equirectangular";

const selectionEntries = selectionData as SelectionEntry[];
const selectionCache = new Map<string, SelectionEntry[]>();

export function isRandomSelectionEnabled(): boolean {
    if (!RANDOM_SELECTION_ENV) {
        return false;
    }
    return ["1", "true", "yes", "on"].includes(RANDOM_SELECTION_ENV.toLowerCase());
}

function getSelectionsFor(layout: string, projection: ProjectionType): SelectionEntry[] {
    const key = `${layout}|${projection}`;
    const cached = selectionCache.get(key);
    if (cached) {
        return cached;
    }
    const matches = selectionEntries
        .filter((entry) => entry.layout === layout && entry.projection === projection)
        .sort((a, b) => a.trial - b.trial);
    selectionCache.set(key, matches);
    return matches;
}

export function getPrecomputedTrialSelection(
    trial: number,
    options?: { layout?: string; projection?: ProjectionType },
): string[] | null {
    const layout = options?.layout ?? layoutType;
    const projection = options?.projection ?? resolvedProjection;
    const entries = getSelectionsFor(layout, projection);
    const entry = entries.find((item) => item.trial === trial);
    return entry ? [...entry.points] : null;
}

export function getPrecomputedTaskSelection(
    taskNumber: 1 | 2 | 3,
    options?: { layout?: string; projection?: ProjectionType },
): string[] | null {
    const layout = options?.layout ?? layoutType;
    const projection = options?.projection ?? resolvedProjection;
    const entries = getSelectionsFor(layout, projection);

    if (taskNumber === 1) {
        const trials = [1, 2, 3, 4];
        const points: string[] = [];
        for (const trial of trials) {
            const entry = entries.find((item) => item.trial === trial);
            if (!entry?.points?.length) {
                return null;
            }
            points.push(entry.points[0]);
        }
        return points;
    }

    if (taskNumber === 2) {
        const trials = [5, 6];
        const points: string[] = [];
        for (const trial of trials) {
            const entry = entries.find((item) => item.trial === trial);
            if (!entry?.points?.length) {
                return null;
            }
            points.push(...entry.points);
        }
        return points.length === 4 ? points : null;
    }

    if (taskNumber === 3) {
        const entry = entries.find((item) => item.trial === 7);
        return entry?.points ? [...entry.points] : null;
    }

    return null;
}

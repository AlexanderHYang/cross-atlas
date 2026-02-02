/**
 * Counterbalance configuration for running multiple projection conditions back-to-back.
 *
 * When counterbalance is enabled, participants complete all 7 trials for one projection,
 * then automatically restart from trial 1 with the next projection in the sequence.
 * This continues until all 4 projections are completed.
 *
 * Sequences (Latin Square counterbalancing):
 * - S1: PCA → Horizontal → Equirectangular → Vertical
 * - S2: Horizontal → Vertical → PCA → Equirectangular
 * - S3: Vertical → Equirectangular → Horizontal → PCA
 * - S4: Equirectangular → PCA → Vertical → Horizontal
 *
 * Note: Counterbalance is disabled when training mode is enabled.
 */

import { isTrainingModeEnabled } from "./trainingMode";

export type ProjectionType = "equirectangular" | "pca" | "vertical" | "horizontal";

export type CounterbalanceSequence = 1 | 2 | 3 | 4;

/**
 * Projection sequences for each counterbalance condition.
 * Based on a Latin Square design to control for order effects.
 */
export const COUNTERBALANCE_SEQUENCES: Record<CounterbalanceSequence, ProjectionType[]> = {
    1: ["pca", "horizontal", "equirectangular", "vertical"],
    2: ["horizontal", "vertical", "pca", "equirectangular"],
    3: ["vertical", "equirectangular", "horizontal", "pca"],
    4: ["equirectangular", "pca", "vertical", "horizontal"],
};

/**
 * Global counterbalance state
 */
let counterbalanceConfig: {
    enabled: boolean;
    sequence: CounterbalanceSequence;
    currentIndex: number;
    transitioning: boolean;
} = {
    enabled: false,
    sequence: 1,
    currentIndex: 0,
    transitioning: false,
};

/**
 * Parse the counterbalance flag from environment variable.
 * @param flag - The counterbalance flag value (1-4)
 * @returns The sequence number if valid, null otherwise
 */
export function parseCounterbalanceFlag(flag?: string | null): CounterbalanceSequence | null {
    if (!flag) {
        return null;
    }
    const parsed = Number.parseInt(flag.trim(), 10);
    if (parsed >= 1 && parsed <= 4) {
        return parsed as CounterbalanceSequence;
    }
    console.warn(`[Counterbalance] Invalid flag: ${flag}. Expected 1-4.`);
    return null;
}

/**
 * Initialize the counterbalance configuration.
 * @param sequence - The sequence number (1-4)
 */
export function setCounterbalanceConfig(sequence: CounterbalanceSequence) {
    counterbalanceConfig = {
        enabled: true,
        sequence,
        currentIndex: 0,
        transitioning: false,
    };
    console.log(
        `[Counterbalance] Enabled with sequence S${sequence}:`,
        COUNTERBALANCE_SEQUENCES[sequence].join(" → "),
    );
}

/**
 * Get the current counterbalance configuration.
 */
export function getCounterbalanceConfig() {
    return { ...counterbalanceConfig };
}

/**
 * Check if counterbalance mode is enabled.
 * Returns false if training mode is enabled (training mode disables counterbalance).
 */
export function isCounterbalanceEnabled(): boolean {
    if (isTrainingModeEnabled()) {
        return false;
    }
    return counterbalanceConfig.enabled;
}

/**
 * Get the current projection type based on counterbalance state.
 */
export function getCurrentCounterbalanceProjection(): ProjectionType | null {
    if (!counterbalanceConfig.enabled) {
        return null;
    }
    const sequence = COUNTERBALANCE_SEQUENCES[counterbalanceConfig.sequence];
    return sequence[counterbalanceConfig.currentIndex] ?? null;
}

/**
 * Get the current projection index (0-3) in the counterbalance sequence.
 */
export function getCurrentProjectionIndex(): number {
    return counterbalanceConfig.currentIndex;
}

/**
 * Sync the counterbalance index to match the given projection type.
 * Useful when reloading mid-session so projection index aligns with stored meta.
 */
export function syncCounterbalanceIndex(projection: ProjectionType): void {
    if (!counterbalanceConfig.enabled) {
        return;
    }
    const sequence = COUNTERBALANCE_SEQUENCES[counterbalanceConfig.sequence];
    const index = sequence.indexOf(projection);
    if (index === -1) {
        console.warn(
            `[Counterbalance] Projection ${projection} not found in sequence S${counterbalanceConfig.sequence}.`,
        );
        return;
    }
    counterbalanceConfig.currentIndex = index;
}

/**
 * Get total number of projections in the sequence.
 */
export function getTotalProjections(): number {
    return 4;
}

/**
 * Advance to the next projection in the counterbalance sequence.
 * @returns The next projection type, or null if all projections are complete
 */
export function advanceToNextProjection(): ProjectionType | null {
    if (!counterbalanceConfig.enabled) {
        return null;
    }

    const nextIndex = counterbalanceConfig.currentIndex + 1;
    const sequence = COUNTERBALANCE_SEQUENCES[counterbalanceConfig.sequence];

    if (nextIndex >= sequence.length) {
        console.log("[Counterbalance] All projections complete!");
        return null;
    }

    counterbalanceConfig.currentIndex = nextIndex;
    const nextProjection = sequence[nextIndex];
    console.log(
        `[Counterbalance] Advancing to projection ${nextIndex + 1}/${sequence.length}: ${nextProjection}`,
    );
    return nextProjection;
}

/**
 * Check if there are more projections remaining in the sequence.
 */
export function hasMoreProjections(): boolean {
    if (!counterbalanceConfig.enabled) {
        return false;
    }
    const sequence = COUNTERBALANCE_SEQUENCES[counterbalanceConfig.sequence];
    return counterbalanceConfig.currentIndex < sequence.length - 1;
}

/**
 * Check if a projection transition is currently in progress.
 */
export function isProjectionTransitioning(): boolean {
    return counterbalanceConfig.transitioning;
}

/**
 * Set the transitioning state to prevent race conditions.
 */
export function setProjectionTransitioning(transitioning: boolean) {
    counterbalanceConfig.transitioning = transitioning;
}

/**
 * Peek at the next projection without advancing.
 * @returns The next projection type, or null if all projections are complete
 */
export function peekNextProjection(): ProjectionType | null {
    if (!counterbalanceConfig.enabled) {
        return null;
    }
    const nextIndex = counterbalanceConfig.currentIndex + 1;
    const sequence = COUNTERBALANCE_SEQUENCES[counterbalanceConfig.sequence];
    return nextIndex < sequence.length ? sequence[nextIndex] : null;
}

/**
 * Reset the counterbalance state to the beginning of the sequence.
 */
export function resetCounterbalance() {
    if (counterbalanceConfig.enabled) {
        counterbalanceConfig.currentIndex = 0;
        console.log("[Counterbalance] Reset to beginning of sequence");
    }
}

/**
 * Get a human-readable description of the current counterbalance state.
 */
export function getCounterbalanceStatus(): string {
    if (!counterbalanceConfig.enabled) {
        return "Counterbalance disabled";
    }
    const sequence = COUNTERBALANCE_SEQUENCES[counterbalanceConfig.sequence];
    const current = sequence[counterbalanceConfig.currentIndex];
    return `S${counterbalanceConfig.sequence}: Projection ${counterbalanceConfig.currentIndex + 1}/${sequence.length} (${current})`;
}

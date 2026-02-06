/**
 * Training Mode Configuration
 *
 * When training mode is enabled:
 * - Layout is forced to "planar"
 * - Projection is forced to "vertical"
 * - Counterbalance is disabled
 * - Task 1 runs 2 trials (1-2)
 * - Task 2 runs 1 trial (5)
 * - Task 3 runs once with 3 colors
 * - After the training flow completes, it restarts from trial 1
 * - No logs are generated
 */

const TRAINING_MODE_ENV = (import.meta.env.VITE_TRAINING_MODE as string | undefined)?.trim();

/**
 * Training mode task flow configuration.
 */
export const TRAINING_TASK1_TRIAL_LIMIT = 2;
export const TRAINING_TASK2_TRIAL_LIMIT = 1;
export const TRAINING_TASK3_PAIR_COUNTS = [3] as const;

/**
 * Check if training mode is enabled via environment variable.
 */
export function isTrainingModeEnabled(): boolean {
    if (!TRAINING_MODE_ENV) {
        return false;
    }
    return ["1", "true", "yes", "on"].includes(TRAINING_MODE_ENV.toLowerCase());
}

/**
 * Training mode state - used to track when we need to restart from trial 1.
 */
let trainingModeLoopPending = false;

/**
 * Set whether a training mode loop (restart from trial 1) is pending.
 */
export function setTrainingModeLoopPending(pending: boolean): void {
    trainingModeLoopPending = pending;
}

/**
 * Check if a training mode loop is pending.
 */
export function isTrainingModeLoopPending(): boolean {
    return trainingModeLoopPending;
}

/**
 * Get the forced layout type for training mode.
 */
export function getTrainingModeLayout(): "planar" {
    return "planar";
}

/**
 * Get the forced projection type for training mode.
 */
export function getTrainingModeProjection(): "vertical" {
    return "vertical";
}

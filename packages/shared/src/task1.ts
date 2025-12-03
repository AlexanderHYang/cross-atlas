/**
 * Task 1: Sequential Trials (Trials 1-4)
 *
 * In this task, players take turns:
 * - Trials 1 & 3: 2D shows the target highlight, 3D user must select
 * - Trials 2 & 4: 3D shows the target highlight, 2D user must select
 */

import type { TaskState, TaskTrial, Trial7Assignment } from "./task";

export const TASK1_ID = "task1";
export const TASK1_TRIALS: TaskTrial[] = [1, 2, 3, 4];

export type Task1Trial = 1 | 2 | 3 | 4;

export function isTask1Trial(trial: TaskTrial): trial is Task1Trial {
    return trial >= 1 && trial <= 4;
}

export function getTask1HintSide(trial: Task1Trial): "2d" | "3d" {
    // Trials 1 & 3: 2D shows hint, 3D selects
    // Trials 2 & 4: 3D shows hint, 2D selects
    return trial === 1 || trial === 3 ? "2d" : "3d";
}

export function createTask1State(targetPointId: string, trial: Task1Trial = 1): TaskState {
    return {
        id: TASK1_ID,
        targetPointId2D: targetPointId,
        trial,
        hintSide: getTask1HintSide(trial),
        feedback: "none",
        completed: false,
        clicked2D: false,
        clicked3D: false,
    };
}

export function getNextTask1Trial(currentTrial: Task1Trial): Task1Trial | null {
    if (currentTrial === 1) return 2;
    if (currentTrial === 2) return 3;
    if (currentTrial === 3) return 4;
    return null; // Trial 4 is the last trial of Task 1
}

export function isTask1Complete(trial: Task1Trial): boolean {
    return trial === 4;
}

/**
 * Handles a 3D selection for Task 1 (trials 1 or 3)
 * Returns updated state and whether to transition to next trial
 */
export function handleTask1Selection3D(
    currentState: TaskState,
    selectedPointId: string
): { updated: TaskState; isCorrect: boolean; shouldTransition: boolean } {
    const trial = currentState.trial as Task1Trial;

    // Only handle trials 1 and 3 (3D selects)
    if (trial !== 1 && trial !== 3) {
        return { updated: currentState, isCorrect: false, shouldTransition: false };
    }

    const isCorrect = selectedPointId === currentState.targetPointId2D;

    if (isCorrect) {
        const updated: TaskState = {
            ...currentState,
            feedback: "success",
            completed: true,
        };
        return { updated, isCorrect: true, shouldTransition: true };
    }

    return { updated: currentState, isCorrect: false, shouldTransition: false };
}

/**
 * Handles a 2D selection for Task 1 (trials 2 or 4)
 * Returns updated state and whether to transition to next trial
 */
export function handleTask1Selection2D(
    currentState: TaskState,
    selectedPointId: string
): { updated: TaskState; isCorrect: boolean; shouldTransition: boolean } {
    const trial = currentState.trial as Task1Trial;

    // Only handle trials 2 and 4 (2D selects)
    if (trial !== 2 && trial !== 4) {
        return { updated: currentState, isCorrect: false, shouldTransition: false };
    }

    const isCorrect = selectedPointId === currentState.targetPointId2D;

    const updated: TaskState = {
        ...currentState,
        feedback: isCorrect ? "success" : "error",
        completed: isCorrect,
    };

    return { updated, isCorrect, shouldTransition: isCorrect };
}

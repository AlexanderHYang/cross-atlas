/**
 * Task 2: Collaborative Trials (Trials 5-6)
 *
 * Both 2D and 3D players have their own targets simultaneously.
 * Both must click their correct targets to complete the trial.
 */

import type { TaskState, TaskTrial } from "./task";

export const TASK2_ID = "task2";
export const TASK2_TRIALS: TaskTrial[] = [5, 6];

export type Task2Trial = 5 | 6;

export function isTask2Trial(trial: TaskTrial): trial is Task2Trial {
    return trial === 5 || trial === 6;
}

export function createTask2State(
    targetPointId2D: string,
    targetPointId3D: string,
    trial: Task2Trial = 5
): TaskState {
    return {
        id: TASK2_ID,
        targetPointId2D: targetPointId2D,
        targetPointId3D: targetPointId3D,
        trial,
        hintSide: "both",
        feedback: "none",
        completed: false,
        clicked2D: false,
        clicked3D: false,
    };
}

export function getNextTask2Trial(currentTrial: Task2Trial): Task2Trial | null {
    if (currentTrial === 5) return 6;
    return null; // Trial 6 is the last trial of Task 2
}

export function isTask2Complete(trial: Task2Trial): boolean {
    return trial === 6;
}

/**
 * Handles a 2D selection for Task 2
 * Returns updated state and whether to transition
 */
export function handleTask2Selection2D(
    currentState: TaskState,
    selectedPointId: string
): { updated: TaskState; isCorrect: boolean; shouldTransition: boolean } {
    if (!isTask2Trial(currentState.trial)) {
        return { updated: currentState, isCorrect: false, shouldTransition: false };
    }

    // Ignore clicks on the 3D partner's target
    if (selectedPointId === currentState.targetPointId3D) {
        return { updated: currentState, isCorrect: false, shouldTransition: false };
    }

    const isCorrect = selectedPointId === currentState.targetPointId2D;
    const bothCorrect = isCorrect && !!currentState.clicked3D;

    const updated: TaskState = {
        ...currentState,
        clicked2D: isCorrect,
        feedback: !isCorrect ? "error" : bothCorrect ? "success" : "none",
        completed: bothCorrect,
    };

    return { updated, isCorrect, shouldTransition: bothCorrect };
}

/**
 * Handles a 3D selection for Task 2
 * Returns updated state and whether to transition
 */
export function handleTask2Selection3D(
    currentState: TaskState,
    selectedPointId: string
): { updated: TaskState; isCorrect: boolean; shouldTransition: boolean } {
    if (!isTask2Trial(currentState.trial)) {
        return { updated: currentState, isCorrect: false, shouldTransition: false };
    }

    // Ignore clicks on the 2D partner's target
    if (selectedPointId === currentState.targetPointId2D) {
        return { updated: currentState, isCorrect: false, shouldTransition: false };
    }

    const isCorrect = selectedPointId === currentState.targetPointId3D;
    const bothCorrect = isCorrect && !!currentState.clicked2D;

    const updated: TaskState = {
        ...currentState,
        clicked3D: isCorrect,
        feedback: !isCorrect ? "error" : bothCorrect ? "success" : "none",
        completed: bothCorrect,
    };

    return { updated, isCorrect, shouldTransition: bothCorrect };
}

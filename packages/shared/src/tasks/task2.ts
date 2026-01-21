/**
 * Task 2: Collaborative Trials (Trials 5-6)
 *
 * Both 2D and 3D players have their own targets simultaneously.
 * Both must click their correct targets to complete the trial.
 */

import type {
    TaskState,
    TaskTrial,
    TaskColorConfig2D,
    TaskColorConfig3D,
    TaskPointVisual2D,
    TaskSelection2DEffect,
    TaskSelection3DEffect,
    TaskPoint3D,
} from "./tasks";
import { Color3, Vector3 } from "@babylonjs/core";

export const TASK2_ID = "task2";
export const TASK2_TRIALS: TaskTrial[] = [5, 6];

export type Task2Trial = 5 | 6;

export function isTask2Trial(trial: TaskTrial): trial is Task2Trial {
    return trial === 5 || trial === 6;
}

export function createTask2State(
    targetPointId2D: string,
    targetPointId3D: string,
    trial: Task2Trial = 5,
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
    selectedPointId: string,
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
    selectedPointId: string,
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

const DEFAULT_VISUAL_2D: TaskPointVisual2D = {
    isTarget: false,
    hideColor: false,
    overrideColor: null,
};

export function getTask2PointVisual2D(
    taskState: TaskState | null,
    pointId: string,
    colors: TaskColorConfig2D,
): TaskPointVisual2D {
    if (!taskState || !isTask2Trial(taskState.trial)) {
        return DEFAULT_VISUAL_2D;
    }

    const partnerTargetId = taskState.targetPointId3D;
    const ownTargetId = taskState.targetPointId2D;
    let overrideColor: TaskPointVisual2D["overrideColor"] = null;
    const darkSuccess = darkenVector(colors.success, TASK2_DARKEN_AMOUNT);
    const lightSuccess = lightenVector(colors.success, TASK2_LIGHTEN_AMOUNT);

    if (partnerTargetId && partnerTargetId === pointId) {
        overrideColor = darkSuccess;
    } else if (taskState.clicked2D && ownTargetId === pointId) {
        overrideColor = lightSuccess;
    }

    return {
        isTarget: ownTargetId === pointId,
        hideColor: false,
        overrideColor,
    };
}

export function evaluateTask2Selection2D(
    taskState: TaskState | null,
    selectedPointId: string,
    colors: TaskColorConfig2D,
): TaskSelection2DEffect {
    if (!taskState || !isTask2Trial(taskState.trial) || taskState.completed) {
        return { handled: false };
    }

    if (!taskState.targetPointId2D || selectedPointId === taskState.targetPointId3D) {
        return { handled: false };
    }

    const isCorrect = selectedPointId === taskState.targetPointId2D;
    const lightSuccess = lightenVector(colors.success, TASK2_LIGHTEN_AMOUNT);
    return {
        handled: true,
        isCorrect,
        successColor: lightSuccess,
        errorColor: colors.error,
        errorFlashDurationMs: 2000,
    };
}

export function evaluateTask2Selection3D(
    taskState: TaskState | null,
    selectedPointId: string,
    colors: TaskColorConfig3D,
): TaskSelection3DEffect {
    if (!taskState || !isTask2Trial(taskState.trial) || taskState.completed) {
        return { handled: false };
    }

    if (!taskState.targetPointId3D || selectedPointId === taskState.targetPointId2D) {
        return { handled: false };
    }

    const isCorrect = selectedPointId === taskState.targetPointId3D;
    const darkSuccess = darkenColor(colors.success, TASK2_DARKEN_AMOUNT);
    return {
        handled: true,
        isCorrect,
        successColor: darkSuccess,
        errorColor: colors.error,
        flashDurationMs: 2000,
        stateUpdate: "task2",
    };
}

export function applyTask2Visuals3D(
    taskState: TaskState | null,
    pointsById: Map<string, TaskPoint3D>,
    colors: TaskColorConfig3D,
) {
    if (!taskState || !isTask2Trial(taskState.trial)) {
        return;
    }

    const lightSuccess = lightenColor(colors.success, TASK2_LIGHTEN_AMOUNT);
    const darkSuccess = darkenColor(colors.success, TASK2_DARKEN_AMOUNT);
    if (taskState.targetPointId2D) {
        const partnerTarget = pointsById.get(taskState.targetPointId2D);
        partnerTarget?.setLocalOverrideColor(lightSuccess);
    }

    if (taskState.clicked3D && taskState.targetPointId3D) {
        const targetPoint = pointsById.get(taskState.targetPointId3D);
        targetPoint?.setDisplayColor(darkSuccess);
    }
}

const TASK2_LIGHTEN_AMOUNT = 0.2;
const TASK2_DARKEN_AMOUNT = 0.2;

function lightenColor(color: Color3, amount: number): Color3 {
    return new Color3(
        Math.min(1, color.r + (1 - color.r) * amount),
        Math.min(1, color.g + (1 - color.g) * amount),
        Math.min(1, color.b + (1 - color.b) * amount)
    );
}

function darkenColor(color: Color3, amount: number): Color3 {
    const factor = 1 - amount;
    return new Color3(color.r * factor, color.g * factor, color.b * factor);
}

function lightenVector(color: Vector3, amount: number): Vector3 {
    return new Vector3(
        Math.min(1, color.x + (1 - color.x) * amount),
        Math.min(1, color.y + (1 - color.y) * amount),
        Math.min(1, color.z + (1 - color.z) * amount)
    );
}

function darkenVector(color: Vector3, amount: number): Vector3 {
    const factor = 1 - amount;
    return new Vector3(color.x * factor, color.y * factor, color.z * factor);
}

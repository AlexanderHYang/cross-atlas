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
} from "./task";

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

const DEFAULT_VISUAL_2D: TaskPointVisual2D = {
    isTarget: false,
    hideColor: false,
    overrideColor: null,
};

export function getTask2PointVisual2D(
    taskState: TaskState | null,
    pointId: string,
    colors: TaskColorConfig2D
): TaskPointVisual2D {
    if (!taskState || !isTask2Trial(taskState.trial)) {
        return DEFAULT_VISUAL_2D;
    }

    const partnerTargetId = taskState.targetPointId3D;
    const ownTargetId = taskState.targetPointId2D;
    let overrideColor: TaskPointVisual2D["overrideColor"] = null;

    if (partnerTargetId && partnerTargetId === pointId) {
        overrideColor = colors.success;
    } else if (taskState.clicked2D && ownTargetId === pointId) {
        overrideColor = colors.success;
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
    colors: TaskColorConfig2D
): TaskSelection2DEffect {
    if (!taskState || !isTask2Trial(taskState.trial) || taskState.completed) {
        return { handled: false };
    }

    if (!taskState.targetPointId2D || selectedPointId === taskState.targetPointId3D) {
        return { handled: false };
    }

    const isCorrect = selectedPointId === taskState.targetPointId2D;
    return {
        handled: true,
        isCorrect,
        successColor: colors.success,
        errorColor: colors.error,
        errorFlashDurationMs: 800,
    };
}

export function evaluateTask2Selection3D(
    taskState: TaskState | null,
    selectedPointId: string,
    colors: TaskColorConfig3D
): TaskSelection3DEffect {
    if (!taskState || !isTask2Trial(taskState.trial) || taskState.completed) {
        return { handled: false };
    }

    if (!taskState.targetPointId3D || selectedPointId === taskState.targetPointId2D) {
        return { handled: false };
    }

    const isCorrect = selectedPointId === taskState.targetPointId3D;
    return {
        handled: true,
        isCorrect,
        successColor: colors.success,
        errorColor: colors.error,
        flashDurationMs: 800,
        stateUpdate: "task2",
    };
}

export function applyTask2Visuals3D(
    taskState: TaskState | null,
    pointsById: Map<string, TaskPoint3D>,
    colors: TaskColorConfig3D
) {
    if (!taskState || !isTask2Trial(taskState.trial)) {
        return;
    }

    if (taskState.targetPointId2D) {
        const partnerTarget = pointsById.get(taskState.targetPointId2D);
        partnerTarget?.setLocalOverrideColor(colors.success);
    }

    if (taskState.clicked3D && taskState.targetPointId3D) {
        const targetPoint = pointsById.get(taskState.targetPointId3D);
        targetPoint?.setDisplayColor(colors.success);
    }
}

/**
 * Task 3: Color-Paired Collaborative Round (Trial 7)
 *
 * Both players get assigned colors to find specific points.
 * Multiple color pairs are presented in sequence.
 * Both must click their correct colored targets to advance.
 */

import type { TaskState, TaskTrial, Trial7Assignment } from "./task";
import { TRIAL7_COLOR_PAIRS } from "./trial7ColorPairs";

export const TASK3_ID = "task3";
export const TASK3_TRIAL: TaskTrial = 7;

export type Task3Trial = 7;

export function isTask3Trial(trial: TaskTrial): trial is Task3Trial {
    return trial === 7;
}

export function createTask3Assignments(
    pointIds: string[],
    pairCount: number = 5
): Trial7Assignment[] {
    const pairs = TRIAL7_COLOR_PAIRS.slice(0, pairCount);

    if (pointIds.length < pairCount * 2) {
        console.warn("Not enough point IDs for Task 3 assignments");
        return [];
    }

    return pairs.map((pair, idx) => ({
        key: pair.key,
        point2D: pointIds[idx],
        point3D: pointIds[idx + pairCount],
        done2D: false,
        done3D: false,
    }));
}

export function createTask3State(assignments: Trial7Assignment[]): TaskState | null {
    if (assignments.length === 0) {
        return null;
    }

    const first = assignments[0];
    return {
        id: TASK3_ID,
        targetPointId2D: first.point2D,
        targetPointId3D: first.point3D,
        trial: 7,
        hintSide: "both",
        feedback: "none",
        completed: false,
        clicked2D: false,
        clicked3D: false,
        colorPairKey: first.key,
        colorPairIndex: 0,
        trial7Assignments: assignments,
    };
}

export function getNextTask3PairIndex(currentState: TaskState): number | null {
    if (!currentState.trial7Assignments) return null;

    const currentIndex = currentState.colorPairIndex ?? 0;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= currentState.trial7Assignments.length) {
        return null; // No more pairs
    }

    return nextIndex;
}

export function isTask3Complete(currentState: TaskState): boolean {
    if (!currentState.trial7Assignments) return true;

    const currentIndex = currentState.colorPairIndex ?? 0;
    return currentIndex >= currentState.trial7Assignments.length - 1 && currentState.completed;
}

/**
 * Handles a 2D selection for Task 3
 */
export function handleTask3Selection2D(
    currentState: TaskState,
    selectedPointId: string
): { updated: TaskState; isCorrect: boolean; shouldAdvancePair: boolean } {
    if (currentState.trial !== 7 || !currentState.trial7Assignments) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    // Ignore clicks on the 3D partner's target
    if (selectedPointId === currentState.targetPointId3D) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    const isCorrect = selectedPointId === currentState.targetPointId2D;
    const activeIndex = currentState.colorPairIndex ?? 0;
    const currentAssignment = currentState.trial7Assignments[activeIndex];

    if (!currentAssignment) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    const updatedAssignments = [...currentState.trial7Assignments];
    updatedAssignments[activeIndex] = {
        ...currentAssignment,
        done2D: isCorrect ? true : currentAssignment.done2D,
    };

    const bothCorrect = isCorrect && !!currentState.clicked3D;

    const updated: TaskState = {
        ...currentState,
        clicked2D: isCorrect,
        feedback: !isCorrect ? "error" : bothCorrect ? "success" : "none",
        completed: bothCorrect,
        trial7Assignments: updatedAssignments,
        // Set errorPointId2D when wrong click so 3D side can show the flash
        errorPointId2D: !isCorrect ? selectedPointId : null,
        errorPointId3D: null, // Clear any previous 3D error
    };

    return { updated, isCorrect, shouldAdvancePair: bothCorrect };
}

/**
 * Handles a 3D selection for Task 3
 */
export function handleTask3Selection3D(
    currentState: TaskState,
    selectedPointId: string
): { updated: TaskState; isCorrect: boolean; shouldAdvancePair: boolean } {
    if (currentState.trial !== 7 || !currentState.trial7Assignments) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    // Ignore clicks on the 2D partner's target
    if (selectedPointId === currentState.targetPointId2D) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    const isCorrect = selectedPointId === currentState.targetPointId3D;
    const activeIndex = currentState.colorPairIndex ?? 0;
    const currentAssignment = currentState.trial7Assignments[activeIndex];

    if (!currentAssignment) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    const updatedAssignments = [...currentState.trial7Assignments];
    updatedAssignments[activeIndex] = {
        ...currentAssignment,
        done3D: isCorrect ? true : currentAssignment.done3D,
    };

    const bothCorrect = isCorrect && !!currentState.clicked2D;

    const updated: TaskState = {
        ...currentState,
        clicked3D: isCorrect,
        feedback: !isCorrect ? "error" : bothCorrect ? "success" : "none",
        completed: bothCorrect,
        trial7Assignments: updatedAssignments,
        // Set errorPointId3D when wrong click so 2D side can show the flash
        errorPointId3D: !isCorrect ? selectedPointId : null,
        errorPointId2D: null, // Clear any previous 2D error
    };

    return { updated, isCorrect, shouldAdvancePair: bothCorrect };
}

/**
 * Creates the state for the next color pair in Task 3
 */
export function advanceToNextPair(currentState: TaskState): TaskState | null {
    if (!currentState.trial7Assignments) return null;

    const currentIndex = currentState.colorPairIndex ?? 0;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= currentState.trial7Assignments.length) {
        // All pairs complete - return final completed state
        return {
            ...currentState,
            feedback: "success",
            completed: true,
        };
    }

    const nextAssignment = currentState.trial7Assignments[nextIndex];
    return {
        ...currentState,
        targetPointId2D: nextAssignment.point2D,
        targetPointId3D: nextAssignment.point3D,
        colorPairKey: nextAssignment.key,
        colorPairIndex: nextIndex,
        feedback: "none",
        completed: false,
        clicked2D: false,
        clicked3D: false,
    };
}

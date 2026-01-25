/**
 * TaskRunner: Orchestrates the flow between Task 1 -> Task 2 -> Task 3
 *
 * This module handles:
 * - Task transitions with configurable delays
 * - Callbacks for task/trial changes
 * - State management for the overall task flow
 */

import type { TaskState, TaskId, TaskTrial, Trial7Assignment } from "./tasks/tasks";
import { getTaskFlowConfig, getTaskAndTrial } from "./tasks/tasks";
import {
    TASK1_ID,
    createTask1State,
    getNextTask1Trial,
    isTask1Trial,
    isTask1Complete,
    Task1Trial,
} from "./tasks/task1";
import {
    TASK2_ID,
    createTask2State,
    getNextTask2Trial,
    isTask2Trial,
    isTask2Complete,
    Task2Trial,
} from "./tasks/task2";
import {
    TASK3_ID,
    createTask3State,
    createTask3Assignments,
    isTask3Trial,
    advanceToNextPair,
    isTask3Complete,
} from "./tasks/task3";

export const TRANSITION_DELAY_MS = 2000;

/**
 * Helper to get the first enabled task
 */
export function getFirstEnabledTask(): TaskId | null {
    const config = getTaskFlowConfig();
    if (config.task1) return TASK1_ID;
    if (config.task2) return TASK2_ID;
    if (config.task3) return TASK3_ID;
    return null;
}

/**
 * Helper to get the next enabled task after the given task
 */
export function getNextEnabledTask(currentTaskId: TaskId): TaskId | null {
    const config = getTaskFlowConfig();
    if (currentTaskId === TASK1_ID) {
        if (config.task2) return TASK2_ID;
        if (config.task3) return TASK3_ID;
        return null;
    }
    if (currentTaskId === TASK2_ID) {
        if (config.task3) return TASK3_ID;
        return null;
    }
    // Task 3 is the last task
    return null;
}

export type TaskFlowState = "task1" | "task2" | "task3" | "completed";

export type TaskTransition = {
    from: TaskFlowState;
    to: TaskFlowState;
};

export interface PointIdProvider {
    pickAngularDistributedIds(count: number): string[];
}

export interface TaskRunnerCallbacks {
    onTaskStateUpdate: (state: TaskState) => void;
    onTaskTransition?: (transition: TaskTransition) => void;
    onAllTasksComplete?: () => void;
}

/**
 * Determines the current task flow state from a TaskState
 */
export function getTaskFlowState(state: TaskState | null): TaskFlowState {
    if (!state) return "task1";

    if (isTask1Trial(state.trial)) return "task1";
    if (isTask2Trial(state.trial)) return "task2";
    if (isTask3Trial(state.trial)) return "task3";

    return "task1";
}

/**
 * Gets the active TaskId from the flow state
 */
export function getTaskIdFromFlowState(flowState: TaskFlowState): TaskId {
    switch (flowState) {
        case "task1":
            return TASK1_ID;
        case "task2":
            return TASK2_ID;
        case "task3":
            return TASK3_ID;
        case "completed":
            return TASK3_ID;
    }
}

/**
 * Creates an initial state for Task 1.
 * Pre-selects all 4 points for the task upfront.
 */
export function createInitialTask1State(provider: PointIdProvider): TaskState {
    const pointIds = provider.pickAngularDistributedIds(4);
    const state = createTask1State(pointIds[0], 1);
    return {
        ...state,
        preselectedPointIds: pointIds,
        preselectedIndex: 1, // First point already used
    };
}

/**
 * Creates the next trial state for Task 1.
 * Uses pre-selected points from the initial state.
 */
export function createNextTask1TrialState(
    currentState: TaskState,
): TaskState | null {
    const currentTrial = currentState.trial as Task1Trial;
    const nextTrial = getNextTask1Trial(currentTrial);

    if (!nextTrial) return null; // Task 1 complete

    console.log(currentState);
    console.log(currentState.preselectedIndex, currentState.preselectedPointIds);
    const { preselectedPointIds, preselectedIndex } = currentState;
    if (!preselectedPointIds || preselectedIndex === undefined) {
        throw new Error("Task 1 state missing preselected points");
    }

    const targetId = preselectedPointIds[preselectedIndex];
    const state = createTask1State(targetId, nextTrial);
    return {
        ...state,
        preselectedPointIds,
        preselectedIndex: preselectedIndex + 1,
    };
}

/**
 * Creates an initial state for Task 2.
 * Pre-selects all 4 points for the task upfront.
 */
export function createInitialTask2State(provider: PointIdProvider): TaskState {
    const pointIds = provider.pickAngularDistributedIds(4);
    const [target2D, target3D] = pointIds;
    const state = createTask2State(target2D, target3D, 5);
    return {
        ...state,
        preselectedPointIds: pointIds,
        preselectedIndex: 2, // First 2 points already used
    };
}

/**
 * Creates the next trial state for Task 2.
 * Uses pre-selected points from the initial state.
 */
export function createNextTask2TrialState(
    currentState: TaskState,
): TaskState | null {
    const currentTrial = currentState.trial as Task2Trial;
    const nextTrial = getNextTask2Trial(currentTrial);

    if (!nextTrial) return null; // Task 2 complete

    const { preselectedPointIds, preselectedIndex } = currentState;
    if (!preselectedPointIds || preselectedIndex === undefined) {
        throw new Error("Task 2 state missing preselected points");
    }

    const target2D = preselectedPointIds[preselectedIndex];
    const target3D = preselectedPointIds[preselectedIndex + 1];
    const state = createTask2State(target2D, target3D, nextTrial);
    return {
        ...state,
        preselectedPointIds,
        preselectedIndex: preselectedIndex + 2,
    };
}

/**
 * Creates an initial state for Task 3.
 * Selects all 10 points for color pairs upfront.
 */
export function createInitialTask3State(
    provider: PointIdProvider,
    pairCount = 5,
): TaskState {
    const pointIds = provider.pickAngularDistributedIds(pairCount * 2);
    const assignments = createTask3Assignments(pointIds, pairCount);
    const state = createTask3State(assignments);
    if (!state) {
        throw new Error("Failed to create Task 3 state: no assignments");
    }
    return {
        ...state,
        preselectedPointIds: pointIds,
    };
}

/**
 * Determines what happens after a task completes.
 * Respects the taskFlowConfig to skip disabled tasks.
 */
export function determineNextAction(currentState: TaskState): {
    action: "next-trial" | "next-task" | "advance-pair" | "all-complete";
    nextTaskId?: TaskId;
} {
    const flowState = getTaskFlowState(currentState);

    if (flowState === "task1") {
        const trial = currentState.trial as Task1Trial;
        if (isTask1Complete(trial)) {
            const nextTask = getNextEnabledTask(TASK1_ID);
            if (nextTask) {
                return { action: "next-task", nextTaskId: nextTask };
            }
            return { action: "all-complete" };
        }
        return { action: "next-trial" };
    }

    if (flowState === "task2") {
        const trial = currentState.trial as Task2Trial;
        if (isTask2Complete(trial)) {
            const nextTask = getNextEnabledTask(TASK2_ID);
            if (nextTask) {
                return { action: "next-task", nextTaskId: nextTask };
            }
            return { action: "all-complete" };
        }
        return { action: "next-trial" };
    }

    if (flowState === "task3") {
        if (isTask3Complete(currentState)) {
            return { action: "all-complete" };
        }
        return { action: "advance-pair" };
    }

    return { action: "all-complete" };
}

/**
 * Creates the next state based on the current state and action.
 * For next-trial actions, uses pre-selected points from the current state.
 * For next-task actions, requires a provider to select new points.
 */
export function createNextState(
    currentState: TaskState,
    action: ReturnType<typeof determineNextAction>,
    provider: PointIdProvider,
): TaskState | null {
    switch (action.action) {
        case "next-trial": {
            const flowState = getTaskFlowState(currentState);
            if (flowState === "task1") {
                return createNextTask1TrialState(currentState);
            }
            if (flowState === "task2") {
                return createNextTask2TrialState(currentState);
            }
            return null;
        }

        case "next-task": {
            if (action.nextTaskId === TASK2_ID) {
                return createInitialTask2State(provider);
            }
            if (action.nextTaskId === TASK3_ID) {
                return createInitialTask3State(provider);
            }
            return null;
        }

        case "advance-pair": {
            return advanceToNextPair(currentState);
        }

        case "all-complete":
            return null;
    }
}

/**
 * Logs trial start
 */
export function logTrialStart(state: TaskState, side: "2D" | "3D" = "2D") {
    const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(state.trial);
    console.log(
        `[${side}][${state.id}] Task ${taskNumber} trial ${trialNumber}/${totalTrials} start`,
    );
}

/**
 * Logs trial end
 */
export function logTrialEnd(state: TaskState, side: "2D" | "3D" = "2D") {
    const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(state.trial);
    if (state.trial === 7 && state.trial7Assignments) {
        const totalPairs = state.trial7Assignments.length;
        const solvedPairs = state.trial7Assignments.filter((a) => a.done2D && a.done3D).length;
        const activeIndex = state.colorPairIndex ?? 0;
        const active = state.trial7Assignments[activeIndex];
        const colorLabel = active?.key ?? "pair";
        console.log(
            `[${side}][${state.id}] Task ${taskNumber} trial ${trialNumber}/${totalTrials} completed ${colorLabel} (${solvedPairs}/${totalPairs} pairs solved)`,
        );
    } else {
        const status = state.feedback === "success" ? "success" : "end";
        console.log(
            `[${side}][${state.id}] Task ${taskNumber} trial ${trialNumber}/${totalTrials} ${status} (completed=${state.completed}, feedback=${state.feedback})`,
        );
    }
}

/**
 * Logs key lifecycle events so both 2D and 3D consoles stay in sync.
 */
export function logTaskLifecycle(
    prevState: TaskState | null,
    nextState: TaskState | null,
    side: "2D" | "3D",
) {
    if (!nextState) return;

    const prevInfo = prevState ? getTaskAndTrial(prevState.trial) : null;
    const nextInfo = getTaskAndTrial(nextState.trial);
    const taskChanged = !prevInfo || prevInfo.taskNumber !== nextInfo.taskNumber;
    const trialChanged = prevState ? prevState.trial !== nextState.trial : true;

    if (taskChanged) {
        console.log(`[${side}][${nextState.id}] Task ${nextInfo.taskNumber} start`);
    }

    if (trialChanged) {
        logTrialStart(nextState, side);
    }

    const completedSuccessfully =
        nextState.feedback === "success" && nextState.completed && !prevState?.completed;

    if (completedSuccessfully) {
        logTrialEnd(nextState, side);
        const action = determineNextAction(nextState);
        if (action.action === "next-task" || action.action === "all-complete") {
            console.log(`[${side}][${nextState.id}] Task ${nextInfo.taskNumber} success`);
        }
        if (action.action === "all-complete") {
            console.log(`[${side}][${nextState.id}] All tasks finished 🎉🎉🎉`);
        }
    }
}

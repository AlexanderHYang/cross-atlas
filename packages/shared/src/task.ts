/**
 * Common types and constants for the task system.
 *
 * Task Flow:
 * - Task 1 (trials 1-4): Sequential trials - players take turns
 * - Task 2 (trials 5-6): Collaborative trials - both have targets simultaneously
 * - Task 3 (trial 7): Color-paired collaborative round
 *
 * See task1.ts, task2.ts, task3.ts for specific task logic.
 * See taskRunner.ts for flow orchestration.
 */

export type TaskTrial = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type TaskId = "task1" | "task2" | "task3";

/**
 * Debug configuration for controlling task flow.
 * Set enabledTasks to control which tasks are included in the flow.
 *
 * Examples:
 * - { task1: true, task2: true, task3: true } - Run all tasks (default)
 * - { task1: false, task2: true, task3: false } - Only run Task 2
 * - { task1: true, task2: false, task3: true } - Skip Task 2
 */
export type TaskFlowConfig = {
    task1: boolean;
    task2: boolean;
    task3: boolean;
};

/*-------- Task switch --------*/
let taskFlowConfig: TaskFlowConfig = {
    task1: true,
    task2: true,
    task3: true,
};

/**
 * Set which tasks are enabled in the flow.
 * Call this before starting tasks to configure the flow.
 */
export function setTaskFlowConfig(config: Partial<TaskFlowConfig>) {
    taskFlowConfig = { ...taskFlowConfig, ...config };
    console.log("[Task] Flow config updated:", taskFlowConfig);
}

/**
 * Get the current task flow configuration
 */
export function getTaskFlowConfig(): TaskFlowConfig {
    return { ...taskFlowConfig };
}

export type Trial7Assignment = {
    key: string;
    point2D: string;
    point3D: string;
    done2D?: boolean;
    done3D?: boolean;
};

export type TaskState = {
    id: string;
    targetPointId2D: string | null;
    /**
     * Trial number.
     * 1-4: Task 1 (sequential trials)
     *   1,3: 2D shows the target highlight and 3D selects.
     *   2,4: 3D shows the target highlight and 2D selects.
     * 5-6: Task 2 (collaborative trials)
     *   Both 2D and 3D have targets simultaneously.
     * 7: Task 3 (color-paired collaborative)
     */
    trial: TaskTrial;
    /**
     * Which side currently sees the target hint.
     * For Task 2/3, both sides see targets simultaneously.
     */
    hintSide: "2d" | "3d" | "both";
    /**
     * Feedback from the active trial: none, wrong guess, or success.
     */
    feedback: "none" | "error" | "success";
    completed: boolean;
    /**
     * For collaborative trials: track which side has clicked correctly.
     */
    clicked2D?: boolean;
    clicked3D?: boolean;
    /**
     * For Task 2/3: the target point ID for the 3D side (when different from 2D).
     */
    targetPointId3D?: string | null;
    /**
     * For syncing error flashes: the point ID that was incorrectly clicked by 2D.
     * Set when 2D clicks the wrong point, cleared after the flash is shown.
     */
    errorPointId2D?: string | null;
    /**
     * For syncing error flashes: the point ID that was incorrectly clicked by 3D.
     * Set when 3D clicks the wrong point, cleared after the flash is shown.
     */
    errorPointId3D?: string | null;
    /**
     * For Trial 7: color pairing key to keep both sides in sync.
     */
    colorPairKey?: string;
    /**
     * For Trial 7: which color pair index in the sequence we are on.
     */
    colorPairIndex?: number;
    /**
     * For Trial 7: the set of point assignments for each color pair.
     */
    trial7Assignments?: Trial7Assignment[];
};

export const TASK_COLLECTION = "task";
export const TASK_META_COLLECTION = "taskMeta";

// Re-export task IDs from individual task files
export { TASK1_ID } from "./task1";
export { TASK2_ID } from "./task2";
export { TASK3_ID } from "./task3";

export type TaskMeta = {
    activeTaskId: TaskId;
};

export function createTaskState(
    id: string,
    targetPointId: string | null,
    trial: TaskTrial = 1,
    hintSide: "2d" | "3d" | "both" = "2d",
    targetPointId3D?: string | null,
    colorPairKey?: string,
    colorPairIndex?: number,
    trial7Assignments?: Trial7Assignment[]
): TaskState {
    return {
        id,
        targetPointId2D: targetPointId,
        trial,
        hintSide,
        feedback: "none",
        completed: false,
        clicked2D: false,
        clicked3D: false,
        targetPointId3D,
        colorPairKey,
        colorPairIndex,
        trial7Assignments,
    };
}

export function getTaskAndTrial(trial: TaskTrial): {
    taskNumber: number;
    trialNumber: number;
    totalTrials: number;
} {
    if (trial >= 1 && trial <= 4) {
        return { taskNumber: 1, trialNumber: trial, totalTrials: 4 };
    }
    if (trial === 5) {
        return { taskNumber: 2, trialNumber: 1, totalTrials: 2 };
    }
    if (trial === 6) {
        return { taskNumber: 2, trialNumber: 2, totalTrials: 2 };
    }
    if (trial === 7) {
        return { taskNumber: 3, trialNumber: 1, totalTrials: 1 };
    }
    // Fallback
    return { taskNumber: 1, trialNumber: 1, totalTrials: 4 };
}

// Re-export task-specific functions for convenience
export {
    isTask1Trial,
    createTask1State,
    handleTask1Selection2D,
    handleTask1Selection3D,
    getNextTask1Trial,
} from "./task1";

export {
    isTask2Trial,
    createTask2State,
    handleTask2Selection2D,
    handleTask2Selection3D,
    getNextTask2Trial,
} from "./task2";

export {
    isTask3Trial,
    createTask3State,
    createTask3Assignments,
    handleTask3Selection2D,
    handleTask3Selection3D,
    advanceToNextPair,
} from "./task3";

export {
    TRANSITION_DELAY_MS,
    getTaskFlowState,
    getTaskIdFromFlowState,
    determineNextAction,
    createNextState,
    createInitialTask1State,
    createInitialTask2State,
    createInitialTask3State,
    logTrialStart,
    logTrialEnd,
    getFirstEnabledTask,
    getNextEnabledTask,
    type PointIdProvider,
    type TaskFlowState,
    type TaskTransition,
} from "./taskRunner";

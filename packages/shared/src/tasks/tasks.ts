import { Color3, Vector3 } from "@babylonjs/core";
import {
    getTask1PointVisual2D,
    evaluateTask1Selection2D,
    evaluateTask1Selection3D,
    applyTask1Visuals3D,
    isTask1Trial,
} from "./task1";
import {
    getTask2PointVisual2D,
    evaluateTask2Selection2D,
    evaluateTask2Selection3D,
    applyTask2Visuals3D,
    isTask2Trial,
} from "./task2";
import {
    getTask3PointVisual2D,
    evaluateTask3Selection2D,
    evaluateTask3Selection3D,
    getTask3Instruction,
    applyTask3Visuals2D,
    applyTask3Visuals3D,
    processTrial7ErrorFlash2D,
    processTrial7ErrorFlash3D,
    isTask3Trial,
} from "./task3";

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
    task1: false,
    task2: false,
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
    /**
     * Which side initially sees the hint for this color.
     * The opposite side is the seeker for the turn.
     */
    hintSide: "2d" | "3d";
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
 * For Task 2, both sides see targets simultaneously.
 * For Task 3, only the hintSide sees the active color; the partner seeks.
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

export type TaskInstructionContent = {
    visible: boolean;
    text?: string;
    html?: string;
};

export type TaskColorConfig2D = {
    success: Vector3;
    error: Vector3;
};

export type TaskColorConfig3D = {
    success: Color3;
    error: Color3;
};

export type TaskPointVisual2D = {
    isTarget: boolean;
    hideColor: boolean;
    overrideColor: Vector3 | null;
    glowColor: Vector3 | null;
};

export type TaskSelection2DEffect = {
    handled: boolean;
    isCorrect?: boolean;
    successColor?: Vector3;
    errorColor?: Vector3;
    lockOnSuccess?: boolean;
    revertToBaseAfterError?: boolean;
    errorFlashDurationMs?: number;
};

export type TaskSelection3DEffect = {
    handled: boolean;
    isCorrect?: boolean;
    successColor?: Color3;
    errorColor?: Color3;
    lockOnSuccess?: boolean;
    advanceTrial?: boolean;
    flashDurationMs?: number;
    stateUpdate?: "task1" | "task2" | "task3";
};

export type TaskPoint2D = {
    id: string;
    setBaseColor(color: Vector3): void;
    setDisplayColor(color: Vector3): void;
    setSelectable(selectable: boolean): void;
    getBaseColor(): Vector3;
    setColor(color: Vector3): void;
    flashColorSync(color: Vector3, durationMs: number): void;
};

export type TaskPoint3D = {
    id: string;
    setDisplayColor(color: Color3): void;
    setLocalOverrideColor(color: Color3): void;
    setPermanentColor(color: Color3): void;
    setSelectable(selectable: boolean): void;
    clearLocalOverrideColor(): void;
    resetToBaseColor(): void;
    getDefaultColor(): Color3;
    flashColorSynced(color: Color3, durationMs: number): void;
};

export const TASK_COLLECTION = "task";
export const TASK_META_COLLECTION = "taskMeta";

// Re-export task IDs from individual task files
export { TASK1_ID } from "./task1";
export { TASK2_ID } from "./task2";
export { TASK3_ID } from "./task3";

export type TaskMeta = {
    activeTaskId?: TaskId;
    studyStarted?: boolean;
    calibrationPending?: boolean;
    calibrationTaskId?: TaskId;
    calibrationTrial?: TaskTrial;
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

const DEFAULT_POINT_VISUAL_2D: TaskPointVisual2D = {
    isTarget: false,
    hideColor: false,
    overrideColor: null,
    glowColor: null,
};

export function getPointVisual2D(
    taskState: TaskState | null,
    pointId: string,
    colors: TaskColorConfig2D
): TaskPointVisual2D {
    if (!taskState) {
        return DEFAULT_POINT_VISUAL_2D;
    }

    if (isTask1Trial(taskState.trial)) {
        return getTask1PointVisual2D(taskState, pointId, colors);
    }

    if (isTask2Trial(taskState.trial)) {
        return getTask2PointVisual2D(taskState, pointId, colors);
    }

    if (isTask3Trial(taskState.trial)) {
        return getTask3PointVisual2D(taskState, pointId);
    }

    return DEFAULT_POINT_VISUAL_2D;
}

export function evaluateSelection2D(
    taskState: TaskState | null,
    selectedPointId: string,
    colors: TaskColorConfig2D
): TaskSelection2DEffect {
    if (!taskState) {
        return { handled: false };
    }

    if (isTask1Trial(taskState.trial)) {
        return evaluateTask1Selection2D(taskState, selectedPointId, colors);
    }

    if (isTask2Trial(taskState.trial)) {
        return evaluateTask2Selection2D(taskState, selectedPointId, colors);
    }

    if (isTask3Trial(taskState.trial)) {
        return evaluateTask3Selection2D(taskState, selectedPointId, colors);
    }

    return { handled: false };
}

export function evaluateSelection3D(
    taskState: TaskState | null,
    selectedPointId: string,
    colors: TaskColorConfig3D
): TaskSelection3DEffect {
    if (!taskState) {
        return { handled: false };
    }

    if (isTask1Trial(taskState.trial)) {
        return evaluateTask1Selection3D(taskState, selectedPointId, colors);
    }

    if (isTask2Trial(taskState.trial)) {
        return evaluateTask2Selection3D(taskState, selectedPointId, colors);
    }

    if (isTask3Trial(taskState.trial)) {
        return evaluateTask3Selection3D(taskState, selectedPointId, colors);
    }

    return { handled: false };
}

export function getInstructionForTask(taskState: TaskState | null): TaskInstructionContent {
    if (taskState?.trial === 7) {
        return getTask3Instruction(taskState);
    }
    return { visible: false, text: "" };
}

export function applyTaskVisuals2D(taskState: TaskState | null, points: Iterable<TaskPoint2D>) {
    if (taskState?.trial === 7) {
        applyTask3Visuals2D(taskState, points);
    }
}

export function applyTaskVisuals3D(
    taskState: TaskState | null,
    pointsById: Map<string, TaskPoint3D>,
    colors: TaskColorConfig3D,
    options?: { flashingPointId?: string | null; resetAllPointColors?: () => void }
) {
    if (!taskState) return;

    if (isTask1Trial(taskState.trial)) {
        applyTask1Visuals3D(
            taskState,
            pointsById,
            colors,
            options?.resetAllPointColors ?? (() => {})
        );
    } else if (isTask2Trial(taskState.trial)) {
        applyTask2Visuals3D(taskState, pointsById, colors);
    } else if (isTask3Trial(taskState.trial)) {
        applyTask3Visuals3D(taskState, pointsById, colors, options?.flashingPointId ?? null);
    }
}

// Re-export task-specific functions for convenience
export {
    isTask1Trial,
    createTask1State,
    handleTask1Selection2D,
    handleTask1Selection3D,
    getNextTask1Trial,
    getTask1PointVisual2D,
    evaluateTask1Selection2D,
    evaluateTask1Selection3D,
    applyTask1Visuals3D,
} from "./task1";

export {
    isTask2Trial,
    createTask2State,
    handleTask2Selection2D,
    handleTask2Selection3D,
    getNextTask2Trial,
    getTask2PointVisual2D,
    evaluateTask2Selection2D,
    evaluateTask2Selection3D,
    applyTask2Visuals3D,
} from "./task2";

export {
    isTask3Trial,
    createTask3State,
    createTask3Assignments,
    handleTask3Selection2D,
    handleTask3Selection3D,
    advanceToNextPair,
    getTask3PointVisual2D,
    evaluateTask3Selection2D,
    evaluateTask3Selection3D,
    getTask3Instruction,
    applyTask3Visuals2D,
    applyTask3Visuals3D,
    applyCompletedTrial7Pairs2D,
    applyCompletedTrial7Pairs3D,
    setTrial7Selectability2D,
    setTrial7Selectability3D,
    processTrial7ErrorFlash2D,
    processTrial7ErrorFlash3D,
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
    logTaskLifecycle,
    getFirstEnabledTask,
    getNextEnabledTask,
    type PointIdProvider,
    type TaskFlowState,
    type TaskTransition,
} from "../taskRunner";

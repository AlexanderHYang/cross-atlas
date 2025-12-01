export type TaskTrial = 1 | 2 | 3 | 4 | 5 | 6;

export type TaskState = {
    id: string;
    targetPointId: string | null;
    /**
     * Trial number.
     * 1-4: Task 1 (sequential trials)
     *   1,3: 2D shows the target highlight and 3D selects.
     *   2,4: 3D shows the target highlight and 2D selects.
     * 5-6: Task 2 (collaborative trials)
     *   Both 2D and 3D have targets simultaneously.
     */
    trial: TaskTrial;
    /**
     * Which side currently sees the target hint.
     * For Task 2 (trial 5+), both sides see targets simultaneously.
     */
    hintSide: "2d" | "3d" | "both";
    /**
     * Feedback from the active trial: none, wrong guess, or success.
     */
    feedback: "none" | "error" | "success";
    completed: boolean;
    /**
     * For Task 2 (collaborative trials): track which side has clicked correctly.
     */
    clicked2D?: boolean;
    clicked3D?: boolean;
    /**
     * For Task 2: the target point ID for the 3D side (when different from 2D).
     */
    targetPointId3D?: string | null;
};

export const TASK_COLLECTION = "task";
export const TASK1_ID = "task1";

export function createTaskState(
    id: string,
    targetPointId: string | null,
    trial: TaskTrial = 1,
    hintSide: "2d" | "3d" | "both" = "2d",
    targetPointId3D?: string | null
): TaskState {
    return {
        id,
        targetPointId,
        trial,
        hintSide,
        feedback: "none",
        completed: false,
        clicked2D: false,
        clicked3D: false,
        targetPointId3D,
    };
}

export function getTaskAndTrial(trial: TaskTrial): { taskNumber: number; trialNumber: number; totalTrials: number } {
    if (trial >= 1 && trial <= 4) {
        return { taskNumber: 1, trialNumber: trial, totalTrials: 4 };
    }
    if (trial === 5) {
        return { taskNumber: 2, trialNumber: 1, totalTrials: 2 };
    }
    if (trial === 6) {
        return { taskNumber: 2, trialNumber: 2, totalTrials: 2 };
    }
    // Fallback
    return { taskNumber: 1, trialNumber: 1, totalTrials: 4 };
}

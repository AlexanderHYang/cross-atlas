export type TaskState = {
  id: string;
  targetPointId: string | null;
  /**
   * Trial stage.
   * 1,3: 2D shows the target highlight and 3D selects.
   * 2,4: 3D shows the target highlight and 2D selects.
   */
  stage: 1 | 2 | 3 | 4;
  /**
   * Which side currently sees the target hint.
   */
  hintSide: "2d" | "3d";
  /**
   * Feedback from the active trial: none, wrong guess, or success.
   */
  feedback: "none" | "error" | "success";
  completed: boolean;
};

export const TASK_COLLECTION = "task";
export const TASK1_ID = "task1";

export function createTaskState(
  id: string,
  targetPointId: string | null,
  stage: 1 | 2 | 3 | 4 = 1,
  hintSide: "2d" | "3d" = "2d"
): TaskState {
  return {
    id,
    targetPointId,
    stage,
    hintSide,
    feedback: "none",
    completed: false,
  };
}

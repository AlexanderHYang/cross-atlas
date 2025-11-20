export type TaskState = {
  id: string;
  targetPointId: string | null;
  completed: boolean;
};

export const TASK_COLLECTION = "task";
export const TASK1_ID = "task1";

export function createTaskState(id: string, targetPointId: string | null): TaskState {
  return {
    id,
    targetPointId,
    completed: false,
  };
}

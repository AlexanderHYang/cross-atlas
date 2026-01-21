import { Vector3 } from "@babylonjs/core";
import {
    TaskColorConfig2D,
    applyTaskVisuals2D,
    evaluateSelection2D,
    getInstructionForTask,
    getTaskAndTrial,
    processTrial7ErrorFlash2D,
} from "../../../shared/src/tasks";
import type { Logger2D } from "../Logger2d";
import type { Point2D } from "../Point2D";
import type { SyncManager2D } from "../SyncManager2D";

export type TaskUIRefs = {
    trialBox: HTMLElement;
    instructionBox: HTMLElement;
};

export type TaskController2DDeps = {
    syncManager: SyncManager2D;
    logger: Logger2D;
    colorConfig: TaskColorConfig2D;
    successColor: Vector3;
    errorColor: Vector3;
    ui: TaskUIRefs;
    drawAll: () => void;
};

export class TaskController2D {
    private lastProcessedErrorPointId3D: string | null = null;

    constructor(private readonly deps: TaskController2DDeps) {}

    public handleTaskStateChange = (taskState: ReturnType<SyncManager2D["getCurrentTask"]>) => {
        const { trialBox, instructionBox } = this.deps.ui;
        const trial = taskState?.trial ?? 1;
        const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(trial);
        const label = `Task ${taskNumber}: Trial ${trialNumber}/${totalTrials}`;
        trialBox.textContent = label;
        const instruction = getInstructionForTask(taskState);
        if (instruction.visible) {
            instructionBox.style.display = "block";
            if (instruction.html) {
                instructionBox.innerHTML = instruction.html;
            } else {
                instructionBox.textContent = instruction.text ?? "";
            }
        } else {
            instructionBox.textContent = "";
            instructionBox.style.display = "none";
        }
        console.debug("2D Task state changed:", {
            trial,
            targetPointId2D: taskState?.targetPointId2D,
            targetPointId3D: taskState?.targetPointId3D,
            clicked2D: taskState?.clicked2D,
            clicked3D: taskState?.clicked3D,
        });

        if (trial === 7) {
            this.lastProcessedErrorPointId3D = processTrial7ErrorFlash2D(
                taskState,
                this.deps.syncManager.getLocalPoints(),
                this.deps.errorColor,
                this.lastProcessedErrorPointId3D
            );
        } else {
            this.lastProcessedErrorPointId3D = null;
        }

        applyTaskVisuals2D(taskState, this.deps.syncManager.getLocalPoints());
    };

    public tryHandleSelection(px: number, py: number, width: number, height: number): void {
        const taskState = this.deps.syncManager.getCurrentTask();
        const points = this.deps.syncManager.getLocalPoints();
        let clicked: Point2D | null = null;
        for (let i = points.length - 1; i >= 0; i--) {
            const p = points[i];
            if (p.hitTest(px, py, width, height)) {
                clicked = p;
                break;
            }
        }

        if (!clicked) return;

        const selection = evaluateSelection2D(taskState, clicked.id, this.deps.colorConfig);
        if (!selection.handled) {
            return;
        }

        if (selection.isCorrect) {
            const color = selection.successColor ?? this.deps.successColor;
            clicked.setDisplayColor(color);
            if (selection.lockOnSuccess) {
                clicked.setSelectable(false);
            }
            this.deps.drawAll();
        } else {
            this.deps.logger.logIncorrectClick2D(clicked.id);
            const errorColor = selection.errorColor ?? this.deps.errorColor;
            const duration = selection.errorFlashDurationMs ?? 2000;

            clicked.flashColorSync(errorColor, duration);
        }

        this.deps.syncManager.handleSelection2D(clicked.id);
    }
}

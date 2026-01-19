import { Color3 } from "@babylonjs/core";
import {
    TaskColorConfig3D,
    applyTaskVisuals3D,
    evaluateSelection3D,
    getTaskAndTrial,
    processTrial7ErrorFlash3D,
} from "../../../shared/src/tasks";
import { getDefaultPointConfig } from "../../../shared/src/defaultPoints";
import type { Logger3D } from "../Logger3d";
import type { Point3D } from "../Point3D";
import type { SyncManager3D } from "../SyncManager3D";

export type TaskController3DDeps = {
    syncManager: SyncManager3D;
    logger: Logger3D;
    pointsById: Map<string, Point3D>;
    colorConfig: TaskColorConfig3D;
    successColor: Color3;
    errorColor: Color3;
};

export class TaskController3D {
    private trialTransitionHandle: number | null = null;
    private lastTrial: number | null = null;
    private lastColorPairIndex: number | null = null;
    private lastProcessedErrorPointId2D: string | null = null;
    private flashingPointId3D: string | null = null;
    private suppressVisuals = false;

    constructor(private readonly deps: TaskController3DDeps) {}

    public handlePointSelection = (point: Point3D) => {
        const task = this.deps.syncManager.getCurrentTask();
        if (!task || task.completed) {
            return;
        }

        const selection = evaluateSelection3D(task, point.id, this.deps.colorConfig);
        if (!selection.handled) {
            return;
        }

        if (selection.isCorrect) {
            const color = selection.successColor ?? this.deps.successColor;
            point.setDisplayColor(color);
            if (selection.lockOnSuccess) {
                point.setSelectable(false);
            }
        } else {
            const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(task.trial);
            this.deps.logger.addLogEvent({
                eventName: "incorrectClick3d",
                eventDetails: {
                    taskNumber,
                    trialNumber,
                    totalTrials,
                    pointId: point.id,
                },
            });
            const flashColor = selection.errorColor ?? this.deps.errorColor;
            const duration = selection.flashDurationMs ?? 1000;
            if (selection.stateUpdate === "task3") {
                this.flashingPointId3D = point.id;
            }
            point.flashColorSynced(flashColor, duration);
            if (selection.stateUpdate === "task3") {
                window.setTimeout(() => {
                    if (this.flashingPointId3D === point.id) {
                        this.flashingPointId3D = null;
                    }
                }, duration + 50);
            }
        }

        switch (selection.stateUpdate) {
            case "task1":
                if (selection.isCorrect) {
                    this.deps.syncManager.markGuessTrialSuccess(task.id);
                    if (selection.advanceTrial) {
                        this.scheduleNextTrialFrom3D(task.trial, task.id);
                    }
                }
                break;
            case "task2":
                this.deps.syncManager.handleTask2Click3D(!!selection.isCorrect, task.id);
                break;
            case "task3":
                this.deps.syncManager.handleTrial7Click3D(!!selection.isCorrect, point.id, task.id);
                break;
        }
    };

    public handleTaskStateChange = (task: ReturnType<SyncManager3D["getCurrentTask"]>) => {
        if (this.suppressVisuals) {
            return;
        }
        const trial = task?.trial ?? 1;
        console.debug("3D Task state changed:", {
            trial,
            targetPointId2D: task?.targetPointId2D,
            targetPointId3D: task?.targetPointId3D,
            clicked2D: task?.clicked2D,
            clicked3D: task?.clicked3D,
        });

        if (trial !== 7) {
            this.clearLocalHints();
            this.flashingPointId3D = null;
        }

        const colorPairIndex = task?.colorPairIndex ?? null;
        const isNewPair =
            trial === 7 && colorPairIndex !== null && colorPairIndex !== this.lastColorPairIndex;

        if (
            trial !== 7 &&
            (this.lastTrial !== trial || isNewPair) &&
            task?.feedback === "none" &&
            !task?.clicked2D &&
            !task?.clicked3D
        ) {
            this.resetAllPointColors();
        }

        if (trial === 7 && this.lastTrial !== 7) {
            this.resetAllPointColors();
            this.clearLocalHints();
        }

        this.lastTrial = trial;
        this.lastColorPairIndex = colorPairIndex;

        applyTaskVisuals3D(task, this.deps.pointsById, this.deps.colorConfig, {
            flashingPointId: this.flashingPointId3D,
            resetAllPointColors: () => this.resetAllPointColors(),
        });

        if (trial === 7) {
            this.lastProcessedErrorPointId2D = processTrial7ErrorFlash3D(
                task,
                this.deps.pointsById,
                this.deps.errorColor,
                this.lastProcessedErrorPointId2D
            );
        } else {
            this.lastProcessedErrorPointId2D = null;
        }
    };

    public setCalibrationActive(active: boolean) {
        if (this.suppressVisuals === active) {
            return;
        }
        this.suppressVisuals = active;
        if (active) {
            this.clearLocalHints();
            this.flashingPointId3D = null;
            this.resetAllPointColors();
        }
    }

    private clearLocalHints() {
        for (const p of this.deps.pointsById.values()) {
            p.clearLocalOverrideColor();
        }
    }

    private resetAllPointColors() {
        for (const p of this.deps.pointsById.values()) {
            const cfg = getDefaultPointConfig(p.id);
            if (cfg?.selectable === false) {
                if (cfg.color) {
                    const base = new Color3(cfg.color.x, cfg.color.y, cfg.color.z);
                    p.setPermanentColor(base);
                }
                p.setSelectable(false);
                continue;
            }
            p.resetToBaseColor();
            p.setSelectable(true);
        }
    }

    private scheduleNextTrialFrom3D(currentTrial: number, taskId: string) {
        if (this.deps.syncManager.isCalibrationPending()) {
            return;
        }
        if (this.trialTransitionHandle !== null) {
            window.clearTimeout(this.trialTransitionHandle);
        }
        this.trialTransitionHandle = window.setTimeout(() => {
            this.trialTransitionHandle = null;
            if (this.deps.syncManager.isCalibrationPending()) {
                return;
            }
            if (currentTrial === 1) {
                this.deps.syncManager.setTrial(2, taskId);
            } else if (currentTrial === 3) {
                this.deps.syncManager.setTrial(4, taskId);
            }
        }, 2000);
    }
}

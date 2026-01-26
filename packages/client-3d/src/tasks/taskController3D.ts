import { Color3, HighlightLayer } from "@babylonjs/core";
import {
    TaskColorConfig3D,
    applyTaskVisuals3D,
    evaluateSelection3D,
    getTaskAndTrial,
    isTask2Trial,
    isTask3Trial,
    processTrial7ErrorFlash3D,
} from "../../../shared/src/tasks";
import { getColorPairByKey } from "../../../shared/src/tasks/task3";
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
    vrHintGlowLayer?: HighlightLayer;
};

export class TaskController3D {
    private lastTrial: number | null = null;
    private lastColorPairIndex: number | null = null;
    private lastProcessedErrorPointId2D: string | null = null;
    private flashingPointId3D: string | null = null;
    private suppressVisuals = false;
    private vrHintMeshes = new Map<string, { mesh: Point3D["mesh"]; colorKey: string }>();

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
            const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(task.trial);
            this.deps.logger.addLogEvent({
                eventName: "correctClick3d",
                eventDetails: {
                    taskNumber,
                    trialNumber,
                    totalTrials,
                    pointId: point.id,
                },
            });
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
            const duration = selection.flashDurationMs ?? 1500;
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
        this.applyVrHintGlow(task);

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
            this.clearVrHintGlow();
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

    private clearVrHintGlow() {
        const layer = this.deps.vrHintGlowLayer;
        if (!layer) {
            this.vrHintMeshes.clear();
            return;
        }
        for (const entry of this.vrHintMeshes.values()) {
            layer.removeMesh(entry.mesh);
        }
        this.vrHintMeshes.clear();
    }

    private applyVrHintGlow(task: ReturnType<SyncManager3D["getCurrentTask"]>) {
        const layer = this.deps.vrHintGlowLayer;
        if (!layer) {
            return;
        }
        if (!task) {
            this.clearVrHintGlow();
            return;
        }

        if (isTask3Trial(task.trial)) {
            this.applyTask3VrHintGlow(task);
            return;
        }

        if (isTask2Trial(task.trial)) {
            this.applyTask2VrHintGlow(task);
            return;
        }

        this.clearVrHintGlow();
    }

    private applyTask2VrHintGlow(task: ReturnType<SyncManager3D["getCurrentTask"]>) {
        if (!task?.targetPointId3D || !task.clicked3D) {
            this.syncVrHintGlow(new Map());
            return;
        }

        const targetPoint = this.deps.pointsById.get(task.targetPointId3D);
        if (!targetPoint) {
            this.syncVrHintGlow(new Map());
            return;
        }

        const desired = new Map([
            [
                targetPoint.id,
                {
                    mesh: targetPoint.mesh,
                    color: this.deps.successColor,
                    colorKey: "success",
                },
            ],
        ]);
        this.syncVrHintGlow(desired);
    }

    private applyTask3VrHintGlow(task: ReturnType<SyncManager3D["getCurrentTask"]>) {
        const desired = new Map<
            string,
            { mesh: Point3D["mesh"]; color: Color3; colorKey: string }
        >();

        if (task?.trial7Assignments) {
            for (const entry of task.trial7Assignments) {
                if (!entry.done2D || !entry.done3D) {
                    continue;
                }
                const targetPoint = this.deps.pointsById.get(entry.point3D);
                if (!targetPoint) {
                    continue;
                }
                const pair = getColorPairByKey(entry.key);
                if (!pair) {
                    continue;
                }
                desired.set(targetPoint.id, {
                    mesh: targetPoint.mesh,
                    color: Color3.FromHexString(pair.hex3D),
                    colorKey: pair.hex3D,
                });
            }
        }

        if (task?.targetPointId3D && task.clicked3D) {
            const targetPoint = this.deps.pointsById.get(task.targetPointId3D);
            if (targetPoint) {
                const pair = getColorPairByKey(task.colorPairKey);
                const glowColor = pair
                    ? Color3.FromHexString(pair.hex3D)
                    : this.deps.successColor;
                const colorKey = pair?.hex3D ?? "success";
                desired.set(targetPoint.id, {
                    mesh: targetPoint.mesh,
                    color: glowColor,
                    colorKey,
                });
            }
        }

        this.syncVrHintGlow(desired);
    }

    private syncVrHintGlow(
        desired: Map<string, { mesh: Point3D["mesh"]; color: Color3; colorKey: string }>
    ) {
        const layer = this.deps.vrHintGlowLayer;
        if (!layer) {
            return;
        }

        for (const [id, existing] of this.vrHintMeshes.entries()) {
            const next = desired.get(id);
            if (!next || next.mesh !== existing.mesh || next.colorKey !== existing.colorKey) {
                layer.removeMesh(existing.mesh);
                this.vrHintMeshes.delete(id);
            }
        }

        for (const [id, next] of desired.entries()) {
            if (!this.vrHintMeshes.has(id)) {
                layer.addMesh(next.mesh, next.color);
                this.vrHintMeshes.set(id, { mesh: next.mesh, colorKey: next.colorKey });
            }
        }
    }
}

import { Color3, HighlightLayer } from "@babylonjs/core";
import {
    TaskColorConfig3D,
    applyTaskVisuals3D,
    evaluateSelection3D,
    getTaskAndTrial,
    isTask1Trial,
    isTask2Trial,
    isTask3Trial,
} from "../../../shared/src/tasks";
import { getColorPairByKey } from "../../../shared/src/tasks/task3";
import { getDefaultPointConfig } from "../../../shared/src/defaultPoints";
import type { Logger3D } from "../Logger3d";
import type { Point3D } from "../Point3D";
import type { SyncManager3D } from "../SyncManager3D";

const successSoundUrl = new URL("../../../../resources/sound-effect.mp3", import.meta.url);

function createSuccessSound(): HTMLAudioElement | null {
    if (typeof Audio === "undefined") {
        return null;
    }
    const audio = new Audio(successSoundUrl.href);
    audio.preload = "auto";
    return audio;
}

export type TaskController3DDeps = {
    syncManager: SyncManager3D;
    logger: Logger3D;
    pointsById: Map<string, Point3D>;
    colorConfig: TaskColorConfig3D;
    successColor: Color3;
    errorColor: Color3;
    vrHintGlowLayer?: HighlightLayer;
    errorGlowLayer?: HighlightLayer;
};

type ErrorSource = "local" | "remote";

export class TaskController3D {
    private readonly successSound = createSuccessSound();
    private lastTrial: number | null = null;
    private lastColorPairIndex: number | null = null;
    private lastProcessedErrorPointId2D: string | null = null;
    private localErrorPointId: string | null = null;
    private remoteErrorPointId: string | null = null;
    private errorHighlights = new Map<string, { prevColor: Color3; sources: Set<ErrorSource> }>();
    private errorGlowMeshes = new Set<string>();
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
            const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(task);
            this.deps.logger.addLogEvent({
                eventName: "correctClick3d",
                eventDetails: {
                    taskNumber,
                    trialNumber,
                    totalTrials,
                    pointId: point.id,
                },
            });
            this.playSuccessSound();
            this.setLocalError(null);
            const color = selection.successColor ?? this.deps.successColor;
            point.setDisplayColor(color);
            if (selection.lockOnSuccess) {
                point.setSelectable(false);
            }
        } else {
            const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(task);
            this.deps.logger.addLogEvent({
                eventName: "incorrectClick3d",
                eventDetails: {
                    taskNumber,
                    trialNumber,
                    totalTrials,
                    pointId: point.id,
                },
            });
            this.setLocalError(point.id);
        }

        switch (selection.stateUpdate) {
            case "task1":
                this.deps.syncManager.handleTask1Click3D(
                    !!selection.isCorrect,
                    point.id,
                    task.id
                );
                break;
            case "task2":
                this.deps.syncManager.handleTask2Click3D(
                    !!selection.isCorrect,
                    point.id,
                    task.id
                );
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
        if (!this.deps.syncManager.isStudyStarted()) {
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

        const colorPairIndex = task?.colorPairIndex ?? null;
        const isNewPair =
            trial === 7 && colorPairIndex !== null && colorPairIndex !== this.lastColorPairIndex;
        const trialChanged = this.lastTrial !== null && this.lastTrial !== trial;
        const leavingTask3 = this.lastTrial === 7 && trial !== 7;

        if (trialChanged || isNewPair) {
            this.clearAllErrors({ restore: true });
            this.lastProcessedErrorPointId2D = null;
        }

        if (leavingTask3) {
            this.resetAllPointColorsToDefaults();
            this.clearLocalHints();
        }

        if (trial !== 7) {
            this.clearLocalHints();
        }

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
            resetAllPointColors: () => this.resetAllPointColors(),
        });
        this.applyVrHintGlow(task);

        const isErrorSyncTrial = isTask1Trial(trial) || isTask2Trial(trial) || isTask3Trial(trial);
        if (isErrorSyncTrial) {
            const remoteErrorPointId = task?.errorPointId2D ?? null;
            if (remoteErrorPointId !== this.lastProcessedErrorPointId2D) {
                this.lastProcessedErrorPointId2D = remoteErrorPointId;
                this.setRemoteError(remoteErrorPointId);
            }
        } else if (this.lastProcessedErrorPointId2D !== null) {
            this.lastProcessedErrorPointId2D = null;
            this.setRemoteError(null);
        }

        this.syncErrors();
    };

    public setCalibrationActive(active: boolean) {
        if (this.suppressVisuals === active) {
            return;
        }
        this.suppressVisuals = active;
        if (active) {
            this.clearLocalHints();
            this.clearAllErrors({ restore: false });
            this.resetAllPointColors();
            this.clearVrHintGlow();
        }
    }

    public resetForIdle() {
        this.clearLocalHints();
        this.clearAllErrors({ restore: false });
        this.clearVrHintGlow();
        this.resetAllPointColorsToDefaults();
    }

    private playSuccessSound() {
        if (!this.successSound) {
            return;
        }
        try {
            this.successSound.currentTime = 0;
        } catch {
            // Ignore seek errors if metadata isn't ready.
        }
        const playPromise = this.successSound.play();
        if (playPromise) {
            playPromise.catch(() => {});
        }
    }

    private setLocalError(pointId: string | null) {
        this.localErrorPointId = pointId;
        this.syncErrors();
    }

    private setRemoteError(pointId: string | null) {
        this.remoteErrorPointId = pointId;
        this.syncErrors();
    }

    private syncErrors() {
        const desired = new Set<string>();
        if (this.localErrorPointId) {
            desired.add(this.localErrorPointId);
        }
        if (this.remoteErrorPointId) {
            desired.add(this.remoteErrorPointId);
        }

        for (const [pointId, entry] of this.errorHighlights.entries()) {
            if (desired.has(pointId)) {
                continue;
            }
            const point = this.deps.pointsById.get(pointId);
            if (point) {
                point.clearErrorHighlight();
                point.setDisplayColor(entry.prevColor);
                this.removeErrorGlow(point);
            }
            this.errorHighlights.delete(pointId);
        }

        for (const pointId of desired) {
            const point = this.deps.pointsById.get(pointId);
            if (!point) {
                continue;
            }
            let entry = this.errorHighlights.get(pointId);
            if (!entry) {
                entry = { prevColor: point.getStableColor(), sources: new Set<ErrorSource>() };
                this.errorHighlights.set(pointId, entry);
            } else {
                entry.prevColor = point.getStableColor();
            }
            entry.sources.clear();
            if (this.localErrorPointId === pointId) {
                entry.sources.add("local");
            }
            if (this.remoteErrorPointId === pointId) {
                entry.sources.add("remote");
            }
            this.updateErrorVisual(point, entry);
        }
    }

    private clearAllErrors(options?: { restore?: boolean }) {
        const restore = options?.restore ?? true;
        for (const [pointId, entry] of this.errorHighlights.entries()) {
            const point = this.deps.pointsById.get(pointId);
            if (!point) {
                continue;
            }
            point.clearErrorHighlight();
            if (restore) {
                point.setDisplayColor(entry.prevColor);
            }
            this.removeErrorGlow(point);
        }
        this.errorHighlights.clear();
        this.localErrorPointId = null;
        this.remoteErrorPointId = null;
        this.errorGlowMeshes.clear();
    }

    private addErrorGlow(point: Point3D) {
        const layer = this.deps.errorGlowLayer;
        if (!layer || this.errorGlowMeshes.has(point.id)) {
            return;
        }
        layer.addMesh(point.mesh, this.deps.errorColor);
        this.errorGlowMeshes.add(point.id);
    }

    private updateErrorVisual(
        point: Point3D,
        entry: { prevColor: Color3; sources: Set<ErrorSource> }
    ) {
        point.setErrorHighlight(this.deps.errorColor);
        if (entry.sources.has("local")) {
            this.addErrorGlow(point);
        } else {
            this.removeErrorGlow(point);
        }
        this.removeVrHintGlowForPoint(point.id);
    }

    private removeVrHintGlowForPoint(pointId: string) {
        const layer = this.deps.vrHintGlowLayer;
        if (!layer) {
            return;
        }
        const existing = this.vrHintMeshes.get(pointId);
        if (!existing) {
            return;
        }
        layer.removeMesh(existing.mesh);
        this.vrHintMeshes.delete(pointId);
    }

    private removeErrorGlow(point: Point3D) {
        const layer = this.deps.errorGlowLayer;
        if (!layer || !this.errorGlowMeshes.has(point.id)) {
            return;
        }
        layer.removeMesh(point.mesh);
        this.errorGlowMeshes.delete(point.id);
    }

    private clearLocalHints() {
        for (const p of this.deps.pointsById.values()) {
            p.clearLocalOverrideColor();
        }
    }

    private resetAllPointColors() {
        for (const p of this.deps.pointsById.values()) {
            p.clearErrorHighlight();
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

    private resetAllPointColorsToDefaults() {
        for (const p of this.deps.pointsById.values()) {
            p.clearErrorHighlight();
            const cfg = getDefaultPointConfig(p.id);
            const base = cfg?.color
                ? new Color3(cfg.color.x, cfg.color.y, cfg.color.z)
                : Color3.White();
            p.clearLocalOverrideColor();
            p.setPermanentColor(base);
            p.setSelectable(cfg?.selectable !== false);
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

        if (this.errorHighlights.has(task.targetPointId3D)) {
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
                if (this.errorHighlights.has(targetPoint.id)) {
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
                if (this.errorHighlights.has(targetPoint.id)) {
                    this.syncVrHintGlow(desired);
                    return;
                }
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

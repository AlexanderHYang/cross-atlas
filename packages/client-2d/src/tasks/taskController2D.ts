import { Vector3 } from "@babylonjs/core";
import {
    TaskColorConfig2D,
    applyTaskVisuals2D,
    evaluateSelection2D,
    getInstructionForTask,
    getTaskAndTrial,
    isTask1Trial,
    isTask2Trial,
    isTask3Trial,
} from "../../../shared/src/tasks";
import type { Logger2D } from "../Logger2d";
import type { Point2D } from "../Point2D";
import type { SyncManager2D } from "../SyncManager2D";

const successSoundUrl = new URL("../../../../resources/sound-effect.mp3", import.meta.url);

function createSuccessSound(): HTMLAudioElement | null {
    if (typeof Audio === "undefined") {
        return null;
    }
    const audio = new Audio(successSoundUrl.href);
    audio.preload = "auto";
    return audio;
}

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
    onLayoutChange?: () => void;
    drawAll: () => void;
};

type ErrorSource = "local" | "remote";

export class TaskController2D {
    private readonly successSound = createSuccessSound();
    private lastTrial: number | null = null;
    private lastColorPairIndex: number | null = null;
    private lastProcessedErrorPointId3D: string | null = null;
    private localErrorPointId: string | null = null;
    private remoteErrorPointId: string | null = null;
    private errorHighlights = new Map<
        string,
        { prevColor: Vector3; sources: Set<ErrorSource> }
    >();

    constructor(private readonly deps: TaskController2DDeps) {}

    public handleTaskStateChange = (taskState: ReturnType<SyncManager2D["getCurrentTask"]>) => {
        const { trialBox, instructionBox } = this.deps.ui;
        const trial = taskState?.trial ?? 1;
        const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(taskState ?? trial);
        trialBox.innerHTML = `Task ${taskNumber} <span style='opacity: 0.5; margin: 0 8px;'>|</span> Trial <span style='color: #a8d5ff; font-weight: 600;'>${trialNumber}</span>/<span style='opacity: 0.7;'>${totalTrials}</span>`;
        const instruction = getInstructionForTask(taskState);
        if (instruction.visible) {
            instructionBox.style.display = "block";
            instructionBox.style.left = "220px";
            if (instruction.html) {
                instructionBox.innerHTML = instruction.html;
            } else {
                instructionBox.textContent = instruction.text ?? "";
            }
        } else {
            instructionBox.textContent = "";
            instructionBox.style.display = "none";
        }
        this.deps.onLayoutChange?.();
        console.debug("2D Task state changed:", {
            trial,
            targetPointId2D: taskState?.targetPointId2D,
            targetPointId3D: taskState?.targetPointId3D,
            clicked2D: taskState?.clicked2D,
            clicked3D: taskState?.clicked3D,
        });

        const trialChanged = this.lastTrial !== null && this.lastTrial !== trial;
        const leavingTask3 = this.lastTrial === 7 && trial !== 7;
        const colorPairIndex = taskState?.colorPairIndex ?? null;
        const isNewPair =
            isTask3Trial(trial) &&
            colorPairIndex !== null &&
            colorPairIndex !== this.lastColorPairIndex;

        if (trialChanged || isNewPair) {
            this.clearAllErrors({ restore: true });
            this.lastProcessedErrorPointId3D = null;
        }

        if (leavingTask3) {
            this.deps.syncManager.resetPointColorsToDefault();
        }

        if (isTask3Trial(trial) && this.lastTrial !== 7) {
            this.deps.syncManager.resetTask3NeutralColors(taskState?.trial7Assignments);
        }

        applyTaskVisuals2D(taskState, this.deps.syncManager.getLocalPoints());

        const isErrorSyncTrial = isTask1Trial(trial) || isTask2Trial(trial) || isTask3Trial(trial);
        if (isErrorSyncTrial) {
            const remoteErrorPointId = taskState?.errorPointId3D ?? null;
            if (remoteErrorPointId !== this.lastProcessedErrorPointId3D) {
                this.lastProcessedErrorPointId3D = remoteErrorPointId;
                this.setRemoteError(remoteErrorPointId);
            }
        } else if (this.lastProcessedErrorPointId3D !== null) {
            this.lastProcessedErrorPointId3D = null;
            this.setRemoteError(null);
        }

        this.lastTrial = trial;
        this.lastColorPairIndex = colorPairIndex;
        this.syncErrors();
    };

    public tryHandleSelection(
        px: number,
        py: number,
        width: number,
        height: number,
        yOffset: number = 0,
    ): void {
        const taskState = this.deps.syncManager.getCurrentTask();
        const points = this.deps.syncManager.getLocalPoints();
        let clicked: Point2D | null = null;
        for (let i = points.length - 1; i >= 0; i--) {
            const p = points[i];
            if (p.hitTest(px, py, width, height, yOffset)) {
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
            this.deps.logger.logCorrectClick2D(clicked.id);
            this.playSuccessSound();
            this.setLocalError(null);
            const color = selection.successColor ?? this.deps.successColor;
            clicked.setDisplayColor(color);
            if (selection.lockOnSuccess) {
                clicked.setSelectable(false);
            }
            this.deps.drawAll();
        } else {
            this.deps.logger.logIncorrectClick2D(clicked.id);
            this.setLocalError(clicked.id);
        }

        this.deps.syncManager.handleSelection2D(clicked.id);
    }

    private getPointById(pointId: string): Point2D | null {
        const points = this.deps.syncManager.getLocalPoints();
        for (const point of points) {
            if (point.id === pointId) {
                return point;
            }
        }
        return null;
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
            const point = this.getPointById(pointId);
            if (point) {
                point.clearErrorHighlight();
                point.setDisplayColor(entry.prevColor);
            }
            this.errorHighlights.delete(pointId);
        }

        for (const pointId of desired) {
            const point = this.getPointById(pointId);
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

    private updateErrorVisual(
        point: Point2D,
        entry: { prevColor: Vector3; sources: Set<ErrorSource> }
    ) {
        const showGlow = entry.sources.has("remote");
        point.setErrorHighlight(this.deps.errorColor, showGlow);
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

    private clearAllErrors(options?: { restore?: boolean }) {
        const restore = options?.restore ?? true;
        for (const [pointId, entry] of this.errorHighlights.entries()) {
            const point = this.getPointById(pointId);
            if (!point) {
                continue;
            }
            point.clearErrorHighlight();
            if (restore) {
                point.setDisplayColor(entry.prevColor);
            }
        }
        this.errorHighlights.clear();
        this.localErrorPointId = null;
        this.remoteErrorPointId = null;
    }
}

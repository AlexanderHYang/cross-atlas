import { SyncManager2D } from "./SyncManager2D";
import { TimedLogEvent } from "../../shared/src/logging";
import {
    determineNextAction,
    getTaskAndTrial,
    TaskState,
    Trial7Assignment,
} from "../../shared/src/tasks";
import { layoutType } from "../../shared/src/defaultPoints";

export type LogEvent2D = {
    eventName: string;
    eventDetails: Record<string, unknown>;
};

type TrialContext = {
    key: string;
    taskNumber: number;
    trialNumber: number;
    totalTrials: number;
};

type RotationSample = {
    time: number;
    yaw: number;
    pitch: number;
    taskNumber: number;
    trialNumber: number;
    totalTrials: number;
    key: string;
};

type IncorrectClickSample = {
    time: number;
    user: "pc" | "vr";
    pointId?: string;
};

type CorrectClickSample = {
    time: number;
    user: "pc" | "vr";
    pointId?: string;
};

type TrialSummary = {
    key: string;
    taskNumber: number;
    trialNumber: number;
    totalTrials: number;
    sampleCount: number;
    incorrectClicks2D: number;
    incorrectClicks3D: number;
    incorrectSequence: IncorrectClickSample[];
    correctClicks2D: number;
    correctClicks3D: number;
    correctSequence: CorrectClickSample[];
    trialStartTime?: number;
    trialEndTime?: number;
    completionMs?: number;
    startTime?: number;
    endTime?: number;
    startYaw?: number;
    startPitch?: number;
    endYaw?: number;
    endPitch?: number;
};

export class Logger2D {
    private pendingText: string[] = [];
    private sendInFlight = false;
    private sessionId: string;
    private currentTrial: TrialContext | null = null;
    private lastRotationSample: RotationSample | null = null;
    private trialSamples: Map<string, RotationSample[]> = new Map();
    private trialSummaries: Map<string, TrialSummary> = new Map();
    private pendingRotationLogs: TimedLogEvent[] = [];
    private suppressRotationLogs = false;
    private finalized = false;
    private lastLifecycleState: TaskState | null = null;
    private lastClickLogTime = 0;
    private pendingEndLines: { time: number; line: string }[] = [];
    private endFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly END_LOG_QUIET_MS = 250;

    private syncManager: SyncManager2D;

    constructor(syncManager: SyncManager2D) {
        this.syncManager = syncManager;
        this.sessionId = Logger2D.createSessionId();
        this.queueText(
            `=== [${new Date().toISOString()}] study_start session=${this.sessionId} ===\n`,
        );
        this.beginReceivingRemoteLogs();
    }

    private beginReceivingRemoteLogs() {
        const logArray = this.syncManager.getLogArray();
        logArray.observe((event) => {
            const newItems = event.changes.added;
            if (newItems.size > 0) {
                for (const change of newItems) {
                    for (const content of change.content.getContent()) {
                        this.handleIncomingLog(content as TimedLogEvent);
                    }
                }
                logArray.delete(0, logArray.length);
            }
        });
    }

    public addLogEvent(logEvent: LogEvent2D) {
        const timestamp = new Date().toISOString();
        const trialLabel = this.currentTrial
            ? Logger2D.formatTrialLabel(
                  this.currentTrial.taskNumber,
                  this.currentTrial.trialNumber,
                  this.currentTrial.totalTrials,
              )
            : "task=unknown trial=unknown";
        let details = "{}";
        try {
            details = JSON.stringify(logEvent.eventDetails ?? {});
        } catch {
            details = '"[unserializable]"';
        }
        this.queueText(
            `[${timestamp}] ${trialLabel} user=pc event=${logEvent.eventName} details=${details}\n`,
        );
    }

    private static createSessionId(): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const suffix = Math.random().toString(36).slice(2, 8);
        return `${timestamp}-${suffix}`;
    }

    private static buildTrialKey(
        taskNumber: number,
        trialNumber: number,
        totalTrials: number,
    ): string {
        return `task-${taskNumber}-trial-${trialNumber}-of-${totalTrials}`;
    }

    private static formatTrialLabel(
        taskNumber: number,
        trialNumber: number,
        totalTrials: number,
    ): string {
        return `task=${taskNumber} trial=${trialNumber}/${totalTrials}`;
    }

    private static formatNumber(value?: number): string {
        if (value === undefined || !Number.isFinite(value)) {
            return "-";
        }
        return value.toFixed(6);
    }

    private static formatCount(value?: number): string {
        if (value === undefined || !Number.isFinite(value)) {
            return "-";
        }
        return Math.round(value).toString();
    }

    private static formatDurationMs(value?: number): string {
        if (value === undefined || !Number.isFinite(value)) {
            return "-";
        }
        return Math.round(value).toString();
    }

    private static formatBinary(value: boolean): string {
        return value ? "1" : "0";
    }

    private static formatYesNo(value: boolean): string {
        return value ? "yes" : "no";
    }

    private static formatTimestamp(value?: number): string {
        if (!value) {
            return "-";
        }
        return new Date(value).toISOString();
    }

    private queueText(text: string) {
        this.pendingText.push(text);
        void this.sendPending();
    }

    private queueEndLine(time: number, line: string) {
        this.pendingEndLines.push({ time, line });
        this.scheduleEndFlush();
    }

    private scheduleEndFlush() {
        if (this.endFlushTimer) {
            return;
        }
        this.endFlushTimer = setTimeout(() => {
            this.endFlushTimer = null;
            this.flushEndLines();
        }, Logger2D.END_LOG_QUIET_MS);
    }

    private flushEndLines(force = false) {
        if (this.pendingEndLines.length === 0) {
            return;
        }

        const now = Date.now();
        if (!force && now - this.lastClickLogTime < Logger2D.END_LOG_QUIET_MS) {
            this.scheduleEndFlush();
            return;
        }

        const lines = [...this.pendingEndLines].sort((a, b) => a.time - b.time);
        this.pendingEndLines = [];
        for (const entry of lines) {
            this.queueText(entry.line);
        }
    }

    private async sendPending(): Promise<void> {
        if (this.sendInFlight || this.pendingText.length === 0) {
            return;
        }

        this.sendInFlight = true;
        const text = this.pendingText.join("");
        this.pendingText = [];

        try {
            const response = await fetch("/api/logs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: this.sessionId, text }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.warn("[2D] Failed to write logs to file:", error);
            this.pendingText = [text, ...this.pendingText];
        } finally {
            this.sendInFlight = false;
            if (this.pendingText.length > 0) {
                void this.sendPending();
            }
        }
    }

    private ensureTrialContext(): TrialContext | null {
        if (this.currentTrial) {
            return this.currentTrial;
        }

        const taskState = this.syncManager.getCurrentTask();
        if (!taskState) {
            return null;
        }

        const { taskNumber, trialNumber, totalTrials } = getTaskAndTrial(taskState.trial);
        this.setTrialContext(taskNumber, trialNumber, totalTrials);
        return this.currentTrial;
    }

    private handleIncomingLog(logEvent: TimedLogEvent) {
        if (this.finalized) {
            return;
        }
        if (logEvent.eventName === "incorrectClick3d") {
            this.handleIncorrectClickLog(logEvent, "vr");
            return;
        }
        if (logEvent.eventName === "correctClick3d") {
            this.handleCorrectClickLog(logEvent, "vr");
            return;
        }
        if (
            logEvent.eventName !== "cumulativeRotation" &&
            logEvent.eventName !== "rotationSample"
        ) {
            return;
        }
        if (this.suppressRotationLogs) {
            return;
        }

        const context = this.ensureTrialContext();
        if (!context) {
            this.pendingRotationLogs.push(logEvent);
            return;
        }

        this.processRotationLog(logEvent, context);
    }

    private processRotationLog(logEvent: TimedLogEvent, context: TrialContext) {
        const details = logEvent.eventDetails ?? {};
        const yaw =
            typeof details["yaw"] === "number"
                ? details["yaw"]
                : typeof details["cumulativeYaw"] === "number"
                  ? details["cumulativeYaw"]
                  : null;
        const pitch =
            typeof details["pitch"] === "number"
                ? details["pitch"]
                : typeof details["cumulativePitch"] === "number"
                  ? details["cumulativePitch"]
                  : null;
        if (yaw === null || pitch === null) {
            return;
        }

        const sample: RotationSample = {
            time: logEvent.time,
            yaw,
            pitch,
            taskNumber: context.taskNumber,
            trialNumber: context.trialNumber,
            totalTrials: context.totalTrials,
            key: context.key,
        };

        const samples = this.trialSamples.get(context.key) ?? [];
        samples.push(sample);
        this.trialSamples.set(context.key, samples);

        const summary =
            this.trialSummaries.get(context.key) ??
            this.createTrialSummary(context.taskNumber, context.trialNumber, context.totalTrials);
        if (summary.sampleCount === 0) {
            summary.startTime = sample.time;
            summary.startYaw = sample.yaw;
            summary.startPitch = sample.pitch;
        }
        summary.sampleCount += 1;
        summary.endTime = sample.time;
        summary.endYaw = sample.yaw;
        summary.endPitch = sample.pitch;
        this.trialSummaries.set(context.key, summary);

        this.lastRotationSample = sample;
    }

    public logTask3PointSolved(params: {
        pairKey: string;
        pairIndex: number;
        side: "2d" | "3d";
        solvedCount?: number;
        totalPairs?: number;
    }) {
        if (this.finalized) {
            return;
        }
        const time = Date.now();
        const timestamp = new Date(time).toISOString();
        const pairLabel = `${params.pairKey} (${params.pairIndex + 1})`;
        const progress =
            params.solvedCount !== undefined && params.totalPairs !== undefined
                ? ` solvedPairs=${params.solvedCount}/${params.totalPairs}`
                : "";
        this.queueText(
            `[${timestamp}] task=3 event=pair_point_solved pair=${pairLabel} side=${params.side}${progress}\n`,
        );
    }

    public logTask3PairSolved(params: {
        pairKey: string;
        pairIndex: number;
        solvedCount?: number;
        totalPairs?: number;
    }) {
        if (this.finalized) {
            return;
        }
        const time = Date.now();
        const timestamp = new Date(time).toISOString();
        const pairLabel = `${params.pairKey} (${params.pairIndex + 1})`;
        const progress =
            params.solvedCount !== undefined && params.totalPairs !== undefined
                ? ` solvedPairs=${params.solvedCount}/${params.totalPairs}`
                : "";
        this.queueText(`[${timestamp}] task=3 event=pair_solved pair=${pairLabel}${progress}\n`);
    }

    private handleIncorrectClickLog(logEvent: TimedLogEvent, user: "pc" | "vr") {
        const details = logEvent.eventDetails ?? {};
        const context = this.extractTrialContext(details) ?? this.ensureTrialContext();
        const pointId = typeof details["pointId"] === "string" ? details["pointId"] : undefined;
        if (!context) {
            const timestamp = new Date(logEvent.time).toISOString();
            const label = "task=unknown trial=unknown";
            this.queueText(
                `[${timestamp}] ${label} user=${user} event=incorrect_click pointId=${pointId ?? "-"}\n`,
            );
            this.lastClickLogTime = Math.max(this.lastClickLogTime, logEvent.time);
            this.flushEndLines();
            return;
        }
        this.recordIncorrectClick(context, user, logEvent.time, pointId);
    }

    private extractTrialContext(details: Record<string, unknown>): TrialContext | null {
        const taskNumber = typeof details["taskNumber"] === "number" ? details["taskNumber"] : null;
        const trialNumber =
            typeof details["trialNumber"] === "number" ? details["trialNumber"] : null;
        const totalTrials =
            typeof details["totalTrials"] === "number" ? details["totalTrials"] : null;
        if (
            taskNumber === null ||
            trialNumber === null ||
            totalTrials === null ||
            !Number.isFinite(taskNumber) ||
            !Number.isFinite(trialNumber) ||
            !Number.isFinite(totalTrials)
        ) {
            return null;
        }
        const key = Logger2D.buildTrialKey(taskNumber, trialNumber, totalTrials);
        return { key, taskNumber, trialNumber, totalTrials };
    }

    private recordIncorrectClick(
        context: TrialContext,
        user: "pc" | "vr",
        time: number,
        pointId?: string,
    ) {
        const summary =
            this.trialSummaries.get(context.key) ??
            this.createTrialSummary(context.taskNumber, context.trialNumber, context.totalTrials);
        if (user === "pc") {
            summary.incorrectClicks2D += 1;
        } else {
            summary.incorrectClicks3D += 1;
        }
        summary.incorrectSequence.push({ time, user, pointId });
        this.trialSummaries.set(context.key, summary);

        const trialLabel = Logger2D.formatTrialLabel(
            context.taskNumber,
            context.trialNumber,
            context.totalTrials,
        );
        const line =
            `[${new Date(time).toISOString()}] ${trialLabel} ` +
            `user=${user} event=incorrect_click pointId=${pointId ?? "-"}`;
        this.queueText(`${line}\n`);
        this.lastClickLogTime = Math.max(this.lastClickLogTime, time);
        this.flushEndLines();
    }

    private handleCorrectClickLog(logEvent: TimedLogEvent, user: "pc" | "vr") {
        const details = logEvent.eventDetails ?? {};
        const context = this.extractTrialContext(details) ?? this.ensureTrialContext();
        const pointId = typeof details["pointId"] === "string" ? details["pointId"] : undefined;
        if (!context) {
            const timestamp = new Date(logEvent.time).toISOString();
            const label = "task=unknown trial=unknown";
            this.queueText(
                `[${timestamp}] ${label} user=${user} event=correct_click pointId=${pointId ?? "-"}\n`,
            );
            this.lastClickLogTime = Math.max(this.lastClickLogTime, logEvent.time);
            this.flushEndLines();
            return;
        }
        this.recordCorrectClick(context, user, logEvent.time, pointId);
    }

    private recordCorrectClick(
        context: TrialContext,
        user: "pc" | "vr",
        time: number,
        pointId?: string,
    ) {
        const summary =
            this.trialSummaries.get(context.key) ??
            this.createTrialSummary(context.taskNumber, context.trialNumber, context.totalTrials);
        if (user === "pc") {
            summary.correctClicks2D += 1;
        } else {
            summary.correctClicks3D += 1;
        }
        summary.correctSequence.push({ time, user, pointId });
        this.trialSummaries.set(context.key, summary);

        const trialLabel = Logger2D.formatTrialLabel(
            context.taskNumber,
            context.trialNumber,
            context.totalTrials,
        );
        const line =
            `[${new Date(time).toISOString()}] ${trialLabel} ` +
            `user=${user} event=correct_click pointId=${pointId ?? "-"}`;
        this.queueText(`${line}\n`);
        this.lastClickLogTime = Math.max(this.lastClickLogTime, time);
        this.flushEndLines();
    }

    private createTrialSummary(
        taskNumber: number,
        trialNumber: number,
        totalTrials: number,
    ): TrialSummary {
        const key = Logger2D.buildTrialKey(taskNumber, trialNumber, totalTrials);
        const summary: TrialSummary = {
            key,
            taskNumber,
            trialNumber,
            totalTrials,
            sampleCount: 0,
            incorrectClicks2D: 0,
            incorrectClicks3D: 0,
            incorrectSequence: [],
            correctClicks2D: 0,
            correctClicks3D: 0,
            correctSequence: [],
        };
        this.trialSummaries.set(key, summary);
        return summary;
    }

    public setTrialContext(taskNumber: number, trialNumber: number, totalTrials: number) {
        const key = Logger2D.buildTrialKey(taskNumber, trialNumber, totalTrials);
        if (this.currentTrial?.key === key) {
            return;
        }
        this.currentTrial = { key, taskNumber, trialNumber, totalTrials };
        this.suppressRotationLogs = false;
        const summary =
            this.trialSummaries.get(key) ??
            this.createTrialSummary(taskNumber, trialNumber, totalTrials);
        if (!summary.trialStartTime) {
            summary.trialStartTime = Date.now();
            this.trialSummaries.set(key, summary);
        }
        if (this.pendingRotationLogs.length > 0 && this.currentTrial) {
            const pending = this.pendingRotationLogs;
            this.pendingRotationLogs = [];
            for (const logEvent of pending) {
                this.processRotationLog(logEvent, this.currentTrial);
            }
        }
    }

    public logTaskLifecycle(nextState: TaskState | null) {
        if (!nextState || this.finalized) {
            this.lastLifecycleState = nextState;
            return;
        }

        const prevInfo = this.lastLifecycleState
            ? getTaskAndTrial(this.lastLifecycleState.trial)
            : null;
        const nextInfo = getTaskAndTrial(nextState.trial);
        const taskChanged = !prevInfo || prevInfo.taskNumber !== nextInfo.taskNumber;
        const trialChanged = this.lastLifecycleState
            ? this.lastLifecycleState.trial !== nextState.trial
            : true;

        const time = Date.now();
        const timestamp = new Date(time).toISOString();
        if (taskChanged) {
            this.queueText(
                `[${timestamp}] [2D][${nextState.id}] Task ${nextInfo.taskNumber} start\n`,
            );
        }

        if (trialChanged) {
            this.queueText(
                `[${timestamp}] [2D][${nextState.id}] Task ${nextInfo.taskNumber} trial ` +
                    `${nextInfo.trialNumber}/${nextInfo.totalTrials} start\n`,
            );
        }

        const completedSuccessfully =
            nextState.feedback === "success" &&
            nextState.completed &&
            !this.lastLifecycleState?.completed;

        if (completedSuccessfully) {
            if (nextState.trial === 7 && nextState.trial7Assignments) {
                const totalPairs = nextState.trial7Assignments.length;
                const solvedPairs = nextState.trial7Assignments.filter(
                    (assignment: Trial7Assignment) => assignment.done2D && assignment.done3D,
                ).length;
                const activeIndex = nextState.colorPairIndex ?? 0;
                const active = nextState.trial7Assignments[activeIndex];
                const colorLabel = active?.key ?? "pair";
                this.queueEndLine(
                    time,
                    `[${timestamp}] [2D][${nextState.id}] Task ${nextInfo.taskNumber} trial ` +
                        `${nextInfo.trialNumber}/${nextInfo.totalTrials} completed ${colorLabel} ` +
                        `(${solvedPairs}/${totalPairs} pairs solved)\n`,
                );
            } else {
                this.queueEndLine(
                    time,
                    `[${timestamp}] [2D][${nextState.id}] Task ${nextInfo.taskNumber} trial ` +
                        `${nextInfo.trialNumber}/${nextInfo.totalTrials} success ` +
                        `(completed=${nextState.completed}, feedback=${nextState.feedback})\n`,
                );
            }

            const action = determineNextAction(nextState);
            if (action.action === "next-task" || action.action === "all-complete") {
                this.queueEndLine(
                    time,
                    `[${timestamp}] [2D][${nextState.id}] Task ${nextInfo.taskNumber} success\n`,
                );
            }
        }

        this.lastLifecycleState = nextState;
    }

    public logIncorrectClick2D(pointId: string) {
        const context = this.ensureTrialContext();
        const time = Date.now();
        if (!context) {
            const timestamp = new Date(time).toISOString();
            this.queueText(
                `[${timestamp}] task=unknown trial=unknown user=pc event=incorrect_click pointId=${pointId}\n`,
            );
            this.lastClickLogTime = Math.max(this.lastClickLogTime, time);
            this.flushEndLines();
            return;
        }
        this.recordIncorrectClick(context, "pc", time, pointId);
    }

    public logTrialEnd(taskNumber: number, trialNumber: number, totalTrials: number) {
        const key = Logger2D.buildTrialKey(taskNumber, trialNumber, totalTrials);
        const trialLabel = Logger2D.formatTrialLabel(taskNumber, trialNumber, totalTrials);
        const endTime = Date.now();
        const timestamp = new Date(endTime).toISOString();
        const samples = this.trialSamples.get(key);
        const lastSample = samples ? samples[samples.length - 1] : this.lastRotationSample;

        const summary =
            this.trialSummaries.get(key) ??
            this.createTrialSummary(taskNumber, trialNumber, totalTrials);
        summary.trialEndTime = endTime;
        summary.completionMs = summary.trialStartTime
            ? endTime - summary.trialStartTime
            : undefined;
        this.trialSummaries.set(key, summary);

        const line =
            `[${timestamp}] ${trialLabel} event=trial_end final=true ` +
            `yaw=${Logger2D.formatNumber(lastSample?.yaw)} ` +
            `pitch=${Logger2D.formatNumber(lastSample?.pitch)} ` +
            `incorrectClicks2D=${summary.incorrectClicks2D} ` +
            `incorrectClicks3D=${summary.incorrectClicks3D} ` +
            `completionMs=${Logger2D.formatDurationMs(summary.completionMs)}`;
        this.queueEndLine(endTime, `${line}\n`);

        if (summary && lastSample) {
            summary.endTime = summary.endTime ?? lastSample.time;
            summary.endYaw = summary.endYaw ?? lastSample.yaw;
            summary.endPitch = summary.endPitch ?? lastSample.pitch;
            this.trialSummaries.set(key, summary);
        }
        this.suppressRotationLogs = true;
    }

    public finalizeStudy() {
        if (this.finalized) {
            return;
        }
        this.finalized = true;

        this.flushEndLines(true);

        const timestamp = new Date().toISOString();
        const lines: string[] = [];
        lines.push(`=== [${timestamp}] study_end session=${this.sessionId} ===`);
        lines.push("");
        lines.push("=== TRIAL VALUES (grouped) ===");

        const summaries = this.getSortedSummaries();
        for (const summary of summaries) {
            const trialLabel = Logger2D.formatTrialLabel(
                summary.taskNumber,
                summary.trialNumber,
                summary.totalTrials,
            );
            lines.push(`-- ${trialLabel} --`);
            const sequence = summary.incorrectSequence.filter((entry) =>
                summary.trialEndTime ? entry.time <= summary.trialEndTime : true,
            );
            if (sequence.length === 0) {
                lines.push("Sequence of incorrect clicks: none");
            } else {
                lines.push("Sequence of incorrect clicks:");
                for (const entry of sequence) {
                    lines.push(
                        `[${new Date(entry.time).toISOString()}] ` +
                            `user=${entry.user} pointId=${entry.pointId ?? "-"}`,
                    );
                }
            }

            const correctSequence = summary.correctSequence.filter((entry) =>
                summary.trialEndTime ? entry.time <= summary.trialEndTime : true,
            );
            if (correctSequence.length === 0) {
                lines.push("Sequence of correct clicks: none");
            } else {
                lines.push("Sequence of correct clicks:");
                for (const entry of correctSequence) {
                    lines.push(
                        `[${new Date(entry.time).toISOString()}] ` +
                            `user=${entry.user} pointId=${entry.pointId ?? "-"}`,
                    );
                }
            }
            lines.push("");
        }

        const projection = this.syncManager.getProjectionManager().getCurrentProjectionType();
        lines.push(`Projection: ${projection}`);
        lines.push(`Layout: ${layoutType}`);
        lines.push("");
        lines.push("=== SUMMARY TABLE (by task/trial) ===");
        lines.push(...this.buildSummaryTableLines(summaries));
        lines.push("");
        lines.push(`Total completion time: ${this.formatTotalCompletionMs(summaries)}`);
        lines.push(this.formatDirectDeicticRateLine(summaries));
        lines.push("");

        this.queueText(`${lines.join("\n")}\n`);
    }

    private getSortedSummaries(): TrialSummary[] {
        return [...this.trialSummaries.values()].sort((a, b) => {
            if (a.taskNumber !== b.taskNumber) {
                return a.taskNumber - b.taskNumber;
            }
            return a.trialNumber - b.trialNumber;
        });
    }

    private buildSummaryTableLines(summaries: TrialSummary[]): string[] {
        const header = [
            "task",
            "trial",
            "incorrect2D",
            "incorrect3D",
            "firstAttempt",
            "completionMs",
            "yaw",
            "pitch",
        ];

        const rows = summaries.map((summary) => [
            String(summary.taskNumber),
            `${summary.trialNumber}/${summary.totalTrials}`,
            Logger2D.formatCount(summary.incorrectClicks2D),
            Logger2D.formatCount(summary.incorrectClicks3D),
            Logger2D.formatYesNo(summary.incorrectClicks2D + summary.incorrectClicks3D === 0),
            Logger2D.formatDurationMs(summary.completionMs),
            Logger2D.formatNumber(summary.endYaw),
            Logger2D.formatNumber(summary.endPitch),
        ]);

        const widths = header.map((value, index) => {
            const rowMax = rows.reduce((max, row) => {
                const cell = row[index] ?? "";
                return Math.max(max, cell.length);
            }, 0);
            return Math.max(value.length, rowMax);
        });

        const formatRow = (rowValues: string[]) => {
            const padded = rowValues.map((value, index) => value.padEnd(widths[index], " "));
            return `| ${padded.join(" | ")} |`;
        };

        const divider = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;

        const lines = [formatRow(header), divider];
        for (const row of rows) {
            lines.push(formatRow(row));
        }
        return lines;
    }

    public logCorrectClick2D(pointId: string) {
        const context = this.ensureTrialContext();
        const time = Date.now();
        if (!context) {
            const timestamp = new Date(time).toISOString();
            this.queueText(
                `[${timestamp}] task=unknown trial=unknown user=pc event=correct_click pointId=${pointId}\n`,
            );
            this.lastClickLogTime = Math.max(this.lastClickLogTime, time);
            this.flushEndLines();
            return;
        }
        this.recordCorrectClick(context, "pc", time, pointId);
    }

    private formatTotalCompletionMs(summaries: TrialSummary[]): string {
        const startTimes = summaries
            .map((summary) => summary.trialStartTime)
            .filter((time): time is number => typeof time === "number");
        const endTimes = summaries
            .map((summary) => summary.trialEndTime)
            .filter((time): time is number => typeof time === "number");
        if (startTimes.length > 0 && endTimes.length > 0) {
            const totalMs = Math.max(...endTimes) - Math.min(...startTimes);
            return Logger2D.formatDurationMinSec(totalMs);
        }
        const sumMs = summaries.reduce((total, summary) => {
            return total + (summary.completionMs ?? 0);
        }, 0);
        return Logger2D.formatDurationMinSec(sumMs);
    }

    private static formatDurationMinSec(value?: number): string {
        if (value === undefined || !Number.isFinite(value)) {
            return "-";
        }
        const totalSeconds = Math.max(0, Math.round(value / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds}s`;
    }

    private formatDirectDeicticRateLine(summaries: TrialSummary[]): string {
        const total = summaries.length;
        if (total === 0) {
            return "Direct Deictic Success Rate: -";
        }
        const successCount = summaries.filter(
            (summary) => summary.incorrectClicks2D + summary.incorrectClicks3D === 0,
        ).length;
        const percent = (successCount / total) * 100;
        return `Direct Deictic Success Rate (first attempt): ${successCount}/${total} (${percent.toFixed(2)}%)`;
    }
}

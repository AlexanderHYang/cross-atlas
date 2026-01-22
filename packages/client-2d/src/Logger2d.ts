import { SyncManager2D } from "./SyncManager2D";
import { TimedLogEvent } from "../../shared/src/logging";
import { getTaskAndTrial } from "../../shared/src/tasks";
import { layoutType } from "../../shared/src/defaultPoints";

export type LogEvent2D = {
    eventName: string,
    eventDetails: Record<string, unknown>
}

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

type TrialSummary = {
    key: string;
    taskNumber: number;
    trialNumber: number;
    totalTrials: number;
    sampleCount: number;
    incorrectClicks2D: number;
    incorrectClicks3D: number;
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

    private syncManager: SyncManager2D;

    constructor (syncManager: SyncManager2D) {
        this.syncManager = syncManager;
        this.sessionId = Logger2D.createSessionId();
        this.queueText(
            `=== [${new Date().toISOString()}] study_start session=${this.sessionId} ===\n`
        );
        this.beginReceivingRemoteLogs();
    }

    private beginReceivingRemoteLogs() {
        const logArray = this.syncManager.getLogArray();
        logArray.observe(event => {
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
                this.currentTrial.totalTrials
            )
            : "task=unknown trial=unknown";
        let details = "{}";
        try {
            details = JSON.stringify(logEvent.eventDetails ?? {});
        } catch {
            details = "\"[unserializable]\"";
        }
        this.queueText(
            `[${timestamp}] ${trialLabel} user=pc event=${logEvent.eventName} details=${details}\n`
        );
    }

    private static createSessionId(): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const suffix = Math.random().toString(36).slice(2, 8);
        return `${timestamp}-${suffix}`;
    }

    private static buildTrialKey(taskNumber: number, trialNumber: number, totalTrials: number): string {
        return `task-${taskNumber}-trial-${trialNumber}-of-${totalTrials}`;
    }

    private static formatTrialLabel(taskNumber: number, trialNumber: number, totalTrials: number): string {
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
        if (logEvent.eventName !== "cumulativeRotation") {
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
        const yaw = typeof details["cumulativeYaw"] === "number" ? details["cumulativeYaw"] : null;
        const pitch = typeof details["cumulativePitch"] === "number" ? details["cumulativePitch"] : null;
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

        const trialLabel = Logger2D.formatTrialLabel(
            context.taskNumber,
            context.trialNumber,
            context.totalTrials
        );
        const line =
            `[${new Date(sample.time).toISOString()}] ${trialLabel} ` +
            `cumulativeYaw=${Logger2D.formatNumber(sample.yaw)} ` +
            `cumulativePitch=${Logger2D.formatNumber(sample.pitch)}`;
        this.queueText(`${line}\n`);

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
        const timestamp = new Date().toISOString();
        const pairLabel = `${params.pairKey} (${params.pairIndex + 1})`;
        const progress =
            params.solvedCount !== undefined && params.totalPairs !== undefined
                ? ` solvedPairs=${params.solvedCount}/${params.totalPairs}`
                : "";
        this.queueText(
            `[${timestamp}] task=3 event=pair_point_solved pair=${pairLabel} side=${params.side}${progress}\n`
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
        const timestamp = new Date().toISOString();
        const pairLabel = `${params.pairKey} (${params.pairIndex + 1})`;
        const progress =
            params.solvedCount !== undefined && params.totalPairs !== undefined
                ? ` solvedPairs=${params.solvedCount}/${params.totalPairs}`
                : "";
        this.queueText(
            `[${timestamp}] task=3 event=pair_solved pair=${pairLabel}${progress}\n`
        );
    }

    private handleIncorrectClickLog(logEvent: TimedLogEvent, user: "pc" | "vr") {
        const details = logEvent.eventDetails ?? {};
        const context = this.extractTrialContext(details) ?? this.ensureTrialContext();
        const pointId = typeof details["pointId"] === "string" ? details["pointId"] : undefined;
        if (!context) {
            const timestamp = new Date(logEvent.time).toISOString();
            const label = "task=unknown trial=unknown";
            this.queueText(
                `[${timestamp}] ${label} user=${user} event=incorrect_click pointId=${pointId ?? "-"}\n`
            );
            return;
        }
        this.recordIncorrectClick(context, user, logEvent.time, pointId);
    }

    private extractTrialContext(details: Record<string, unknown>): TrialContext | null {
        const taskNumber = typeof details["taskNumber"] === "number" ? details["taskNumber"] : null;
        const trialNumber = typeof details["trialNumber"] === "number" ? details["trialNumber"] : null;
        const totalTrials = typeof details["totalTrials"] === "number" ? details["totalTrials"] : null;
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
        pointId?: string
    ) {
        const summary =
            this.trialSummaries.get(context.key) ??
            this.createTrialSummary(context.taskNumber, context.trialNumber, context.totalTrials);
        if (user === "pc") {
            summary.incorrectClicks2D += 1;
        } else {
            summary.incorrectClicks3D += 1;
        }
        this.trialSummaries.set(context.key, summary);

        const trialLabel = Logger2D.formatTrialLabel(
            context.taskNumber,
            context.trialNumber,
            context.totalTrials
        );
        const line =
            `[${new Date(time).toISOString()}] ${trialLabel} ` +
            `user=${user} event=incorrect_click pointId=${pointId ?? "-"}`;
        this.queueText(`${line}\n`);
    }

    private createTrialSummary(
        taskNumber: number,
        trialNumber: number,
        totalTrials: number
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
            this.trialSummaries.get(key) ?? this.createTrialSummary(taskNumber, trialNumber, totalTrials);
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

    public logIncorrectClick2D(pointId: string) {
        const context = this.ensureTrialContext();
        const time = Date.now();
        if (!context) {
            const timestamp = new Date(time).toISOString();
            this.queueText(
                `[${timestamp}] task=unknown trial=unknown user=pc event=incorrect_click pointId=${pointId}\n`
            );
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
            this.trialSummaries.get(key) ?? this.createTrialSummary(taskNumber, trialNumber, totalTrials);
        summary.trialEndTime = endTime;
        summary.completionMs = summary.trialStartTime ? endTime - summary.trialStartTime : undefined;
        this.trialSummaries.set(key, summary);

        const line =
            `[${timestamp}] ${trialLabel} event=trial_end final=true ` +
            `cumulativeYaw=${Logger2D.formatNumber(lastSample?.yaw)} ` +
            `cumulativePitch=${Logger2D.formatNumber(lastSample?.pitch)} ` +
            `incorrectClicks2D=${summary.incorrectClicks2D} ` +
            `incorrectClicks3D=${summary.incorrectClicks3D} ` +
            `completionMs=${Logger2D.formatDurationMs(summary.completionMs)}`;
        this.queueText(`${line}\n`);

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
                summary.totalTrials
            );
            lines.push(`-- ${trialLabel} --`);
            const samples = this.trialSamples.get(summary.key) ?? [];
            if (samples.length === 0) {
                lines.push("no samples");
            } else {
                for (const sample of samples) {
                    lines.push(
                        `[${new Date(sample.time).toISOString()}] ` +
                            `cumulativeYaw=${Logger2D.formatNumber(sample.yaw)} ` +
                            `cumulativePitch=${Logger2D.formatNumber(sample.pitch)}`
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
            "completionMs",
            "cumulativeYaw",
            "cumulativePitch",
        ];

        const rows = summaries.map((summary) => [
            String(summary.taskNumber),
            `${summary.trialNumber}/${summary.totalTrials}`,
            Logger2D.formatCount(summary.incorrectClicks2D),
            Logger2D.formatCount(summary.incorrectClicks3D),
            Logger2D.formatDurationMs(summary.completionMs),
            Logger2D.formatNumber(summary.endYaw),
            Logger2D.formatNumber(summary.endPitch),
        ]);

        const widths = header.map((title, index) => {
            let max = title.length;
            for (const row of rows) {
                max = Math.max(max, row[index].length);
            }
            return max;
        });

        const formatRow = (row: string[]) =>
            row.map((cell, index) => cell.padEnd(widths[index])).join(" | ");

        const separator = widths.map((width) => "-".repeat(width)).join("-|-");
        const lines = [formatRow(header), separator];
        for (const row of rows) {
            lines.push(formatRow(row));
        }
        return lines;
    }
}

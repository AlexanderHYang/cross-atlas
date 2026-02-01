import { SyncManager2D } from "./SyncManager2D";
import { TimedLogEvent } from "../../shared/src/logging";
import {
    determineNextAction,
    getTaskAndTrial,
    TaskState,
    Trial7Assignment,
} from "../../shared/src/tasks";
import { layoutType } from "../../shared/src/defaultPoints";
import { isRandomSelectionEnabled } from "../../shared/src/pointSelections";
import {
    isCounterbalanceEnabled,
    getCurrentProjectionIndex,
    getCounterbalanceConfig,
    getTotalProjections,
    COUNTERBALANCE_SEQUENCES,
} from "../../shared/src/counterbalance";

// Angular velocity gating parameters for cumulative rotation
const ROTATION_SAMPLE_INTERVAL_MS = 100; // Expected 10Hz sampling
const ANGULAR_VELOCITY_THRESHOLD = 15; // degrees per second
const DELTA_THRESHOLD = ANGULAR_VELOCITY_THRESHOLD * (ROTATION_SAMPLE_INTERVAL_MS / 1000); // 1.5° at 10Hz

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
    // Gated cumulative rotation
    cumulativeYaw: number;
    cumulativePitch: number;
    prevYaw?: number;
    prevPitch?: number;
    prevSampleTime?: number;
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
    private suppressLifecycleLogs = false;
    private finalized = false;
    private lastLifecycleState: TaskState | null = null;
    private lastClickLogTime = 0;
    private pendingEndLines: { time: number; line: string }[] = [];
    private endFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly END_LOG_QUIET_MS = 250;

    // Time-series logging
    private pendingTimeSeries: string[] = [];
    private timeSeriesSendInFlight = false;
    private timeSeriesHeaderWritten = false;
    private lastTrialKeyForTimeSeries: string | null = null;
    private suppressTimeSeriesLogs = false;
    // Cursor time-series logging (2D)
    private cursorSessionId = "";
    private pendingCursorTimeSeries: string[] = [];
    private cursorTimeSeriesSendInFlight = false;
    private cursorTimeSeriesHeaderWritten = false;
    private lastTrialKeyForCursorTimeSeries: string | null = null;
    private cursorTrialStartTimes: Map<string, number> = new Map();
    private suppressCursorTimeSeriesLogs = false;

    // Counterbalance tracking
    private currentProjectionIndex = 0;
    private projectionSummaries: Map<number, TrialSummary[]> = new Map();

    private syncManager: SyncManager2D;

    constructor(syncManager: SyncManager2D) {
        this.syncManager = syncManager;
        this.sessionId = Logger2D.createSessionId();
        const selectionMode = isRandomSelectionEnabled() ? "random" : "precomputed";
        const projection = this.syncManager.getProjectionManager().getCurrentProjectionType();
        const timestamp = Logger2D.formatLocalTimestamp(new Date());

        // Build counterbalance info string if enabled
        let counterbalanceInfo = "";
        if (isCounterbalanceEnabled()) {
            const cbConfig = getCounterbalanceConfig();
            this.currentProjectionIndex = getCurrentProjectionIndex();
            counterbalanceInfo = ` counterbalance=S${cbConfig.sequence} projection_index=${this.currentProjectionIndex + 1}/${getTotalProjections()}`;
        }

        this.queueText(
            `=== [${timestamp}] study_start session=${this.sessionId} ` +
                `selection_mode=${selectionMode} layout=${layoutType} projection=${projection}${counterbalanceInfo} ===\n`,
        );

        // Log counterbalance sequence details if enabled
        if (isCounterbalanceEnabled()) {
            const cbConfig = getCounterbalanceConfig();
            const sequence = COUNTERBALANCE_SEQUENCES[cbConfig.sequence];
            const sequenceStr = sequence.join(" → ");
            this.queueText(
                `Counterbalance sequence S${cbConfig.sequence}: ${sequenceStr}\n\n`,
            );
        }

        // Log the first projection header
        if (isCounterbalanceEnabled()) {
            const projIndex = getCurrentProjectionIndex();
            const lines: string[] = [];
            lines.push("=".repeat(80));
            lines.push(
                `=== [${timestamp}] projection_start projection=${projection} layout=${layoutType} ===`,
            );
            lines.push(`=== Projection ${projIndex + 1}/${getTotalProjections()}: ${projection.toUpperCase()} ===`);
            lines.push("=".repeat(80));
            lines.push("");
            this.queueText(`${lines.join("\n")}\n`);
        }

        // Write time-series header
        this.queueTimeSeries(
            `=== Time Series Data session=${this.sessionId} ===\n` +
                `Generated: ${Logger2D.formatLocalTimestamp(new Date())}\n\n`,
        );
        this.timeSeriesHeaderWritten = true;
        this.suppressTimeSeriesLogs = false;

        this.cursorSessionId = Logger2D.formatLocalTimestampForFile(new Date());
        this.queueCursorTimeSeries(
            `=== Time Series Data session=${this.cursorSessionId} ===\n` +
                `Generated: ${Logger2D.formatLocalTimestamp(new Date())}\n\n`,
        );
        this.cursorTimeSeriesHeaderWritten = true;
        this.suppressCursorTimeSeriesLogs = false;

        if (isCounterbalanceEnabled()) {
            const projIndex = getCurrentProjectionIndex();
            this.logTimeSeriesProjectionStart(
                projection,
                projIndex + 1,
                getTotalProjections(),
            );
            this.logCursorProjectionStart(projection, projIndex + 1, getTotalProjections());
        }
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
        const timestamp = Logger2D.formatLocalTimestamp(new Date());
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
        const timestamp = Logger2D.formatLocalTimestampForFile(new Date());
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

    private static formatLocalTimestamp(value: number | Date): string {
        const date = value instanceof Date ? value : new Date(value);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        const millis = String(date.getMilliseconds()).padStart(3, "0");
        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}`;
    }

    private static formatLocalTimestampForFile(value: number | Date): string {
        const date = value instanceof Date ? value : new Date(value);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
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
        return Logger2D.formatLocalTimestamp(value);
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

    private queueTimeSeries(text: string) {
        this.pendingTimeSeries.push(text);
        void this.sendPendingTimeSeries();
    }

    private async sendPendingTimeSeries(): Promise<void> {
        if (this.timeSeriesSendInFlight || this.pendingTimeSeries.length === 0) {
            return;
        }

        this.timeSeriesSendInFlight = true;
        const text = this.pendingTimeSeries.join("");
        this.pendingTimeSeries = [];

        try {
            const response = await fetch("/api/logs/timeseries", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: this.sessionId, text }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.warn("[2D] Failed to write time-series:", error);
            this.pendingTimeSeries = [text, ...this.pendingTimeSeries];
        } finally {
            this.timeSeriesSendInFlight = false;
            if (this.pendingTimeSeries.length > 0) {
                void this.sendPendingTimeSeries();
            }
        }
    }

    private queueCursorTimeSeries(text: string) {
        this.pendingCursorTimeSeries.push(text);
        void this.sendPendingCursorTimeSeries();
    }

    private async sendPendingCursorTimeSeries(): Promise<void> {
        if (this.cursorTimeSeriesSendInFlight || this.pendingCursorTimeSeries.length === 0) {
            return;
        }

        this.cursorTimeSeriesSendInFlight = true;
        const text = this.pendingCursorTimeSeries.join("");
        this.pendingCursorTimeSeries = [];

        try {
            const response = await fetch("/api/logs/cursor-movement", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: this.cursorSessionId, text }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.warn("[2D] Failed to write cursor time-series:", error);
            this.pendingCursorTimeSeries = [text, ...this.pendingCursorTimeSeries];
        } finally {
            this.cursorTimeSeriesSendInFlight = false;
            if (this.pendingCursorTimeSeries.length > 0) {
                void this.sendPendingCursorTimeSeries();
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

    /**
     * Wrap angle delta to [-180, 180] range for yaw
     */
    private static wrapDelta(delta: number): number {
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        return delta;
    }

    /**
     * Compute soft-gated delta: if angular speed >= threshold, return |delta| - deltaThreshold
     */
    private static computeGatedDelta(delta: number, deltaTimeMs: number): number {
        const absDelta = Math.abs(delta);
        const deltaTimeSec = deltaTimeMs / 1000;
        if (deltaTimeSec <= 0) return 0;
        const angularSpeed = absDelta / deltaTimeSec; // degrees per second

        if (angularSpeed >= ANGULAR_VELOCITY_THRESHOLD) {
            const gatedAmount = absDelta - DELTA_THRESHOLD;
            return gatedAmount > 0 ? gatedAmount : 0;
        }
        return 0;
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

        const summary =
            this.trialSummaries.get(context.key) ??
            this.createTrialSummary(context.taskNumber, context.trialNumber, context.totalTrials);
        const trialStartTime = summary.trialStartTime ?? logEvent.time;
        if (!summary.trialStartTime) {
            summary.trialStartTime = trialStartTime;
            this.trialSummaries.set(context.key, summary);
        }

        if (logEvent.time < trialStartTime) {
            return;
        }
        if (summary.trialEndTime !== undefined && logEvent.time > summary.trialEndTime) {
            return;
        }

        const samples = this.trialSamples.get(context.key) ?? [];
        samples.push(sample);
        this.trialSamples.set(context.key, samples);

        // Write to time-series file (raw values)
        if (!this.suppressTimeSeriesLogs) {
            if (this.lastTrialKeyForTimeSeries !== context.key) {
                const trialLabel = Logger2D.formatTrialLabel(
                    context.taskNumber,
                    context.trialNumber,
                    context.totalTrials,
                );
                this.queueTimeSeries(`=== ${trialLabel} ===\ntime_ms,yaw,pitch\n`);
                this.lastTrialKeyForTimeSeries = context.key;
            }
            const relativeTime = sample.time - trialStartTime;
            this.queueTimeSeries(
                `${relativeTime},${sample.yaw.toFixed(6)},${sample.pitch.toFixed(6)}\n`,
            );
        }
        if (summary.sampleCount === 0) {
            summary.startTime = sample.time;
            summary.startYaw = sample.yaw;
            summary.startPitch = sample.pitch;
        }

        // Compute gated cumulative rotation
        if (
            summary.prevYaw !== undefined &&
            summary.prevPitch !== undefined &&
            summary.prevSampleTime !== undefined
        ) {
            const deltaTimeMs = sample.time - summary.prevSampleTime;
            if (deltaTimeMs > 0) {
                // Yaw: wrap to handle ±180° boundary
                const deltaYaw = Logger2D.wrapDelta(sample.yaw - summary.prevYaw);
                const gatedYaw = Logger2D.computeGatedDelta(deltaYaw, deltaTimeMs);
                summary.cumulativeYaw += gatedYaw;

                // Pitch: no wrapping needed
                const deltaPitch = sample.pitch - summary.prevPitch;
                const gatedPitch = Logger2D.computeGatedDelta(deltaPitch, deltaTimeMs);
                summary.cumulativePitch += gatedPitch;
            }
        }
        summary.prevYaw = sample.yaw;
        summary.prevPitch = sample.pitch;
        summary.prevSampleTime = sample.time;

        summary.sampleCount += 1;
        summary.endTime = sample.time;
        summary.endYaw = sample.yaw;
        summary.endPitch = sample.pitch;
        this.trialSummaries.set(context.key, summary);

        this.lastRotationSample = sample;
    }

    public logCursorSample(time: number, x: number, y: number) {
        if (this.finalized) {
            return;
        }
        if (this.suppressCursorTimeSeriesLogs) {
            return;
        }
        const context = this.ensureTrialContext();
        if (!context) {
            return;
        }
        const summary =
            this.trialSummaries.get(context.key) ??
            this.createTrialSummary(context.taskNumber, context.trialNumber, context.totalTrials);
        const trialStartTime =
            summary.trialStartTime ?? this.cursorTrialStartTimes.get(context.key) ?? time;
        if (!summary.trialStartTime) {
            summary.trialStartTime = trialStartTime;
            this.trialSummaries.set(context.key, summary);
        }
        if (summary.trialEndTime !== undefined && time > summary.trialEndTime) {
            return;
        }
        if (time < trialStartTime) {
            return;
        }
        if (this.lastTrialKeyForCursorTimeSeries !== context.key) {
            const trialLabel = Logger2D.formatTrialLabel(
                context.taskNumber,
                context.trialNumber,
                context.totalTrials,
            );
            this.queueCursorTimeSeries(`=== ${trialLabel} ===\ntime_ms,x,y\n`);
            this.lastTrialKeyForCursorTimeSeries = context.key;
            this.cursorTrialStartTimes.set(context.key, trialStartTime);
        }
        const relativeTime = time - trialStartTime;
        this.queueCursorTimeSeries(
            `${relativeTime},${x.toFixed(6)},${y.toFixed(6)}\n`,
        );
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
        const timestamp = Logger2D.formatLocalTimestamp(time);
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
        const timestamp = Logger2D.formatLocalTimestamp(time);
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
            const timestamp = Logger2D.formatLocalTimestamp(logEvent.time);
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
            `[${Logger2D.formatLocalTimestamp(time)}] ${trialLabel} ` +
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
            const timestamp = Logger2D.formatLocalTimestamp(logEvent.time);
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
            `[${Logger2D.formatLocalTimestamp(time)}] ${trialLabel} ` +
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
            cumulativeYaw: 0,
            cumulativePitch: 0,
        };
        this.trialSummaries.set(key, summary);
        return summary;
    }

    public setTrialContext(
        taskNumber: number,
        trialNumber: number,
        totalTrials: number,
        startTime?: number,
    ) {
        const key = Logger2D.buildTrialKey(taskNumber, trialNumber, totalTrials);
        if (this.currentTrial?.key === key) {
            if (startTime !== undefined) {
                const summary =
                    this.trialSummaries.get(key) ??
                    this.createTrialSummary(taskNumber, trialNumber, totalTrials);
                summary.trialStartTime = startTime;
                this.trialSummaries.set(key, summary);
                this.cursorTrialStartTimes.set(key, startTime);
            }
            return;
        }
        this.currentTrial = { key, taskNumber, trialNumber, totalTrials };
        this.suppressRotationLogs = false;
        this.suppressCursorTimeSeriesLogs = false;
        const summary =
            this.trialSummaries.get(key) ??
            this.createTrialSummary(taskNumber, trialNumber, totalTrials);
        const resolvedStartTime = startTime ?? Date.now();
        summary.trialStartTime = resolvedStartTime;
        this.trialSummaries.set(key, summary);
        this.cursorTrialStartTimes.set(key, resolvedStartTime);
        if (this.pendingRotationLogs.length > 0 && this.currentTrial) {
            const pending = this.pendingRotationLogs;
            this.pendingRotationLogs = [];
            for (const logEvent of pending) {
                this.processRotationLog(logEvent, this.currentTrial);
            }
        }
    }

    public logTaskLifecycle(nextState: TaskState | null) {
        if (!nextState || this.finalized || this.suppressLifecycleLogs) {
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
        const timestamp = Logger2D.formatLocalTimestamp(time);
        if (taskChanged) {
            this.queueText(
                `[${timestamp}] [2D][${nextState.id}] Task ${nextInfo.taskNumber} start\n`,
            );
        }

        if (trialChanged) {
            this.setTrialContext(
                nextInfo.taskNumber,
                nextInfo.trialNumber,
                nextInfo.totalTrials,
                time,
            );
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

    public logPointSelection(params: {
        taskNumber: number;
        pointIds: string[];
        cumulativeDegrees: number;
        points: { pointId: string; degrees: number | null; difficulty: string }[];
    }) {
        const timestamp = Logger2D.formatLocalTimestamp(new Date());
        const pointsLabel = params.points
            .map((entry) => {
                const degrees =
                    entry.degrees === null || !Number.isFinite(entry.degrees)
                        ? "-"
                        : entry.degrees.toFixed(2);
                return `${entry.pointId}(${degrees}deg, ${entry.difficulty})`;
            })
            .join("; ");
        const cumulative =
            params.cumulativeDegrees === null || !Number.isFinite(params.cumulativeDegrees)
                ? "-"
                : params.cumulativeDegrees.toFixed(2);
        this.queueText(
            `[${timestamp}] task=${params.taskNumber} event=point_selection ` +
                `cumulative_degrees=${cumulative} points=[${pointsLabel}]\n`,
        );
    }

    public logIncorrectClick2D(pointId: string) {
        const context = this.ensureTrialContext();
        const time = Date.now();
        if (!context) {
            const timestamp = Logger2D.formatLocalTimestamp(time);
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
        const timestamp = Logger2D.formatLocalTimestamp(endTime);
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
            `cumYaw=${Logger2D.formatNumber(summary.cumulativeYaw)} ` +
            `cumPitch=${Logger2D.formatNumber(summary.cumulativePitch)} ` +
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
        this.suppressCursorTimeSeriesLogs = true;

        // Add blank line after trial in time-series
        this.queueTimeSeries("\n");
        this.queueCursorTimeSeries("\n");
    }

    /**
     * Log a projection transition in counterbalance mode.
     * Called when switching from one projection to the next.
     */
    public logProjectionTransition(
        previousProjection: string,
        nextProjection: string,
        projectionIndex: number,
        totalProjections: number,
    ) {
        // Save current summaries for the completed projection
        this.projectionSummaries.set(this.currentProjectionIndex, this.getSortedSummaries());
        this.suppressLifecycleLogs = true;

        const timestamp = Logger2D.formatLocalTimestamp(new Date());
        const lines: string[] = [];
        lines.push("");
        lines.push(
            `=== [${timestamp}] projection_complete projection=${previousProjection} projection_index=${projectionIndex}/${totalProjections} ===`,
        );
        lines.push("");
        lines.push(
            `--- PROJECTION ${projectionIndex}/${totalProjections} SUMMARY (${previousProjection}) ---`,
        );

        const summaries = this.getSortedSummaries();
        lines.push(...this.buildSummaryTableLines(summaries));
        lines.push("");
        lines.push(
            `Projection ${projectionIndex} completion time: ${this.formatTotalCompletionMs(summaries)}`,
        );
        lines.push("");
        lines.push(
            `=== [${timestamp}] projection_start projection=${nextProjection} projection_index=${projectionIndex + 1}/${totalProjections} ===`,
        );
        lines.push("");

        this.queueText(`${lines.join("\n")}\n`);

        this.logTimeSeriesProjectionEnd(previousProjection, projectionIndex, totalProjections);
        this.logTimeSeriesProjectionStart(nextProjection, projectionIndex + 1, totalProjections);
        this.logCursorProjectionEnd(previousProjection, projectionIndex, totalProjections);
        this.logCursorProjectionStart(nextProjection, projectionIndex + 1, totalProjections);

        // Clear trial data for next projection
        this.trialSamples.clear();
        this.trialSummaries.clear();
        this.lastRotationSample = null;
        this.currentTrial = null;
        this.lastLifecycleState = null;
        this.suppressRotationLogs = false;
        this.currentProjectionIndex = projectionIndex; // This is the NEW index (0-based)
    }

    /**
     * Finalize the current projection with an old-style summary.
     * Called at the end of each projection in counterbalance mode.
     */
    public finalizeProjection(
        projection: string,
        projectionIndex: number,
        totalProjections: number,
    ) {
        this.suppressLifecycleLogs = true;
        this.flushEndLines(true);

        // Save current summaries for this projection
        this.projectionSummaries.set(this.currentProjectionIndex, [...this.getSortedSummaries()]);

        const timestamp = Logger2D.formatLocalTimestamp(new Date());
        const lines: string[] = [];

        lines.push(
            `=== [${timestamp}] projection_end projection=${projection} projection_index=${projectionIndex}/${totalProjections} session=${this.sessionId} ===`,
        );
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
            if (summary.incorrectSequence.length === 0) {
                lines.push("Sequence of incorrect clicks: none");
            } else {
                lines.push("Sequence of incorrect clicks:");
                for (const entry of summary.incorrectSequence) {
                    lines.push(
                        `[${Logger2D.formatLocalTimestamp(entry.time)}] ` +
                            `user=${entry.user} pointId=${entry.pointId ?? "-"}`,
                    );
                }
            }

            if (summary.correctSequence.length === 0) {
                lines.push("Sequence of correct clicks: none");
            } else {
                lines.push("Sequence of correct clicks:");
                for (const entry of summary.correctSequence) {
                    lines.push(
                        `[${Logger2D.formatLocalTimestamp(entry.time)}] ` +
                            `user=${entry.user} pointId=${entry.pointId ?? "-"}`,
                    );
                }
            }
            lines.push("");
        }

        lines.push(`Projection: ${projection}`);
        lines.push(`Layout: ${layoutType}`);
        lines.push(`Projection index: ${projectionIndex}/${totalProjections}`);
        lines.push("");
        lines.push("=== SUMMARY TABLE (by task/trial) ===");
        lines.push(...this.buildSummaryTableLines(summaries));
        lines.push("");
        lines.push(`Total completion time: ${this.formatTotalCompletionMs(summaries)}`);
        lines.push(this.formatDirectDeicticRateLine(summaries));
        lines.push("");

        this.queueText(`${lines.join("\n")}\n`);

        this.logTimeSeriesProjectionEnd(projection, projectionIndex, totalProjections);
        this.suppressTimeSeriesLogs = true;
        this.logCursorProjectionEnd(projection, projectionIndex, totalProjections);
        this.suppressCursorTimeSeriesLogs = true;

        // Clear trial data for next projection
        this.trialSamples.clear();
        this.trialSummaries.clear();
        this.lastRotationSample = null;
        this.currentTrial = null;
        this.lastLifecycleState = null;
        this.suppressRotationLogs = false;
        this.finalized = false; // Allow finalization for next projection
    }

    /**
     * Reset state for a new projection in counterbalance mode.
     * Called before starting trials with a new projection.
     */
    public resetForNewProjection() {
        this.trialSamples.clear();
        this.trialSummaries.clear();
        this.lastRotationSample = null;
        this.currentTrial = null;
        this.lastLifecycleState = null;
        this.suppressRotationLogs = false;
        this.finalized = false;
        this.suppressLifecycleLogs = false;
        this.currentProjectionIndex = getCurrentProjectionIndex();
        this.lastTrialKeyForTimeSeries = null;
        this.lastTrialKeyForCursorTimeSeries = null;
        this.cursorTrialStartTimes.clear();
        this.suppressCursorTimeSeriesLogs = true;
    }

    /**
     * Log the start of a new projection session in counterbalance mode.
     * This creates a clear visual header in the log file.
     */
    public logProjectionStart(
        projection: string,
        projectionIndex: number,
        totalProjections: number,
    ) {
        const timestamp = Logger2D.formatLocalTimestamp(new Date());
        const lines: string[] = [];
        lines.push("");
        lines.push("=".repeat(80));
        lines.push(
            `=== [${timestamp}] projection_start projection=${projection} layout=${layoutType} ===`,
        );
        lines.push(`=== Projection ${projectionIndex}/${totalProjections}: ${projection.toUpperCase()} ===`);
        lines.push("=".repeat(80));
        lines.push("");
        this.queueText(`${lines.join("\n")}\n`);

        this.suppressTimeSeriesLogs = false;
        this.logTimeSeriesProjectionStart(projection, projectionIndex, totalProjections);
        this.suppressCursorTimeSeriesLogs = false;
        this.logCursorProjectionStart(projection, projectionIndex, totalProjections);
    }

    public finalizeStudy() {
        if (this.finalized) {
            return;
        }
        this.finalized = true;

        this.flushEndLines(true);

        const timestamp = Logger2D.formatLocalTimestamp(new Date());
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
            // No time filtering - clicks are already associated with correct trial when recorded
            if (summary.incorrectSequence.length === 0) {
                lines.push("Sequence of incorrect clicks: none");
            } else {
                lines.push("Sequence of incorrect clicks:");
                for (const entry of summary.incorrectSequence) {
                    lines.push(
                        `[${Logger2D.formatLocalTimestamp(entry.time)}] ` +
                            `user=${entry.user} pointId=${entry.pointId ?? "-"}`,
                    );
                }
            }

            if (summary.correctSequence.length === 0) {
                lines.push("Sequence of correct clicks: none");
            } else {
                lines.push("Sequence of correct clicks:");
                for (const entry of summary.correctSequence) {
                    lines.push(
                        `[${Logger2D.formatLocalTimestamp(entry.time)}] ` +
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

    public finalizeCounterbalanceStudy() {
        if (this.finalized) {
            return;
        }
        this.finalized = true;

        this.flushEndLines(true);
        this.suppressCursorTimeSeriesLogs = true;
        this.suppressTimeSeriesLogs = true;

        const timestamp = Logger2D.formatLocalTimestamp(new Date());
        const lines: string[] = [];
        lines.push(`=== [${timestamp}] study_end session=${this.sessionId} mode=counterbalance ===`);
        lines.push("");
        this.queueText(`${lines.join("\n")}\n`);
    }

    private logTimeSeriesProjectionStart(
        projection: string,
        projectionIndex: number,
        totalProjections: number,
    ) {
        const timestamp = Logger2D.formatLocalTimestamp(new Date());
        this.lastTrialKeyForTimeSeries = null;
        this.suppressTimeSeriesLogs = false;
        this.queueTimeSeries(
            `=== [${timestamp}] projection_start projection=${projection} layout=${layoutType} ` +
                `projection_index=${projectionIndex}/${totalProjections} ===\n`,
        );
    }

    private logTimeSeriesProjectionEnd(
        projection: string,
        projectionIndex: number,
        totalProjections: number,
    ) {
        const timestamp = Logger2D.formatLocalTimestamp(new Date());
        this.queueTimeSeries(
            `=== [${timestamp}] projection_end projection=${projection} layout=${layoutType} ` +
                `projection_index=${projectionIndex}/${totalProjections} ===\n\n`,
        );
        this.lastTrialKeyForTimeSeries = null;
    }

    private logCursorProjectionStart(
        projection: string,
        projectionIndex: number,
        totalProjections: number,
    ) {
        const timestamp = Logger2D.formatLocalTimestamp(new Date());
        this.lastTrialKeyForCursorTimeSeries = null;
        this.cursorTrialStartTimes.clear();
        this.suppressCursorTimeSeriesLogs = false;
        this.queueCursorTimeSeries(
            `=== [${timestamp}] projection_start projection=${projection} layout=${layoutType} ` +
                `projection_index=${projectionIndex}/${totalProjections} ===\n`,
        );
    }

    private logCursorProjectionEnd(
        projection: string,
        projectionIndex: number,
        totalProjections: number,
    ) {
        const timestamp = Logger2D.formatLocalTimestamp(new Date());
        this.queueCursorTimeSeries(
            `=== [${timestamp}] projection_end projection=${projection} layout=${layoutType} ` +
                `projection_index=${projectionIndex}/${totalProjections} ===\n\n`,
        );
        this.lastTrialKeyForCursorTimeSeries = null;
        this.cursorTrialStartTimes.clear();
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
            "cumYaw",
            "cumPitch",
        ];

        const rows = summaries.map((summary) => [
            String(summary.taskNumber),
            `${summary.trialNumber}/${summary.totalTrials}`,
            Logger2D.formatCount(summary.incorrectClicks2D),
            Logger2D.formatCount(summary.incorrectClicks3D),
            Logger2D.formatYesNo(summary.incorrectClicks2D + summary.incorrectClicks3D === 0),
            Logger2D.formatDurationMs(summary.completionMs),
            Logger2D.formatNumber(summary.cumulativeYaw),
            Logger2D.formatNumber(summary.cumulativePitch),
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
            const timestamp = Logger2D.formatLocalTimestamp(time);
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

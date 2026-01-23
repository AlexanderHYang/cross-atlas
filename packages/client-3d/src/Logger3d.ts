import { WebXRDefaultExperience } from "@babylonjs/core";
import { SyncManager3D } from "./SyncManager3D";
import { LogEvent, TimedLogEvent } from "../../shared/src/logging";

const ROTATION_SAMPLE_INTERVAL = 100; // Raw samples for time-series (10Hz)
const LOG_SEND_INTERVAL = 1000;

// Angular velocity gating parameters
const ANGULAR_VELOCITY_THRESHOLD = 15; // degrees per second
const DELTA_THRESHOLD = ANGULAR_VELOCITY_THRESHOLD * (ROTATION_SAMPLE_INTERVAL / 1000); // 1.5° at 10Hz

export type LogEvent3D = {
    eventName: string;
    eventDetails: Record<string, unknown>;
};

export class Logger3D {
    private syncManager: SyncManager3D;
    private xr: WebXRDefaultExperience;

    private localLogs: TimedLogEvent[] = [];
    private lastTrial: number | null = null;
    private loggingEnabled = false;

    // Raw rotation (for time-series)
    private currentYawDeg: number | null = null;
    private currentPitchDeg: number | null = null;

    // Previous raw values for delta computation
    private prevYawDeg: number | null = null;
    private prevPitchDeg: number | null = null;
    private prevSampleTime: number | null = null;

    // Gated cumulative rotation (for main log)
    private cumulativeYaw: number = 0;
    private cumulativePitch: number = 0;

    constructor(syncManager: SyncManager3D, xr: WebXRDefaultExperience) {
        this.syncManager = syncManager;
        this.xr = xr;

        this.beginSendingLogs();
        this.syncManager.onTaskStateChange(this.handleTaskStateChange);
        this.initializeHeadTracking();
    }

    private beginSendingLogs() {
        const logArray = this.syncManager.getLogArray();
        setInterval(() => {
            if (this.localLogs.length === 0) return;

            const batch = this.localLogs;
            this.localLogs = [];

            // single Yjs transaction for the whole batch
            logArray.doc?.transact(() => {
                logArray.push(batch);
            });
        }, LOG_SEND_INTERVAL); // flush every second
    }

    /**
     * Wrap angle delta to [-180, 180] range
     */
    private wrapDelta(delta: number): number {
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        return delta;
    }

    /**
     * Apply soft angular velocity gating:
     * If angular speed >= threshold, accumulate |delta| - deltaThreshold
     * Otherwise, accumulate 0
     */
    private computeGatedDelta(delta: number, deltaTime: number): number {
        const absDelta = Math.abs(delta);
        const angularSpeed = absDelta / deltaTime; // degrees per second

        if (angularSpeed >= ANGULAR_VELOCITY_THRESHOLD) {
            // Soft gate: subtract threshold amount
            const gatedAmount = absDelta - DELTA_THRESHOLD;
            return gatedAmount > 0 ? gatedAmount : 0;
        }
        return 0;
    }

    private initializeHeadTracking() {
        const xrCamera = this.xr.baseExperience.camera;

        // Update raw rotation on every frame
        xrCamera.onViewMatrixChangedObservable.add(() => {
            const currentQuaternion = xrCamera.rotationQuaternion;
            if (!currentQuaternion) {
                return;
            }

            const euler = currentQuaternion.toEulerAngles();
            const toDegrees = 180 / Math.PI;
            this.currentYawDeg = euler.y * toDegrees;
            this.currentPitchDeg = euler.x * toDegrees;
        });

        // Sample at fixed interval for time-series and cumulative tracking
        setInterval(() => {
            if (this.currentYawDeg === null || this.currentPitchDeg === null) {
                return;
            }

            const now = Date.now();

            // Send raw rotation sample for time-series (always when logging enabled)
            if (this.loggingEnabled) {
                const logEvent: LogEvent = {
                    user: "vr",
                    eventName: "rotationSample",
                    eventDetails: {
                        yaw: this.currentYawDeg,
                        pitch: this.currentPitchDeg,
                    },
                };
                this.addLogEvent(logEvent);

                // Compute gated cumulative rotation
                if (
                    this.prevYawDeg !== null &&
                    this.prevPitchDeg !== null &&
                    this.prevSampleTime !== null
                ) {
                    const deltaTime = (now - this.prevSampleTime) / 1000; // seconds
                    if (deltaTime > 0) {
                        // Yaw: wrap to handle ±180° boundary
                        const deltaYaw = this.wrapDelta(this.currentYawDeg - this.prevYawDeg);
                        const gatedYaw = this.computeGatedDelta(deltaYaw, deltaTime);
                        this.cumulativeYaw += gatedYaw;

                        // Pitch: no wrapping needed (usually constrained to ±90°)
                        const deltaPitch = this.currentPitchDeg - this.prevPitchDeg;
                        const gatedPitch = this.computeGatedDelta(deltaPitch, deltaTime);
                        this.cumulativePitch += gatedPitch;
                    }
                }
            }

            // Update previous values for next delta computation
            this.prevYawDeg = this.currentYawDeg;
            this.prevPitchDeg = this.currentPitchDeg;
            this.prevSampleTime = now;
        }, ROTATION_SAMPLE_INTERVAL);
    }

    private handleTaskStateChange = (taskState: { trial?: number } | null) => {
        if (!this.loggingEnabled) {
            return;
        }
        const trial = taskState?.trial ?? null;
        if (trial === null) {
            this.lastTrial = null;
            return;
        }
        if (this.lastTrial === null) {
            this.lastTrial = trial;
            return;
        }
        if (trial !== this.lastTrial) {
            this.resetCumulativeRotation();
            this.lastTrial = trial;
        }
    };

    private resetCumulativeRotation() {
        this.cumulativeYaw = 0;
        this.cumulativePitch = 0;
        this.prevYawDeg = null;
        this.prevPitchDeg = null;
        this.prevSampleTime = null;
    }

    public setLoggingEnabled(enabled: boolean) {
        if (this.loggingEnabled === enabled) {
            return;
        }
        this.loggingEnabled = enabled;
        if (enabled) {
            this.lastTrial = null;
            this.resetCumulativeRotation();
        }
    }

    public getCumulativeRotation(): { yaw: number; pitch: number } {
        return { yaw: this.cumulativeYaw, pitch: this.cumulativePitch };
    }

    public addLogEvent(logEvent: LogEvent3D) {
        const timedLogEvent: TimedLogEvent = {
            time: Date.now(),
            user: "vr",
            ...logEvent,
        };
        this.localLogs.push(timedLogEvent);
    }
}

import { Quaternion, WebXRDefaultExperience } from "@babylonjs/core";
import { SyncManager3D } from "./SyncManager3D";
import { LogEvent, TimedLogEvent } from "../../shared/src/logging";

const ROTATION_UPDATE_INTERVAL = 100;
const LOG_SEND_INTERVAL = 1000;

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

    // rotation-specific fields
    private currentYawDeg: number | null = null;
    private currentPitchDeg: number | null = null;

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

    private initializeHeadTracking() {
        // add observable to camera xr camera motion
        const xrCamera = this.xr.baseExperience.camera;
        xrCamera.onViewMatrixChangedObservable.add(() => {
            const currentQuaternion =
                xrCamera.rotationQuaternion ?? xrCamera.absoluteRotationQuaternion;
            if (!currentQuaternion) {
                return;
            }
            const euler = currentQuaternion.toEulerAngles();
            const toDegrees = 180 / Math.PI;
            const yawDeg = euler.y * toDegrees;
            const pitchDeg = euler.x * toDegrees;

            this.currentYawDeg = yawDeg;
            this.currentPitchDeg = pitchDeg;

            if (!this.loggingEnabled) {
                return;
            }
        });

        // add interval to send log periodically
        setInterval(() => {
            if (!this.loggingEnabled) {
                return;
            }
            if (this.currentYawDeg === null || this.currentPitchDeg === null) {
                return;
            }
            const logEvent: LogEvent = {
                user: "vr",
                eventName: "rotationSample",
                eventDetails: {
                    yaw: this.currentYawDeg,
                    pitch: this.currentPitchDeg,
                },
            };
            this.addLogEvent(logEvent);
        }, ROTATION_UPDATE_INTERVAL);
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
        this.currentYawDeg = null;
        this.currentPitchDeg = null;
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

    public addLogEvent(logEvent: LogEvent3D) {
        const timedLogEvent: TimedLogEvent = {
            time: Date.now(),
            user: "vr",
            ...logEvent,
        };
        this.localLogs.push(timedLogEvent);
    }
}

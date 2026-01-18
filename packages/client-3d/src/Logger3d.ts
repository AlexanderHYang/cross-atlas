import { Quaternion, WebXRDefaultExperience } from "@babylonjs/core";
import { SyncManager3D } from "./SyncManager3D";
import { LogEvent, TimedLogEvent } from "../../shared/src/logging"

const ROTATION_UPDATE_INTERVAL = 2000;
const LOG_SEND_INTERVAL = 1000;

export type LogEvent3D = {
    eventName: string,
    eventDetails: Record<string, unknown>
}

export class Logger3D {
    private syncManager: SyncManager3D
    private xr: WebXRDefaultExperience

    private localLogs: TimedLogEvent[] = []
    private lastTrial: number | null = null;

    // rotation-specific fields
    private prevCameraQuaternion: Quaternion | null = null;
    private cumulativePitch: number = 0;
    private cumulativeYaw: number = 0;

    constructor (syncManager: SyncManager3D, xr: WebXRDefaultExperience) {
        this.syncManager = syncManager
        this.xr = xr

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
            if (!this.prevCameraQuaternion) {
                this.prevCameraQuaternion = currentQuaternion.clone();
            } else {
                const delta = this.prevCameraQuaternion.conjugate().multiply(currentQuaternion);
                const euler = delta.toEulerAngles();
                const deltaPitch = Math.abs(euler.x);
                const deltaYaw = Math.abs(euler.y);
                const toDegrees = 180 / Math.PI;

                this.cumulativePitch += deltaPitch * toDegrees;
                this.cumulativeYaw += deltaYaw * toDegrees;
                this.prevCameraQuaternion = currentQuaternion.clone();
            }
        })

        // add interval to send log periodically
        setInterval(() => {
            const logEvent: LogEvent = {
                user: "vr",
                eventName: "cumulativeRotation",
                eventDetails: {
                    "cumulativePitch": this.cumulativePitch,
                    "cumulativeYaw": this.cumulativeYaw,
                }
            }
            this.addLogEvent(logEvent);
        }, ROTATION_UPDATE_INTERVAL)
    }

    private handleTaskStateChange = (taskState: { trial?: number } | null) => {
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
        this.cumulativePitch = 0;
        this.cumulativeYaw = 0;
        this.prevCameraQuaternion = null;
    }

    public addLogEvent(logEvent: LogEvent3D) {
        const timedLogEvent: TimedLogEvent = {
            time: Date.now(),
            user: "vr",
            ...logEvent
        }
        this.localLogs.push(timedLogEvent);
    }
}

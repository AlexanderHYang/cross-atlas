import { Quaternion, WebXRDefaultExperience } from "@babylonjs/core";
import { SyncManager3D } from "./SyncManager3D";
import { LogEvent, TimedLogEvent } from "../../shared/src/logging"

const ROTATION_UPDATE_INTERVAL = 1000;
const LOG_SEND_INTERVAL = 1000;

export type LogEvent3D = {
    eventName: string,
    eventDetails: Record<string, unknown>
}

export class Logger3D {
    private syncManager: SyncManager3D
    private xr: WebXRDefaultExperience

    private localLogs: TimedLogEvent[] = []

    // rotation-specific fields
    private prevCameraQuaternion: Quaternion | null = null;
    private cumulativePitch: number = 0;
    private cumulativeYaw: number = 0;

    constructor (syncManager: SyncManager3D, xr: WebXRDefaultExperience) {
        this.syncManager = syncManager
        this.xr = xr

        this.beginSendingLogs();
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
            const currentQuaternion = xrCamera.rotationQuaternion;
            if (!this.prevCameraQuaternion) {
                this.prevCameraQuaternion = currentQuaternion
            } else {
                const delta = this.prevCameraQuaternion.conjugate().multiply(currentQuaternion);
                const euler = delta.toEulerAngles();
                const deltaPitch = euler.x;
                const deltaYaw = euler.y;

                this.cumulativePitch += deltaPitch;
                this.cumulativeYaw += deltaYaw;
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

    public addLogEvent(logEvent: LogEvent3D) {
        const timedLogEvent: TimedLogEvent = {
            time: Date.now(),
            user: "vr",
            ...logEvent
        }
        this.localLogs.push(timedLogEvent);
    }
}
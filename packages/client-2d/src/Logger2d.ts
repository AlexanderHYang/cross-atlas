import { SyncManager2D } from "./SyncManager2D";
import { TimedLogEvent } from "../../shared/src/logging";

export type LogEvent2D = {
    eventName: string,
    eventDetails: Record<string, unknown>
}

export class Logger2D {
    private localLogs: TimedLogEvent[] = []
    private remoteLogs: TimedLogEvent[] = []

    private syncManager: SyncManager2D;


    constructor (syncManager: SyncManager2D) {
        this.syncManager = syncManager;
        this.beginReceivingRemoteLogs();
    }

    private beginReceivingRemoteLogs() {
        const logArray = this.syncManager.getLogArray();
        logArray.observe(event => {

            const newItems = event.changes.added; 
            if (newItems.size > 0) {
                for (const change of newItems) {
                    for (const content of change.content.getContent()) {
                        this.remoteLogs.push(content as any as TimedLogEvent);
                    }
    
                }
                logArray.delete(0, logArray.length);
            }
        });
    }

    public addLogEvent(logEvent: LogEvent2D) {
        const timedLogEvent: TimedLogEvent = {
            time: Date.now(),
            user: "pc",
            ...logEvent
        }
        this.localLogs.push(timedLogEvent);
    }
}
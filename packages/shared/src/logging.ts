export type LogEvent = {
    user: "pc" | "vr"
    // TODO: add task and trial here? Would need to know global state for this
    // task: "1" | "2" | "3"
    // trial: number
    eventName: string,
    eventDetails: Record<string, unknown>
}

export type TimedLogEvent = {
    time: number,
    user: "pc" | "vr"
    // TODO: add task and trial here? Would need to know global state for this
    // task: "1" | "2" | "3"
    // trial: number
    eventName: string,
    eventDetails: Record<string, unknown>
}
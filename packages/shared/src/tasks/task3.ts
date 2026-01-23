/**
 * Task 3: Color-Paired Collaborative Round (Trial 7)
 *
 * Both players get assigned colors to find specific points.
 * Multiple color pairs are presented in sequence.
 * Both must click their correct colored targets to advance.
 */

import type { TaskState, TaskTrial, Trial7Assignment } from "./tasks";
import type {
    TaskColorConfig2D,
    TaskColorConfig3D,
    TaskInstructionContent,
    TaskPoint2D,
    TaskPoint3D,
    TaskPointVisual2D,
    TaskSelection2DEffect,
    TaskSelection3DEffect,
} from "./tasks";
import { Color3, Vector3 } from "@babylonjs/core";

export type Trial7ColorPair = {
    key: string;
    name2D: string;
    name3D: string;
    hex2D: string;
    hex3D: string;
};

// Distinctive non-red pairs for Trial 7 color matching
export const TRIAL7_COLOR_PAIRS: Trial7ColorPair[] = [
    { key: "yellow", name2D: "Yellow", name3D: "Yellow", hex2D: "#f6c90e", hex3D: "#f6c90e" },
    { key: "green", name2D: "Green", name3D: "Green", hex2D: "#27ae60", hex3D: "#27ae60" },
    { key: "blue", name2D: "Blue", name3D: "Blue", hex2D: "#2980b9", hex3D: "#2980b9" },
    { key: "brown", name2D: "Brown", name3D: "Brown", hex2D: "#8e5b3a", hex3D: "#8e5b3a" },
    { key: "pink", name2D: "Pink", name3D: "Pink", hex2D: "#ff66c4", hex3D: "#ff66c4" },
];

export function getColorPairByKey(key: string | undefined | null) {
    if (!key) return undefined;
    return TRIAL7_COLOR_PAIRS.find((pair) => pair.key === key);
}

export const TASK3_ID = "task3";
export const TASK3_TRIAL: TaskTrial = 7;

export type Task3Trial = 7;

export function isTask3Trial(trial: TaskTrial): trial is Task3Trial {
    return trial === 7;
}

export function createTask3Assignments(
    pointIds: string[],
    pairCount: number = 5,
): Trial7Assignment[] {
    const pairs = TRIAL7_COLOR_PAIRS.slice(0, pairCount);

    if (pointIds.length < pairCount * 2) {
        console.warn("Not enough point IDs for Task 3 assignments");
        return [];
    }

    return pairs.map((pair, idx) => ({
        key: pair.key,
        point2D: pointIds[idx],
        point3D: pointIds[idx + pairCount],
        done2D: false,
        done3D: false,
        hintSide: idx % 2 === 0 ? "2d" : "3d",
    }));
}

export function createTask3State(assignments: Trial7Assignment[]): TaskState | null {
    if (assignments.length === 0) {
        return null;
    }

    const first = assignments[0];
    return {
        id: TASK3_ID,
        targetPointId2D: first.point2D,
        targetPointId3D: first.point3D,
        trial: 7,
        hintSide: first.hintSide,
        feedback: "none",
        completed: false,
        clicked2D: false,
        clicked3D: false,
        colorPairKey: first.key,
        colorPairIndex: 0,
        trial7Assignments: assignments,
    };
}

export function getNextTask3PairIndex(currentState: TaskState): number | null {
    if (!currentState.trial7Assignments) return null;

    const currentIndex = currentState.colorPairIndex ?? 0;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= currentState.trial7Assignments.length) {
        return null; // No more pairs
    }

    return nextIndex;
}

export function isTask3Complete(currentState: TaskState): boolean {
    if (!currentState.trial7Assignments || currentState.trial7Assignments.length === 0) {
        return true;
    }

    return currentState.trial7Assignments.every((entry) => entry.done2D && entry.done3D);
}

/**
 * Handles a 2D selection for Task 3
 */
export function handleTask3Selection2D(
    currentState: TaskState,
    selectedPointId: string,
): { updated: TaskState; isCorrect: boolean; shouldAdvancePair: boolean } {
    if (currentState.trial !== 7 || !currentState.trial7Assignments) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    const activeIndex = currentState.colorPairIndex ?? 0;
    const currentAssignment = currentState.trial7Assignments[activeIndex];

    if (!currentAssignment) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    // Ignore clicks on the 3D partner's target
    if (selectedPointId === currentState.targetPointId3D) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    const isCorrect = selectedPointId === currentState.targetPointId2D;

    const updatedAssignments = [...currentState.trial7Assignments];
    updatedAssignments[activeIndex] = {
        ...currentAssignment,
        done2D: isCorrect || currentAssignment.done2D,
        done3D: currentAssignment.done3D,
    };

    const pairSolved =
        updatedAssignments[activeIndex].done2D && updatedAssignments[activeIndex].done3D;

    const updated: TaskState = {
        ...currentState,
        clicked2D: isCorrect,
        clicked3D: currentState.clicked3D,
        feedback: !isCorrect ? "error" : pairSolved ? "success" : "none",
        completed: pairSolved,
        trial7Assignments: updatedAssignments,
        // Set errorPointId2D when wrong click so 3D side can show the flash
        errorPointId2D: !isCorrect ? selectedPointId : null,
        errorPointId3D: null, // Clear any previous 3D error
    };

    return { updated, isCorrect, shouldAdvancePair: pairSolved };
}

/**
 * Handles a 3D selection for Task 3
 */
export function handleTask3Selection3D(
    currentState: TaskState,
    selectedPointId: string,
): { updated: TaskState; isCorrect: boolean; shouldAdvancePair: boolean } {
    if (currentState.trial !== 7 || !currentState.trial7Assignments) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    const activeIndex = currentState.colorPairIndex ?? 0;
    const currentAssignment = currentState.trial7Assignments[activeIndex];
    if (!currentAssignment) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    // Ignore clicks on the 2D partner's target
    if (selectedPointId === currentState.targetPointId2D) {
        return { updated: currentState, isCorrect: false, shouldAdvancePair: false };
    }

    const isCorrect = selectedPointId === currentState.targetPointId3D;

    const updatedAssignments = [...currentState.trial7Assignments];
    updatedAssignments[activeIndex] = {
        ...currentAssignment,
        done2D: currentAssignment.done2D,
        done3D: isCorrect || currentAssignment.done3D,
    };

    const pairSolved =
        updatedAssignments[activeIndex].done2D && updatedAssignments[activeIndex].done3D;

    const updated: TaskState = {
        ...currentState,
        clicked3D: isCorrect,
        clicked2D: currentState.clicked2D,
        feedback: !isCorrect ? "error" : pairSolved ? "success" : "none",
        completed: pairSolved,
        trial7Assignments: updatedAssignments,
        // Set errorPointId3D when wrong click so 2D side can show the flash
        errorPointId3D: !isCorrect ? selectedPointId : null,
        errorPointId2D: null, // Clear any previous 2D error
    };

    return { updated, isCorrect, shouldAdvancePair: pairSolved };
}

/**
 * Creates the state for the next color pair in Task 3
 */
export function advanceToNextPair(currentState: TaskState): TaskState | null {
    if (!currentState.trial7Assignments) return null;

    const currentIndex = currentState.colorPairIndex ?? 0;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= currentState.trial7Assignments.length) {
        // All pairs complete - return final completed state
        return {
            ...currentState,
            feedback: "success",
            completed: true,
        };
    }

    const nextAssignment = currentState.trial7Assignments[nextIndex];
    return {
        ...currentState,
        targetPointId2D: nextAssignment.point2D,
        targetPointId3D: nextAssignment.point3D,
        colorPairKey: nextAssignment.key,
        colorPairIndex: nextIndex,
        hintSide: nextAssignment.hintSide,
        feedback: "none",
        completed: false,
        clicked2D: false,
        clicked3D: false,
        errorPointId2D: null,
        errorPointId3D: null,
    };
}

const DEFAULT_VISUAL_2D: TaskPointVisual2D = {
    isTarget: false,
    hideColor: false,
    overrideColor: null,
    glowColor: null,
};

function hexToVector3(hex: string): Vector3 {
    const trimmed = hex.replace("#", "");
    const bigint = Number.parseInt(trimmed, 16);
    return new Vector3(
        ((bigint >> 16) & 255) / 255,
        ((bigint >> 8) & 255) / 255,
        (bigint & 255) / 255,
    );
}

function hexToColor3(hex: string): Color3 {
    return Color3.FromHexString(hex);
}

function vectorToCssRgb(color: Vector3): string {
    const r = Math.round(Math.min(1, Math.max(0, color.x)) * 255);
    const g = Math.round(Math.min(1, Math.max(0, color.y)) * 255);
    const b = Math.round(Math.min(1, Math.max(0, color.z)) * 255);
    return `rgb(${r}, ${g}, ${b})`;
}

function getActiveAssignment(taskState: TaskState | null) {
    const activeIndex = taskState?.colorPairIndex ?? 0;
    const activeAssignment = taskState?.trial7Assignments?.[activeIndex];
    return { activeIndex, activeAssignment };
}

export function getTask3PointVisual2D(
    taskState: TaskState | null,
    pointId: string,
): TaskPointVisual2D {
    if (!taskState || taskState.trial !== 7) {
        return DEFAULT_VISUAL_2D;
    }

    const { activeAssignment } = getActiveAssignment(taskState);
    const pair = activeAssignment ? getColorPairByKey(activeAssignment.key) : null;
    const pairSolved = !!activeAssignment && activeAssignment.done2D && activeAssignment.done3D;

    if (!pairSolved && pair && activeAssignment && pointId === activeAssignment.point3D) {
        return {
            isTarget: taskState.targetPointId2D === pointId,
            hideColor: false,
            overrideColor: hexToVector3(pair.hex3D),
            glowColor: hexToVector3(pair.hex3D),
        };
    }

    const solvedAssignment = taskState.trial7Assignments?.find(
        (entry) => entry.done2D && entry.done3D && entry.point3D === pointId,
    );
    if (solvedAssignment) {
        const solvedPair = getColorPairByKey(solvedAssignment.key);
        if (solvedPair) {
            const solvedColor = hexToVector3(solvedPair.hex3D);
            return {
                isTarget: taskState.targetPointId2D === pointId,
                hideColor: false,
                overrideColor: solvedColor,
                glowColor: solvedColor,
            };
        }
    }

    return {
        isTarget: taskState.targetPointId2D === pointId,
        hideColor: false,
        overrideColor: null,
        glowColor: null,
    };
}

export function evaluateTask3Selection2D(
    taskState: TaskState | null,
    selectedPointId: string,
    colors: TaskColorConfig2D,
): TaskSelection2DEffect {
    if (!taskState || taskState.trial !== 7 || taskState.completed) {
        return { handled: false };
    }

    if (!taskState.targetPointId2D) {
        return { handled: false };
    }

    if (selectedPointId === taskState.targetPointId3D) {
        return { handled: false };
    }

    const alreadySolved =
        taskState.trial7Assignments?.some(
            (entry) =>
                entry.done2D &&
                entry.done3D &&
                (entry.point2D === selectedPointId || entry.point3D === selectedPointId),
        ) ?? false;
    if (alreadySolved) {
        return { handled: false };
    }

    const { activeAssignment } = getActiveAssignment(taskState);
    const pairKey = activeAssignment?.key ?? taskState.colorPairKey;
    const pair = pairKey ? getColorPairByKey(pairKey) : null;
    const ownColor = pair ? hexToVector3(pair.hex2D) : colors.success;

    const isCorrect = selectedPointId === taskState.targetPointId2D;
    return {
        handled: true,
        isCorrect,
        successColor: ownColor,
        errorColor: colors.error,
        lockOnSuccess: isCorrect,
        revertToBaseAfterError: true,
        errorFlashDurationMs: 1500,
    };
}

export function evaluateTask3Selection3D(
    taskState: TaskState | null,
    selectedPointId: string,
    colors: TaskColorConfig3D,
): TaskSelection3DEffect {
    if (!taskState || taskState.trial !== 7 || taskState.completed) {
        return { handled: false };
    }

    if (!taskState.targetPointId3D) {
        return { handled: false };
    }

    if (selectedPointId === taskState.targetPointId2D) {
        return { handled: false };
    }

    const { activeAssignment } = getActiveAssignment(taskState);
    const pairKey = activeAssignment?.key ?? taskState.colorPairKey;
    const pair = pairKey ? getColorPairByKey(pairKey) : null;
    const ownColor = pair ? hexToColor3(pair.hex3D) : colors.success;

    const isCorrect = selectedPointId === taskState.targetPointId3D;
    return {
        handled: true,
        isCorrect,
        successColor: ownColor,
        errorColor: colors.error,
        lockOnSuccess: isCorrect,
        flashDurationMs: 1500,
        stateUpdate: "task3",
    };
}

export function getTask3Instruction(taskState: TaskState | null): TaskInstructionContent {
    if (!taskState || taskState.trial !== 7) {
        return { visible: false, text: "" };
    }

    const { activeAssignment } = getActiveAssignment(taskState);
    const pair = getColorPairByKey(activeAssignment?.key ?? taskState.colorPairKey);
    if (pair) {
        const baseColor = hexToVector3(pair.hex2D);
        const colorWord = `<span style="color:${vectorToCssRgb(baseColor)};font-weight:bold;">${pair.name2D}</span>`;
        return {
            visible: true,
            html: `Find the ${colorWord} sphere`,
        };
    }

    return {
        visible: true,
        text: "Match the instructed colors",
    };
}

function createPointMap<T extends { id: string }>(points: Iterable<T>): Map<string, T> {
    const map = new Map<string, T>();
    for (const p of points) {
        map.set(p.id, p);
    }
    return map;
}

export function applyCompletedTrial7Pairs2D(
    taskState: TaskState | null,
    points: Iterable<TaskPoint2D>,
) {
    if (!taskState || taskState.trial !== 7 || !taskState.trial7Assignments) return;

    const pointMap = createPointMap(points);
    for (const entry of taskState.trial7Assignments) {
        const fullySolved = entry.done2D && entry.done3D;
        if (!fullySolved) continue;

        const point = pointMap.get(entry.point2D);
        const partnerPoint = pointMap.get(entry.point3D);
        const pair = getColorPairByKey(entry.key);

        if (point && pair) {
            const color = hexToVector3(pair.hex2D);
            point.setBaseColor(color);
            point.setDisplayColor(color);
            point.setSelectable(false);
        }
        if (partnerPoint && pair) {
            const partnerColor = hexToVector3(pair.hex3D);
            partnerPoint.setBaseColor(partnerColor);
            partnerPoint.setDisplayColor(partnerColor);
            partnerPoint.setSelectable(false);
        }
    }
}

export function applyCompletedTrial7Pairs3D(
    taskState: TaskState | null,
    points: Iterable<TaskPoint3D>,
) {
    if (!taskState || taskState.trial !== 7 || !taskState.trial7Assignments) return;

    const pointMap = createPointMap(points);
    for (const entry of taskState.trial7Assignments) {
        const fullySolved = entry.done2D && entry.done3D;
        if (!fullySolved) continue;

        const point = pointMap.get(entry.point3D);
        const partnerPoint = pointMap.get(entry.point2D);
        const pair = getColorPairByKey(entry.key);
        if (point && pair) {
            point.clearLocalOverrideColor();
            const color = hexToColor3(pair.hex3D);
            point.setPermanentColor(color);
            point.setSelectable(false);
        }
        if (partnerPoint && pair) {
            partnerPoint.clearLocalOverrideColor();
            const partnerColor = hexToColor3(pair.hex2D);
            partnerPoint.setPermanentColor(partnerColor);
            partnerPoint.setSelectable(false);
        }
    }
}

export function setTrial7Selectability2D(
    taskState: TaskState | null,
    points: Iterable<TaskPoint2D>,
) {
    if (!taskState || taskState.trial !== 7 || !taskState.trial7Assignments) return;

    const solvedIds = new Set<string>();
    for (const entry of taskState.trial7Assignments) {
        if (entry.done2D && entry.done3D) {
            solvedIds.add(entry.point2D);
        }
    }

    for (const p of points) {
        if (solvedIds.has(p.id)) {
            p.setSelectable(false);
        } else {
            p.setSelectable(true);
        }
    }
}

export function setTrial7Selectability3D(
    taskState: TaskState | null,
    points: Iterable<TaskPoint3D>,
) {
    if (!taskState || taskState.trial !== 7 || !taskState.trial7Assignments) return;

    const pointMap = createPointMap(points);
    for (const entry of taskState.trial7Assignments) {
        const vrTarget = pointMap.get(entry.point3D);
        const pcHintSphere = pointMap.get(entry.point2D);
        const solved = entry.done2D && entry.done3D;

        vrTarget?.setSelectable(!solved);
        pcHintSphere?.setSelectable(!solved);
    }
}

function clearLocalHints(pointsById: Map<string, TaskPoint3D>) {
    for (const p of pointsById.values()) {
        p.clearLocalOverrideColor();
    }
}

export function applyTask3Visuals2D(taskState: TaskState | null, points: Iterable<TaskPoint2D>) {
    applyCompletedTrial7Pairs2D(taskState, points);
    setTrial7Selectability2D(taskState, points);
}

export function applyTask3Visuals3D(
    taskState: TaskState | null,
    pointsById: Map<string, TaskPoint3D>,
    colors: TaskColorConfig3D,
    flashingPointId: string | null,
) {
    if (!taskState || taskState.trial !== 7) {
        return;
    }

    const { activeAssignment } = getActiveAssignment(taskState);
    const activePair = activeAssignment ? getColorPairByKey(activeAssignment.key) : null;
    const activeSolved = !!activeAssignment && activeAssignment.done2D && activeAssignment.done3D;

    if (!flashingPointId) {
        clearLocalHints(pointsById);
    }

    setTrial7Selectability3D(taskState, pointsById.values());

    if (activeAssignment && activePair && !activeSolved) {
        const partnerPoint = pointsById.get(activeAssignment.point2D);
        partnerPoint?.setLocalOverrideColor(hexToColor3(activePair.hex2D));
    }

    applyCompletedTrial7Pairs3D(taskState, pointsById.values());
}

export function processTrial7ErrorFlash2D(
    taskState: TaskState | null,
    points: Iterable<TaskPoint2D>,
    errorColor: Vector3,
    lastProcessedErrorPointId: string | null,
): string | null {
    if (!taskState || taskState.trial !== 7) {
        return lastProcessedErrorPointId;
    }

    const pointMap = createPointMap(points);
    if (taskState.errorPointId3D && taskState.errorPointId3D !== lastProcessedErrorPointId) {
        const errorPoint = pointMap.get(taskState.errorPointId3D);
        errorPoint?.flashColorSync(errorColor, 1500);
        return taskState.errorPointId3D;
    }

    if (!taskState.errorPointId3D) {
        return null;
    }

    return lastProcessedErrorPointId;
}

export function processTrial7ErrorFlash3D(
    taskState: TaskState | null,
    points: Map<string, TaskPoint3D>,
    errorColor: Color3,
    lastProcessedErrorPointId: string | null,
): string | null {
    if (!taskState || taskState.trial !== 7) {
        return lastProcessedErrorPointId;
    }

    if (taskState.errorPointId2D && taskState.errorPointId2D !== lastProcessedErrorPointId) {
        const errorPoint = points.get(taskState.errorPointId2D);
        errorPoint?.flashColorSynced(errorColor, 1500);
        return taskState.errorPointId2D;
    }

    if (!taskState.errorPointId2D) {
        return null;
    }

    return lastProcessedErrorPointId;
}

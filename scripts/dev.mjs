#!/usr/bin/env node
/**
 * Launches the full development environment (cert generation + Yjs + 2D + 3D)
 * in a single terminal window and shuts everything down on Ctrl+C.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const certDir = join(root, "certs");
const certPath = join(certDir, "cert.pem");
const keyPath = join(certDir, "key.pem");
const scriptsDir = join(root, "scripts");
const yjsScript = join(scriptsDir, "yws-ssl-server.mjs");
const generateCertsScript = join(scriptsDir, "generate-certs.mjs");
const viteBin = join(root, "node_modules", "vite", "bin", "vite.js");
const vite2dConfig = join(root, "packages", "client-2d", "vite.config.ts");
const vite3dConfig = join(root, "packages", "client-3d", "vite.config.ts");

const launchedProcesses = [];
let shuttingDown = false;

async function ensureCertificates() {
    if (existsSync(certPath) && existsSync(keyPath)) {
        return;
    }

    console.log("TLS certificates not found. Running generate-certs...");
    await runOneOff(process.execPath, [generateCertsScript], "generate-certs");
}

async function runOneOff(command, args, label) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: "inherit",
            env: process.env,
            shell: false,
        });

        child.on("exit", (code, signal) => {
            if (code === 0 && !signal) {
                resolve();
            } else {
                reject(
                    new Error(
                        `[${label}] exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
                    ),
                );
            }
        });

        child.on("error", (error) => {
            reject(error);
        });
    });
}

function startService(label, command, args, extraEnv = {}) {
    console.log(`Starting ${label}...`);

    let resolveExit;
    const exitPromise = new Promise((resolve) => {
        resolveExit = resolve;
    });

    const child = spawn(command, args, {
        stdio: "inherit",
        env: { ...process.env, ...extraEnv },
        shell: false,
    });

    const record = { label, child, exitPromise };
    launchedProcesses.push(record);

    child.on("exit", (code, signal) => {
        resolveExit();
        const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
        console.log(`[${label}] exited (${reason}).`);

        if (!shuttingDown) {
            shutdown(`service ${label} exited`, typeof code === "number" ? code : 1);
        }
    });

    child.on("error", (error) => {
        resolveExit();
        console.error(`[${label}] failed to start:`, error);
        if (!shuttingDown) {
            shutdown(`failed to start ${label}`, 1);
        }
    });

    return record;
}

function shutdown(trigger, exitCode = 0) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    console.log(`\nStopping dev environment (${trigger})...`);

    for (const { child, label } of launchedProcesses) {
        if (child.exitCode !== null || child.signalCode !== null) {
            continue;
        }
        console.log(`Sending SIGINT to ${label}...`);
        child.kill("SIGINT");

        const termTimer = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
                console.log(`Forcing SIGTERM to ${label}...`);
                child.kill("SIGTERM");
            }
        }, 2000);
        termTimer.unref?.();
    }

    const allExits = Promise.allSettled(launchedProcesses.map((proc) => proc.exitPromise));

    allExits.finally(() => {
        process.exit(exitCode);
    });

    const hardExitTimer = setTimeout(() => {
        process.exit(exitCode);
    }, 5000);
    hardExitTimer.unref?.();
}

process.on("SIGINT", () => shutdown("SIGINT", 0));
process.on("SIGTERM", () => shutdown("SIGTERM", 0));

function parseArguments() {
    const args = process.argv.slice(2);
    const envVars = {};

    const allowedProjections = new Set(["equirectangular", "pca", "vertical", "horizontal"]);
    const allowedLayouts = new Set(["spherical", "semiSpherical", "planar"]);
    const allowedCounterbalance = new Set(["1", "2", "3", "4"]);
    let tasksArg;
    let calibrationOrientationArg;
    let layoutArg;
    let randomSelectionArg;
    let counterbalanceArg;
    let trainingArg;

    for (const arg of args) {
        // parse --projection option
        if (arg.startsWith("--projection=")) {
            const projection = arg.split("=")[1];
            if (allowedProjections.has(projection)) {
                envVars["VITE_PROJECTION"] = projection;
            } else {
                console.error(
                    `Invalid --projection=${projection}. Allowed: ${[...allowedProjections].join(
                        ", ",
                    )}`,
                );
                process.exit(1);
            }
        }

        if (arg.startsWith("--layout=") || arg.startsWith("--layout-type=")) {
            const layout = arg.split("=")[1];
            if (allowedLayouts.has(layout)) {
                layoutArg = layout;
            } else {
                console.error(
                    `Invalid --layout=${layout}. Allowed: ${[...allowedLayouts].join(", ")}`,
                );
                process.exit(1);
            }
        }

        if (arg.startsWith("--tasks=") || arg.startsWith("tasks=")) {
            tasksArg = arg.split("=")[1];
        }

        if (arg.startsWith("--task=") || arg.startsWith("task=")) {
            tasksArg = arg.split("=")[1];
        }

        if (
            arg.startsWith("--require-calibration-orientation=") ||
            arg.startsWith("require-calibration-orientation=") ||
            arg.startsWith("--calibration-orientation=") ||
            arg.startsWith("calibration-orientation=")
        ) {
            calibrationOrientationArg = arg.split("=")[1];
        }

        if (arg.startsWith("--random-selection=")) {
            randomSelectionArg = arg.split("=")[1];
        }

        if (arg.startsWith("--counterbalance=") || arg.startsWith("--cb=")) {
            const cb = arg.split("=")[1];
            if (allowedCounterbalance.has(cb)) {
                counterbalanceArg = cb;
            } else {
                console.error(`Invalid --counterbalance=${cb}. Allowed: 1, 2, 3, 4`);
                process.exit(1);
            }
        }

        if (arg === "--training" || arg === "training" || arg.startsWith("--training=")) {
            const value = arg.includes("=") ? arg.split("=")[1] : "true";
            trainingArg = value;
        }
    }

    const envTasks =
        tasksArg ??
        process.env.VITE_TASKS ??
        process.env.TASKS ??
        process.env.TASK ??
        process.env.tasks ??
        process.env.task ??
        process.env.npm_config_tasks ??
        process.env.npm_config_task;
    if (envTasks) {
        envVars["VITE_TASKS"] = envTasks;
    }

    const envCalibrationOrientation =
        calibrationOrientationArg ??
        process.env.VITE_REQUIRE_CALIBRATION_ORIENTATION ??
        process.env.REQUIRE_CALIBRATION_ORIENTATION ??
        process.env.require_calibration_orientation ??
        process.env.npm_config_require_calibration_orientation ??
        process.env.npm_config_calibration_orientation;
    if (envCalibrationOrientation !== undefined) {
        envVars["VITE_REQUIRE_CALIBRATION_ORIENTATION"] = envCalibrationOrientation;
    }

    const envLayout =
        layoutArg ??
        process.env.VITE_LAYOUT_TYPE ??
        process.env.VITE_LAYOUT ??
        process.env.LAYOUT_TYPE ??
        process.env.layout_type ??
        process.env.npm_config_layout_type ??
        process.env.npm_config_layout;
    if (envLayout !== undefined) {
        envVars["VITE_LAYOUT_TYPE"] = envLayout;
    }

    const envRandomSelection =
        randomSelectionArg ??
        process.env.VITE_RANDOM_SELECTION ??
        process.env.RANDOM_SELECTION ??
        process.env.random_selection ??
        process.env.npm_config_random_selection;
    if (envRandomSelection !== undefined) {
        envVars["VITE_RANDOM_SELECTION"] = envRandomSelection;
    }

    const envCounterbalance =
        counterbalanceArg ??
        process.env.VITE_COUNTERBALANCE ??
        process.env.COUNTERBALANCE ??
        process.env.counterbalance ??
        process.env.npm_config_counterbalance;
    if (envCounterbalance !== undefined) {
        envVars["VITE_COUNTERBALANCE"] = envCounterbalance;
    }

    const envTraining =
        trainingArg ??
        process.env.VITE_TRAINING_MODE ??
        process.env.TRAINING_MODE ??
        process.env.training_mode ??
        process.env.npm_config_training_mode;
    if (envTraining !== undefined) {
        envVars["VITE_TRAINING_MODE"] = envTraining;
    }

    return envVars;
}

async function main() {
    try {
        await ensureCertificates();
    } catch (error) {
        console.error("Failed to ensure certificates:", error);
        process.exit(1);
    }

    const additionalEnv = parseArguments();

    startService("yjs", process.execPath, [yjsScript]);

    // Slight delay to give Yjs time to bind the port before clients start.
    await delay(300);

    startService("client-2d", process.execPath, [viteBin, "--config", vite2dConfig], additionalEnv);

    startService("client-3d", process.execPath, [viteBin, "--config", vite3dConfig], additionalEnv);

    console.log("\nAll services launched. Press Ctrl+C to stop them all together.\n");

    // Keep the process alive until shutdown is triggered.
    await new Promise(() => {});
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
    console.error("Failed to start dev environment:", error);
    shutdown("startup failure", 1);
});

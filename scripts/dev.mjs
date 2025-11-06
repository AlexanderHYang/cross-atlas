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
            `[${label}] exited with ${signal ? `signal ${signal}` : `code ${code}`}`
          )
        );
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

function startService(label, command, args) {
  console.log(`Starting ${label}...`);

  let resolveExit;
  const exitPromise = new Promise((resolve) => {
    resolveExit = resolve;
  });

  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  const record = { label, child, exitPromise };
  launchedProcesses.push(record);

  child.on("exit", (code, signal) => {
    resolveExit();
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.log(`[${label}] exited (${reason}).`);

    if (!shuttingDown) {
      shutdown(
        `service ${label} exited`,
        typeof code === "number" ? code : 1
      );
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

  const allExits = Promise.allSettled(
    launchedProcesses.map((proc) => proc.exitPromise)
  );

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

async function main() {
  try {
    await ensureCertificates();
  } catch (error) {
    console.error("Failed to ensure certificates:", error);
    process.exit(1);
  }

  startService("yjs", process.execPath, [yjsScript]);

  // Slight delay to give Yjs time to bind the port before clients start.
  await delay(300);

  startService("client-2d", process.execPath, [
    viteBin,
    "--config",
    vite2dConfig,
  ]);

  startService("client-3d", process.execPath, [
    viteBin,
    "--config",
    vite3dConfig,
  ]);

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

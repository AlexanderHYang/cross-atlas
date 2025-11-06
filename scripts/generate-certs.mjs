#!/usr/bin/env node
// Generate self-signed SSL certificates for local development

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const certsDir = join(__dirname, "..", "certs");

if (!existsSync(certsDir)) {
  mkdirSync(certsDir, { recursive: true });
}

const certPath = join(certsDir, "cert.pem");
const keyPath = join(certsDir, "key.pem");

if (existsSync(certPath) && existsSync(keyPath)) {
  console.log("SSL certificates already exist:");
  console.log(`  Certificate: ${certPath}`);
  console.log(`  Private Key: ${keyPath}`);
  process.exit(0);
}

console.log("Generating self-signed SSL certificates...");

const openssl = spawn(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "365",
    "-nodes",
    "-subj",
    "/C=US/ST=State/L=City/O=CrossDash/CN=localhost",
  ],
  { stdio: "inherit" }
);

openssl.on("close", (code) => {
  if (code === 0) {
    console.log("✅ SSL certificates generated successfully!");
    console.log(`  Certificate: ${certPath}`);
    console.log(`  Private Key: ${keyPath}`);
    console.log("\nYou can now start the Yjs server with SSL support.");
  } else {
    console.error("❌ Failed to generate SSL certificates.");
    console.error("Ensure OpenSSL is installed on your system.");
    process.exit(1);
  }
});

openssl.on("error", (error) => {
  console.error("❌ Error running OpenSSL:", error.message);
  console.error("Ensure OpenSSL is installed on your system.");
  process.exit(1);
});

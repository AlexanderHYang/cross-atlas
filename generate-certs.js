#!/usr/bin/env node
// Generate self-signed SSL certificates for local development

import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const certsDir = join(__dirname, "certs");

// Create certs directory if it doesn't exist
if (!existsSync(certsDir)) {
    mkdirSync(certsDir);
}

const certPath = join(certsDir, "cert.pem");
const keyPath = join(certsDir, "key.pem");

// Check if certificates already exist
if (existsSync(certPath) && existsSync(keyPath)) {
    console.log("SSL certificates already exist at:");
    console.log(`  Certificate: ${certPath}`);
    console.log(`  Private Key: ${keyPath}`);
    process.exit(0);
}

console.log("Generating self-signed SSL certificates...");

// Generate self-signed certificate using OpenSSL
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
        "/C=US/ST=State/L=City/O=Organization/CN=localhost",
    ],
    { stdio: "inherit" }
);

openssl.on("close", (code) => {
    if (code === 0) {
        console.log("✅ SSL certificates generated successfully!");
        console.log(`  Certificate: ${certPath}`);
        console.log(`  Private Key: ${keyPath}`);
        console.log("\nYou can now start the signaling server with SSL support.");
    } else {
        console.error("❌ Failed to generate SSL certificates.");
        console.error("Make sure OpenSSL is installed on your system.");
        console.error("On macOS, you can install it with: brew install openssl");
        process.exit(1);
    }
});

openssl.on("error", (error) => {
    console.error("❌ Error running OpenSSL:", error.message);
    console.error("Make sure OpenSSL is installed on your system.");
    console.error("On macOS, you can install it with: brew install openssl");
    process.exit(1);
});

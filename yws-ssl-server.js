#!/usr/bin/env node
// WSS wrapper for y-websocket server using SSL certificates

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "https";
import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import { networkInterfaces } from "os";
import * as Y from "yjs";
import * as encoding from "lib0/encoding.js";
import * as decoding from "lib0/decoding.js";
import * as syncProtocol from "y-protocols/sync.js";
import * as awarenessProtocol from "y-protocols/awareness.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 4444;

// Get local IP address dynamically
function getLocalIpAddress() {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal and non-IPv4 addresses
            if (!iface.internal && iface.family === "IPv4") {
                return iface.address;
            }
        }
    }
    return "localhost";
}

// Try to load SSL certificates
const certPath = join(__dirname, "certs", "cert.pem");
const keyPath = join(__dirname, "certs", "key.pem");

let server;
let useSSL = false;

if (existsSync(certPath) && existsSync(keyPath)) {
    try {
        const cert = readFileSync(certPath);
        const key = readFileSync(keyPath);
        server = createServer({ cert, key });
        useSSL = true;
        console.log("Using SSL certificates for WSS");
    } catch (error) {
        console.log("Failed to load SSL certificates, falling back to HTTP");
        server = createHttpServer();
    }
} else {
    console.log("SSL certificates not found, using HTTP (run: npm run generate-certs)");
    server = createHttpServer();
}

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store documents and awareness by room name
const docs = new Map();
const conns = new Map();

// Proper y-websocket protocol implementation
wss.on("connection", (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomname = url.pathname.slice(1) || "crossdash-room";

    console.log(`Client connected to room: ${roomname}`);

    // Get or create document and awareness for this room
    if (!docs.has(roomname)) {
        docs.set(roomname, new Y.Doc());
        conns.set(roomname, new Map());
    }
    const doc = docs.get(roomname);
    const roomConns = conns.get(roomname);

    // Create awareness instance for this connection
    const awareness = new awarenessProtocol.Awareness(doc);

    // Store connection info
    roomConns.set(ws, { awareness });

    // Send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // messageType = sync
    syncProtocol.writeSyncStep1(encoder, doc);
    ws.send(encoding.toUint8Array(encoder));

    // Send current awareness state
    if (awareness.getStates().size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, 1); // messageType = awareness
        encoding.writeVarUint8Array(
            awarenessEncoder,
            awarenessProtocol.encodeAwarenessUpdate(
                awareness,
                Array.from(awareness.getStates().keys())
            )
        );
        ws.send(encoding.toUint8Array(awarenessEncoder));
    }

    ws.on("message", (message) => {
        try {
            const uint8Array = new Uint8Array(message);
            const decoder = decoding.createDecoder(uint8Array);
            const messageType = decoding.readVarUint(decoder);

            switch (messageType) {
                case 0: // sync
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, 0);
                    const syncMessageType = syncProtocol.readSyncMessage(
                        decoder,
                        encoder,
                        doc,
                        null
                    );
                    if (encoding.length(encoder) > 1) {
                        ws.send(encoding.toUint8Array(encoder));
                    }
                    // Broadcast sync to other clients
                    broadcastToRoom(roomname, uint8Array, ws);
                    break;

                case 1: // awareness
                    awarenessProtocol.applyAwarenessUpdate(
                        awareness,
                        decoding.readVarUint8Array(decoder),
                        null
                    );
                    broadcastToRoom(roomname, uint8Array, ws);
                    break;

                default:
                    console.warn("Unknown message type:", messageType);
            }
        } catch (error) {
            console.error("Error processing message:", error);
        }
    });

    ws.on("close", () => {
        console.log(`Client disconnected from room: ${roomname}`);
        if (roomConns.has(ws)) {
            roomConns.delete(ws);
            if (roomConns.size === 0) {
                docs.delete(roomname);
                conns.delete(roomname);
            }
        }
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
    });
});

function broadcastToRoom(roomname, message, excludeWs) {
    if (!conns.has(roomname)) return;

    const roomConns = conns.get(roomname);
    roomConns.forEach((connInfo, ws) => {
        if (ws !== excludeWs && ws.readyState === ws.OPEN) {
            try {
                ws.send(message);
            } catch (error) {
                console.error("Error broadcasting message:", error);
                roomConns.delete(ws);
            }
        }
    });
}

// Add HTTP handler for testing/verification
server.on("request", (req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>CrossDash y-websocket Server</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .status { color: #28a745; font-weight: bold; }
                .info { margin: 20px 0; padding: 15px; background: #e9ecef; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>CrossDash y-websocket Server</h1>
                <p class="status">Server is running!</p>
                <div class="info">
                    <h3>Connection Information:</h3>
                    <p><strong>Protocol:</strong> ${useSSL ? "WSS (Secure)" : "WS (Insecure)"}</p>
                    <p><strong>Local:</strong> ${useSSL ? "wss" : "ws"}://localhost:${PORT}/</p>
                    <p><strong>Network:</strong> ${
                        useSSL ? "wss" : "ws"
                    }://${getLocalIpAddress()}:${PORT}/</p>
                    <p><strong>Active Rooms:</strong> ${docs.size}</p>
                </div>
                <p>Your CrossDash application can now sync via this y-websocket server.</p>
            </div>
        </body>
        </html>
    `);
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
    const protocol = useSSL ? "wss" : "ws";
    const localIp = getLocalIpAddress();
    console.log("=".repeat(60));
    console.log("CrossDash y-websocket Server Started");
    console.log("=".repeat(60));
    console.log(`Local access: ${protocol}://localhost:${PORT}/`);
    console.log(`Network access: ${protocol}://${localIp}:${PORT}/`);
    console.log(`SSL enabled: ${useSSL}`);
    console.log("=".repeat(60));
    console.log("Waiting for connections...");
});

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\nShutting down y-websocket server...");
    wss.close(() => {
        server.close(() => {
            console.log("Server closed");
            process.exit(0);
        });
    });
});

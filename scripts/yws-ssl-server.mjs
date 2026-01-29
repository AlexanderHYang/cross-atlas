#!/usr/bin/env node
// HTTPS / WSS wrapper for the Yjs websocket server

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { networkInterfaces } from "node:os";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding.js";
import * as decoding from "lib0/decoding.js";
import * as syncProtocol from "y-protocols/sync.js";
import * as awarenessProtocol from "y-protocols/awareness.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOST = process.env.HOST?.trim() || "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT ?? "1234", 10);
const MAX_TOTAL_CLIENTS = Number.parseInt(
  process.env.MAX_CLIENTS ?? "2",
  10
);
const MAX_ROOM_CLIENTS = Number.parseInt(
  process.env.MAX_ROOM_CLIENTS ?? String(MAX_TOTAL_CLIENTS),
  10
);
const ENFORCE_CLIENT_TYPES =
  (process.env.ENFORCE_CLIENT_TYPES ?? "true").trim().toLowerCase() !== "false";

const VALID_CLIENT_TYPES = new Set(["2d", "3d"]);

function getLocalIpAddress() {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) {
      continue;
    }
    for (const entry of entries) {
      if (!entry.internal && entry.family === "IPv4") {
        return entry.address;
      }
    }
  }
  return "127.0.0.1";
}

const certPath = join(__dirname, "..", "certs", "cert.pem");
const keyPath = join(__dirname, "..", "certs", "key.pem");

let server;
let useSSL = false;

if (existsSync(certPath) && existsSync(keyPath)) {
  try {
    const cert = readFileSync(certPath);
    const key = readFileSync(keyPath);
    server = createHttpsServer({ cert, key });
    useSSL = true;
    console.log("Using SSL certificates for WSS connections.");
  } catch (error) {
    console.warn("Failed to load SSL certificates, falling back to HTTP.", error);
    server = createHttpServer();
  }
} else {
  console.warn(
    "SSL certificates not found, using HTTP (run `npm run generate-certs` for self-signed certs)."
  );
  server = createHttpServer();
}

const wss = new WebSocketServer({ server });

const docs = new Map();
const connectionsByRoom = new Map();

wss.on("error", handleFatalServerError);
server.on("error", handleFatalServerError);

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const room = url.pathname.slice(1) || "crossdash-room";
  const clientType = url.searchParams.get("client")?.toLowerCase() ?? "";

  if (!docs.has(room)) {
    docs.set(room, new Y.Doc());
    connectionsByRoom.set(room, new Map());
  }

  const doc = docs.get(room);
  const roomConns = connectionsByRoom.get(room);
  const awareness = new awarenessProtocol.Awareness(doc);

  const totalClients = Array.from(connectionsByRoom.values()).reduce(
    (acc, map) => acc + map.size,
    0
  );
  if (ENFORCE_CLIENT_TYPES) {
    if (!VALID_CLIENT_TYPES.has(clientType)) {
      ws.close(1008, "Invalid client type");
      console.warn(
        `Rejected client for room "${room}" (invalid client type "${clientType || "none"}").`
      );
      return;
    }
    const hasSameType = Array.from(roomConns.values()).some(
      (info) => info.clientType === clientType
    );
    if (hasSameType) {
      ws.close(1008, `Client type "${clientType}" already connected`);
      console.warn(
        `Rejected client for room "${room}" (duplicate client type "${clientType}").`
      );
      return;
    }
  }
  if (
    Number.isFinite(MAX_TOTAL_CLIENTS) &&
    totalClients >= MAX_TOTAL_CLIENTS
  ) {
    ws.close(1008, "Server at capacity");
    console.warn(
      `Rejected client for room "${room}" (total capacity ${MAX_TOTAL_CLIENTS}).`
    );
    return;
  }
  if (
    Number.isFinite(MAX_ROOM_CLIENTS) &&
    roomConns.size >= MAX_ROOM_CLIENTS
  ) {
    ws.close(1008, "Room at capacity");
    console.warn(
      `Rejected client for room "${room}" (room capacity ${MAX_ROOM_CLIENTS}).`
    );
    return;
  }

  roomConns.set(ws, { awareness, clientType: clientType || "unknown" });
  const remoteAddress = req.socket?.remoteAddress ?? "unknown";
  const remotePort = req.socket?.remotePort ? `:${req.socket.remotePort}` : "";
  const totalClientsAfter = Array.from(connectionsByRoom.values()).reduce(
    (acc, map) => acc + map.size,
    0
  );
  console.log(
    `Client connected (${clientType || "unknown"}) from ${remoteAddress}${remotePort} ` +
      `-> room "${room}". Room count: ${roomConns.size}, total clients: ${totalClientsAfter}.`
  );

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder));

  if (awareness.getStates().size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, 1);
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
      const asUint8 = new Uint8Array(message);
      const decoder = decoding.createDecoder(asUint8);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case 0: {
          const replyEncoder = encoding.createEncoder();
          encoding.writeVarUint(replyEncoder, 0);
          syncProtocol.readSyncMessage(decoder, replyEncoder, doc, null);
          if (encoding.length(replyEncoder) > 1) {
            ws.send(encoding.toUint8Array(replyEncoder));
          }
          broadcast(room, asUint8, ws);
          break;
        }
        case 1: {
          awarenessProtocol.applyAwarenessUpdate(
            awareness,
            decoding.readVarUint8Array(decoder),
            null
          );
          broadcast(room, asUint8, ws);
          break;
        }
        default: {
          console.warn("Unknown message type received:", messageType);
        }
      }
    } catch (error) {
      console.error("Error processing websocket message:", error);
    }
  });

  ws.on("close", () => {
    const roomConnections = connectionsByRoom.get(room);
    if (!roomConnections) {
      return;
    }
    const info = roomConnections.get(ws);
    roomConnections.delete(ws);
    if (roomConnections.size === 0) {
      connectionsByRoom.delete(room);
      docs.delete(room);
    }
    const totalClientsAfterClose = Array.from(connectionsByRoom.values()).reduce(
      (acc, map) => acc + map.size,
      0
    );
    console.log(
      `Client disconnected (${info?.clientType || "unknown"}) from room "${room}". ` +
        `Room count: ${roomConnections.size}, total clients: ${totalClientsAfterClose}.`
    );
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

function broadcast(room, message, origin) {
  const roomConnections = connectionsByRoom.get(room);
  if (!roomConnections) {
    return;
  }

  roomConnections.forEach((_info, client) => {
    if (client !== origin && client.readyState === client.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error("Error broadcasting message:", error);
        roomConnections.delete(client);
      }
    }
  });
}

server.on("request", (_req, res) => {
  const protocol = useSSL ? "wss" : "ws";
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <!doctype html>
    <html>
      <head>
        <title>CrossDash - Yjs Server</title>
        <style>
          body { font-family: system-ui, sans-serif; margin: 40px; background: #f5f5f5; }
          .card { background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,0.08); }
          .muted { color: #555; }
          code { background: #f0f0f0; padding: 4px 6px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>CrossDash Yjs Server</h1>
          <p class="muted">Server is running and ready for clients.</p>
          <ul>
            <li>Protocol: <strong>${protocol.toUpperCase()}</strong></li>
            <li>Local URL: <code>${protocol}://localhost:${PORT}/</code></li>
            <li>Network URL: <code>${protocol}://${getLocalIpAddress()}:${PORT}/</code></li>
            <li>Active Rooms: <strong>${docs.size}</strong></li>
            <li>Max Clients: <strong>${MAX_TOTAL_CLIENTS}</strong></li>
            <li>Max Clients per Room: <strong>${MAX_ROOM_CLIENTS}</strong></li>
          </ul>
        </div>
      </body>
    </html>
  `);
});

server.listen(PORT, HOST, () => {
  const protocol = useSSL ? "wss" : "ws";
  const ip = getLocalIpAddress();
  console.log("=".repeat(60));
  console.log("CrossDash Yjs Server started");
  console.log("=".repeat(60));
  console.log(`Listening on ${protocol}://${HOST}:${PORT}`);
  console.log(`Local URL: ${protocol}://localhost:${PORT}/`);
  console.log(`Network URL: ${protocol}://${ip}:${PORT}/`);
  console.log(`SSL enabled: ${useSSL}`);
  console.log("=".repeat(60));
  console.log("Waiting for connections...");
});

let shuttingDown = false;

function gracefulShutdown(trigger = "SIGINT") {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`\nShutting down Yjs server (via ${trigger})...`);

  const closeWebSocket = new Promise((resolve) => {
    wss.close(() => resolve());
    // Force close lingering clients after timeout
    setTimeout(() => {
      wss.clients.forEach((client) => {
        try {
          client.terminate();
        } catch {
          /* noop */
        }
      });
      resolve();
    }, 2000).unref?.();
  });

  const closeHttp = new Promise((resolve) => {
    server.close(() => resolve());
    setTimeout(() => resolve(), 2000).unref?.();
  });

  Promise.allSettled([closeWebSocket, closeHttp]).finally(() => {
    console.log("Server closed");
    process.exit(0);
  });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

function handleFatalServerError(error) {
  if (shuttingDown) {
    return;
  }

  if (error?.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use. Stop the other process or run with PORT=<new-port> npm run dev:yjs.`
    );
  } else {
    console.error("\nYjs server encountered a fatal error:", error);
  }
  process.exit(1);
}

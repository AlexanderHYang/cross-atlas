# CrossDash

**CrossDash** is a research prototype for **cross-reality collaborative analytics**, enabling users in VR and on desktop to share synchronized dashboards and interact with data visualizations across physical and immersive workspaces. It explores how spatial layout mappings and synchronized interfaces support collaboration, awareness, and sensemaking between 2D and 3D environments.

Built with the [Anu.js](https://github.com/jpmorganchase/anu) and [Babylon.js](https://www.babylonjs.com/) engine, CrossDash integrates immersive rendering and real-time state synchronization to allow seamless transitions between desktop and VR sessions.
## Getting Started

1. **Prerequisites**
   - [Node.js](https://nodejs.org/) ≥ 18 (Vite targets modern ES modules).
   - A WebXR-capable browser (Chromium-based browsers with WebXR enabled work well). For VR testing you will need a headset or a simulator such as Chrome's WebXR emulator.

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run the development server (expose the host)**

   ```bash
   npm run dev -- --host 
   ```

  Vite serves the project over HTTPS (via `@vitejs/plugin-basic-ssl`). The first time you load https://localhost:5173—or the LAN variant—you may need to accept the self-signed certificate in your browser.

### Access from a headset
   - Direct in-headset browser: join the same network as the development machine, then point the headset's browser to `https://<your-pc-ip>:5173`.
   - SteamVR streaming: run CrossDash in Chrome on your PC and use SteamVR to mirror the desktop session into the headset.


## Branch Guide

- **main** – Baseline for the VR dashboard: original layout logic, chart set, and Babylon scene creation.
- **authoring-panel-gui** – Features the latest changes to the authoring panel with dropdown-driven chart selection, improved spacing, and styling updates.
- **elliott-2d-3d-projection-sync** – Prototype that synchronizes 2D and 3D views using Y.js; includes a small README describing how to run paired clients (`npm run dev:2d` / `npm run dev:3d`) alongside a websocket relay.
- **lily-sync-2D-3D** – Features 2D Figma-like dashboard, refining layout and authoring tools in the 2D client.
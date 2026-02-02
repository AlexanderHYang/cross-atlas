![demo](./demo.gif)

# Setup

1. Install dependencies:

> ```bash
> npm install
> ```

2. Launch the full dev stack (cert check → Yjs → 3D → 2D) in one terminal:

> ```bash
> npm run dev
> ```
>
> On first run the script generates self-signed certificates (requires OpenSSL), then starts the Yjs server plus both Vite dev servers. All logs stream in the same window, and `Ctrl+C` stops everything.

> Open the HTTPS URL printed by Vite (e.g. https://<your-ip>:5173) in your browser and accept the self-signed certificate.
> Open the HTTPS URL printed by Vite (e.g. https://<your-ip>:5174) in your browser.

## CLI flags (npm run dev)

The `npm run dev` script supports a few flags that map to Vite env vars:

- `--projection=<equirectangular|pca|vertical|horizontal>`: projection mode (defaults to whatever the client selects).
- `--layout=<spherical|hemispherical|planar>` (alias `--layout-type=<...>`): select the generated point layout.
- `--tasks=<digits>` or `--task=<digits>`: enable specific tasks by number (e.g. `--tasks=1` for Task 1 only, `--tasks=13` for Tasks 1 and 3).
- `--require-calibration-orientation=<true|false>` (alias `--calibration-orientation=<true|false>`): require the 3D user to face the landmark during calibration.
- `--random-selection=<true|false>`: use randomized angular-distance sampling instead of the precomputed point selections.
- `--counterbalance=<1|2|3|4>` (alias `--cb=<1|2|3|4>`): enable counterbalance mode with the specified sequence (see below).

### Counterbalance Mode

When `--counterbalance` is specified, participants complete all 7 trials for one projection, then automatically restart from trial 1 with the next projection in the sequence. This continues until all 4 projections are completed.

**Sequences (Latin Square design):**
| Flag | Sequence |
|------|----------|
| `--counterbalance=1` (S1) | PCA → Horizontal → Equirectangular → Vertical |
| `--counterbalance=2` (S2) | Horizontal → Vertical → PCA → Equirectangular |
| `--counterbalance=3` (S3) | Vertical → Equirectangular → Horizontal → PCA |
| `--counterbalance=4` (S4) | Equirectangular → PCA → Vertical → Horizontal |

**Note:** When counterbalance mode is enabled, the `--projection` flag is ignored since the projection sequence is controlled by the counterbalance condition.

Example:

```bash
npm run dev -- --projection=pca --layout=planar --tasks=1 --require-calibration-orientation=false --random-selection=true
```

**Counterbalance example** (runs all 4 projections in sequence S2):

```bash
npm run dev -- --counterbalance=2 --layout=planar
```

3. Demo

> Place the two tabs side-by-side and drag the point around. Watch as the point is projected and bidirectionally synchronized.
> If your browser supports WebXR, use the Enter VR button in the 3D view to explore the scene immersively.

import "@babylonjs/inspector";
import * as BABYLON from "@babylonjs/core";
import {
    layout,
    getChartMetadata,
    createIndividualChart,
} from "@/core/layout-manager.js";
import {
    initChartSync,
    setChartPosition,
    getChartPosition,
    subscribeToChartPositions,
    POSITION_ORIGINS,
} from "@/core/chart-sync.js";

let chartInstances = [];

// Board transform state
const state = {
    translateX: 0,
    translateY: 0,
    scale: 1,
};

const { positionsMap: chartPositionsMap } = initChartSync();
const chartWindows = new Map();
const chartMetadataById = new Map();
const pendingRemotePositions = new Map();
let detachPositionsObserver = null;
const POSITION_ORIGIN_LOCAL = POSITION_ORIGINS.TWO_D;
let currentPositionMapping = null;

// Initialize the 3D layout first to generate charts
function initializeDashboard() {
    // Create a hidden canvas to initialize the 3D scene and generate charts
    const hiddenCanvas = document.createElement("canvas");
    hiddenCanvas.style.display = 'none';
    document.body.appendChild(hiddenCanvas);

    const babylonEngine = new BABYLON.Engine(hiddenCanvas, true);
    const scene = layout(babylonEngine);

    // Start the hidden render loop to initialize everything
    babylonEngine.runRenderLoop(() => {
        scene.render();
    });

    // Wait for charts to be generated, then create the dashboard
    setTimeout(() => {
        createDashboard();
        setupInteractions();
    }, 1000);
}

function createDashboard() {
    const chartsGrid = document.getElementById('charts-grid');
    const chartMetadata = getChartMetadata();

    if (chartMetadata.length === 0) {
        chartsGrid.innerHTML = '<div class="loading-message">No charts available. Make sure the 3D layout has been initialized.</div>';
        return;
    }

    // Clear loading message
    chartsGrid.innerHTML = '';

    chartWindows.clear();
    chartMetadataById.clear();
    ensurePositionObserver();

    const positionMapping = computePositionMapping(chartMetadata);
    currentPositionMapping = positionMapping;

    chartMetadata.forEach((chart, index) => {
        const chartWindow = createChartWindow(chart, index);
        chartWindows.set(chart.id, { element: chartWindow, index });
        chartMetadataById.set(chart.id, chart);

        const storedPosition =
            getChartPosition(chart.id) ?? pendingRemotePositions.get(chart.id);
        const boardPos =
            storedPosition ?? map3DPositionToBoard(chart.position, positionMapping);

        console.debug("[chart-sync][2d] initial position", {
            id: chart.id,
            storedPosition,
            boardPos,
        });

        applyWindowPosition(chartWindow, boardPos);
        updateChartMetadataPosition(chart.id, boardPos);

        if (!storedPosition) {
            setChartPosition(
                chart.id,
                {
                    ...boardPos,
                    x: chart.position.x ?? 0,
                    y: chart.position.y ?? 0,
                    z: chart.position.z ?? 0,
                },
                POSITION_ORIGINS.INITIAL_SYNC
            );
        } else {
            pendingRemotePositions.delete(chart.id);
        }

        chartsGrid.appendChild(chartWindow);
    });

    // Create individual chart instances after DOM is ready
    setTimeout(() => {
        chartMetadata.forEach((_, index) => {
            const canvasId = `chart-canvas-${index}`;
            const chartInstance = createIndividualChart(index, canvasId);
            if (chartInstance) {
                chartInstances[index] = chartInstance;
            }
        });
    }, 100);
}

function computePositionMapping(metadata) {
    if (!Array.isArray(metadata) || metadata.length === 0) {
        return {
            centerX: 0,
            centerY: 0,
            scale: 180,
        };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    metadata.forEach(({ position }) => {
        if (!position) return;
        const x = position.x ?? 0;
        const y = position.y ?? 0;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    });

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const maxSpan = Math.max(spanX, spanY);
    const scale = Math.min(280, Math.max(160, 600 / maxSpan));

    return {
        centerX: (minX + maxX) / 2 || 0,
        centerY: (minY + maxY) / 2 || 0,
        scale,
    };
}

function map3DPositionToBoard(pos, mapping) {
    const x = (pos.x ?? 0) - mapping.centerX;
    const y = (pos.y ?? 0) - mapping.centerY;
    return {
        left: x * mapping.scale,
        top: -y * mapping.scale,
        x: pos.x ?? 0,
        y: pos.y ?? 0,
        z: pos.z ?? 0,
    };
}

function createChartWindow(chart, index) {
    const chartWindow = document.createElement('div');
    chartWindow.className = 'chart-window';
    chartWindow.dataset.index = String(index);
    chartWindow.dataset.chartId = chart.id;

    chartWindow.innerHTML = `
        <div class="chart-header" data-drag-handle>
            ${chart.name} (${chart.type})
        </div>
        <div class="chart-canvas-container">
            <canvas id="chart-canvas-${index}" class="chart-canvas"></canvas>
        </div>
        <div class="chart-footer">
            <span class="pos-text">Position: (${chart.position.x.toFixed(1)}, ${chart.position.y.toFixed(1)}, ${chart.position.z.toFixed(1)})</span>
            <button class="reset-button" data-reset-index="${index}">Reset View</button>
        </div>
    `;

    // Make header cursor indicate draggable
    const header = chartWindow.querySelector('[data-drag-handle]');
    if (header) header.style.cursor = 'grab';

    return chartWindow;
}

// Make resetChartView global so it can be called from onclick
window.resetChartView = function(index) {
    const instance = chartInstances[index];
    if (instance && instance.engine) {
        // Reset camera position
        const camera = instance.scene.activeCamera;
        if (camera) {
            camera.position = new BABYLON.Vector3(0, 2, -4);
            camera.setTarget(BABYLON.Vector3.Zero());
        }
    }
};

// Interaction wiring: pan board and drag windows
function setupInteractions() {
    const stage = document.getElementById('stage');
    const board = document.getElementById('charts-board');
    const grid = document.getElementById('charts-grid');

    // style adjustments to enable large board and absolute children
    grid.style.position = 'absolute';
    grid.style.left = '50%';
    grid.style.top = '50%';
    grid.style.transform = 'translate(-50%, -50%)';

    // make chart-window absolute and centered at coordinates
    const style = document.createElement('style');
    style.textContent = `
        #charts-board { cursor: grab; }
        .chart-window { position: absolute; transform: translate(-50%, -50%); }
        .chart-header { user-select: none; }
    `;
    document.head.appendChild(style);

    // Board pan
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    stage.addEventListener('pointerdown', (e) => {
        // only start pan when background (stage) is targeted, not a window header or its children
        const target = e.target;
        if (target.closest && target.closest('.chart-window')) return;
        isPanning = true;
        panStart = { x: e.clientX - state.translateX, y: e.clientY - state.translateY };
        stage.setPointerCapture(e.pointerId);
        stage.style.cursor = 'grabbing';
    });

    stage.addEventListener('pointermove', (e) => {
        if (!isPanning) return;
        state.translateX = e.clientX - panStart.x;
        state.translateY = e.clientY - panStart.y;
        board.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
    });

    stage.addEventListener('pointerup', (e) => {
        if (!isPanning) return;
        isPanning = false;
        stage.releasePointerCapture(e.pointerId);
        stage.style.cursor = 'grab';
    });

    // Window drag
    let dragState = null;

    document.addEventListener('pointerdown', (e) => {
        const handle = e.target.closest && e.target.closest('[data-drag-handle]');
        if (!handle) return;
        const win = handle.closest('.chart-window');
        if (!win) return;
        const chartId = win.dataset.chartId || null;
        dragState = {
            el: win,
            startX: e.clientX,
            startY: e.clientY,
            origLeft: parseFloat(win.style.left || '0'),
            origTop: parseFloat(win.style.top || '0'),
            chartId,
        };
        handle.setPointerCapture(e.pointerId);
        handle.style.cursor = 'grabbing';
    });

    document.addEventListener('pointermove', (e) => {
        if (!dragState) return;
        const dx = (e.clientX - dragState.startX) / state.scale;
        const dy = (e.clientY - dragState.startY) / state.scale;
        const newLeft = dragState.origLeft + dx;
        const newTop = dragState.origTop + dy;
        applyWindowPosition(dragState.el, { left: newLeft, top: newTop });
        if (dragState.chartId) {
            const payload = buildPositionPayload(dragState.chartId, newLeft, newTop);
            setChartPosition(dragState.chartId, payload, POSITION_ORIGIN_LOCAL);
            updateChartMetadataPosition(dragState.chartId, payload);
        }
    });

    document.addEventListener('pointerup', (e) => {
        if (!dragState) return;
        try { dragState.el.querySelector('[data-drag-handle]').releasePointerCapture(e.pointerId); } catch (err) {}
        dragState.el.querySelector('[data-drag-handle]').style.cursor = 'grab';
        dragState = null;
    });


    // Reset button using event delegation
    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('[data-reset-index]');
        if (!btn) return;
        const idx = parseInt(btn.getAttribute('data-reset-index'));
        window.resetChartView(idx);
    });
}

function applyWindowPosition(element, position) {
    if (!element || !position) return;
    console.debug("[chart-sync][2d] applyWindowPosition", {
        id: element?.dataset?.chartId,
        position,
    });
    if (typeof position.left === "number" && Number.isFinite(position.left)) {
        element.style.left = `${position.left}px`;
    }
    if (typeof position.top === "number" && Number.isFinite(position.top)) {
        element.style.top = `${position.top}px`;
    }
}

function ensurePositionObserver() {
    if (detachPositionsObserver) return;
    console.debug("[chart-sync][2d] ensuring position observer");
    detachPositionsObserver = subscribeToChartPositions(handleRemotePositionUpdate);
}

function ensureBoardCoordinates(position) {
    if (!position) return position;
    if (
        (typeof position.left !== "number" || !Number.isFinite(position.left)) &&
        typeof position.x === "number"
    ) {
        const coords = convert3DToBoard(position.x, position.y);
        return { ...position, ...coords };
    }
    return position;
}

function handleRemotePositionUpdate(event, transaction) {
    if (transaction?.origin === POSITION_ORIGIN_LOCAL) {
        console.debug("[chart-sync][2d] ignore local transaction", {
            origin: transaction?.origin,
            keysChanged: Array.from(event.keysChanged || []),
        });
        return;
    }
    event.changes.keys.forEach((change, key) => {
        if (change.action === "delete") return;
        let payload = chartPositionsMap.get(key);
        if (!payload) return;
        payload = ensureBoardCoordinates(payload);
        console.debug("[chart-sync][2d] remote position update", { key, payload });
        const entry = chartWindows.get(key);
        if (!entry) {
            pendingRemotePositions.set(key, payload);
            return;
        }
        applyWindowPosition(entry.element, payload);
        updateChartMetadataPosition(key, payload);
    });
}

function updateChartMetadataPosition(id, position) {
    if (!id || !position) return;
    const metadata = chartMetadataById.get(id);
    if (!metadata) return;
    console.debug("[chart-sync][2d] updateChartMetadataPosition", { id, position });
    metadata.boardPosition = {
        left: typeof position.left === "number" ? position.left : Number(position.left) || 0,
        top: typeof position.top === "number" ? position.top : Number(position.top) || 0,
        x: typeof position.x === "number" ? position.x : Number(position.x) || 0,
        y: typeof position.y === "number" ? position.y : Number(position.y) || 0,
        z: typeof position.z === "number" ? position.z : Number(position.z) || 0,
    };
}

function convertBoardTo3D(left, top, mapping = currentPositionMapping) {
    if (!mapping || !mapping.scale) {
        return { x: left, y: -top };
    }
    return {
        x: left / mapping.scale + (mapping.centerX ?? 0),
        y: -(top / mapping.scale) + (mapping.centerY ?? 0),
    };
}

function convert3DToBoard(x = 0, y = 0, mapping = currentPositionMapping) {
    if (!mapping || !mapping.scale) {
        return { left: x, top: -y };
    }
    return {
        left: (x - (mapping.centerX ?? 0)) * mapping.scale,
        top: -((y - (mapping.centerY ?? 0)) * mapping.scale),
    };
}

function buildPositionPayload(chartId, left, top) {
    const existing = (chartId && getChartPosition(chartId)) || {};
    const coords = convertBoardTo3D(left, top);
    const payload = {
        ...existing,
        left,
        top,
        x: coords.x,
        y: coords.y,
        z: typeof existing.z === "number" ? existing.z : 0,
    };
    console.debug("[chart-sync][2d] buildPositionPayload", { chartId, payload });
    return payload;
}

// Cleanup function
window.addEventListener('beforeunload', () => {
    chartInstances.forEach(instance => {
        if (instance && instance.dispose) {
            instance.dispose();
        }
    });
});

// Start the application
initializeDashboard();

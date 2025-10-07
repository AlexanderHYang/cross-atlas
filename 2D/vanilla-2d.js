import "@babylonjs/inspector";
import * as BABYLON from "@babylonjs/core";
import { layout, getChartMetadata, createIndividualChart } from "../layout.js";

let chartInstances = [];

// Board transform state
const state = {
    translateX: 0,
    translateY: 0,
    scale: 1,
};

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

    // We'll position chart windows absolutely on the board
    chartMetadata.forEach((chart, index) => {
        const chartWindow = createChartWindow(chart, index);
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

function map3DPositionToBoard(pos) {
    // Simple mapping: use x/z for 2D coordinates, scale up for visibility
    // Assumption: 3D scene uses meters; we scale to pixels
    const scale = 120; // pixels per unit
    return {
        x: pos.x * scale,
        y: -pos.z * scale // invert z to map forward to downwards on screen
    };
}

function createChartWindow(chart, index) {
    const chartWindow = document.createElement('div');
    chartWindow.className = 'chart-window';
    chartWindow.dataset.index = String(index);

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

    // Position the window based on 3D chart position
    const boardPos = map3DPositionToBoard(chart.position);
    // set initial transform relative to board center
    chartWindow.style.left = boardPos.x + 'px';
    chartWindow.style.top = boardPos.y + 'px';

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
        dragState = {
            el: win,
            startX: e.clientX,
            startY: e.clientY,
            origLeft: parseFloat(win.style.left || '0'),
            origTop: parseFloat(win.style.top || '0')
        };
        handle.setPointerCapture(e.pointerId);
        handle.style.cursor = 'grabbing';
    });

    document.addEventListener('pointermove', (e) => {
        if (!dragState) return;
        const dx = (e.clientX - dragState.startX) / state.scale;
        const dy = (e.clientY - dragState.startY) / state.scale;
        dragState.el.style.left = (dragState.origLeft + dx) + 'px';
        dragState.el.style.top = (dragState.origTop + dy) + 'px';
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
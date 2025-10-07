import React from 'react';
import ReactDOM from 'react-dom/client';
import TwoDPage from './2d.tsx';

// Initialize the 3D layout first to generate charts
import "@babylonjs/inspector";
import * as BABYLON from "@babylonjs/core";
import { layout } from "../layout.js";

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

// Small delay to ensure charts are generated
setTimeout(() => {
    // Now render the React component
    const appElement = document.getElementById('app');
    if (appElement) {
        const root = ReactDOM.createRoot(appElement);
        root.render(<TwoDPage />);
    }
}, 1000);
import React, { useEffect, useRef, useState } from 'react';
import { getChartMetadata, createIndividualChart } from '../layout';

interface ChartInstance {
    engine: any;
    scene: any;
    chart: any;
    dispose: () => void;
}

export default function TwoDPage() {
    const [chartMetadata, setChartMetadata] = useState<any[]>([]);
    const chartInstances = useRef<ChartInstance[]>([]);

    useEffect(() => {
        // Get chart metadata when component mounts
        const metadata = getChartMetadata();
        setChartMetadata(metadata);

        // Cleanup function to dispose of chart instances when component unmounts
        return () => {
            chartInstances.current.forEach(instance => {
                if (instance && instance.dispose) {
                    instance.dispose();
                }
            });
            chartInstances.current = [];
        };
    }, []);

    useEffect(() => {
        // Create individual chart instances after canvases are rendered
        if (chartMetadata.length > 0) {
            setTimeout(() => {
                chartMetadata.forEach((_, index) => {
                    const canvasId = `chart-canvas-${index}`;
                    const chartInstance = createIndividualChart(index, canvasId);
                    if (chartInstance) {
                        chartInstances.current[index] = chartInstance;
                    }
                });
            }, 100); // Small delay to ensure canvases are in DOM
        }
    }, [chartMetadata]);

    return (
        <div style={{
            padding: '20px',
            backgroundColor: '#f5f5f5',
            minHeight: '100vh'
        }}>
            <h1 style={{
                textAlign: 'center',
                color: '#333',
                marginBottom: '30px',
                fontFamily: 'Arial, sans-serif'
            }}>
                3D Charts Dashboard
            </h1>
            
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '20px',
                justifyContent: 'center',
                maxWidth: '1400px',
                margin: '0 auto'
            }}>
                {chartMetadata.map((chart, index) => (
                    <div
                        key={chart.id || index}
                        style={{
                            flex: '1 1 calc(25% - 15px)', // 4 columns
                            minWidth: '300px',
                            maxWidth: '400px',
                            height: '350px',
                            backgroundColor: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        {/* Chart Header */}
                        <div style={{
                            padding: '12px 16px',
                            backgroundColor: '#f8f9fa',
                            borderBottom: '1px solid #eee',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            color: '#333'
                        }}>
                            {chart.name} ({chart.type})
                        </div>
                        
                        {/* Chart Canvas */}
                        <div style={{
                            flex: 1,
                            position: 'relative'
                        }}>
                            <canvas
                                id={`chart-canvas-${index}`}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'block'
                                }}
                            />
                        </div>
                        
                        {/* Chart Info Footer */}
                        <div style={{
                            padding: '8px 16px',
                            backgroundColor: '#f8f9fa',
                            borderTop: '1px solid #eee',
                            fontSize: '12px',
                            color: '#666',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span>
                                Position: ({chart.position.x.toFixed(1)}, {chart.position.y.toFixed(1)}, {chart.position.z.toFixed(1)})
                            </span>
                            <button
                                onClick={() => {
                                    const instance = chartInstances.current[index];
                                    if (instance && instance.engine) {
                                        // Reset camera position
                                        const camera = instance.scene.activeCamera;
                                        if (camera) {
                                            camera.position = new (window as any).BABYLON.Vector3(0, 2, -4);
                                            camera.setTarget((window as any).BABYLON.Vector3.Zero());
                                        }
                                    }
                                }}
                                style={{
                                    padding: '2px 8px',
                                    fontSize: '10px',
                                    backgroundColor: '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    cursor: 'pointer'
                                }}
                            >
                                Reset View
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            
            {chartMetadata.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '50px',
                    color: '#666',
                    fontSize: '18px'
                }}>
                    No charts available. Make sure the 3D layout has been initialized.
                </div>
            )}
        </div>
    );
};


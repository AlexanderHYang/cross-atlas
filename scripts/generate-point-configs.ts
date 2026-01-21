/**
 * Generates 3D point configurations that avoid 2D overlap under all projection types.
 *
 * Usage: npm run generate-points
 *
 * Generates three distributions (spherical, half-spherical, planar) where points are
 * guaranteed to have sufficient 2D separation under all projections (equirectangular,
 * PCA, vertical plane, horizontal plane). Uses rejection sampling to place points.
 *
 * Output: scripts/generated-point-configs.json
 */

import { Vector3 } from '@babylonjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    ProjectionManager,
    PCAProjection,
} from '../packages/client-2d/src/ProjectionManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const NUM_POINTS = 30;
const MIN_2D_DISTANCE_SPHERICAL = 0.06;
const MIN_2D_DISTANCE_HALF_SPHERICAL = 0.06;
const MIN_2D_DISTANCE_PLANAR = 0.023;
const MAX_ATTEMPTS_PER_POINT = 50000;
const SPHERE_RADIUS = 3;

// Single projection manager instance
const projectionManager = new ProjectionManager('equirectangular');

function distance2D(p1: [number, number], p2: [number, number]): number {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
}

function checkAllProjections(
    newPoint: Vector3,
    existingPoints: Vector3[],
    minDistance: number
): boolean {
    if (existingPoints.length === 0) return true;

    const projectionTypes: Array<'equirectangular' | 'pca' | 'vertical' | 'horizontal'> = [
        'equirectangular',
        'pca',
        'vertical',
        'horizontal',
    ];

    for (const type of projectionTypes) {
        projectionManager.setCurrentProjectionType(type);

        if (type === 'pca') {
            const pcaProjection = projectionManager.getCurrentProjection() as PCAProjection;
            pcaProjection.updatePCA([...existingPoints, newPoint]);
        }

        const newPoint2D = projectionManager.project(newPoint);

        for (const existingPoint of existingPoints) {
            const existingPoint2D = projectionManager.project(existingPoint);
            const dist = distance2D(newPoint2D, existingPoint2D);

            if (dist < minDistance) {
                return false;
            }
        }
    }

    return true;
}

function randomPointOnSphere(radius: number): Vector3 {
    let x: number, y: number, z: number;
    let sq: number;

    do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        sq = x * x + y * y;
    } while (sq >= 1);

    const root = Math.sqrt(1 - sq);
    x = 2 * x * root;
    y = 2 * y * root;
    z = 1 - 2 * sq;

    const norm = Math.sqrt(x * x + y * y + z * z);
    return new Vector3((x / norm) * radius, (y / norm) * radius, (z / norm) * radius);
}

function randomPointOnHalfSphere(radius: number): Vector3 {
    let point: Vector3;
    do {
        point = randomPointOnSphere(radius);
    } while (point.z < 0);
    return point;
}

function randomPointOnVerticalPlane(size: number): Vector3 {
    const y = (Math.random() * 2 - 1) * size;
    const z = (Math.random() * 2 - 1) * size;
    return new Vector3(0, y, z);
}

function generateConfiguration(
    distributionType: 'spherical' | 'half-spherical' | 'planar',
    numPoints: number
): Vector3[] {
    const points: Vector3[] = [new Vector3(1,0,0)]; // start with landmark as first point
    let consecutiveFailures = 0;

    let minDistance: number;
    switch (distributionType) {
        case 'spherical':
            minDistance = MIN_2D_DISTANCE_SPHERICAL;
            break;
        case 'half-spherical':
            minDistance = MIN_2D_DISTANCE_HALF_SPHERICAL;
            break;
        case 'planar':
            minDistance = MIN_2D_DISTANCE_PLANAR;
            break;
    }

    console.log(`\n${distributionType}: placing ${numPoints} points (min 2D distance: ${minDistance})`);
    const startTime = Date.now();

    while (points.length < numPoints) {
        let candidate: Vector3;

        switch (distributionType) {
            case 'spherical':
                candidate = randomPointOnSphere(SPHERE_RADIUS);
                break;
            case 'half-spherical':
                candidate = randomPointOnHalfSphere(SPHERE_RADIUS);
                break;
            case 'planar':
                candidate = randomPointOnVerticalPlane(SPHERE_RADIUS);
                break;
        }

        if (checkAllProjections(candidate, points, minDistance)) {
            points.push(candidate);
            console.log(`  ${points.length}/${numPoints} (${consecutiveFailures} attempts)`);
            consecutiveFailures = 0;
        } else {
            consecutiveFailures++;
        }

        if (consecutiveFailures > MAX_ATTEMPTS_PER_POINT) {
            console.error(`\nFailed after ${MAX_ATTEMPTS_PER_POINT} attempts with ${points.length} points placed.`);
            console.error(`Try reducing NUM_POINTS or MIN_2D_DISTANCE_${distributionType.toUpperCase().replace('-', '_')}`);
            process.exit(1);
        }

        if (consecutiveFailures % 10000 === 0 && consecutiveFailures > 0) {
            process.stdout.write('.');
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  done (${elapsed}s)`);
    return points;
}

function formatPoints(points: Vector3[]): Array<{ x: number; y: number; z: number }> {
    return points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

async function main() {
    console.log('Generating point configurations...');

    const results = {
        spherical: formatPoints(generateConfiguration('spherical', NUM_POINTS)),
        halfSpherical: formatPoints(generateConfiguration('half-spherical', NUM_POINTS)),
        planar: formatPoints(generateConfiguration('planar', NUM_POINTS)),
    };

    const outputPath = path.join(__dirname, 'generated-point-configs.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log(`\nSaved to ${outputPath}`);
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

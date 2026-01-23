/**
 * Angular point selection utilities for choosing points based on angular distance from a landmark.
 */

import { Vector3 } from "@babylonjs/core";

// Landmark position (origin/forward reference point)
const LANDMARK_POS = new Vector3(1, 0, 0);

// Tolerance multiplier
const TOLERANCE_MULTIPLIER = 1.15;

// Front dead zone in degrees - points within this angular distance from landmark are excluded
const FRONT_DEAD_ZONE_DEGREES = 1;

// Average angular distance in degrees per point
const AVERAGE_ANGULAR_DISTANCE_DEGREES = 60;

/**
 * Selects a specified number of points from an array such that the cumulative angular
 * distance from a landmark equals a target value using a backtracking algorithm.
 *
 * @param points - Array of 3D points to select from
 * @param numPointsToSelect - Number of points to select (without replacement)
 * @returns Array of selected points, or null if selection criteria cannot be met
 *
 * @example
 * const points = [
 *   new Vector3(1, 0, 0),
 *   new Vector3(0, 1, 0),
 *   new Vector3(-1, 0, 0)
 * ];
 * const selected = selectPointsByAngularDistance(points, 2, 180);
 */
export function selectPointsByAngularDistance(
  points: Vector3[],
  numPointsToSelect: number,
): Vector3[] | null {
  const cumulativeAngularDegrees = AVERAGE_ANGULAR_DISTANCE_DEGREES * numPointsToSelect;
  const tolerance = cumulativeAngularDegrees * (TOLERANCE_MULTIPLIER - 1);

  // Filter out points in the dead zone
  const validCandidates = points.filter(point => {
    const angularDist = Vector3.GetAngleBetweenVectors(
      point,
      LANDMARK_POS,
      Vector3.Up()
    );
    const angularDistDegrees = (angularDist * 180) / Math.PI;
    return angularDistDegrees >= FRONT_DEAD_ZONE_DEGREES;
  });

  if (validCandidates.length < numPointsToSelect) {
    console.warn(
      `Not enough valid candidates outside dead zone. Need ${numPointsToSelect}, have ${validCandidates.length}`
    );
    return null;
  }

  // Validate that the target is theoretically achievable
  const maxPossible = numPointsToSelect * 180;
  const minPossible = 0;

  if (cumulativeAngularDegrees > maxPossible || cumulativeAngularDegrees < minPossible) {
    console.warn(
      `Target cumulative angular distance ${cumulativeAngularDegrees}° is outside possible range [${minPossible}°, ${maxPossible}°]`
    );
    return null;
  }

  // Backtracking algorithm
  const selected: Vector3[] = [];
  const usedIndices = new Set<number>();

  function backtrack(currentSum: number): boolean {
    // Success case: we have enough points and cumulative sum is within tolerance
    if (selected.length === numPointsToSelect) {
      return Math.abs(currentSum - cumulativeAngularDegrees) <= tolerance;
    }

    // Pruning: if we can't possibly reach target even with remaining points
    const remainingPoints = numPointsToSelect - selected.length;
    const maxPossibleAddition = 180 * remainingPoints; // Max angular distance is 180 degrees

    if (currentSum > cumulativeAngularDegrees + tolerance) {
      return false; // Already exceeded target
    }

    if (currentSum + maxPossibleAddition < cumulativeAngularDegrees - tolerance) {
      return false; // Can't reach target
    }

    // Try adding each unused candidate
    for (let i = 0; i < validCandidates.length; i++) {
      if (usedIndices.has(i)) continue;

      const point = validCandidates[i];
      const angularDist = Vector3.GetAngleBetweenVectors(
        point,
        LANDMARK_POS,
        Vector3.Up()
      );
      const angularDistDegrees = (angularDist * 180) / Math.PI;
      const newSum = currentSum + angularDistDegrees;

      // Early pruning: if this single addition overshoots too much
      if (selected.length === numPointsToSelect - 1) {
        // Last point to add
        if (Math.abs(newSum - cumulativeAngularDegrees) > tolerance) {
          continue;
        }
      }

      selected.push(point);
      usedIndices.add(i);

      if (backtrack(newSum)) {
        return true;
      }

      // Backtrack
      selected.pop();
      usedIndices.delete(i);
    }

    return false;
  }

  if (backtrack(0)) {
    return selected;
  }

  return null;
}

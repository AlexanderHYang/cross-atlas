/**
 * Angular point selection utilities for choosing points based on angular distance from a landmark.
 */

import { Vector3 } from "@babylonjs/core";
import { DefaultPointConfig } from "./defaultPoints";

// Landmark position (origin/forward reference point)
const LANDMARK_POS = new Vector3(1, 0, 0);

// Tolerance multiplier
const TOLERANCE_MULTIPLIER = 1.3;

// Front dead zone in degrees - points within this angular distance from landmark are excluded
const FRONT_DEAD_ZONE_DEGREES = 1;

// Average angular distance in degrees per point
const AVERAGE_ANGULAR_DISTANCE_DEGREES = 45;

/**
 * Selects a specified number of points from an array such that the cumulative angular
 * distance from a landmark equals a target value using a backtracking algorithm.
 *
 * @param configs - Array of point configurations to select from
 * @param numPointsToSelect - Number of points to select (without replacement)
 * @returns Array of selected point IDs
 * @throws Error if selection criteria cannot be met
 *
 * @example
 * const ids = selectPointsByAngularDistance(DEFAULT_POINT_CONFIGS, 4);
 */
export function selectPointsByAngularDistance(
  configs: DefaultPointConfig[],
  numPointsToSelect: number,
): string[] {
  const cumulativeAngularDegrees = AVERAGE_ANGULAR_DISTANCE_DEGREES * numPointsToSelect;
  const tolerance = cumulativeAngularDegrees * (TOLERANCE_MULTIPLIER - 1);

  // Filter out non-selectable points
  const selectableConfigs = configs.filter(cfg => cfg.selectable !== false);

  // Shuffle for randomness (Fisher-Yates)
  for (let i = selectableConfigs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selectableConfigs[i], selectableConfigs[j]] = [selectableConfigs[j], selectableConfigs[i]];
  }

  // Filter out points in the dead zone and convert to working format
  const candidates: { config: DefaultPointConfig; position: Vector3; angularDist: number }[] = [];
  for (const cfg of selectableConfigs) {
    const position = new Vector3(cfg.direction.x, cfg.direction.y, cfg.direction.z);
    const angularDist = Vector3.GetAngleBetweenVectors(position, LANDMARK_POS, Vector3.Up());
    const angularDistDegrees = (angularDist * 180) / Math.PI;
    if (angularDistDegrees >= FRONT_DEAD_ZONE_DEGREES) {
      candidates.push({ config: cfg, position, angularDist: angularDistDegrees });
    }
  }

  if (candidates.length < numPointsToSelect) {
    console.error(
      `Not enough valid candidates outside dead zone. Need ${numPointsToSelect}, have ${candidates.length}`
    );
    throw new Error("Failed to select points by angular distance: not enough candidates");
  }

  // Validate that the target is theoretically achievable
  const maxPossible = numPointsToSelect * 180;
  if (cumulativeAngularDegrees > maxPossible) {
    console.error(
      `Target cumulative angular distance ${cumulativeAngularDegrees}° exceeds maximum possible ${maxPossible}°`
    );
    throw new Error("Failed to select points by angular distance: target unreachable");
  }

  // Backtracking algorithm
  const selectedIndices: number[] = [];
  const usedIndices = new Set<number>();

  function backtrack(currentSum: number): boolean {
    // Success case: we have enough points and cumulative sum is within tolerance
    if (selectedIndices.length === numPointsToSelect) {
      return Math.abs(currentSum - cumulativeAngularDegrees) <= tolerance;
    }

    // Pruning: if we can't possibly reach target even with remaining points
    const remainingPoints = numPointsToSelect - selectedIndices.length;
    const maxPossibleAddition = 180 * remainingPoints;

    if (currentSum > cumulativeAngularDegrees + tolerance) {
      return false; // Already exceeded target
    }

    if (currentSum + maxPossibleAddition < cumulativeAngularDegrees - tolerance) {
      return false; // Can't reach target
    }

    // Try adding each unused candidate
    for (let i = 0; i < candidates.length; i++) {
      if (usedIndices.has(i)) continue;

      const candidate = candidates[i];
      const newSum = currentSum + candidate.angularDist;

      // Early pruning: if this single addition overshoots too much
      if (selectedIndices.length === numPointsToSelect - 1) {
        if (Math.abs(newSum - cumulativeAngularDegrees) > tolerance) {
          continue;
        }
      }

      selectedIndices.push(i);
      usedIndices.add(i);

      if (backtrack(newSum)) {
        return true;
      }

      // Backtrack
      selectedIndices.pop();
      usedIndices.delete(i);
    }

    return false;
  }

  if (backtrack(0)) {
    return selectedIndices.map(i => candidates[i].config.id);
  }

  console.error("selectPointsByAngularDistance failed to find valid selection");
  return selectableConfigs.slice(0, numPointsToSelect).map(cfg => cfg.id);
}

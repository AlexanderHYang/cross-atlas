import { PCA } from 'ml-pca'
import { Vector3 } from '@babylonjs/core'

export function getNormal(points: Array<Vector3 | number[]>): Vector3 | null {
  const mat: number[][] = []
  let validCount = 0

  for (const p of points) {
    if (p instanceof Vector3) {
      mat.push([p.x, p.y, p.z])
      validCount++
    } else if (Array.isArray(p) && p.length === 3) {
      mat.push([p[0], p[1], p[2]])
      validCount++
    } else {
      // ignore invalid entries
    }
  }

  if (validCount === 0) {
    console.warn('PCA computed with no valid points')
  }

  // Ensure at least 3 rows for PCA stability
  while (mat.length < 3) {
    mat.push([0, 0, 0]);
  }

  const pcaInstance = new PCA(mat, { center: true, scale: false })
  const components = pcaInstance.getEigenvectors()
  if (components && components.columns == 3) {
    const normalArr = components.getColumn(2)
    return new Vector3(normalArr[0], normalArr[1], normalArr[2]).normalize()
  } else {
    console.warn('PCA failed to compute normal vector, either components missing or dimensions != 3')
  }

  return null;
}
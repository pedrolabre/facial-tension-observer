import { Point3D, FaceMesh } from './types';

export const INDEX_RIGHT_EYE_INNER = 33;
export const INDEX_LEFT_EYE_INNER = 263;
export const INDEX_RIGHT_BROW_INNER = 55;
export const INDEX_LEFT_BROW_INNER = 285;
export const INDEX_UPPER_LIP = 13;
export const INDEX_LOWER_LIP = 14;
export const INDEX_MOUTH_CORNER_RIGHT = 61;
export const INDEX_MOUTH_CORNER_LEFT = 291;
export const INDEX_CHIN_TIP = 152;

export function euclideanDistance3D(p1: Point3D, p2: Point3D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function getInterocularDistance(mesh: FaceMesh): number {
  const rightEyeInner = mesh[INDEX_RIGHT_EYE_INNER];
  const leftEyeInner = mesh[INDEX_LEFT_EYE_INNER];

  if (!rightEyeInner || !leftEyeInner) {
    return 0.0;
  }

  return euclideanDistance3D(rightEyeInner, leftEyeInner);
}

export function getNormalizedDistance(mesh: FaceMesh, idxA: number, idxB: number): number {
  const pA = mesh[idxA];
  const pB = mesh[idxB];

  if (!pA || !pB) {
    return 0.0;
  }

  const interocularDistance = getInterocularDistance(mesh);

  if (interocularDistance < 1e-6) {
    return 0.0;
  }

  return euclideanDistance3D(pA, pB) / interocularDistance;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

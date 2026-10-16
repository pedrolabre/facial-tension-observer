import { Point3D, FaceMesh } from '../../src/core/types';
import {
  INDEX_RIGHT_EYE_INNER,
  INDEX_LEFT_EYE_INNER,
  INDEX_RIGHT_BROW_INNER,
  INDEX_LEFT_BROW_INNER,
  INDEX_UPPER_LIP,
  INDEX_LOWER_LIP,
  INDEX_MOUTH_CORNER_RIGHT,
  INDEX_MOUTH_CORNER_LEFT,
  INDEX_CHIN_TIP,
} from '../../src/core/geometry';

export const TOTAL_FACEMESH_POINTS = 468;

export function createMockMesh(overrides: Record<number, Point3D> = {}): FaceMesh {
  const points: Point3D[] = [];

  for (let i = 0; i < TOTAL_FACEMESH_POINTS; i++) {
    points.push(overrides[i] ?? { x: 0.0, y: 0.0, z: 0.0 });
  }

  return points;
}

export function createNeutralMesh(): FaceMesh {
  return createMockMesh({
    [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
    [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
    [INDEX_RIGHT_BROW_INNER]: { x: -0.21, y: 0.25, z: 0.0 },
    [INDEX_LEFT_BROW_INNER]: { x: 0.21, y: 0.25, z: 0.0 },
    [INDEX_MOUTH_CORNER_RIGHT]: { x: -0.25, y: -0.7, z: 0.0 },
    [INDEX_MOUTH_CORNER_LEFT]: { x: 0.25, y: -0.7, z: 0.0 },
    [INDEX_UPPER_LIP]: { x: 0.0, y: -0.655, z: 0.0 },
    [INDEX_LOWER_LIP]: { x: 0.0, y: -0.745, z: 0.0 },
    [INDEX_CHIN_TIP]: { x: 0.0, y: -1.35, z: 0.0 },
  });
}

export function createFurrowedMesh(): FaceMesh {
  return createMockMesh({
    [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
    [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
    [INDEX_RIGHT_BROW_INNER]: { x: -0.14, y: 0.25, z: 0.0 },
    [INDEX_LEFT_BROW_INNER]: { x: 0.14, y: 0.25, z: 0.0 },
    [INDEX_MOUTH_CORNER_RIGHT]: { x: -0.25, y: -0.7, z: 0.0 },
    [INDEX_MOUTH_CORNER_LEFT]: { x: 0.25, y: -0.7, z: 0.0 },
    [INDEX_UPPER_LIP]: { x: 0.0, y: -0.655, z: 0.0 },
    [INDEX_LOWER_LIP]: { x: 0.0, y: -0.745, z: 0.0 },
    [INDEX_CHIN_TIP]: { x: 0.0, y: -1.35, z: 0.0 },
  });
}

export function createCompressedLipsMesh(): FaceMesh {
  return createMockMesh({
    [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
    [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
    [INDEX_RIGHT_BROW_INNER]: { x: -0.21, y: 0.25, z: 0.0 },
    [INDEX_LEFT_BROW_INNER]: { x: 0.21, y: 0.25, z: 0.0 },
    [INDEX_MOUTH_CORNER_RIGHT]: { x: -0.25, y: -0.7, z: 0.0 },
    [INDEX_MOUTH_CORNER_LEFT]: { x: 0.25, y: -0.7, z: 0.0 },
    [INDEX_UPPER_LIP]: { x: 0.0, y: -0.7, z: 0.0 },
    [INDEX_LOWER_LIP]: { x: 0.0, y: -0.7, z: 0.0 },
    [INDEX_CHIN_TIP]: { x: 0.0, y: -1.35, z: 0.0 },
  });
}

export function createClenchedJawMesh(): FaceMesh {
  return createMockMesh({
    [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
    [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
    [INDEX_RIGHT_BROW_INNER]: { x: -0.21, y: 0.25, z: 0.0 },
    [INDEX_LEFT_BROW_INNER]: { x: 0.21, y: 0.25, z: 0.0 },
    [INDEX_MOUTH_CORNER_RIGHT]: { x: -0.25, y: -0.7, z: 0.0 },
    [INDEX_MOUTH_CORNER_LEFT]: { x: 0.25, y: -0.7, z: 0.0 },
    [INDEX_UPPER_LIP]: { x: 0.0, y: -0.655, z: 0.0 },
    [INDEX_LOWER_LIP]: { x: 0.0, y: -0.745, z: 0.0 },
    [INDEX_CHIN_TIP]: { x: 0.0, y: -1.20, z: 0.0 },
  });
}

export function createHighTensionMesh(): FaceMesh {
  return createMockMesh({
    [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
    [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
    [INDEX_RIGHT_BROW_INNER]: { x: -0.14, y: 0.25, z: 0.0 },
    [INDEX_LEFT_BROW_INNER]: { x: 0.14, y: 0.25, z: 0.0 },
    [INDEX_MOUTH_CORNER_RIGHT]: { x: -0.25, y: -0.7, z: 0.0 },
    [INDEX_MOUTH_CORNER_LEFT]: { x: 0.25, y: -0.7, z: 0.0 },
    [INDEX_UPPER_LIP]: { x: 0.0, y: -0.7, z: 0.0 },
    [INDEX_LOWER_LIP]: { x: 0.0, y: -0.7, z: 0.0 },
    [INDEX_CHIN_TIP]: { x: 0.0, y: -1.35, z: 0.0 },
  });
}

export function createFullTensionMesh(): FaceMesh {
  return createMockMesh({
    [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
    [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
    [INDEX_RIGHT_BROW_INNER]: { x: -0.14, y: 0.25, z: 0.0 },
    [INDEX_LEFT_BROW_INNER]: { x: 0.14, y: 0.25, z: 0.0 },
    [INDEX_MOUTH_CORNER_RIGHT]: { x: -0.25, y: -0.7, z: 0.0 },
    [INDEX_MOUTH_CORNER_LEFT]: { x: 0.25, y: -0.7, z: 0.0 },
    [INDEX_UPPER_LIP]: { x: 0.0, y: -0.7, z: 0.0 },
    [INDEX_LOWER_LIP]: { x: 0.0, y: -0.7, z: 0.0 },
    [INDEX_CHIN_TIP]: { x: 0.0, y: -1.20, z: 0.0 },
  });
}

export function createSmilingMesh(): FaceMesh {
  return createMockMesh({
    [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
    [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
    [INDEX_RIGHT_BROW_INNER]: { x: -0.23, y: 0.25, z: 0.0 },
    [INDEX_LEFT_BROW_INNER]: { x: 0.23, y: 0.25, z: 0.0 },
    [INDEX_MOUTH_CORNER_RIGHT]: { x: -0.35, y: -0.6, z: 0.0 },
    [INDEX_MOUTH_CORNER_LEFT]: { x: 0.35, y: -0.6, z: 0.0 },
    [INDEX_UPPER_LIP]: { x: 0.0, y: -0.63, z: 0.0 },
    [INDEX_LOWER_LIP]: { x: 0.0, y: -0.71, z: 0.0 },
    [INDEX_CHIN_TIP]: { x: 0.0, y: -1.35, z: 0.0 },
  });
}

export function scaleMesh(mesh: FaceMesh, factor: number): FaceMesh {
  return mesh.map((p) => ({
    x: p.x * factor,
    y: p.y * factor,
    z: p.z * factor,
  }));
}

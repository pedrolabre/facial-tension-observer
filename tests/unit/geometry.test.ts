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
  euclideanDistance3D,
  getInterocularDistance,
  getNormalizedDistance,
  clamp
} from '../../src/core/geometry';

describe('Geometry and Normalization Engine', () => {
  describe('MediaPipe Anatomical Landmark Constants', () => {
    it('defines expected indices for eye inner corners', () => {
      expect(INDEX_RIGHT_EYE_INNER).toBe(33);
      expect(INDEX_LEFT_EYE_INNER).toBe(263);
    });

    it('defines expected indices for eyebrow medial corners', () => {
      expect(INDEX_RIGHT_BROW_INNER).toBe(55);
      expect(INDEX_LEFT_BROW_INNER).toBe(285);
    });

    it('defines expected indices for lip boundaries and corners', () => {
      expect(INDEX_UPPER_LIP).toBe(13);
      expect(INDEX_LOWER_LIP).toBe(14);
      expect(INDEX_MOUTH_CORNER_RIGHT).toBe(61);
      expect(INDEX_MOUTH_CORNER_LEFT).toBe(291);
    });

    it('defines expected index for chin tip', () => {
      expect(INDEX_CHIN_TIP).toBe(152);
    });
  });

  describe('euclideanDistance3D', () => {
    it('returns zero for identical coordinates', () => {
      const p: Point3D = { x: 1.5, y: -2.3, z: 4.8 };
      expect(euclideanDistance3D(p, p)).toBe(0.0);
    });

    it('computes 1D distance accurately along X axis', () => {
      const p1: Point3D = { x: 2.0, y: 0.0, z: 0.0 };
      const p2: Point3D = { x: 7.0, y: 0.0, z: 0.0 };
      expect(euclideanDistance3D(p1, p2)).toBe(5.0);
    });

    it('computes 1D distance accurately along Y axis', () => {
      const p1: Point3D = { x: 0.0, y: -3.0, z: 0.0 };
      const p2: Point3D = { x: 0.0, y: 4.0, z: 0.0 };
      expect(euclideanDistance3D(p1, p2)).toBe(7.0);
    });

    it('computes 1D distance accurately along Z axis', () => {
      const p1: Point3D = { x: 0.0, y: 0.0, z: 2.0 };
      const p2: Point3D = { x: 0.0, y: 0.0, z: -8.0 };
      expect(euclideanDistance3D(p1, p2)).toBe(10.0);
    });

    it('computes 2D distance on XY plane following Pythagorean theorem', () => {
      const p1: Point3D = { x: 0.0, y: 0.0, z: 0.0 };
      const p2: Point3D = { x: 3.0, y: 4.0, z: 0.0 };
      expect(euclideanDistance3D(p1, p2)).toBe(5.0);
    });

    it('computes 2D distance on XZ and YZ planes', () => {
      const pOrigin: Point3D = { x: 0.0, y: 0.0, z: 0.0 };
      const pXZ: Point3D = { x: 6.0, y: 0.0, z: 8.0 };
      const pYZ: Point3D = { x: 0.0, y: 5.0, z: 12.0 };

      expect(euclideanDistance3D(pOrigin, pXZ)).toBe(10.0);
      expect(euclideanDistance3D(pOrigin, pYZ)).toBe(13.0);
    });

    it('computes full 3D distance with multi-axis deltas', () => {
      const p1: Point3D = { x: 1.0, y: -2.0, z: 3.0 };
      const p2: Point3D = { x: 3.0, y: 1.0, z: 9.0 };

      expect(euclideanDistance3D(p1, p2)).toBe(7.0);
    });

    it('is symmetric regardless of argument order', () => {
      const pA: Point3D = { x: -0.4, y: 1.2, z: 3.1 };
      const pB: Point3D = { x: 0.8, y: -0.9, z: 0.5 };

      expect(euclideanDistance3D(pA, pB)).toBe(euclideanDistance3D(pB, pA));
    });

    it('satisfies the triangle inequality', () => {
      const pA: Point3D = { x: 0.1, y: 0.2, z: 0.3 };
      const pB: Point3D = { x: 1.1, y: 1.5, z: 0.8 };
      const pC: Point3D = { x: 2.5, y: 0.7, z: 1.9 };

      const distAC = euclideanDistance3D(pA, pC);
      const distAB = euclideanDistance3D(pA, pB);
      const distBC = euclideanDistance3D(pB, pC);

      expect(distAC).toBeLessThanOrEqual(distAB + distBC + 1e-12);
    });
  });

  describe('getInterocularDistance', () => {
    function buildMockMesh(rightEye: Point3D, leftEye: Point3D): FaceMesh {
      const mesh: Point3D[] = Array.from({ length: 468 }, () => ({ x: 0.0, y: 0.0, z: 0.0 }));
      mesh[INDEX_RIGHT_EYE_INNER] = rightEye;
      mesh[INDEX_LEFT_EYE_INNER] = leftEye;
      return mesh;
    }

    it('calculates the 3D euclidean distance between landmarks 33 and 263', () => {
      const rightEye: Point3D = { x: -0.03, y: 0.05, z: -0.01 };
      const leftEye: Point3D = { x: 0.03, y: 0.05, z: -0.01 };
      const mesh = buildMockMesh(rightEye, leftEye);

      expect(getInterocularDistance(mesh)).toBeCloseTo(0.06, 6);
    });

    it('returns 0.0 when mesh is empty', () => {
      const emptyMesh: FaceMesh = [];
      expect(getInterocularDistance(emptyMesh)).toBe(0.0);
    });

    it('returns 0.0 when right eye landmark 33 is missing', () => {
      const incompleteMesh: FaceMesh = Array.from({ length: 200 }, () => ({ x: 0.0, y: 0.0, z: 0.0 }));
      expect(getInterocularDistance(incompleteMesh)).toBe(0.0);
    });

    it('returns 0.0 when left eye landmark 263 is missing', () => {
      const incompleteMesh: FaceMesh = Array.from({ length: 260 }, () => ({ x: 0.0, y: 0.0, z: 0.0 }));
      expect(getInterocularDistance(incompleteMesh)).toBe(0.0);
    });

    it('returns 0.0 when eye landmarks are coincident', () => {
      const coincident: Point3D = { x: 0.0, y: 0.0, z: 0.0 };
      const mesh = buildMockMesh(coincident, coincident);
      expect(getInterocularDistance(mesh)).toBe(0.0);
    });
  });

  describe('getNormalizedDistance', () => {
    function createSyntheticFaceMesh(): Point3D[] {
      const mesh: Point3D[] = Array.from({ length: 468 }, (_, idx) => ({
        x: (idx % 20) * 0.01,
        y: Math.floor(idx / 20) * 0.01,
        z: 0.0
      }));

      mesh[INDEX_RIGHT_EYE_INNER] = { x: -0.035, y: 0.05, z: -0.02 };
      mesh[INDEX_LEFT_EYE_INNER] = { x: 0.035, y: 0.05, z: -0.02 };
      mesh[INDEX_RIGHT_BROW_INNER] = { x: -0.015, y: 0.08, z: -0.01 };
      mesh[INDEX_LEFT_BROW_INNER] = { x: 0.015, y: 0.08, z: -0.01 };
      mesh[INDEX_UPPER_LIP] = { x: 0.0, y: -0.02, z: 0.01 };
      mesh[INDEX_LOWER_LIP] = { x: 0.0, y: -0.035, z: 0.01 };
      mesh[INDEX_MOUTH_CORNER_RIGHT] = { x: -0.025, y: -0.027, z: 0.0 };
      mesh[INDEX_MOUTH_CORNER_LEFT] = { x: 0.025, y: -0.027, z: 0.0 };
      mesh[INDEX_CHIN_TIP] = { x: 0.0, y: -0.08, z: 0.02 };

      return mesh;
    }

    it('calculates the ratio between two landmarks divided by interocular distance', () => {
      const mesh = createSyntheticFaceMesh();
      const interocular = euclideanDistance3D(
        mesh[INDEX_RIGHT_EYE_INNER]!,
        mesh[INDEX_LEFT_EYE_INNER]!
      );
      const browDist = euclideanDistance3D(
        mesh[INDEX_RIGHT_BROW_INNER]!,
        mesh[INDEX_LEFT_BROW_INNER]!
      );
      const expectedRatio = browDist / interocular;

      const normalized = getNormalizedDistance(mesh, INDEX_RIGHT_BROW_INNER, INDEX_LEFT_BROW_INNER);
      expect(normalized).toBeCloseTo(expectedRatio, 6);
    });

    it('demonstrates scale invariance under 2x zoom factor', () => {
      const baseMesh = createSyntheticFaceMesh();
      const scaledMesh: FaceMesh = baseMesh.map((p) => ({
        x: p.x * 2,
        y: p.y * 2,
        z: p.z * 2
      }));

      const baseRatio = getNormalizedDistance(baseMesh, INDEX_RIGHT_BROW_INNER, INDEX_LEFT_BROW_INNER);
      const scaledRatio = getNormalizedDistance(scaledMesh, INDEX_RIGHT_BROW_INNER, INDEX_LEFT_BROW_INNER);

      expect(scaledRatio).toBeCloseTo(baseRatio, 9);
    });

    it('demonstrates scale invariance under 5x zoom factor', () => {
      const baseMesh = createSyntheticFaceMesh();
      const scaledMesh: FaceMesh = baseMesh.map((p) => ({
        x: p.x * 5,
        y: p.y * 5,
        z: p.z * 5
      }));

      const baseRatio = getNormalizedDistance(baseMesh, INDEX_UPPER_LIP, INDEX_LOWER_LIP);
      const scaledRatio = getNormalizedDistance(scaledMesh, INDEX_UPPER_LIP, INDEX_LOWER_LIP);

      expect(scaledRatio).toBeCloseTo(baseRatio, 9);
    });

    it('demonstrates scale invariance under 10x zoom factor', () => {
      const baseMesh = createSyntheticFaceMesh();
      const scaledMesh: FaceMesh = baseMesh.map((p) => ({
        x: p.x * 10,
        y: p.y * 10,
        z: p.z * 10
      }));

      const baseRatio = getNormalizedDistance(baseMesh, INDEX_MOUTH_CORNER_RIGHT, INDEX_MOUTH_CORNER_LEFT);
      const scaledRatio = getNormalizedDistance(scaledMesh, INDEX_MOUTH_CORNER_RIGHT, INDEX_MOUTH_CORNER_LEFT);

      expect(scaledRatio).toBeCloseTo(baseRatio, 9);
    });

    it('demonstrates scale invariance under fractional scaling (0.1x)', () => {
      const baseMesh = createSyntheticFaceMesh();
      const scaledMesh: FaceMesh = baseMesh.map((p) => ({
        x: p.x * 0.1,
        y: p.y * 0.1,
        z: p.z * 0.1
      }));

      const baseRatio = getNormalizedDistance(baseMesh, INDEX_CHIN_TIP, INDEX_LOWER_LIP);
      const scaledRatio = getNormalizedDistance(scaledMesh, INDEX_CHIN_TIP, INDEX_LOWER_LIP);

      expect(scaledRatio).toBeCloseTo(baseRatio, 9);
    });

    it('demonstrates spatial translation invariance', () => {
      const baseMesh = createSyntheticFaceMesh();
      const translatedMesh: FaceMesh = baseMesh.map((p) => ({
        x: p.x + 12.34,
        y: p.y - 56.78,
        z: p.z + 90.12
      }));

      const baseRatio = getNormalizedDistance(baseMesh, INDEX_RIGHT_BROW_INNER, INDEX_LEFT_BROW_INNER);
      const translatedRatio = getNormalizedDistance(
        translatedMesh,
        INDEX_RIGHT_BROW_INNER,
        INDEX_LEFT_BROW_INNER
      );

      expect(translatedRatio).toBeCloseTo(baseRatio, 9);
    });

    it('returns 0.0 if mesh is empty', () => {
      expect(getNormalizedDistance([], INDEX_RIGHT_BROW_INNER, INDEX_LEFT_BROW_INNER)).toBe(0.0);
    });

    it('returns 0.0 if idxA is out of bounds', () => {
      const mesh = createSyntheticFaceMesh();
      expect(getNormalizedDistance(mesh, 999, INDEX_LEFT_BROW_INNER)).toBe(0.0);
      expect(getNormalizedDistance(mesh, -1, INDEX_LEFT_BROW_INNER)).toBe(0.0);
    });

    it('returns 0.0 if idxB is out of bounds', () => {
      const mesh = createSyntheticFaceMesh();
      expect(getNormalizedDistance(mesh, INDEX_RIGHT_BROW_INNER, 999)).toBe(0.0);
      expect(getNormalizedDistance(mesh, INDEX_RIGHT_BROW_INNER, -5)).toBe(0.0);
    });

    it('returns 0.0 when interocular distance is zero', () => {
      const mesh = createSyntheticFaceMesh();
      mesh[INDEX_RIGHT_EYE_INNER] = { x: 0.0, y: 0.0, z: 0.0 };
      mesh[INDEX_LEFT_EYE_INNER] = { x: 0.0, y: 0.0, z: 0.0 };

      expect(getNormalizedDistance(mesh, INDEX_RIGHT_BROW_INNER, INDEX_LEFT_BROW_INNER)).toBe(0.0);
    });

    it('returns 0.0 when interocular distance is below 1e-6 epsilon guard', () => {
      const mesh = createSyntheticFaceMesh();
      mesh[INDEX_RIGHT_EYE_INNER] = { x: 0.0, y: 0.0, z: 0.0 };
      mesh[INDEX_LEFT_EYE_INNER] = { x: 5e-7, y: 0.0, z: 0.0 };

      expect(getNormalizedDistance(mesh, INDEX_RIGHT_BROW_INNER, INDEX_LEFT_BROW_INNER)).toBe(0.0);
    });

    it('computes accurately when interocular distance is equal to or above 1e-6', () => {
      const mesh = createSyntheticFaceMesh();
      mesh[INDEX_RIGHT_EYE_INNER] = { x: 0.0, y: 0.0, z: 0.0 };
      mesh[INDEX_LEFT_EYE_INNER] = { x: 1e-6, y: 0.0, z: 0.0 };
      mesh[INDEX_RIGHT_BROW_INNER] = { x: 0.0, y: 0.0, z: 0.0 };
      mesh[INDEX_LEFT_BROW_INNER] = { x: 2e-6, y: 0.0, z: 0.0 };

      const result = getNormalizedDistance(mesh, INDEX_RIGHT_BROW_INNER, INDEX_LEFT_BROW_INNER);
      expect(result).toBeCloseTo(2.0, 4);
    });
  });

  describe('clamp', () => {
    it('returns value unchanged when within boundaries', () => {
      expect(clamp(0.5, 0.0, 1.0)).toBe(0.5);
      expect(clamp(15, 10, 20)).toBe(15);
      expect(clamp(-3, -10, 0)).toBe(-3);
    });

    it('returns min when value is strictly less than min', () => {
      expect(clamp(-0.2, 0.0, 1.0)).toBe(0.0);
      expect(clamp(4, 10, 20)).toBe(10);
      expect(clamp(-15, -10, 0)).toBe(-10);
    });

    it('returns max when value is strictly greater than max', () => {
      expect(clamp(1.4, 0.0, 1.0)).toBe(1.0);
      expect(clamp(25, 10, 20)).toBe(20);
      expect(clamp(5, -10, 0)).toBe(0);
    });

    it('handles exact boundary values', () => {
      expect(clamp(0.0, 0.0, 1.0)).toBe(0.0);
      expect(clamp(1.0, 0.0, 1.0)).toBe(1.0);
    });

    it('handles negative ranges correctly', () => {
      expect(clamp(-12, -10, -5)).toBe(-10);
      expect(clamp(-7, -10, -5)).toBe(-7);
      expect(clamp(-2, -10, -5)).toBe(-5);
    });
  });
});

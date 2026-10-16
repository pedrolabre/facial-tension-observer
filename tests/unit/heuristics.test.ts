import {
  calculateBrowScore,
  calculateLipScore,
  calculateJawScore,
  computeInstantTension,
  RATIO_BROW_NEUTRAL,
  RATIO_BROW_TENSE,
  RATIO_LIPS_NEUTRAL,
  RATIO_JAW_NEUTRAL,
  JAW_DELTA_THRESHOLD,
  SMILE_SUPPRESSION_THRESHOLD,
  WEIGHT_BROW,
  WEIGHT_LIPS,
  WEIGHT_JAW,
} from '../../src/core/heuristics';
import {
  createMockMesh,
  createNeutralMesh,
  createFurrowedMesh,
  createCompressedLipsMesh,
  createClenchedJawMesh,
  createHighTensionMesh,
  createFullTensionMesh,
  createSmilingMesh,
  scaleMesh,
} from '../fixtures/mock_meshes';
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

describe('Heuristics Constants', () => {
  it('exports correct biomechanical ratios and weights', () => {
    expect(RATIO_BROW_NEUTRAL).toBe(0.42);
    expect(RATIO_BROW_TENSE).toBe(0.28);
    expect(RATIO_LIPS_NEUTRAL).toBe(0.18);
    expect(RATIO_JAW_NEUTRAL).toBe(1.35);
    expect(JAW_DELTA_THRESHOLD).toBe(0.15);
    expect(SMILE_SUPPRESSION_THRESHOLD).toBe(0.15);
    expect(WEIGHT_BROW).toBe(0.50);
    expect(WEIGHT_LIPS).toBe(0.30);
    expect(WEIGHT_JAW).toBe(0.20);
    expect(WEIGHT_BROW + WEIGHT_LIPS + WEIGHT_JAW).toBeCloseTo(1.0, 5);
  });
});

describe('calculateBrowScore', () => {
  it('returns 0.0 for a neutral face mesh', () => {
    const mesh = createNeutralMesh();
    const score = calculateBrowScore(mesh);
    expect(score).toBeCloseTo(0.0, 5);
  });

  it('returns 1.0 for a severely furrowed brow mesh', () => {
    const mesh = createFurrowedMesh();
    const score = calculateBrowScore(mesh);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('returns intermediate value for medium furrowing', () => {
    const mesh = createMockMesh({
      [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
      [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
      [INDEX_RIGHT_BROW_INNER]: { x: -0.175, y: 0.25, z: 0.0 },
      [INDEX_LEFT_BROW_INNER]: { x: 0.175, y: 0.25, z: 0.0 },
    });
    const score = calculateBrowScore(mesh);
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('clamps to 1.0 when brow distance is narrower than tense threshold', () => {
    const mesh = createMockMesh({
      [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
      [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
      [INDEX_RIGHT_BROW_INNER]: { x: -0.10, y: 0.25, z: 0.0 },
      [INDEX_LEFT_BROW_INNER]: { x: 0.10, y: 0.25, z: 0.0 },
    });
    const score = calculateBrowScore(mesh);
    expect(score).toBe(1.0);
  });

  it('clamps to 0.0 when brow distance is wider than neutral baseline', () => {
    const mesh = createMockMesh({
      [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
      [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
      [INDEX_RIGHT_BROW_INNER]: { x: -0.25, y: 0.25, z: 0.0 },
      [INDEX_LEFT_BROW_INNER]: { x: 0.25, y: 0.25, z: 0.0 },
    });
    const score = calculateBrowScore(mesh);
    expect(score).toBe(0.0);
  });

  it('is invariant to scale factors of 2x, 5x, and 10x', () => {
    const furrowed = createFurrowedMesh();
    const baseScore = calculateBrowScore(furrowed);

    expect(calculateBrowScore(scaleMesh(furrowed, 2))).toBeCloseTo(baseScore, 5);
    expect(calculateBrowScore(scaleMesh(furrowed, 5))).toBeCloseTo(baseScore, 5);
    expect(calculateBrowScore(scaleMesh(furrowed, 10))).toBeCloseTo(baseScore, 5);
  });

  it('returns 0.0 for empty or incomplete mesh', () => {
    expect(calculateBrowScore([])).toBe(0.0);
    expect(calculateBrowScore([{ x: 0, y: 0, z: 0 }])).toBe(0.0);
  });

  it('returns 0.0 when landmarks are undefined', () => {
    const sparseMesh: any[] = [];
    sparseMesh[INDEX_RIGHT_EYE_INNER] = { x: -0.5, y: 0, z: 0 };
    sparseMesh[INDEX_LEFT_EYE_INNER] = { x: 0.5, y: 0, z: 0 };
    sparseMesh[INDEX_RIGHT_BROW_INNER] = { x: -0.14, y: 0.25, z: 0 };
    expect(calculateBrowScore(sparseMesh)).toBe(0.0);
  });

  it('returns 0.0 when interocular distance is zero or below 1e-6', () => {
    const degenerateMesh = createMockMesh({
      [INDEX_RIGHT_EYE_INNER]: { x: 0.0, y: 0.0, z: 0.0 },
      [INDEX_LEFT_EYE_INNER]: { x: 0.0, y: 0.0, z: 0.0 },
      [INDEX_RIGHT_BROW_INNER]: { x: -0.14, y: 0.25, z: 0.0 },
      [INDEX_LEFT_BROW_INNER]: { x: 0.14, y: 0.25, z: 0.0 },
    });
    expect(calculateBrowScore(degenerateMesh)).toBe(0.0);
  });
});

describe('calculateLipScore', () => {
  it('returns 0.0 for a neutral face mesh', () => {
    const mesh = createNeutralMesh();
    const score = calculateLipScore(mesh);
    expect(score).toBeCloseTo(0.0, 5);
  });

  it('returns 1.0 for compressed lips mesh', () => {
    const mesh = createCompressedLipsMesh();
    const score = calculateLipScore(mesh);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('returns intermediate value for medium lip compression', () => {
    const mesh = createMockMesh({
      [INDEX_MOUTH_CORNER_RIGHT]: { x: -0.25, y: -0.7, z: 0.0 },
      [INDEX_MOUTH_CORNER_LEFT]: { x: 0.25, y: -0.7, z: 0.0 },
      [INDEX_UPPER_LIP]: { x: 0.0, y: -0.6775, z: 0.0 },
      [INDEX_LOWER_LIP]: { x: 0.0, y: -0.7225, z: 0.0 },
    });
    const score = calculateLipScore(mesh);
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('clamps to 0.0 when lips are open wider than neutral ratio', () => {
    const mesh = createMockMesh({
      [INDEX_MOUTH_CORNER_RIGHT]: { x: -0.25, y: -0.7, z: 0.0 },
      [INDEX_MOUTH_CORNER_LEFT]: { x: 0.25, y: -0.7, z: 0.0 },
      [INDEX_UPPER_LIP]: { x: 0.0, y: -0.55, z: 0.0 },
      [INDEX_LOWER_LIP]: { x: 0.0, y: -0.85, z: 0.0 },
    });
    const score = calculateLipScore(mesh);
    expect(score).toBe(0.0);
  });

  it('is invariant to scale factors of 2x, 5x, and 10x', () => {
    const compressed = createCompressedLipsMesh();
    const baseScore = calculateLipScore(compressed);

    expect(calculateLipScore(scaleMesh(compressed, 2))).toBeCloseTo(baseScore, 5);
    expect(calculateLipScore(scaleMesh(compressed, 5))).toBeCloseTo(baseScore, 5);
    expect(calculateLipScore(scaleMesh(compressed, 10))).toBeCloseTo(baseScore, 5);
  });

  it('returns 0.0 for empty or incomplete mesh', () => {
    expect(calculateLipScore([])).toBe(0.0);
    expect(calculateLipScore([{ x: 0, y: 0, z: 0 }])).toBe(0.0);
  });

  it('returns 0.0 when mouth landmarks are missing', () => {
    const sparseMesh: any[] = [];
    sparseMesh[INDEX_UPPER_LIP] = { x: 0, y: -0.7, z: 0 };
    sparseMesh[INDEX_LOWER_LIP] = { x: 0, y: -0.7, z: 0 };
    sparseMesh[INDEX_MOUTH_CORNER_RIGHT] = { x: -0.25, y: -0.7, z: 0 };
    expect(calculateLipScore(sparseMesh)).toBe(0.0);
  });

  it('returns 0.0 when mouth width is below 1e-6', () => {
    const degenerateMesh = createMockMesh({
      [INDEX_MOUTH_CORNER_RIGHT]: { x: 0.0, y: -0.7, z: 0.0 },
      [INDEX_MOUTH_CORNER_LEFT]: { x: 0.0, y: -0.7, z: 0.0 },
      [INDEX_UPPER_LIP]: { x: 0.0, y: -0.7, z: 0.0 },
      [INDEX_LOWER_LIP]: { x: 0.0, y: -0.7, z: 0.0 },
    });
    expect(calculateLipScore(degenerateMesh)).toBe(0.0);
  });
});

describe('calculateJawScore', () => {
  it('returns 0.0 for neutral jaw mesh', () => {
    const mesh = createNeutralMesh();
    const score = calculateJawScore(mesh);
    expect(score).toBeCloseTo(0.0, 5);
  });

  it('returns 1.0 for clenched jaw mesh', () => {
    const mesh = createClenchedJawMesh();
    const score = calculateJawScore(mesh);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('returns intermediate value for medium jaw elevation', () => {
    const mesh = createMockMesh({
      [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
      [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
      [INDEX_CHIN_TIP]: { x: 0.0, y: -1.275, z: 0.0 },
    });
    const score = calculateJawScore(mesh);
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('clamps to 1.0 when jaw is elevated beyond tense threshold', () => {
    const mesh = createMockMesh({
      [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
      [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
      [INDEX_CHIN_TIP]: { x: 0.0, y: -1.10, z: 0.0 },
    });
    const score = calculateJawScore(mesh);
    expect(score).toBe(1.0);
  });

  it('clamps to 0.0 when jaw is dropped or lower than neutral baseline', () => {
    const mesh = createMockMesh({
      [INDEX_RIGHT_EYE_INNER]: { x: -0.5, y: 0.0, z: 0.0 },
      [INDEX_LEFT_EYE_INNER]: { x: 0.5, y: 0.0, z: 0.0 },
      [INDEX_CHIN_TIP]: { x: 0.0, y: -1.50, z: 0.0 },
    });
    const score = calculateJawScore(mesh);
    expect(score).toBe(0.0);
  });

  it('is invariant to scale factors of 2x, 5x, and 10x', () => {
    const clenched = createClenchedJawMesh();
    const baseScore = calculateJawScore(clenched);

    expect(calculateJawScore(scaleMesh(clenched, 2))).toBeCloseTo(baseScore, 5);
    expect(calculateJawScore(scaleMesh(clenched, 5))).toBeCloseTo(baseScore, 5);
    expect(calculateJawScore(scaleMesh(clenched, 10))).toBeCloseTo(baseScore, 5);
  });

  it('returns 0.0 for empty or incomplete mesh', () => {
    expect(calculateJawScore([])).toBe(0.0);
    expect(calculateJawScore([{ x: 0, y: 0, z: 0 }])).toBe(0.0);
  });

  it('returns 0.0 when chin tip landmark is missing', () => {
    const sparseMesh: any[] = [];
    sparseMesh[INDEX_RIGHT_EYE_INNER] = { x: -0.5, y: 0, z: 0 };
    sparseMesh[INDEX_LEFT_EYE_INNER] = { x: 0.5, y: 0, z: 0 };
    expect(calculateJawScore(sparseMesh)).toBe(0.0);
  });

  it('returns 0.0 when interocular distance is below 1e-6', () => {
    const degenerateMesh = createMockMesh({
      [INDEX_RIGHT_EYE_INNER]: { x: 0.0, y: 0.0, z: 0.0 },
      [INDEX_LEFT_EYE_INNER]: { x: 0.0, y: 0.0, z: 0.0 },
      [INDEX_CHIN_TIP]: { x: 0.0, y: -1.20, z: 0.0 },
    });
    expect(calculateJawScore(degenerateMesh)).toBe(0.0);
  });
});

describe('computeInstantTension', () => {
  it('returns 0.0 for neutral face with zero smile probability', () => {
    const mesh = createNeutralMesh();
    const result = computeInstantTension(mesh, 0.0);

    expect(result.instantScore).toBeCloseTo(0.0, 5);
    expect(result.isSmileSuppressed).toBe(false);
    expect(result.components.browFurrowScore).toBeCloseTo(0.0, 5);
    expect(result.components.lipCompressionScore).toBeCloseTo(0.0, 5);
    expect(result.components.jawRigidityScore).toBeCloseTo(0.0, 5);
    expect(result.components.smileProbability).toBe(0.0);
  });

  it('applies 0.50 weight to brow score when only brows are furrowed', () => {
    const mesh = createFurrowedMesh();
    const result = computeInstantTension(mesh, 0.0);

    expect(result.components.browFurrowScore).toBeCloseTo(1.0, 5);
    expect(result.components.lipCompressionScore).toBeCloseTo(0.0, 5);
    expect(result.components.jawRigidityScore).toBeCloseTo(0.0, 5);
    expect(result.instantScore).toBeCloseTo(0.50, 5);
    expect(result.isSmileSuppressed).toBe(false);
  });

  it('applies 0.30 weight to lip score when only lips are compressed', () => {
    const mesh = createCompressedLipsMesh();
    const result = computeInstantTension(mesh, 0.0);

    expect(result.components.browFurrowScore).toBeCloseTo(0.0, 5);
    expect(result.components.lipCompressionScore).toBeCloseTo(1.0, 5);
    expect(result.components.jawRigidityScore).toBeCloseTo(0.0, 5);
    expect(result.instantScore).toBeCloseTo(0.30, 5);
    expect(result.isSmileSuppressed).toBe(false);
  });

  it('applies 0.20 weight to jaw score when only jaw is clenched', () => {
    const mesh = createClenchedJawMesh();
    const result = computeInstantTension(mesh, 0.0);

    expect(result.components.browFurrowScore).toBeCloseTo(0.0, 5);
    expect(result.components.lipCompressionScore).toBeCloseTo(0.0, 5);
    expect(result.components.jawRigidityScore).toBeCloseTo(1.0, 5);
    expect(result.instantScore).toBeCloseTo(0.20, 5);
    expect(result.isSmileSuppressed).toBe(false);
  });

  it('computes combined high tension exceeding trigger threshold of 0.75', () => {
    const mesh = createHighTensionMesh();
    const result = computeInstantTension(mesh, 0.0);

    expect(result.instantScore).toBeCloseTo(0.80, 5);
    expect(result.instantScore).toBeGreaterThanOrEqual(0.75);
    expect(result.isSmileSuppressed).toBe(false);
  });

  it('reaches maximum instantScore of 1.0 for full tension across all 3 components', () => {
    const mesh = createFullTensionMesh();
    const result = computeInstantTension(mesh, 0.0);

    expect(result.instantScore).toBeCloseTo(1.0, 5);
    expect(result.isSmileSuppressed).toBe(false);
  });

  it('preserves score when smileProbability is exactly at or below threshold of 0.15', () => {
    const mesh = createFullTensionMesh();
    const resultAtBoundary = computeInstantTension(mesh, 0.15);

    expect(resultAtBoundary.instantScore).toBeCloseTo(1.0, 5);
    expect(resultAtBoundary.isSmileSuppressed).toBe(false);
    expect(resultAtBoundary.components.smileProbability).toBe(0.15);
  });

  it('strictly suppresses score to 0.0 when smileProbability exceeds 0.15', () => {
    const mesh = createFullTensionMesh();
    const resultSlightlyAbove = computeInstantTension(mesh, 0.15001);

    expect(resultSlightlyAbove.instantScore).toBe(0.0);
    expect(resultSlightlyAbove.isSmileSuppressed).toBe(true);
    expect(resultSlightlyAbove.components.browFurrowScore).toBeCloseTo(1.0, 5);
    expect(resultSlightlyAbove.components.lipCompressionScore).toBeCloseTo(1.0, 5);
    expect(resultSlightlyAbove.components.jawRigidityScore).toBeCloseTo(1.0, 5);

    const resultEvidentSmile = computeInstantTension(mesh, 0.60);
    expect(resultEvidentSmile.instantScore).toBe(0.0);
    expect(resultEvidentSmile.isSmileSuppressed).toBe(true);
    expect(resultEvidentSmile.components.smileProbability).toBe(0.60);
  });

  it('handles smiling mesh with smiling probability correctly', () => {
    const mesh = createSmilingMesh();
    const result = computeInstantTension(mesh, 0.85);

    expect(result.instantScore).toBe(0.0);
    expect(result.isSmileSuppressed).toBe(true);
    expect(result.components.smileProbability).toBe(0.85);
  });

  it('returns 0.0 for empty or degenerate meshes safely', () => {
    const emptyResult = computeInstantTension([], 0.0);
    expect(emptyResult.instantScore).toBe(0.0);
    expect(emptyResult.isSmileSuppressed).toBe(false);
    expect(emptyResult.components.browFurrowScore).toBe(0.0);
    expect(emptyResult.components.lipCompressionScore).toBe(0.0);
    expect(emptyResult.components.jawRigidityScore).toBe(0.0);
  });

  it('is invariant to geometric scale under full tension', () => {
    const fullTension = createFullTensionMesh();
    const baseResult = computeInstantTension(fullTension, 0.05);

    const scaledResult2x = computeInstantTension(scaleMesh(fullTension, 2), 0.05);
    const scaledResult5x = computeInstantTension(scaleMesh(fullTension, 5), 0.05);

    expect(scaledResult2x.instantScore).toBeCloseTo(baseResult.instantScore, 5);
    expect(scaledResult5x.instantScore).toBeCloseTo(baseResult.instantScore, 5);
  });
});

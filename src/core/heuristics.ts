import { Point3D, FaceMesh, InstantTensionResult } from './types';
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
  clamp,
} from './geometry';

export const RATIO_BROW_NEUTRAL = 0.42;
export const RATIO_BROW_TENSE = 0.28;
export const RATIO_LIPS_NEUTRAL = 0.18;
export const RATIO_JAW_NEUTRAL = 1.35;
export const JAW_DELTA_THRESHOLD = 0.15;
export const SMILE_SUPPRESSION_THRESHOLD = 0.15;
export const WEIGHT_BROW = 0.50;
export const WEIGHT_LIPS = 0.30;
export const WEIGHT_JAW = 0.20;

export function calculateBrowScore(mesh: FaceMesh): number {
  const p55 = mesh[INDEX_RIGHT_BROW_INNER];
  const p285 = mesh[INDEX_LEFT_BROW_INNER];

  if (!p55 || !p285) {
    return 0.0;
  }

  const interocularDistance = getInterocularDistance(mesh);

  if (interocularDistance < 1e-6) {
    return 0.0;
  }

  const browDistance = euclideanDistance3D(p55, p285);
  const ratioBrow = browDistance / interocularDistance;

  return clamp((RATIO_BROW_NEUTRAL - ratioBrow) / (RATIO_BROW_NEUTRAL - RATIO_BROW_TENSE), 0.0, 1.0);
}

export function calculateLipScore(mesh: FaceMesh): number {
  const p13 = mesh[INDEX_UPPER_LIP];
  const p14 = mesh[INDEX_LOWER_LIP];
  const p61 = mesh[INDEX_MOUTH_CORNER_RIGHT];
  const p291 = mesh[INDEX_MOUTH_CORNER_LEFT];

  if (!p13 || !p14 || !p61 || !p291) {
    return 0.0;
  }

  const mouthWidth = euclideanDistance3D(p61, p291);

  if (mouthWidth < 1e-6) {
    return 0.0;
  }

  const lipHeight = euclideanDistance3D(p13, p14);
  const ratioLips = lipHeight / mouthWidth;

  return clamp(1.0 - (ratioLips / RATIO_LIPS_NEUTRAL), 0.0, 1.0);
}

export function calculateJawScore(mesh: FaceMesh): number {
  const p33 = mesh[INDEX_RIGHT_EYE_INNER];
  const p263 = mesh[INDEX_LEFT_EYE_INNER];
  const p152 = mesh[INDEX_CHIN_TIP];

  if (!p33 || !p263 || !p152) {
    return 0.0;
  }

  const interocularDistance = getInterocularDistance(mesh);

  if (interocularDistance < 1e-6) {
    return 0.0;
  }

  const midPoint: Point3D = {
    x: (p33.x + p263.x) / 2,
    y: (p33.y + p263.y) / 2,
    z: (p33.z + p263.z) / 2,
  };

  const jawDistance = euclideanDistance3D(p152, midPoint);
  const ratioJaw = jawDistance / interocularDistance;

  return clamp((RATIO_JAW_NEUTRAL - ratioJaw) / JAW_DELTA_THRESHOLD, 0.0, 1.0);
}

export function computeInstantTension(
  mesh: FaceMesh,
  smileProbability: number
): InstantTensionResult {
  const browFurrowScore = calculateBrowScore(mesh);
  const lipCompressionScore = calculateLipScore(mesh);
  const jawRigidityScore = calculateJawScore(mesh);

  const isSmileSuppressed = smileProbability > SMILE_SUPPRESSION_THRESHOLD;

  const weightedScore =
    WEIGHT_BROW * browFurrowScore +
    WEIGHT_LIPS * lipCompressionScore +
    WEIGHT_JAW * jawRigidityScore;

  const instantScore = isSmileSuppressed ? 0.0 : clamp(weightedScore, 0.0, 1.0);

  return {
    instantScore,
    components: {
      browFurrowScore,
      lipCompressionScore,
      jawRigidityScore,
      smileProbability,
    },
    isSmileSuppressed,
  };
}

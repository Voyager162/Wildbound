import type { ResourceType } from '../resources';
import { LandmarkType, type ProceduralLandmark } from '../landmarkConfig';
import { randomAtTile } from '../generation/noise';
import { WORLD_TILE_SIZE } from '../worldConfig';

export const LANDMARK_SURFACE_GENERATION_VERSION = 5;

export type LandmarkComponentRole =
  | 'ancient-trunk'
  | 'ancient-root'
  | 'canopy-lobe'
  | 'cliff-rock'
  | 'crater-rim'
  | 'impact-core'
  | 'stone-block'
  | 'rune-altar'
  | 'skeleton-spine'
  | 'skeleton-rib'
  | 'skeleton-skull'
  | 'tower-foundation'
  | 'tower-leg'
  | 'tower-platform';

export type LandmarkGroundDetailKind =
  | 'root-trace'
  | 'approach-path'
  | 'pool'
  | 'runoff'
  | 'ejecta'
  | 'fracture'
  | 'rune-line'
  | 'burial'
  | 'foundation-track';

export type LandmarkMaterialStyle =
  | 'star-vein'
  | 'iron-nodule'
  | 'glowing-shard-bed'
  | 'rune-slab'
  | 'fragment-cache'
  | 'relic-inlay'
  | 'bone-bed'
  | 'resin-seam'
  | 'fossil-impression';

export interface LandmarkCircleShape {
  readonly kind: 'circle';
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface LandmarkCapsuleShape {
  readonly kind: 'capsule';
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly radius: number;
}

export interface LandmarkOrientedBoxShape {
  readonly kind: 'oriented-box';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

export type LandmarkSurfaceShape = LandmarkCircleShape | LandmarkCapsuleShape | LandmarkOrientedBoxShape;

export interface LandmarkSurfaceComponent {
  readonly id: string;
  readonly role: LandmarkComponentRole;
  readonly shape: LandmarkSurfaceShape;
  readonly height: number;
  readonly lean: number;
  readonly rotation: number;
  readonly scale: number;
  readonly variant: number;
  readonly order: number;
}

export interface LandmarkGroundDetail {
  readonly id: string;
  readonly kind: LandmarkGroundDetailKind;
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly width: number;
  readonly rotation: number;
  readonly opacity: number;
  readonly variant: number;
}

export interface LandmarkEntrance {
  readonly id: string;
  readonly landmark: ProceduralLandmark;
  readonly worldX: number;
  readonly worldY: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly facingAngle: number;
  readonly interactionRadiusPixels: number;
  readonly label: string;
}

export interface LandmarkEntranceVisualPosition {
  readonly worldX: number;
  readonly worldY: number;
}

// Interaction is measured from walkable ground in front of an entrance. Doors carved into tall
// landmark facades are higher, so UI markers and renderers share their authored visible position.
export const landmarkEntranceVisualPosition = (
  entrance: LandmarkEntrance
): LandmarkEntranceVisualPosition => ({
  worldX: entrance.worldX,
  worldY: entrance.landmark.type === LandmarkType.GiantAncientTree
    ? entrance.worldY - entrance.landmark.footprintRadiusTiles * WORLD_TILE_SIZE * 0.78 * 0.105
    : entrance.landmark.type === LandmarkType.Watchtower
      ? entrance.worldY - entrance.landmark.footprintRadiusTiles * WORLD_TILE_SIZE * 0.205
    : entrance.worldY
});

export interface LandmarkMaterialNode {
  readonly id: string;
  readonly landmarkId: string;
  readonly landmarkType: LandmarkType;
  readonly resource: ResourceType;
  readonly worldX: number;
  readonly worldY: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly scale: number;
  readonly rotation: number;
  readonly style: LandmarkMaterialStyle;
  readonly variant: number;
  readonly yieldAmount: number;
  readonly glowStrength: number;
  readonly clearanceRadiusPixels: number;
}

export interface LandmarkSurfacePlan {
  readonly id: string;
  readonly generationVersion: number;
  readonly landmark: ProceduralLandmark;
  readonly components: readonly LandmarkSurfaceComponent[];
  readonly structuralShapes: readonly LandmarkSurfaceShape[];
  readonly groundDetails: readonly LandmarkGroundDetail[];
  readonly entrance: LandmarkEntrance | null;
  readonly materials: readonly LandmarkMaterialNode[];
}

interface MaterialDefinition {
  readonly resource: ResourceType;
  readonly style: LandmarkMaterialStyle;
  readonly glowStrength: number;
}

// Keep these as canonical typed literals rather than a runtime enum import. resources.ts maps
// ordinary TerrainFeatureType values and therefore imports featureGenerator.ts, which itself
// consumes this planner; a value import here would close an ESM cycle and risk a TDZ read.
const STARSTONE = 'starstone' as ResourceType;
const METEOR_IRON = 'meteor iron' as ResourceType;
const GLOWING_FRAGMENTS = 'glowing fragments' as ResourceType;
const RUNE_STONE = 'rune stone' as ResourceType;
const ANCIENT_FRAGMENTS = 'ancient fragments' as ResourceType;
const RELIC_MATERIALS = 'relic materials' as ResourceType;
const BONE_FRAGMENTS = 'bone fragments' as ResourceType;
const FOSSIL_RESIN = 'fossil resin' as ResourceType;
const ANCIENT_REMAINS = 'ancient remains' as ResourceType;

const MATERIALS_BY_LANDMARK: Partial<Record<LandmarkType, readonly MaterialDefinition[]>> = {
  [LandmarkType.MeteorCrater]: [
    { resource: STARSTONE, style: 'star-vein', glowStrength: 0.62 },
    { resource: METEOR_IRON, style: 'iron-nodule', glowStrength: 0.08 },
    { resource: GLOWING_FRAGMENTS, style: 'glowing-shard-bed', glowStrength: 0.92 }
  ],
  [LandmarkType.StoneCircle]: [
    { resource: RUNE_STONE, style: 'rune-slab', glowStrength: 0.96 },
    { resource: ANCIENT_FRAGMENTS, style: 'fragment-cache', glowStrength: 0.04 },
    { resource: RELIC_MATERIALS, style: 'relic-inlay', glowStrength: 0.48 }
  ],
  [LandmarkType.GiantSkeleton]: [
    { resource: BONE_FRAGMENTS, style: 'bone-bed', glowStrength: 0 },
    { resource: FOSSIL_RESIN, style: 'resin-seam', glowStrength: 0.46 },
    { resource: ANCIENT_REMAINS, style: 'fossil-impression', glowStrength: 0.08 }
  ]
};

const centerWorld = (landmark: ProceduralLandmark): { readonly x: number; readonly y: number } => ({
  x: (landmark.centerTileX + 0.5) * WORLD_TILE_SIZE,
  y: (landmark.centerTileY + 0.5) * WORLD_TILE_SIZE
});

const planSeedFor = (seed: string, landmark: ProceduralLandmark): string => (
  `${seed}:${landmark.id}:surface:v${LANDMARK_SURFACE_GENERATION_VERSION}`
);

const planRandom = (planSeed: string, stream: number, index: number, salt = 0): number => (
  randomAtTile(planSeed, index * 131 + stream * 17, stream * 193 - index * 29, 0x68f137a5 ^ salt)
);

const rotateLocal = (x: number, y: number, rotation: number): { readonly x: number; readonly y: number } => ({
  x: x * Math.cos(rotation) - y * Math.sin(rotation),
  y: x * Math.sin(rotation) + y * Math.cos(rotation)
});

const circle = (x: number, y: number, radius: number): LandmarkCircleShape => ({ kind: 'circle', x, y, radius });
const capsule = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  radius: number
): LandmarkCapsuleShape => ({ kind: 'capsule', startX, startY, endX, endY, radius });
const box = (
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number
): LandmarkOrientedBoxShape => ({ kind: 'oriented-box', x, y, width, height, rotation });

const component = (
  landmark: ProceduralLandmark,
  role: LandmarkComponentRole,
  index: number,
  shape: LandmarkSurfaceShape,
  height: number,
  lean: number,
  rotation: number,
  scale: number,
  variant: number,
  order: number
): LandmarkSurfaceComponent => ({
  id: `${landmark.id}:component:${role}:${index}`,
  role,
  shape,
  height,
  lean,
  rotation,
  scale,
  variant,
  order
});

const groundDetail = (
  landmark: ProceduralLandmark,
  kind: LandmarkGroundDetailKind,
  index: number,
  x: number,
  y: number,
  length: number,
  width: number,
  rotation: number,
  opacity: number,
  variant: number
): LandmarkGroundDetail => ({
  id: `${landmark.id}:ground:${kind}:${index}`,
  kind,
  x,
  y,
  length,
  width,
  rotation,
  opacity,
  variant
});

const createEntrance = (
  landmark: ProceduralLandmark,
  localX: number,
  localY: number,
  facingAngle: number
): LandmarkEntrance => {
  const center = centerWorld(landmark);
  const offset = rotateLocal(localX, localY, landmark.rotation);
  const worldX = center.x + offset.x;
  const worldY = center.y + offset.y;
  return {
    id: `${landmark.id}:entrance`,
    landmark,
    worldX,
    worldY,
    tileX: Math.floor(worldX / WORLD_TILE_SIZE),
    tileY: Math.floor(worldY / WORLD_TILE_SIZE),
    facingAngle: facingAngle + landmark.rotation,
    interactionRadiusPixels: landmark.type === LandmarkType.GiantAncientTree ? 156 : 72,
    label: 'Press E to enter'
  };
};

const treePlan = (seed: string, landmark: ProceduralLandmark): Omit<LandmarkSurfacePlan, 'id' | 'generationVersion' | 'landmark' | 'materials'> => {
  const planSeed = planSeedFor(seed, landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const components: LandmarkSurfaceComponent[] = [];
  const shapes: LandmarkSurfaceShape[] = [];
  const details: LandmarkGroundDetail[] = [];
  // Surface art is screen-oriented for legibility, so counter-rotate the entrance to keep every
  // ancient tree's carved door on the visible southern face regardless of its seeded rotation.
  const entranceAngle = Math.PI / 2 - landmark.rotation;
  const tangentAngle = entranceAngle + Math.PI / 2;
  const trunkRotation = entranceAngle - Math.PI / 2;
  // Only the compact physical heart of the trunk blocks movement. The much larger rendered
  // trunk and crown intentionally occlude the player without trapping them behind invisible
  // root or canopy barriers.
  [-1, 1].forEach((side, index) => {
    const shape = box(
      Math.cos(tangentAngle) * side * r * 0.105 - Math.cos(entranceAngle) * r * 0.035,
      Math.sin(tangentAngle) * side * r * 0.105 - Math.sin(entranceAngle) * r * 0.035,
      r * 0.15,
      r * 0.38,
      trunkRotation
    );
    shapes.push(shape);
    components.push(component(landmark, 'ancient-trunk', index, shape, r * 1.62, side * 0.035, trunkRotation, 1, planRandom(planSeed, 1, index), index));
  });
  const rootCount = 12 + Math.floor(planRandom(planSeed, 2, 0) * 5);
  for (let index = 0; index < rootCount; index += 1) {
    const angle = -Math.PI + (index / rootCount) * Math.PI * 2
      + (planRandom(planSeed, 2, index, 1) - 0.5) * 0.24;
    // Keep the world-south entrance lane open.
    const pointsTowardEntrance = Math.abs(Math.atan2(Math.sin(angle - entranceAngle), Math.cos(angle - entranceAngle))) < 0.58;
    const startRadius = r * (0.13 + planRandom(planSeed, 2, index, 2) * 0.08);
    const length = r * (0.55 + planRandom(planSeed, 2, index, 3) * 0.48);
    const startX = Math.cos(angle) * startRadius;
    const startY = Math.sin(angle) * startRadius;
    const endX = Math.cos(angle) * length;
    const endY = Math.sin(angle) * length;
    details.push(groundDetail(landmark, 'root-trace', index, startX, startY, length, r * 0.07, angle, 0.2, planRandom(planSeed, 3, index)));
    if (!pointsTowardEntrance) {
      const shape = capsule(startX, startY, endX, endY, r * (0.045 + planRandom(planSeed, 2, index, 4) * 0.035));
      components.push(component(landmark, 'ancient-root', index, shape, r * 0.09, (planRandom(planSeed, 2, index, 5) - 0.5) * 0.12, angle, 1, planRandom(planSeed, 2, index, 6), 20 + index));
    }
  }
  const canopyCount = 22 + Math.floor(planRandom(planSeed, 4, 0) * 8);
  for (let index = 0; index < canopyCount; index += 1) {
    const angle = (index / canopyCount) * Math.PI * 2 + planRandom(planSeed, 4, index, 1) * 0.22;
    const distance = r * (0.22 + planRandom(planSeed, 4, index, 2) * 0.58);
    const shape = circle(
      Math.cos(angle) * distance,
      -r * 1.18 + Math.sin(angle) * distance * 0.5,
      r * (0.18 + planRandom(planSeed, 4, index, 3) * 0.19)
    );
    components.push(component(landmark, 'canopy-lobe', index, shape, r * 0.2, 0, angle, 1, planRandom(planSeed, 4, index, 4), 100 + index));
  }
  details.push(groundDetail(
    landmark,
    'approach-path',
    0,
    Math.cos(entranceAngle) * r * 0.72,
    Math.sin(entranceAngle) * r * 0.72,
    r * 0.62,
    r * 0.17,
    entranceAngle,
    0.26,
    planRandom(planSeed, 5, 0)
  ));
  return {
    components,
    structuralShapes: shapes,
    groundDetails: details,
    entrance: createEntrance(
      landmark,
      Math.cos(entranceAngle) * r * 0.2,
      Math.sin(entranceAngle) * r * 0.2,
      entranceAngle
    )
  };
};

const waterfallPlan = (seed: string, landmark: ProceduralLandmark): Omit<LandmarkSurfacePlan, 'id' | 'generationVersion' | 'landmark' | 'materials'> => {
  const planSeed = planSeedFor(seed, landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const components: LandmarkSurfaceComponent[] = [];
  const shapes: LandmarkSurfaceShape[] = [];
  const details: LandmarkGroundDetail[] = [];
  const rockCount = 15 + Math.floor(planRandom(planSeed, 10, 0) * 6);
  for (let index = 0; index < rockCount; index += 1) {
    const normalized = index / Math.max(1, rockCount - 1);
    const x = (normalized - 0.5) * r * 1.62;
    const y = -r * (0.2 + planRandom(planSeed, 10, index, 1) * 0.2);
    const shape = circle(x, y, r * (0.12 + planRandom(planSeed, 10, index, 2) * 0.11));
    const entranceX = r * 0.29;
    const entranceY = -r * 0.08;
    if (Math.hypot(shape.x - entranceX, shape.y - entranceY) <= shape.radius + 72) {
      continue;
    }
    shapes.push(shape);
    components.push(component(landmark, 'cliff-rock', index, shape, r * (0.28 + planRandom(planSeed, 10, index, 3) * 0.32), (planRandom(planSeed, 10, index, 4) - 0.5) * 0.12, 0, 1, planRandom(planSeed, 10, index, 5), index));
  }
  details.push(groundDetail(landmark, 'pool', 0, 0, r * 0.25, r * 1.48, r * 0.82, 0, 0.9, planRandom(planSeed, 11, 0)));
  details.push(groundDetail(landmark, 'runoff', 0, -r * 0.05, r * 0.82, r * 1.24, r * 0.18, Math.PI / 2, 0.82, planRandom(planSeed, 11, 1)));
  details.push(groundDetail(landmark, 'approach-path', 0, r * 0.28, r * 0.48, r * 0.52, r * 0.13, Math.PI / 2, 0.2, planRandom(planSeed, 11, 2)));
  return { components, structuralShapes: shapes, groundDetails: details, entrance: createEntrance(landmark, r * 0.29, -r * 0.08, Math.PI / 2) };
};

const craterPlan = (seed: string, landmark: ProceduralLandmark): Omit<LandmarkSurfacePlan, 'id' | 'generationVersion' | 'landmark' | 'materials'> => {
  const planSeed = planSeedFor(seed, landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const components: LandmarkSurfaceComponent[] = [];
  const shapes: LandmarkSurfaceShape[] = [];
  const details: LandmarkGroundDetail[] = [];
  const rimCount = 22 + Math.floor(planRandom(planSeed, 20, 0) * 8);
  for (let index = 0; index < rimCount; index += 1) {
    const angle = landmark.rotation + index / rimCount * Math.PI * 2 + (planRandom(planSeed, 20, index, 1) - 0.5) * 0.12;
    // Several walkable breaches keep every deposit reachable from outside.
    if (index % 8 === 3) {
      continue;
    }
    const distance = r * (0.72 + (planRandom(planSeed, 20, index, 2) - 0.5) * 0.13);
    const local = rotateLocal(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.68, -landmark.rotation);
    const shape = circle(local.x, local.y, r * (0.075 + planRandom(planSeed, 20, index, 3) * 0.055));
    shapes.push(shape);
    components.push(component(landmark, 'crater-rim', index, shape, r * 0.1, 0, angle, 1, planRandom(planSeed, 20, index, 4), index));
  }
  const core = circle(-r * 0.05, r * 0.03, r * 0.105);
  shapes.push(core);
  components.push(component(landmark, 'impact-core', 0, core, r * 0.18, -0.06, landmark.rotation, 1, planRandom(planSeed, 21, 0), 100));
  for (let index = 0; index < 16; index += 1) {
    const angle = index / 16 * Math.PI * 2 + planRandom(planSeed, 22, index) * 0.18;
    details.push(groundDetail(landmark, index % 3 === 0 ? 'fracture' : 'ejecta', index, 0, 0, r * (0.75 + planRandom(planSeed, 22, index, 1) * 0.8), r * (0.025 + planRandom(planSeed, 22, index, 2) * 0.045), angle, 0.16 + planRandom(planSeed, 22, index, 3) * 0.16, planRandom(planSeed, 22, index, 4)));
  }
  return { components, structuralShapes: shapes, groundDetails: details, entrance: null };
};

const stoneCirclePlan = (seed: string, landmark: ProceduralLandmark): Omit<LandmarkSurfacePlan, 'id' | 'generationVersion' | 'landmark' | 'materials'> => {
  const planSeed = planSeedFor(seed, landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const components: LandmarkSurfaceComponent[] = [];
  const shapes: LandmarkSurfaceShape[] = [];
  const details: LandmarkGroundDetail[] = [];
  const count = 11 + Math.floor(planRandom(planSeed, 30, 0) * 3);
  const ringScale = 0.79 + (planRandom(planSeed, 30, 1) - 0.5) * 0.055;
  const gapIndex = Math.floor(planRandom(planSeed, 30, 2) * count);
  for (let index = 0; index < count; index += 1) {
    if (index === gapIndex) {
      continue;
    }
    const angle = landmark.rotation + index / count * Math.PI * 2
      + (planRandom(planSeed, 30, index, 3) - 0.5) * 0.045;
    const distance = r * (ringScale + (planRandom(planSeed, 30, index, 4) - 0.5) * 0.035);
    const local = rotateLocal(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.7, -landmark.rotation);
    const blockRotation = angle + Math.PI / 2 + (planRandom(planSeed, 30, index, 5) - 0.5) * 0.075;
    const shape = box(
      local.x,
      local.y,
      r * (0.118 + planRandom(planSeed, 30, index, 6) * 0.036),
      r * (0.09 + planRandom(planSeed, 30, index, 7) * 0.028),
      blockRotation - landmark.rotation
    );
    shapes.push(shape);
    components.push(component(
      landmark,
      'stone-block',
      index,
      shape,
      r * (0.205 + planRandom(planSeed, 30, index, 8) * 0.09),
      (planRandom(planSeed, 30, index, 9) - 0.5) * 0.025,
      blockRotation,
      0.94 + planRandom(planSeed, 30, index, 10) * 0.12,
      planRandom(planSeed, 30, index, 11),
      local.y
    ));
  }
  const altarRotation = (planRandom(planSeed, 31, 0) - 0.5) * 0.18;
  const altar = box(0, 0, r * 0.135, r * 0.095, altarRotation);
  shapes.push(altar);
  components.push(component(
    landmark,
    'rune-altar',
    0,
    altar,
    r * 0.045,
    0,
    landmark.rotation + altarRotation,
    1,
    planRandom(planSeed, 31, 1),
    0
  ));
  for (let index = 0; index < 6; index += 1) {
    const angle = landmark.rotation + index / 6 * Math.PI * 2 + (planRandom(planSeed, 31, index, 2) - 0.5) * 0.08;
    details.push(groundDetail(landmark, 'rune-line', index, 0, 0, r * (0.32 + planRandom(planSeed, 31, index, 3) * 0.2), r * 0.006, angle, 0.1, planRandom(planSeed, 31, index, 4)));
  }
  // Deliberately no ground disk: the ring remains native biome terrain outside the exact stone
  // and altar clearances, while authored grass at each buried base integrates the monuments.
  return { components, structuralShapes: shapes, groundDetails: details, entrance: null };
};

const skeletonPlan = (seed: string, landmark: ProceduralLandmark): Omit<LandmarkSurfacePlan, 'id' | 'generationVersion' | 'landmark' | 'materials'> => {
  const planSeed = planSeedFor(seed, landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const components: LandmarkSurfaceComponent[] = [];
  const shapes: LandmarkSurfaceShape[] = [];
  const details: LandmarkGroundDetail[] = [];
  const spineAngle = (planRandom(planSeed, 40, 0) - 0.5) * 0.22;
  const spine = capsule(-r * 0.63, 0, r * 0.46, r * 0.03, r * 0.055);
  shapes.push(spine);
  components.push(component(landmark, 'skeleton-spine', 0, spine, r * 0.06, spineAngle, landmark.rotation, 1, planRandom(planSeed, 40, 1), 0));
  const ribCount = 9 + Math.floor(planRandom(planSeed, 41, 0) * 4);
  for (let index = 0; index < ribCount; index += 1) {
    const progress = index / Math.max(1, ribCount - 1);
    const x = -r * 0.42 + progress * r * 0.72;
    [-1, 1].forEach((side) => {
      const ribLength = r * (0.21 + Math.sin(progress * Math.PI) * 0.17) * (0.9 + planRandom(planSeed, 41, index, side + 3) * 0.16);
      const shape = capsule(x, 0, x + r * 0.04, side * ribLength, r * 0.032);
      shapes.push(shape);
      components.push(component(landmark, 'skeleton-rib', index * 2 + (side > 0 ? 1 : 0), shape, r * 0.035, side * 0.04, landmark.rotation, 1, planRandom(planSeed, 41, index, side + 7), index));
    });
  }
  const skull = box(r * 0.6, r * 0.02, r * 0.31, r * 0.25, -0.08);
  shapes.push(skull);
  components.push(component(landmark, 'skeleton-skull', 0, skull, r * 0.12, -0.07, landmark.rotation, 1, planRandom(planSeed, 42, 0), 100));
  for (let index = 0; index < 10; index += 1) {
    const angle = planRandom(planSeed, 43, index) * Math.PI * 2;
    const distance = r * (0.16 + planRandom(planSeed, 43, index, 1) * 0.58);
    details.push(groundDetail(landmark, 'burial', index, Math.cos(angle) * distance, Math.sin(angle) * distance * 0.55, r * (0.16 + planRandom(planSeed, 43, index, 2) * 0.25), r * (0.07 + planRandom(planSeed, 43, index, 3) * 0.08), angle, 0.12 + planRandom(planSeed, 43, index, 4) * 0.15, planRandom(planSeed, 43, index, 5)));
  }
  return { components, structuralShapes: shapes, groundDetails: details, entrance: null };
};

const towerPlan = (seed: string, landmark: ProceduralLandmark): Omit<LandmarkSurfacePlan, 'id' | 'generationVersion' | 'landmark' | 'materials'> => {
  const planSeed = planSeedFor(seed, landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const components: LandmarkSurfaceComponent[] = [];
  const shapes: LandmarkSurfaceShape[] = [];
  const details: LandmarkGroundDetail[] = [];
  // Counter-rotation keeps the facade and doorway screen-south while the landmark still retains
  // its seeded rotation for detail variation and identity.
  const halfWidth = r * (0.3 + planRandom(planSeed, 50, 0) * 0.035);
  const halfDepth = r * (0.225 + planRandom(planSeed, 50, 1) * 0.025);
  const wallThickness = r * 0.105;
  const doorHalfWidth = r * (0.085 + planRandom(planSeed, 50, 2) * 0.012);
  const screenAlignedBox = (
    screenX: number,
    screenY: number,
    width: number,
    height: number
  ): LandmarkOrientedBoxShape => {
    const local = rotateLocal(screenX, screenY, -landmark.rotation);
    return box(local.x, local.y, width, height, -landmark.rotation);
  };
  const frontSegmentWidth = halfWidth - doorHalfWidth;
  const wallShapes = [
    screenAlignedBox(0, -halfDepth + wallThickness * 0.5, halfWidth * 2, wallThickness),
    screenAlignedBox(-halfWidth + wallThickness * 0.5, 0, wallThickness, halfDepth * 2),
    screenAlignedBox(halfWidth - wallThickness * 0.5, 0, wallThickness, halfDepth * 2),
    screenAlignedBox(-doorHalfWidth - frontSegmentWidth * 0.5, halfDepth - wallThickness * 0.5, frontSegmentWidth, wallThickness),
    screenAlignedBox(doorHalfWidth + frontSegmentWidth * 0.5, halfDepth - wallThickness * 0.5, frontSegmentWidth, wallThickness)
  ];
  wallShapes.forEach((shape, index) => {
    shapes.push(shape);
    components.push(component(
      landmark,
      'tower-foundation',
      index,
      shape,
      r * (1.16 + planRandom(planSeed, 50, index, 3) * 0.16),
      0,
      0,
      1,
      planRandom(planSeed, 50, index, 4),
      index
    ));
  });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sideX, sideY], index) => {
    const screenX = sideX * (halfWidth - wallThickness * 0.08);
    const screenY = sideY * (halfDepth - wallThickness * 0.08);
    const local = rotateLocal(screenX, screenY, -landmark.rotation);
    const shape = circle(local.x, local.y, r * (0.075 + planRandom(planSeed, 51, index, 0) * 0.012));
    shapes.push(shape);
    components.push(component(
      landmark,
      'tower-leg',
      index,
      shape,
      r * (0.2 + planRandom(planSeed, 51, index, 1) * 0.06),
      sideX * 0.012,
      0,
      1,
      planRandom(planSeed, 51, index, 2),
      screenY
    ));
  });
  const platformShape = screenAlignedBox(0, -r * 0.02, halfWidth * 2.22, halfDepth * 2.22);
  components.push(component(landmark, 'tower-platform', 0, platformShape, r * 0.18, 0, 0, 1, planRandom(planSeed, 52, 0), 100));
  details.push(groundDetail(landmark, 'foundation-track', 0, 0, r * 0.015, r * 0.88, r * 0.68, 0, 0.24, planRandom(planSeed, 53, 0)));
  details.push(groundDetail(landmark, 'approach-path', 0, 0, r * 0.53, r * 0.68, r * 0.17, Math.PI / 2, 0.25, planRandom(planSeed, 53, 1)));
  const entranceScreenY = halfDepth + r * 0.1;
  const entranceLocal = rotateLocal(0, entranceScreenY, -landmark.rotation);
  return {
    components,
    structuralShapes: shapes,
    groundDetails: details,
    entrance: createEntrance(landmark, entranceLocal.x, entranceLocal.y, Math.PI / 2 - landmark.rotation)
  };
};

const distanceToSegmentSquared = (
  x: number,
  y: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): number => {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const progress = lengthSquared <= 0
    ? 0
    : Math.max(0, Math.min(1, ((x - startX) * deltaX + (y - startY) * deltaY) / lengthSquared));
  const closestX = startX + deltaX * progress;
  const closestY = startY + deltaY * progress;
  return (x - closestX) ** 2 + (y - closestY) ** 2;
};

export const landmarkSurfaceShapeContainsLocalPoint = (
  shape: LandmarkSurfaceShape,
  localX: number,
  localY: number,
  paddingPixels = 0
): boolean => {
  if (shape.kind === 'circle') {
    return (localX - shape.x) ** 2 + (localY - shape.y) ** 2 <= (shape.radius + paddingPixels) ** 2;
  }
  if (shape.kind === 'capsule') {
    return distanceToSegmentSquared(localX, localY, shape.startX, shape.startY, shape.endX, shape.endY)
      <= (shape.radius + paddingPixels) ** 2;
  }
  const cosine = Math.cos(-shape.rotation);
  const sine = Math.sin(-shape.rotation);
  const deltaX = localX - shape.x;
  const deltaY = localY - shape.y;
  const rotatedX = deltaX * cosine - deltaY * sine;
  const rotatedY = deltaX * sine + deltaY * cosine;
  return Math.abs(rotatedX) <= shape.width / 2 + paddingPixels
    && Math.abs(rotatedY) <= shape.height / 2 + paddingPixels;
};

const worldToPlanLocal = (
  plan: LandmarkSurfacePlan,
  worldX: number,
  worldY: number
): { readonly x: number; readonly y: number } => {
  const center = centerWorld(plan.landmark);
  return rotateLocal(worldX - center.x, worldY - center.y, -plan.landmark.rotation);
};

const materialLocation = (
  seed: string,
  landmark: ProceduralLandmark,
  shapes: readonly LandmarkSurfaceShape[],
  existing: readonly LandmarkMaterialNode[],
  definition: MaterialDefinition,
  index: number,
  required: boolean
): LandmarkMaterialNode | null => {
  const planSeed = planSeedFor(seed, landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const center = centerWorld(landmark);
  if (landmark.type === LandmarkType.StoneCircle && definition.resource === RUNE_STONE) {
    return {
      id: `${landmark.id}:surface-material:rune-stone:${index}`,
      landmarkId: landmark.id,
      landmarkType: landmark.type,
      resource: definition.resource,
      worldX: center.x,
      worldY: center.y - r * 0.045,
      tileX: landmark.centerTileX,
      tileY: Math.floor((center.y - r * 0.045) / WORLD_TILE_SIZE),
      scale: 1.12,
      rotation: landmark.rotation + (planRandom(planSeed, 31, 0) - 0.5) * 0.18,
      style: definition.style,
      variant: planRandom(planSeed, 90 + index, 2),
      yieldAmount: 1,
      glowStrength: definition.glowStrength,
      clearanceRadiusPixels: r * 0.085
    };
  }
  const minimumRadius = landmark.type === LandmarkType.StoneCircle ? r * 0.92 : r * 0.16;
  const maximumRadius = landmark.type === LandmarkType.StoneCircle
    ? r * 0.98
    : landmark.type === LandmarkType.GiantSkeleton
      ? r * 0.72
      : r * 0.62;
  const desiredSpacing = landmark.type === LandmarkType.StoneCircle
    ? 70
    : landmark.type === LandmarkType.GiantSkeleton
      ? 76
      : 82;
  const candidateClearance = (candidate: { readonly x: number; readonly y: number }): number => {
    if (shapes.some((shape) => landmarkSurfaceShapeContainsLocalPoint(shape, candidate.x, candidate.y, 34))) {
      return Number.NEGATIVE_INFINITY;
    }
    const rotated = rotateLocal(candidate.x, candidate.y, landmark.rotation);
    const worldX = center.x + rotated.x;
    const worldY = center.y + rotated.y;
    return existing.reduce(
      (clearance, node) => Math.min(clearance, Math.hypot(node.worldX - worldX, node.worldY - worldY)),
      Number.POSITIVE_INFINITY
    );
  };
  let chosen: { readonly x: number; readonly y: number } | undefined;
  let bestCandidate: { readonly x: number; readonly y: number } | undefined;
  let bestClearance = Number.NEGATIVE_INFINITY;
  const considerCandidate = (candidate: { readonly x: number; readonly y: number }): boolean => {
    const clearance = candidateClearance(candidate);
    if (clearance > bestClearance) {
      bestClearance = clearance;
      bestCandidate = candidate;
    }
    if (clearance >= desiredSpacing) {
      chosen = candidate;
      return true;
    }
    return false;
  };
  for (let attempt = 0; attempt < 72; attempt += 1) {
    const angle = planRandom(planSeed, 70 + index, attempt, 1) * Math.PI * 2;
    const distance = minimumRadius + planRandom(planSeed, 70 + index, attempt, 2) * (maximumRadius - minimumRadius);
    const candidate = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.68 };
    if (considerCandidate(candidate)) {
      break;
    }
  }

  // Random rejection is intentionally bounded. In the unlikely event that all random samples
  // miss a narrow open pocket, sweep a dense deterministic polar lattice before failing loudly;
  // silently dropping a node at the origin can overlap a wall and make a save permanently bad.
  if (!chosen) {
    const phase = planRandom(planSeed, 70 + index, 999, 1) * Math.PI * 2;
    exhaustiveSearch:
    for (let radialStep = 0; radialStep < 24; radialStep += 1) {
      const distance = minimumRadius
        + ((radialStep + 0.5) / 24) * (maximumRadius - minimumRadius);
      for (let angleStep = 0; angleStep < 96; angleStep += 1) {
        const angle = phase + angleStep * (Math.PI * 2 / 96);
        const candidate = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.68 };
        if (considerCandidate(candidate)) {
          break exhaustiveSearch;
        }
      }
    }
  }
  if (!chosen) {
    // Extras are enrichment, not content requirements. Omitting an overcrowded extra keeps world
    // generation total and stable. Required theme materials may use the best exhaustive pocket,
    // but never overlap a structure or sit close enough to merge into an existing deposit.
    if (!required) {
      return null;
    }
    if (!bestCandidate || bestClearance < 52) {
      throw new Error(`Unable to place required deterministic landmark material ${index} for ${landmark.id}`);
    }
    chosen = bestCandidate;
  }
  const offset = rotateLocal(chosen.x, chosen.y, landmark.rotation);
  const worldX = center.x + offset.x;
  const worldY = center.y + offset.y;
  const resourceKey = String(definition.resource).replace(/[^a-z0-9]+/g, '-');
  return {
    id: `${landmark.id}:surface-material:${resourceKey}:${index}`,
    landmarkId: landmark.id,
    landmarkType: landmark.type,
    resource: definition.resource,
    worldX,
    worldY,
    tileX: Math.floor(worldX / WORLD_TILE_SIZE),
    tileY: Math.floor(worldY / WORLD_TILE_SIZE),
    scale: 0.82 + planRandom(planSeed, 90 + index, 0) * 0.48,
    rotation: planRandom(planSeed, 90 + index, 1) * Math.PI * 2,
    style: definition.style,
    variant: planRandom(planSeed, 90 + index, 2),
    yieldAmount: 1 + Math.floor(planRandom(planSeed, 90 + index, 3) * 3),
    glowStrength: definition.glowStrength * (0.82 + planRandom(planSeed, 90 + index, 4) * 0.28),
    clearanceRadiusPixels: 34 + planRandom(planSeed, 90 + index, 5) * 14
  };
};

export const createLandmarkSurfacePlan = (
  seed: string,
  landmark: ProceduralLandmark
): LandmarkSurfacePlan => {
  const partial = (() => {
    switch (landmark.type) {
      case LandmarkType.GiantAncientTree:
        return treePlan(seed, landmark);
      case LandmarkType.Waterfall:
        return waterfallPlan(seed, landmark);
      case LandmarkType.MeteorCrater:
        return craterPlan(seed, landmark);
      case LandmarkType.StoneCircle:
        return stoneCirclePlan(seed, landmark);
      case LandmarkType.GiantSkeleton:
        return skeletonPlan(seed, landmark);
      case LandmarkType.Watchtower:
        return towerPlan(seed, landmark);
    }
  })();
  const materials: LandmarkMaterialNode[] = [];
  const definitions = MATERIALS_BY_LANDMARK[landmark.type] ?? [];
  // One of every requested material is guaranteed. Seeded extras make two landmarks of the same
  // type materially different without ever omitting a theme-defining rare resource.
  definitions.forEach((definition, index) => {
    const material = materialLocation(seed, landmark, partial.structuralShapes, materials, definition, index, true);
    if (material) {
      materials.push(material);
    }
  });
  const planSeed = planSeedFor(seed, landmark);
  const extraCount = definitions.length === 0 || landmark.type === LandmarkType.StoneCircle
    ? 0
    : 2 + Math.floor(planRandom(planSeed, 101, 0) * 4);
  const extraDefinitions = landmark.type === LandmarkType.StoneCircle
    ? definitions.filter((definition) => definition.resource !== RUNE_STONE)
    : definitions;
  for (let extra = 0; extra < extraCount; extra += 1) {
    const definition = extraDefinitions[Math.floor(planRandom(planSeed, 102, extra) * extraDefinitions.length)]!;
    const material = materialLocation(
      seed,
      landmark,
      partial.structuralShapes,
      materials,
      definition,
      definitions.length + extra,
      false
    );
    if (material) {
      materials.push(material);
    }
  }
  return {
    id: `${landmark.id}:surface-plan:v${LANDMARK_SURFACE_GENERATION_VERSION}`,
    generationVersion: LANDMARK_SURFACE_GENERATION_VERSION,
    landmark,
    ...partial,
    materials
  };
};

export const landmarkStructureContainsWorldPoint = (
  plan: LandmarkSurfacePlan,
  worldX: number,
  worldY: number,
  paddingPixels = 0
): boolean => {
  const local = worldToPlanLocal(plan, worldX, worldY);
  return plan.structuralShapes.some((shape) => landmarkSurfaceShapeContainsLocalPoint(shape, local.x, local.y, paddingPixels));
};

export const landmarkCollisionContainsWorldPoint = landmarkStructureContainsWorldPoint;

export interface LandmarkCollisionFreePoint {
  readonly worldX: number;
  readonly worldY: number;
}

// Save files may place a player inside geometry introduced by a later visual generation version.
// Search concentric rings in a fixed order so recovery is deterministic and always chooses the
// nearest sampled open point instead of leaving movement trapped inside collision.
export const findNearestLandmarkCollisionFreeWorldPoint = (
  plans: readonly LandmarkSurfacePlan[],
  worldX: number,
  worldY: number,
  paddingPixels = 23,
  maximumRadiusPixels = WORLD_TILE_SIZE * 24
): LandmarkCollisionFreePoint | null => {
  const isBlocked = (candidateX: number, candidateY: number): boolean => plans.some((plan) => (
    landmarkCollisionContainsWorldPoint(plan, candidateX, candidateY, paddingPixels)
  ));
  if (!isBlocked(worldX, worldY)) {
    return { worldX, worldY };
  }
  const radialStep = WORLD_TILE_SIZE * 0.5;
  const sampleCount = 32;
  for (let radius = radialStep; radius <= maximumRadiusPixels; radius += radialStep) {
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const angle = Math.PI / 2 + sample / sampleCount * Math.PI * 2;
      const candidateX = worldX + Math.cos(angle) * radius;
      const candidateY = worldY + Math.sin(angle) * radius;
      if (!isBlocked(candidateX, candidateY)) {
        return { worldX: candidateX, worldY: candidateY };
      }
    }
  }
  return null;
};

export const ancientTreeOccludesWorldPoint = (
  landmark: ProceduralLandmark,
  worldX: number,
  worldY: number
): boolean => {
  if (landmark.type !== LandmarkType.GiantAncientTree) {
    return false;
  }
  const center = centerWorld(landmark);
  const radius = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const normalizedX = (worldX - center.x) / (radius * 0.7);
  // The front root flare and doorway remain below the avatar. Only the trunk and crown north of
  // the center become foreground when the player walks behind them.
  const normalizedY = (worldY - (center.y - radius * 0.72)) / (radius * 0.78);
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
};

export const stoneCircleOccludesWorldPoint = (
  plan: LandmarkSurfacePlan,
  worldX: number,
  worldY: number
): boolean => {
  if (plan.landmark.type !== LandmarkType.StoneCircle) {
    return false;
  }
  const landmarkCenter = centerWorld(plan.landmark);
  return plan.components.some((part) => {
    if (part.role !== 'stone-block' || part.shape.kind !== 'oriented-box') {
      return false;
    }
    const rotatedCenter = rotateLocal(part.shape.x, part.shape.y, plan.landmark.rotation);
    const centerX = landmarkCenter.x + rotatedCenter.x;
    const centerY = landmarkCenter.y + rotatedCenter.y;
    const worldRotation = part.shape.rotation + plan.landmark.rotation;
    const screenWidth = Math.abs(Math.cos(worldRotation)) * part.shape.width
      + Math.abs(Math.sin(worldRotation)) * part.shape.height;
    const screenDepth = Math.abs(Math.sin(worldRotation)) * part.shape.width
      + Math.abs(Math.cos(worldRotation)) * part.shape.height;
    const groundLineY = centerY + screenDepth * 0.13;
    const visualTopY = centerY - part.height;
    // Depth is decided by the player's feet. A player south of the ground line is in front;
    // north of it, the pillar rises between the camera and any overlapping part of the avatar.
    return Math.abs(worldX - centerX) <= screenWidth * 0.55 + WORLD_TILE_SIZE * 0.12
      && worldY <= groundLineY + WORLD_TILE_SIZE * 0.06
      && worldY >= visualTopY - WORLD_TILE_SIZE * 0.12;
  });
};

export const watchtowerOccludesWorldPoint = (
  plan: LandmarkSurfacePlan,
  worldX: number,
  worldY: number
): boolean => {
  if (plan.landmark.type !== LandmarkType.Watchtower) {
    return false;
  }
  const landmarkCenter = centerWorld(plan.landmark);
  const walls = plan.components.filter((part) => (
    part.role === 'tower-foundation' && part.shape.kind === 'oriented-box'
  ));
  if (walls.length === 0) {
    return false;
  }
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let groundLineY = Number.NEGATIVE_INFINITY;
  let visualTopY = Number.POSITIVE_INFINITY;
  walls.forEach((part) => {
    if (part.shape.kind !== 'oriented-box') return;
    const rotatedCenter = rotateLocal(part.shape.x, part.shape.y, plan.landmark.rotation);
    const centerX = landmarkCenter.x + rotatedCenter.x;
    const centerY = landmarkCenter.y + rotatedCenter.y;
    const worldRotation = part.shape.rotation + plan.landmark.rotation;
    const screenWidth = Math.abs(Math.cos(worldRotation)) * part.shape.width
      + Math.abs(Math.sin(worldRotation)) * part.shape.height;
    const screenDepth = Math.abs(Math.sin(worldRotation)) * part.shape.width
      + Math.abs(Math.cos(worldRotation)) * part.shape.height;
    left = Math.min(left, centerX - screenWidth * 0.5);
    right = Math.max(right, centerX + screenWidth * 0.5);
    groundLineY = Math.max(groundLineY, centerY + screenDepth * 0.5);
    visualTopY = Math.min(visualTopY, centerY + screenDepth * 0.5 - part.height);
  });
  // The player's feet control depth. The southern doorway and approach remain in front, while
  // the continuous masonry body hides an avatar crossing behind the tower.
  return worldX >= left - WORLD_TILE_SIZE * 0.12
    && worldX <= right + WORLD_TILE_SIZE * 0.12
    && worldY <= groundLineY + WORLD_TILE_SIZE * 0.04
    && worldY >= visualTopY - WORLD_TILE_SIZE * 0.12;
};

export const landmarkPlanBlocksFeatureTile = (
  plan: LandmarkSurfacePlan,
  tileX: number,
  tileY: number
): boolean => {
  const worldX = (tileX + 0.5) * WORLD_TILE_SIZE;
  const worldY = (tileY + 0.5) * WORLD_TILE_SIZE;
  if (plan.landmark.type === LandmarkType.GiantAncientTree) {
    const center = centerWorld(plan.landmark);
    const radius = plan.landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
    const normalizedX = (worldX - center.x) / (radius * 0.84);
    const normalizedY = (worldY - (center.y - radius * 0.34)) / (radius * 1.18);
    if (normalizedX * normalizedX + normalizedY * normalizedY <= 1) {
      return true;
    }
  }
  if (plan.landmark.type === LandmarkType.StoneCircle) {
    const center = centerWorld(plan.landmark);
    const radius = plan.landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
    const local = rotateLocal(worldX - center.x, worldY - center.y, -plan.landmark.rotation);
    const normalizedX = local.x / (radius * 0.86);
    const normalizedY = local.y / (radius * 0.64);
    if (normalizedX * normalizedX + normalizedY * normalizedY <= 1) {
      return true;
    }
  }
  const structurePadding = plan.landmark.type === LandmarkType.StoneCircle
    ? WORLD_TILE_SIZE * 2.2
    : WORLD_TILE_SIZE * 0.58;
  if (landmarkStructureContainsWorldPoint(plan, worldX, worldY, structurePadding)) {
    return true;
  }
  return plan.materials.some((material) => (
    Math.hypot(material.worldX - worldX, material.worldY - worldY)
      <= material.clearanceRadiusPixels + WORLD_TILE_SIZE * 0.54
  ));
};

export const landmarkPlanBlocksGroundGrassTile = (
  plan: LandmarkSurfacePlan,
  tileX: number,
  tileY: number
): boolean => {
  const worldX = (tileX + 0.5) * WORLD_TILE_SIZE;
  const worldY = (tileY + 0.5) * WORLD_TILE_SIZE;
  if (landmarkStructureContainsWorldPoint(plan, worldX, worldY, WORLD_TILE_SIZE * 0.18)) {
    return true;
  }
  return plan.materials.some((material) => (
    Math.hypot(material.worldX - worldX, material.worldY - worldY)
      <= material.clearanceRadiusPixels + WORLD_TILE_SIZE * 0.18
  ));
};

export const findLandmarkEntrance = (plan: LandmarkSurfacePlan): LandmarkEntrance | null => plan.entrance;

export const findLandmarkEntranceNearWorldPoint = (
  plan: LandmarkSurfacePlan,
  worldX: number,
  worldY: number,
  radiusPixels: number
): LandmarkEntrance | null => {
  const entrance = plan.entrance;
  return entrance && Math.hypot(entrance.worldX - worldX, entrance.worldY - worldY) <= radiusPixels
    ? entrance
    : null;
};

export const findLandmarkSurfaceMaterialAtWorldPoint = (
  plan: LandmarkSurfacePlan,
  worldX: number,
  worldY: number,
  radiusPixels: number,
  isAvailable: (material: LandmarkMaterialNode) => boolean = () => true
): LandmarkMaterialNode | null => {
  let nearest: LandmarkMaterialNode | null = null;
  let nearestDistanceSquared = radiusPixels * radiusPixels;
  plan.materials.forEach((material) => {
    if (!isAvailable(material)) {
      return;
    }
    const distanceSquared = (material.worldX - worldX) ** 2 + (material.worldY - worldY) ** 2;
    if (distanceSquared < nearestDistanceSquared) {
      nearest = material;
      nearestDistanceSquared = distanceSquared;
    }
  });
  return nearest;
};

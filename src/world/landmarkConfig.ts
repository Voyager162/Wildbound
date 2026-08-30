import { Biome } from './generation/biomeGenerator';

// Landmarks are a macro-generation layer. Keeping their placement values here means terrain,
// feature, map, and rendering code can all agree on the same deterministic world landmarks.
export enum LandmarkType {
  GiantAncientTree = 'giant-ancient-tree',
  Waterfall = 'waterfall',
  MeteorCrater = 'meteor-crater',
  StoneCircle = 'stone-circle',
  GiantSkeleton = 'giant-skeleton',
  Watchtower = 'watchtower'
}

export interface LandmarkDefinition {
  readonly type: LandmarkType;
  readonly label: string;
  readonly validBiomes: readonly Biome[];
  readonly selectionWeight: number;
  readonly footprintRadiusTiles: number;
  readonly visualRadiusTiles: number;
  readonly reservationPaddingTiles: number;
  readonly mapColor: number;
}

// This is the public, seed-derived record that rendering, maps, and exploration state use.
export interface ProceduralLandmark {
  readonly id: string;
  readonly type: LandmarkType;
  readonly label: string;
  readonly biome: Biome;
  readonly centerTileX: number;
  readonly centerTileY: number;
  readonly footprintRadiusTiles: number;
  readonly visualRadiusTiles: number;
  readonly reservationRadiusTiles: number;
  readonly rotation: number;
  readonly variation: number;
  readonly mapColor: number;
}

export interface LandmarkGenerationConfig {
  readonly generationVersion: number;
  readonly macroCellSizeTiles: number;
  readonly candidateChance: number;
  readonly candidatePositionPaddingTiles: number;
  readonly minimumSeparationTiles: number;
  readonly spawnTileX: number;
  readonly spawnTileY: number;
  readonly spawnExclusionRadiusTiles: number;
  readonly cellCacheLimit: number;
  readonly seedCacheLimit: number;
}

export interface LandmarkRandomSalts {
  readonly candidate: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly type: number;
  readonly variation: number;
  readonly rotation: number;
  readonly priority: number;
}

// These values intentionally make landmarks much rarer than normal terrain features. A macro
// cell is 384 tiles across (24 chunks), so an accepted landmark is typically several screens away.
export const LANDMARK_GENERATION_CONFIG: LandmarkGenerationConfig = {
  generationVersion: 2,
  macroCellSizeTiles: 384,
  candidateChance: 0.38,
  candidatePositionPaddingTiles: 54,
  minimumSeparationTiles: 132,
  spawnTileX: 0,
  spawnTileY: 0,
  spawnExclusionRadiusTiles: 96,
  cellCacheLimit: 2048,
  seedCacheLimit: 4
};

// Salts isolate landmark rolls from one another and from normal terrain/feature generation.
export const LANDMARK_RANDOM_SALTS: LandmarkRandomSalts = {
  candidate: 0x52b88f31,
  centerX: 0x7380c1a5,
  centerY: 0xa64e52db,
  type: 0x1b7d8ea9,
  variation: 0xc7f44163,
  rotation: 0x3d20ae97,
  priority: 0x96a4d5fb
};

// Macro footprints reserve enough room for complete locations rather than a single emblem. The
// surface plan still uses exact component shapes for feature clearance and collision, leaving
// courtyards, stone-circle centers, and natural terrain open inside these broad bounds.
export const LANDMARK_DEFINITIONS = [
  {
    type: LandmarkType.GiantAncientTree,
    label: 'Giant Ancient Tree',
    validBiomes: [Biome.Forest, Biome.Plains, Biome.Swamp],
    selectionWeight: 1.1,
    footprintRadiusTiles: 18,
    visualRadiusTiles: 35,
    reservationPaddingTiles: 8,
    mapColor: 0x2d7540
  },
  {
    type: LandmarkType.Waterfall,
    label: 'Waterfall',
    validBiomes: [Biome.Hills, Biome.Mountains, Biome.Snow],
    selectionWeight: 0.72,
    footprintRadiusTiles: 22,
    visualRadiusTiles: 39,
    reservationPaddingTiles: 8,
    mapColor: 0x67d9e8
  },
  {
    type: LandmarkType.MeteorCrater,
    label: 'Meteor Crater',
    validBiomes: [Biome.Plains, Biome.Forest, Biome.Desert, Biome.Hills, Biome.Snow],
    selectionWeight: 0.78,
    footprintRadiusTiles: 25,
    visualRadiusTiles: 38,
    reservationPaddingTiles: 8,
    mapColor: 0x9b6048
  },
  {
    type: LandmarkType.StoneCircle,
    label: 'Stone Circle',
    validBiomes: [Biome.Plains, Biome.Forest, Biome.Hills, Biome.Snow],
    selectionWeight: 0.82,
    footprintRadiusTiles: 17,
    visualRadiusTiles: 28,
    reservationPaddingTiles: 6,
    mapColor: 0xb6b9b2
  },
  {
    type: LandmarkType.GiantSkeleton,
    label: 'Giant Skeleton',
    validBiomes: [Biome.Plains, Biome.Desert, Biome.Hills, Biome.Snow],
    selectionWeight: 0.52,
    footprintRadiusTiles: 22,
    visualRadiusTiles: 35,
    reservationPaddingTiles: 8,
    mapColor: 0xe7dfbb
  },
  {
    type: LandmarkType.Watchtower,
    label: 'Watchtower',
    validBiomes: [Biome.Plains, Biome.Forest, Biome.Desert, Biome.Hills, Biome.Mountains, Biome.Snow],
    selectionWeight: 0.84,
    footprintRadiusTiles: 13,
    visualRadiusTiles: 31,
    reservationPaddingTiles: 7,
    mapColor: 0xd3a566
  }
] as const satisfies readonly LandmarkDefinition[];

export const MAX_LANDMARK_FOOTPRINT_RADIUS_TILES = Math.max(
  ...LANDMARK_DEFINITIONS.map((definition) => definition.footprintRadiusTiles)
);

export const MAX_LANDMARK_VISUAL_RADIUS_TILES = Math.max(
  ...LANDMARK_DEFINITIONS.map((definition) => definition.visualRadiusTiles)
);

export const MAX_LANDMARK_RESERVATION_RADIUS_TILES = Math.max(
  ...LANDMARK_DEFINITIONS.map(
    (definition) => definition.footprintRadiusTiles + definition.reservationPaddingTiles
  )
);

import { Biome } from '../generation/biomeGenerator';

// Public cave-generation controls. Adjust these probabilities directly to tune how often a
// viable tile becomes a cave site in each biome. Ocean and beach intentionally remain zero.
export const CAVE_SPAWN_CHANCE_BY_BIOME: Readonly<Record<Biome, number>> = {
  [Biome.Ocean]: 0,
  [Biome.Beach]: 0,
  [Biome.Plains]: 0.000012,
  [Biome.Forest]: 0.000018,
  [Biome.Desert]: 0.00001,
  [Biome.Swamp]: 0.000006,
  [Biome.Hills]: 0.00011,
  [Biome.Mountains]: 0.00036,
  [Biome.Snow]: 0.00005,
};

// Prevents cave formations from clustering. This is in world tiles.
export const CAVE_MIN_SEPARATION_TILES = 18;

// Surface formation controls: the sinkhole/ravine is generated directly into the terrain canvas.
export const CAVE_FORMATION_RADIUS_MIN_TILES = 4.5;
export const CAVE_FORMATION_RADIUS_MAX_TILES = 7;

export const CAVE_INTERIOR_DIMENSIONS = {
  shallow: { width: 70, height: 56, chambers: 10 },
  medium: { width: 110, height: 86, chambers: 16 },
  deep: { width: 160, height: 124, chambers: 24 },
} as const;

export const CAVE_WORLD_ORIGIN_STRIDE = 12_000;

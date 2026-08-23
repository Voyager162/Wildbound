import { Biome } from '../generation/biomeGenerator';

// Public cave-generation controls. Adjust these probabilities directly to tune how often a
// viable tile becomes a cave site in each biome. Ocean and beach intentionally remain zero.
export const CAVE_SPAWN_CHANCE_BY_BIOME: Readonly<Record<Biome, number>> = {
  [Biome.Ocean]: 0,
  [Biome.Beach]: 0,
  [Biome.Plains]: 0.000012,
  [Biome.Forest]: 0.000018,
  [Biome.Desert]: 0.00001,
  [Biome.Swamp]: 0.000000,
  [Biome.Hills]: 0.000010,
  [Biome.Mountains]: 0.00016,
  [Biome.Snow]: 0.00005,
};

// Minimum center-to-center spacing between independently generated surface cave entrances,
// measured in streamed chunks. Four chunks (64 tiles) keeps caves discoverable but prevents
// neighbouring formations from reading as a cluster. Linked exits from the same cave system
// remain intentional exceptions so connected cave networks continue to work.
export const CAVE_MIN_SEPARATION_CHUNKS = 4;

// Surface formation controls: the mouth and exposed rock face are generated directly into the
// terrain canvas. Larger values make each entrance read as a substantial formation rather than
// a small hole in the terrain.
export const CAVE_FORMATION_RADIUS_MIN_TILES = 6.5;
export const CAVE_FORMATION_RADIUS_MAX_TILES = 9.5;

// The local forward axis points into a cave mouth, while its side axis spans the rock face.
// The side radius is deliberately broader to produce an angled horizontal entrance, not a
// circular vertical shaft. These values are multiplied by the entrance's formation radius.
export const CAVE_MOUTH_FORWARD_RADIUS_MIN_SCALE = 0.36;
export const CAVE_MOUTH_FORWARD_RADIUS_MAX_SCALE = 0.46;
export const CAVE_MOUTH_SIDE_RADIUS_MIN_SCALE = 0.72;
export const CAVE_MOUTH_SIDE_RADIUS_MAX_SCALE = 0.9;
export const CAVE_MOUTH_FORWARD_OFFSET_MIN_SCALE = 0.17;
export const CAVE_MOUTH_FORWARD_OFFSET_MAX_SCALE = 0.31;
export const CAVE_MOUTH_SIDE_OFFSET_MAX_SCALE = 0.14;
// The dark interior sits behind the broken outer lip. Interaction and rendering share this
// offset so the prompt ring always sits on the actual jagged recess, not the wider rock rim.
export const CAVE_MOUTH_RECESS_FORWARD_SHIFT_SCALE = -0.12;
export const CAVE_MOUTH_STALACTITE_COUNT_MIN = 4;
export const CAVE_MOUTH_STALACTITE_COUNT_MAX = 7;

export const CAVE_INTERIOR_DIMENSIONS = {
  shallow: { width: 70, height: 56, chambers: 10 },
  medium: { width: 110, height: 86, chambers: 16 },
  deep: { width: 160, height: 124, chambers: 24 },
} as const;

export const CAVE_WORLD_ORIGIN_STRIDE = 12_000;

import { Biome } from './generation/biomeGenerator';

// True per-biome ambient-particle density control. Unlike particleSpawnChance (which only
// decides whether a cell contributes at all), this creates additional independently animated
// particles in every qualifying cell. Use 1 for the normal density, 2 for roughly double, and
// fractional values such as 1.5 for a lighter increase. The global render cap still protects FPS.
export const AMBIENT_PARTICLE_DENSITY_MULTIPLIER_BY_BIOME: Readonly<Record<Biome, number>> = {
  [Biome.Ocean]: 1,
  [Biome.Beach]: 1,
  [Biome.Plains]: 1,
  [Biome.Forest]: 1,
  [Biome.Desert]: 1,
  [Biome.Swamp]: 1,
  [Biome.Hills]: 1,
  [Biome.Mountains]: 1,
  [Biome.Snow]: 1
};

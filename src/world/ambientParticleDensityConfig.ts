import { Biome } from './generation/biomeGenerator';

// True per-biome ambient-particle density control. Unlike particleSpawnChance (which only
// decides whether a cell contributes at all), this creates additional independently animated
// particles in every qualifying cell. Use 1 for the normal density, 2 for roughly double, and
// fractional values such as 1.5 for a lighter increase. The global render cap still protects FPS.
export const AMBIENT_PARTICLE_DENSITY_MULTIPLIER_BY_BIOME: Readonly<Record<Biome, number>> = {
  [Biome.Ocean]: 100,
  [Biome.Beach]: 100,
  [Biome.Plains]: 100,
  [Biome.Forest]: 100,
  [Biome.Desert]: 100,
  [Biome.Swamp]: 100,
  [Biome.Hills]: 100,
  [Biome.Mountains]: 100,
  [Biome.Snow]: 100
};

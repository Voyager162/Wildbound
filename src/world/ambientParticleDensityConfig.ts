import { Biome } from './generation/biomeGenerator';

// True per-biome ambient-particle density control. Unlike particleSpawnChance (which only
// decides whether a cell contributes at all), this creates additional independently animated
// particles in every qualifying cell. Use 1 for the normal density, 2 for roughly double, and
// fractional values such as 1.5 for a lighter increase. The global render cap still protects FPS.
export const AMBIENT_PARTICLE_DENSITY_MULTIPLIER_BY_BIOME: Readonly<Record<Biome, number>> = {
  [Biome.Ocean]: 0.35,
  [Biome.Beach]: 0.2,
  [Biome.Plains]: 0.3,
  [Biome.Forest]: 0.5,
  [Biome.Desert]: 0.18,
  [Biome.Swamp]: 0.38,
  [Biome.Hills]: 0.25,
  [Biome.Mountains]: 0.25,
  [Biome.Snow]: 0.22
};

import { BIOME_SIZE_SCALE } from '../worldConfig';
import { coherentNoise } from './noise';

export enum Biome {
  Ocean = 'ocean',
  Beach = 'beach',
  Plains = 'plains',
  Forest = 'forest',
  Desert = 'desert',
  Swamp = 'swamp',
  Hills = 'hills',
  Mountains = 'mountains',
  Snow = 'snow'
}

export interface ClimateSample {
  elevation: number;
  moisture: number;
  temperature: number;
}

export const BIOME_COLORS: Record<Biome, number> = {
  [Biome.Ocean]: 0x2878b5,
  [Biome.Beach]: 0xd6b861,
  [Biome.Plains]: 0x5da955,
  [Biome.Forest]: 0x245937,
  [Biome.Desert]: 0xc28c3d,
  [Biome.Swamp]: 0x3d6d5e,
  [Biome.Hills]: 0x937a57,
  [Biome.Mountains]: 0x657080,
  [Biome.Snow]: 0xaec2cf
};

const biomeNoiseScale = (baseScale: number): number => baseScale * (BIOME_SIZE_SCALE / 50);

// Ocean is deliberately broader than the shore. Water gameplay and the biome label use this same boundary.
export const OCEAN_ELEVATION_MAX = 0.28;
export const BEACH_ELEVATION_MAX = 0.36;
export const HILL_ELEVATION_MIN = 0.62;
export const MOUNTAIN_ELEVATION_MIN = 0.76;

// Large climate wavelengths make each biome a region to explore instead of a small patch.
export const climateAtTile = (seed: string, tileX: number, tileY: number): ClimateSample => ({
  elevation: coherentNoise(seed, tileX, tileY, biomeNoiseScale(512), 0x63d83595),
  moisture: coherentNoise(seed, tileX, tileY, biomeNoiseScale(416), 0xa511e9b3),
  temperature: coherentNoise(seed, tileX, tileY, biomeNoiseScale(640), 0x4f1bbcdc)
});

export const biomeForClimate = ({ elevation, moisture, temperature }: ClimateSample): Biome => {
  if (elevation < OCEAN_ELEVATION_MAX) {
    return Biome.Ocean;
  }

  if (elevation < BEACH_ELEVATION_MAX) {
    return Biome.Beach;
  }

  if (temperature < 0.2 || (elevation > 0.83 && temperature < 0.58)) {
    return Biome.Snow;
  }

  if (elevation > MOUNTAIN_ELEVATION_MIN) {
    return Biome.Mountains;
  }

  if (elevation > HILL_ELEVATION_MIN) {
    return Biome.Hills;
  }

  if (moisture > 0.76 && temperature > 0.42) {
    return Biome.Swamp;
  }

  if (temperature > 0.67 && moisture < 0.36) {
    return Biome.Desert;
  }

  if (moisture > 0.57) {
    return Biome.Forest;
  }

  return Biome.Plains;
};

// The minimap uses final gameplay biomes directly: if a pixel is blue, that world tile is swim-water.
// Smoothness comes from dense world sampling, not from blurring unrelated biome colors together.
export const minimapColorAtTile = (seed: string, tileX: number, tileY: number): number => {
  const biome = biomeForClimate(climateAtTile(seed, tileX, tileY));
  return BIOME_COLORS[biome];
};
export const biomeAtTile = (seed: string, tileX: number, tileY: number): Biome =>
  biomeForClimate(climateAtTile(seed, tileX, tileY));
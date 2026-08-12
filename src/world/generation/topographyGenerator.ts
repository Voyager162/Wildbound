import { climateAtTile, type ClimateSample } from './biomeGenerator';
import { coherentNoise } from './noise';
import { WORLD_TILE_SIZE } from '../worldConfig';

// Rolling terrain is deterministic world data. It deliberately has no authored or macro-scale
// mountain-range system, so every location remains freely traversable.
const NAVIGATION_SAMPLE_SIZE = 8;
const NAVIGATION_SAMPLE_CACHE_LIMIT = 8192;

export const TOPOGRAPHY_GENERATION_VERSION = 4;

export type TopographySurface = 'ground' | 'rolling';

export interface TopographySample {
  height: number;
  slope: number;
  hilliness: number;
  contour: number;
  surface: TopographySurface;
}

const navigationSampleCache = new Map<string, TopographySample>();

const clamp = (value: number, minimum = 0, maximum = 1): number => Math.max(minimum, Math.min(maximum, value));

const smoothRange = (start: number, end: number, value: number): number => {
  const normalized = clamp((value - start) / (end - start));
  return normalized * normalized * (3 - 2 * normalized);
};

const continuousHilliness = (climate: ClimateSample): number => {
  const { elevation, moisture, temperature } = climate;
  const coastalFlatness = 1 - smoothRange(0.3, 0.42, elevation);
  const hills = smoothRange(0.58, 0.78, elevation);
  const mountains = smoothRange(0.76, 0.92, elevation);
  const forest = smoothRange(0.46, 0.67, moisture) * (1 - smoothRange(0.62, 0.8, temperature));
  const desert = smoothRange(0.6, 0.76, temperature) * (1 - smoothRange(0.28, 0.46, moisture));
  const swamp = smoothRange(0.7, 0.84, moisture) * smoothRange(0.36, 0.55, temperature);
  const cold = 1 - smoothRange(0.14, 0.34, temperature);

  return clamp(
    (0.026 + forest * 0.055 + desert * 0.045 + cold * 0.055 + hills * 0.18 + mountains * 0.19)
      * (1 - coastalFlatness * 0.88)
      * (1 - swamp * 0.75),
    0.006,
    0.32
  );
};

const topographyBaseAt = (
  seed: string,
  worldX: number,
  worldY: number,
  climate?: ClimateSample
): Omit<TopographySample, 'slope'> => {
  const tileX = worldX / WORLD_TILE_SIZE;
  const tileY = worldY / WORLD_TILE_SIZE;
  const resolvedClimate = climate ?? climateAtTile(seed, tileX, tileY);
  const hilliness = continuousHilliness(resolvedClimate);
  const rolling = coherentNoise(seed, tileX, tileY, 104, 0x19ca62bf) - 0.5;
  const ridge = coherentNoise(seed, tileX, tileY, 39, 0x84f7db21) - 0.5;
  const height = clamp(resolvedClimate.elevation + rolling * hilliness + ridge * hilliness * 0.32);
  const contour = Math.abs((height * 15 - Math.floor(height * 15)) - 0.5) * 2;

  return {
    height,
    hilliness,
    contour,
    surface: hilliness > 0.1 ? 'rolling' : 'ground'
  };
};

export const sampleTopographyVisual = (
  seed: string,
  worldX: number,
  worldY: number,
  climate?: ClimateSample
): TopographySample => ({ ...topographyBaseAt(seed, worldX, worldY, climate), slope: 0 });

export const sampleTopography = (seed: string, worldX: number, worldY: number): TopographySample => {
  const navigationX = Math.floor(worldX / NAVIGATION_SAMPLE_SIZE);
  const navigationY = Math.floor(worldY / NAVIGATION_SAMPLE_SIZE);
  const cacheKey = `${seed}:nav:${navigationX},${navigationY}`;
  const cached = navigationSampleCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const sampledWorldX = (navigationX + 0.5) * NAVIGATION_SAMPLE_SIZE;
  const sampledWorldY = (navigationY + 0.5) * NAVIGATION_SAMPLE_SIZE;
  const base = topographyBaseAt(seed, sampledWorldX, sampledWorldY);
  const slopeStep = WORLD_TILE_SIZE / 2;
  const left = topographyBaseAt(seed, sampledWorldX - slopeStep, sampledWorldY).height;
  const right = topographyBaseAt(seed, sampledWorldX + slopeStep, sampledWorldY).height;
  const up = topographyBaseAt(seed, sampledWorldX, sampledWorldY - slopeStep).height;
  const down = topographyBaseAt(seed, sampledWorldX, sampledWorldY + slopeStep).height;
  const sample = { ...base, slope: clamp(Math.hypot(right - left, down - up) / 0.12) };

  navigationSampleCache.set(cacheKey, sample);
  if (navigationSampleCache.size > NAVIGATION_SAMPLE_CACHE_LIMIT) {
    navigationSampleCache.clear();
  }
  return sample;
};
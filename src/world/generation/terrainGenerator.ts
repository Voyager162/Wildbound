import { BEACH_ELEVATION_MAX, biomeForClimate, Biome, climateAtTile, OCEAN_ELEVATION_MAX } from './biomeGenerator';
import { coherentNoise, randomAtTile } from './noise';
import { sampleTopographyVisual, type TopographySample } from './topographyGenerator';
import { CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from '../worldConfig';
import {
  OCEAN_SHORELINE_RIPPLE_ELEVATION,
  OCEAN_SHORELINE_WOBBLE_ELEVATION,
  OCEAN_SURF_BLEND_ELEVATION
} from '../worldVisualConfig';
import {
  SWAMP_POOL_CLIMATE_END,
  SWAMP_POOL_CLIMATE_START,
  SWAMP_POOL_NOISE_END,
  SWAMP_POOL_NOISE_START
} from '../swampWaterDecorConfig';

export enum TerrainType {
  Grass = 'grass',
  Dirt = 'dirt',
  Water = 'water',
  Sand = 'sand',
  Forest = 'forest',
  Desert = 'desert',
  Swamp = 'swamp',
  Mountain = 'mountain',
  Snow = 'snow'
}

export interface TerrainSurface {
  biome: Biome;
  terrain: TerrainType;
  color: number;
  isWater: boolean;
  isShallowWater: boolean;
  // Swamp pools use the same continuous water palette, but deliberately have no ocean waves or
  // animated shore foam.
  isSwampWater: boolean;
  // Visual shoreline depth is continuous, unlike the exact water flag used for swimming.
  waterVisualAmount: number;
  elevation: number;
  moisture: number;
  temperature: number;
  topography: TopographySample;
}

export const TERRAIN_COLORS: Record<TerrainType, number> = {
  [TerrainType.Grass]: 0x5a9d50,
  [TerrainType.Dirt]: 0x8d7959,
  [TerrainType.Water]: 0x286b9b,
  [TerrainType.Sand]: 0xd8bd73,
  [TerrainType.Forest]: 0x356b43,
  [TerrainType.Desert]: 0xc99c54,
  [TerrainType.Swamp]: 0x486d55,
  [TerrainType.Mountain]: 0x69747a,
  [TerrainType.Snow]: 0xdde9ed
};

const terrainForBiome: Record<Biome, TerrainType> = {
  [Biome.Ocean]: TerrainType.Water,
  [Biome.Beach]: TerrainType.Sand,
  [Biome.Plains]: TerrainType.Grass,
  [Biome.Forest]: TerrainType.Forest,
  [Biome.Desert]: TerrainType.Desert,
  [Biome.Swamp]: TerrainType.Swamp,
  [Biome.Hills]: TerrainType.Dirt,
  [Biome.Mountains]: TerrainType.Mountain,
  [Biome.Snow]: TerrainType.Snow
};

const colorChannels = (color: number): readonly [number, number, number] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff
];

const composeColor = (red: number, green: number, blue: number): number =>
  (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue);

const blendColor = (first: number, second: number, amount: number): number => {
  const [firstRed, firstGreen, firstBlue] = colorChannels(first);
  const [secondRed, secondGreen, secondBlue] = colorChannels(second);
  const blend = Math.max(0, Math.min(1, amount));
  return composeColor(
    firstRed + (secondRed - firstRed) * blend,
    firstGreen + (secondGreen - firstGreen) * blend,
    firstBlue + (secondBlue - firstBlue) * blend
  );
};

const shadeColor = (color: number, amount: number): number => {
  const [red, green, blue] = colorChannels(color);
  const factor = 1 + amount;
  return composeColor(
    Math.max(0, Math.min(255, red * factor)),
    Math.max(0, Math.min(255, green * factor)),
    Math.max(0, Math.min(255, blue * factor))
  );
};

const smoothRange = (start: number, end: number, value: number): number => {
  const normalized = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return normalized * normalized * (3 - 2 * normalized);
};

// This intentionally has no biome-label branch. It lets wetlands, their colors, and their pools
// taper through a climate boundary rather than stepping when biomeForClimate changes its label.
const swampClimateAmount = (climate: ReturnType<typeof climateAtTile>): number =>
  smoothRange(0.7, 0.84, climate.moisture)
    * smoothRange(0.36, 0.55, climate.temperature)
    * (1 - smoothRange(0.58, 0.74, climate.elevation));

// Biome labels are still useful for gameplay, but terrain color is derived from the continuous
// climate values. This gives every visual boundary the same gradual treatment as a shoreline.
const blendedLandColor = (climate: ReturnType<typeof climateAtTile>): number => {
  const { elevation, moisture, temperature } = climate;
  let color = TERRAIN_COLORS[TerrainType.Grass];

  const forestAmount = smoothRange(0.46, 0.67, moisture) * (1 - smoothRange(0.62, 0.8, temperature));
  const desertAmount = smoothRange(0.6, 0.76, temperature) * (1 - smoothRange(0.28, 0.46, moisture));
  const swampAmount = swampClimateAmount(climate);
  color = blendColor(color, TERRAIN_COLORS[TerrainType.Forest], forestAmount);
  color = blendColor(color, TERRAIN_COLORS[TerrainType.Desert], desertAmount);
  color = blendColor(color, TERRAIN_COLORS[TerrainType.Swamp], swampAmount);

  const hillAmount = smoothRange(0.6, 0.78, elevation);
  const mountainAmount = smoothRange(0.76, 0.92, elevation);
  color = blendColor(color, TERRAIN_COLORS[TerrainType.Dirt], hillAmount);
  color = blendColor(color, TERRAIN_COLORS[TerrainType.Mountain], mountainAmount);

  const coldSnow = 1 - smoothRange(0.14, 0.34, temperature);
  const highSnow = smoothRange(0.72, 0.92, elevation) * (1 - smoothRange(0.5, 0.68, temperature));
  color = blendColor(color, TERRAIN_COLORS[TerrainType.Snow], Math.max(coldSnow, highSnow));

  return color;
};

// This returns deterministic visual terrain data. Gameplay and saving still use only global
// coordinates and the seed, so chunks can be unloaded and recreated without visual drift.
export const surfaceAtTile = (seed: string, tileX: number, tileY: number): TerrainSurface => {
  const climate = climateAtTile(seed, tileX, tileY);
  const biome = biomeForClimate(climate);
  const microVariation = coherentNoise(seed, tileX, tileY, 22, 0x3a4172d1) - 0.5;
  const swampPool = coherentNoise(seed, tileX, tileY, 28, 0x31b69f13);
  const swampAmount = swampClimateAmount(climate);
  const terrain = terrainForBiome[biome];
  const topography = sampleTopographyVisual(
    seed,
    tileX * WORLD_TILE_SIZE,
    tileY * WORLD_TILE_SIZE,
    climate
  );
  const regionalLandColor = blendedLandColor(climate);
  let color = regionalLandColor;
  let isWater = biome === Biome.Ocean;
  let isShallowWater = false;
  let isSwampWater = false;
  let waterVisualAmount = 0;

  // Ocean is the only swim-water biome. Beaches retain the same continuous shore palette but
  // stay walkable, so the minimap, F3 label, and movement state never disagree at a shoreline.
  const deepWater = 0x1f5d91;
  const shallowWater = 0x3c94b0;
  const beachSand = 0xdbc37f;
  if (biome === Biome.Ocean || biome === Biome.Beach) {
    // Coarse curvature plus finer ripple noise makes this world's shore recognizably unique to
    // its seed without a jagged tile contour. It only affects the visual surf line; swimming
    // still starts at the canonical ocean threshold below.
    const shorelineWobble = (coherentNoise(seed, tileX, tileY, 84, 0x48f3a925) - 0.5)
      * OCEAN_SHORELINE_WOBBLE_ELEVATION * 2
      + (coherentNoise(seed, tileX, tileY, 23, 0x1f97cb6d) - 0.5)
      * OCEAN_SHORELINE_RIPPLE_ELEVATION * 2;
    const visualOceanElevation = OCEAN_ELEVATION_MAX + shorelineWobble;
    const waterColor = blendColor(deepWater, shallowWater, smoothRange(0.08, visualOceanElevation + 0.035, climate.elevation));
    const shoreLandColor = blendColor(
      beachSand,
      regionalLandColor,
      smoothRange(OCEAN_ELEVATION_MAX + 0.02, BEACH_ELEVATION_MAX, climate.elevation)
    );
    // A compact moving-surf zone preserves more of the beach as clear sand. The seeded contour
    // above shifts this line smoothly, creating a wavy shoreline rather than a straight band.
    waterVisualAmount = 1 - smoothRange(
      visualOceanElevation - OCEAN_SURF_BLEND_ELEVATION * 0.4,
      visualOceanElevation + OCEAN_SURF_BLEND_ELEVATION * 0.6,
      climate.elevation
    );
    color = blendColor(shoreLandColor, waterColor, waterVisualAmount);
    isWater = biome === Biome.Ocean;
    isShallowWater = isWater && climate.elevation > OCEAN_ELEVATION_MAX - 0.08;
  }

  if (biome !== Biome.Ocean) {
    // Pool coverage is constrained by continuous swamp climate rather than the discrete Swamp
    // label. Apply it over beaches too: excluding Beach made a swamp pool stop in a hard line
    // where the discrete biome label changed, although its underlying climate was smooth. The
    // gameplay water threshold sits well inside the visible blend.
    const poolAmount = smoothRange(SWAMP_POOL_NOISE_START, SWAMP_POOL_NOISE_END, swampPool)
      * smoothRange(SWAMP_POOL_CLIMATE_START, SWAMP_POOL_CLIMATE_END, swampAmount);
    if (poolAmount > 0.001) {
      const existingWaterVisualAmount = waterVisualAmount;
      color = blendColor(color, 0x367f8b, poolAmount);
      // At wet ocean sand, retain the ocean surface until the continuous swamp pool is the
      // stronger influence. This prevents a tiny trace of swamp climate from abruptly swapping
      // the animated shore layer to the still-pool layer while keeping the colour blend smooth.
      isSwampWater = poolAmount >= existingWaterVisualAmount;
      isWater = isWater || poolAmount > 0.34;
      isShallowWater = isWater;
      waterVisualAmount = Math.max(waterVisualAmount, poolAmount);
    }
  }

  // Fade ground-only shading as the shore becomes water so its discontinuity cannot form an
  // accidental hard coastline where the swim-state boundary lies. This intentionally runs on
  // both sides of a swamp-pool threshold: the visual blend is continuous even when walkability
  // changes at a tile sample.
  const rollingShade = ((topography.height - climate.elevation) * 0.35 + (topography.contour < 0.075 ? -0.07 : 0))
    * (1 - waterVisualAmount);
  color = shadeColor(color, rollingShade);

  return {
    biome,
    terrain,
    color: shadeColor(color, microVariation * 0.16),
    isWater,
    isShallowWater,
    isSwampWater,
    waterVisualAmount,
    elevation: climate.elevation,
    moisture: climate.moisture,
    temperature: climate.temperature,
    topography
  };
};

export const terrainAtTile = (seed: string, tileX: number, tileY: number): TerrainType =>
  surfaceAtTile(seed, tileX, tileY).terrain;

export const isTraversableWaterAt = (seed: string, tileX: number, tileY: number): boolean =>
  surfaceAtTile(seed, tileX, tileY).isWater;

// This is pure: recreating a chunk with its seed and coordinates always returns the same terrain.
export const generateChunkTerrain = (seed: string, chunkX: number, chunkY: number): TerrainType[] => {
  const terrain: TerrainType[] = [];
  const firstTileX = chunkX * CHUNK_SIZE_TILES;
  const firstTileY = chunkY * CHUNK_SIZE_TILES;

  for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
    for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
      terrain.push(terrainAtTile(seed, firstTileX + localX, firstTileY + localY));
    }
  }

  return terrain;
};

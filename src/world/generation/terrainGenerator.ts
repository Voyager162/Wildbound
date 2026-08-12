import { BEACH_ELEVATION_MAX, biomeForClimate, Biome, climateAtTile, OCEAN_ELEVATION_MAX } from './biomeGenerator';
import { coherentNoise, randomAtTile } from './noise';
import { sampleTopographyVisual, type TopographySample } from './topographyGenerator';
import { CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from '../worldConfig';

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

// Biome labels are still useful for gameplay, but terrain color is derived from the continuous
// climate values. This gives every visual boundary the same gradual treatment as a shoreline.
const blendedLandColor = (climate: ReturnType<typeof climateAtTile>): number => {
  const { elevation, moisture, temperature } = climate;
  let color = TERRAIN_COLORS[TerrainType.Grass];

  const forestAmount = smoothRange(0.46, 0.67, moisture) * (1 - smoothRange(0.62, 0.8, temperature));
  const desertAmount = smoothRange(0.6, 0.76, temperature) * (1 - smoothRange(0.28, 0.46, moisture));
  const swampAmount = smoothRange(0.7, 0.84, moisture)
    * smoothRange(0.36, 0.55, temperature)
    * (1 - smoothRange(0.58, 0.74, elevation));
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
  let waterVisualAmount = 0;

  // Ocean is the only swim-water biome. Beaches retain the same continuous shore palette but
  // stay walkable, so the minimap, F3 label, and movement state never disagree at a shoreline.
  const deepWater = 0x1f5d91;
  const shallowWater = 0x3c94b0;
  const beachSand = 0xdbc37f;
  if (biome === Biome.Ocean || biome === Biome.Beach) {
    const waterColor = blendColor(deepWater, shallowWater, smoothRange(0.08, OCEAN_ELEVATION_MAX + 0.035, climate.elevation));
    const shoreLandColor = blendColor(
      beachSand,
      regionalLandColor,
      smoothRange(OCEAN_ELEVATION_MAX + 0.02, BEACH_ELEVATION_MAX, climate.elevation)
    );
    // The visible shoreline intentionally spans both sides of the gameplay water threshold.
    // That removes one-sided hard seams while swimming still begins only once the player crosses
    // the exact ocean surface boundary below.
    waterVisualAmount = 1 - smoothRange(OCEAN_ELEVATION_MAX - 0.075, BEACH_ELEVATION_MAX, climate.elevation);
    color = blendColor(shoreLandColor, waterColor, waterVisualAmount);
    isWater = biome === Biome.Ocean;
    isShallowWater = isWater && climate.elevation > OCEAN_ELEVATION_MAX - 0.08;
  } else if (biome === Biome.Swamp && swampPool > 0.64) {
    // Swamp pools are shallow swim-water; surrounding swamp ground remains walkable.
    const poolAmount = smoothRange(0.64, 0.82, swampPool);
    color = blendColor(regionalLandColor, 0x367f8b, poolAmount);
    isWater = true;
    isShallowWater = true;
    waterVisualAmount = poolAmount;
  }

  if (!isWater) {
    // Fade ground-only shading as the shore becomes water so its discontinuity cannot form an
    // accidental hard coastline where the swim-state boundary lies.
    const rollingShade = ((topography.height - climate.elevation) * 0.35 + (topography.contour < 0.075 ? -0.07 : 0))
      * (1 - waterVisualAmount);
    color = shadeColor(color, rollingShade);

  }

  return {
    biome,
    terrain,
    color: shadeColor(color, microVariation * 0.16),
    isWater,
    isShallowWater,
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

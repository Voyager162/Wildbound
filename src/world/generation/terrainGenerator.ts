import { biomeAtTile, Biome, climateAtTile } from './biomeGenerator';
import { coherentNoise, randomAtTile } from './noise';
import { CHUNK_SIZE_TILES } from '../worldConfig';

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
  elevation: number;
  moisture: number;
  temperature: number;
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

const landColor = (biome: Biome): number => {
  switch (biome) {
    case Biome.Forest:
      return TERRAIN_COLORS[TerrainType.Forest];
    case Biome.Desert:
      return TERRAIN_COLORS[TerrainType.Desert];
    case Biome.Swamp:
      return TERRAIN_COLORS[TerrainType.Swamp];
    case Biome.Hills:
      return TERRAIN_COLORS[TerrainType.Dirt];
    case Biome.Mountains:
      return TERRAIN_COLORS[TerrainType.Mountain];
    case Biome.Snow:
      return TERRAIN_COLORS[TerrainType.Snow];
    default:
      return TERRAIN_COLORS[TerrainType.Grass];
  }
};

// This returns deterministic visual terrain data. Gameplay and saving still use only global
// coordinates and the seed, so chunks can be unloaded and recreated without visual drift.
export const surfaceAtTile = (seed: string, tileX: number, tileY: number): TerrainSurface => {
  const climate = climateAtTile(seed, tileX, tileY);
  const biome = biomeAtTile(seed, tileX, tileY);
  const microVariation = coherentNoise(seed, tileX, tileY, 22, 0x3a4172d1) - 0.5;
  const swampPool = coherentNoise(seed, tileX, tileY, 28, 0x31b69f13);
  const terrain = terrainForBiome[biome];
  let color = landColor(biome);
  let isWater = biome === Biome.Ocean;
  let isShallowWater = false;

  // Smooth elevation bands make coastlines blend rather than stepping abruptly between biomes.
  const deepWater = 0x1f5d91;
  const shallowWater = 0x3c94b0;
  const beachSand = 0xdbc37f;
  if (climate.elevation < 0.27) {
    color = blendColor(deepWater, shallowWater, smoothRange(0.08, 0.27, climate.elevation));
    isWater = true;
    isShallowWater = climate.elevation > 0.2;
  } else if (climate.elevation < 0.35) {
    const shoreAmount = smoothRange(0.27, 0.35, climate.elevation);
    color = blendColor(shallowWater, beachSand, smoothRange(0.27, 0.31, climate.elevation));
    color = blendColor(color, landColor(biome), smoothRange(0.31, 0.35, climate.elevation));
    isWater = shoreAmount < 0.2;
    isShallowWater = shoreAmount < 0.55;
  } else if (biome === Biome.Swamp && swampPool > 0.64) {
    const poolAmount = smoothRange(0.64, 0.82, swampPool);
    color = blendColor(TERRAIN_COLORS[TerrainType.Swamp], 0x367f8b, poolAmount);
    isWater = true;
    isShallowWater = true;
  } else if (biome === Biome.Hills) {
    color = blendColor(TERRAIN_COLORS[TerrainType.Grass], TERRAIN_COLORS[TerrainType.Dirt], smoothRange(0.62, 0.76, climate.elevation));
  } else if (biome === Biome.Mountains) {
    color = blendColor(TERRAIN_COLORS[TerrainType.Dirt], TERRAIN_COLORS[TerrainType.Mountain], smoothRange(0.74, 0.92, climate.elevation));
  } else if (biome === Biome.Snow) {
    const iceAmount = smoothRange(0.68, 0.92, climate.elevation) * smoothRange(0.08, 0.36, 0.4 - climate.temperature);
    color = blendColor(TERRAIN_COLORS[TerrainType.Snow], 0xaed9e5, iceAmount);
  }

  return {
    biome,
    terrain,
    color: shadeColor(color, microVariation * 0.16),
    isWater,
    isShallowWater,
    elevation: climate.elevation,
    moisture: climate.moisture,
    temperature: climate.temperature
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

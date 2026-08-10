import { CHUNK_SIZE_TILES } from '../worldConfig';

export enum TerrainType {
  Grass = 'grass',
  Dirt = 'dirt',
  Water = 'water'
}

export const TERRAIN_COLORS: Record<TerrainType, number> = {
  [TerrainType.Grass]: 0x4d8c4a,
  [TerrainType.Dirt]: 0x917044,
  [TerrainType.Water]: 0x3d7199
};

const hashSeed = (seed: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const hashGridPoint = (gridX: number, gridY: number, seed: number): number => {
  let hash = (seed ^ Math.imul(gridX, 374761393) ^ Math.imul(gridY, 668265263)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);

  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
};

const smoothStep = (value: number): number => value * value * (3 - 2 * value);

const interpolate = (start: number, end: number, amount: number): number => start + (end - start) * amount;

const valueNoise = (x: number, y: number, seed: number): number => {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const horizontalProgress = smoothStep(x - left);
  const verticalProgress = smoothStep(y - top);
  const topEdge = interpolate(
    hashGridPoint(left, top, seed),
    hashGridPoint(left + 1, top, seed),
    horizontalProgress
  );
  const bottomEdge = interpolate(
    hashGridPoint(left, top + 1, seed),
    hashGridPoint(left + 1, top + 1, seed),
    horizontalProgress
  );

  return interpolate(topEdge, bottomEdge, verticalProgress);
};

export const terrainAtTile = (seed: string, tileX: number, tileY: number): TerrainType => {
  const seedValue = hashSeed(seed);
  const broadRegions = valueNoise(tileX / 28, tileY / 28, seedValue);
  const localVariation = valueNoise(tileX / 10, tileY / 10, seedValue ^ 0x9e3779b9);
  const terrainValue = broadRegions * 0.78 + localVariation * 0.22;

  if (terrainValue < 0.31) {
    return TerrainType.Water;
  }

  if (terrainValue < 0.47) {
    return TerrainType.Dirt;
  }

  return TerrainType.Grass;
};

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

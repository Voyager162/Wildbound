import { biomeAtTile, Biome } from './biomeGenerator';
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

export const TERRAIN_COLORS: Record<TerrainType, number> = {
  [TerrainType.Grass]: 0x4d8c4a,
  [TerrainType.Dirt]: 0x84775b,
  [TerrainType.Water]: 0x2f6d9b,
  [TerrainType.Sand]: 0xd8c27c,
  [TerrainType.Forest]: 0x326b42,
  [TerrainType.Desert]: 0xc99f58,
  [TerrainType.Swamp]: 0x496f55,
  [TerrainType.Mountain]: 0x747985,
  [TerrainType.Snow]: 0xe8eff1
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

export const terrainAtTile = (seed: string, tileX: number, tileY: number): TerrainType =>
  terrainForBiome[biomeAtTile(seed, tileX, tileY)];

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
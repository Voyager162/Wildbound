import { biomeAtTile, Biome } from './biomeGenerator';
import { randomAtTile } from './noise';
import { CHUNK_SIZE_TILES } from '../worldConfig';

export enum TerrainFeatureType {
  Tree = 'tree',
  Cactus = 'cactus',
  Rock = 'rock',
  Reeds = 'reeds',
  SnowyRock = 'snowy rock',
  IcePatch = 'ice patch'
}

export interface TerrainFeature {
  type: TerrainFeatureType;
  localTileX: number;
  localTileY: number;
}

// Tweak these deterministic per-tile chances to control terrain-feature density by biome.
export const FEATURE_DENSITIES = {
  forestTree: 0.01,
  desertCactus: 0.005,
  rocky: 0.007,
  swampReeds: 0.01,
  snowyRock: 0.005,
  icePatch: 0.01
} as const;

export const featureAtTile = (seed: string, tileX: number, tileY: number): TerrainFeatureType | null => {
  const placement = randomAtTile(seed, tileX, tileY, 0x77a5c3d1);
  const biome = biomeAtTile(seed, tileX, tileY);

  switch (biome) {
    case Biome.Forest:
      return placement < FEATURE_DENSITIES.forestTree ? TerrainFeatureType.Tree : null;
    case Biome.Desert:
      return placement < FEATURE_DENSITIES.desertCactus ? TerrainFeatureType.Cactus : null;
    case Biome.Hills:
    case Biome.Mountains:
      return placement < FEATURE_DENSITIES.rocky ? TerrainFeatureType.Rock : null;
    case Biome.Swamp:
      return placement < FEATURE_DENSITIES.swampReeds ? TerrainFeatureType.Reeds : null;
    case Biome.Snow:
      if (placement < FEATURE_DENSITIES.snowyRock) {
        return TerrainFeatureType.SnowyRock;
      }

      return placement < FEATURE_DENSITIES.icePatch ? TerrainFeatureType.IcePatch : null;
    default:
      return null;
  }
};

// This data is independent of Phaser, so an unloaded chunk can be recreated exactly later.
export const generateChunkFeatures = (seed: string, chunkX: number, chunkY: number): TerrainFeature[] => {
  const features: TerrainFeature[] = [];
  const firstTileX = chunkX * CHUNK_SIZE_TILES;
  const firstTileY = chunkY * CHUNK_SIZE_TILES;

  for (let localTileY = 0; localTileY < CHUNK_SIZE_TILES; localTileY += 1) {
    for (let localTileX = 0; localTileX < CHUNK_SIZE_TILES; localTileX += 1) {
      const type = featureAtTile(seed, firstTileX + localTileX, firstTileY + localTileY);

      if (type) {
        features.push({ type, localTileX, localTileY });
      }
    }
  }

  return features;
};
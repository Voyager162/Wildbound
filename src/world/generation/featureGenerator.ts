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

export const featureAtTile = (seed: string, tileX: number, tileY: number): TerrainFeatureType | null => {
  const placement = randomAtTile(seed, tileX, tileY, 0x77a5c3d1);
  const biome = biomeAtTile(seed, tileX, tileY);

  switch (biome) {
    case Biome.Forest:
      return placement < 0.045 ? TerrainFeatureType.Tree : null;
    case Biome.Desert:
      return placement < 0.025 ? TerrainFeatureType.Cactus : null;
    case Biome.Hills:
    case Biome.Mountains:
      return placement < 0.035 ? TerrainFeatureType.Rock : null;
    case Biome.Swamp:
      return placement < 0.055 ? TerrainFeatureType.Reeds : null;
    case Biome.Snow:
      if (placement < 0.028) {
        return TerrainFeatureType.SnowyRock;
      }

      return placement < 0.05 ? TerrainFeatureType.IcePatch : null;
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
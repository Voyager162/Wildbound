import { biomeForClimate, climateAtTile, Biome } from './biomeGenerator';
import { randomAtTile } from './noise';
import { isLandmarkReservedTile } from './landmarkGenerator';
import { sampleTopographyVisual } from './topographyGenerator';
import { CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from '../worldConfig';

export enum TerrainFeatureType {
  Tree = 'tree',
  Cactus = 'cactus',
  Rock = 'rock',
  Reeds = 'reeds',
  SnowyRock = 'snowy rock',
  IcePatch = 'ice patch',
  Grass = 'wild grass'
}

export interface TerrainFeature {
  type: TerrainFeatureType;
  localTileX: number;
  localTileY: number;
}

// Tweak these deterministic base chances to control terrain-feature density. Climate weights
// fade them at biome edges so small features do not form a hard visible boundary.
export const FEATURE_DENSITIES = {
  forestTree: 0.01,
  desertCactus: 0.005,
  rocky: 0.007,
  swampReeds: 0.01,
  snowyRock: 0.002,
  icePatch: 0.002,
  plainsGrass: 0.02
} as const;

const shouldPlace = (seed: string, tileX: number, tileY: number, salt: number, chance: number): boolean =>
  randomAtTile(seed, tileX, tileY, salt) < chance;

export const featureAtTile = (seed: string, tileX: number, tileY: number): TerrainFeatureType | null => {
  // Landmark reservations are a separate macro layer. Skipping normal resources here keeps the
  // visible chunk art, harvesting lookup, and F3 feature readout in agreement.
  if (isLandmarkReservedTile(seed, tileX, tileY)) {
    return null;
  }

  const climate = climateAtTile(seed, tileX, tileY);
  const biome = biomeForClimate(climate);

  // Features are keyed to the final gameplay biome, never to a partial climate blend. This keeps
  // cacti out of hills and snow resources out of plains while preserving deterministic placement.
  if (biome === Biome.Ocean || biome === Biome.Beach) {
    return null;
  }

  const topography = sampleTopographyVisual(
    seed,
    tileX * WORLD_TILE_SIZE,
    tileY * WORLD_TILE_SIZE,
    climate
  );
  switch (biome) {
    case Biome.Snow:
      if (shouldPlace(seed, tileX, tileY, 0x1a7f44bd, FEATURE_DENSITIES.snowyRock)) {
        return TerrainFeatureType.SnowyRock;
      }
      return shouldPlace(seed, tileX, tileY, 0x33c51981, FEATURE_DENSITIES.icePatch)
        ? TerrainFeatureType.IcePatch
        : null;
    case Biome.Mountains:
    case Biome.Hills:
      return shouldPlace(seed, tileX, tileY, 0x47bd60a9, FEATURE_DENSITIES.rocky)
        ? TerrainFeatureType.Rock
        : null;
    case Biome.Swamp:
      return shouldPlace(seed, tileX, tileY, 0x5d1be613, FEATURE_DENSITIES.swampReeds)
        ? TerrainFeatureType.Reeds
        : null;
    case Biome.Desert:
      return shouldPlace(seed, tileX, tileY, 0x6ea84c35, FEATURE_DENSITIES.desertCactus)
        ? TerrainFeatureType.Cactus
        : null;
    case Biome.Forest:
      return shouldPlace(seed, tileX, tileY, 0x77a5c3d1, FEATURE_DENSITIES.forestTree)
        ? TerrainFeatureType.Tree
        : null;
    case Biome.Plains:
      return shouldPlace(seed, tileX, tileY, 0x8df3524f, FEATURE_DENSITIES.plainsGrass)
        ? TerrainFeatureType.Grass
        : null;
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

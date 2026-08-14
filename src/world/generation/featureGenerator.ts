import { biomeForClimate, climateAtTile, Biome } from './biomeGenerator';
import { randomAtTile } from './noise';
import { isLandmarkReservedTile } from './landmarkGenerator';
import { surfaceAtTile } from './terrainGenerator';
import { CHUNK_SIZE_TILES } from '../worldConfig';
import {
  SWAMP_REED_SHORE_DENSITY,
  SWAMP_REED_SHORE_SEARCH_RADIUS_TILES,
  SWAMP_REED_WATER_DENSITY,
  SWAMP_REED_WATER_MAX_VISUAL_AMOUNT,
  SWAMP_REED_WATER_MIN_VISUAL_AMOUNT
} from '../swampWaterDecorConfig';

export enum TerrainFeatureType {
  Tree = 'tree',
  Cactus = 'cactus',
  Rock = 'rock',
  Reeds = 'reeds',
  WaterReeds = 'water reeds',
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
  snowyRock: 0.002,
  icePatch: 0.002,
  plainsGrass: 0.02
} as const;

const shouldPlace = (seed: string, tileX: number, tileY: number, salt: number, chance: number): boolean =>
  randomAtTile(seed, tileX, tileY, salt) < chance;

const featureClearance: Record<TerrainFeatureType, number> = {
  [TerrainFeatureType.Tree]: 1.75,
  [TerrainFeatureType.Cactus]: 1.25,
  [TerrainFeatureType.Rock]: 1.45,
  [TerrainFeatureType.Reeds]: 1.1,
  [TerrainFeatureType.WaterReeds]: 0.9,
  [TerrainFeatureType.SnowyRock]: 1.35,
  [TerrainFeatureType.IcePatch]: 1.6,
  [TerrainFeatureType.Grass]: 1
};

const isBiomeCompatible = (feature: TerrainFeatureType, biome: Biome): boolean => {
  switch (feature) {
    case TerrainFeatureType.Tree:
      return biome === Biome.Forest;
    case TerrainFeatureType.Cactus:
      return biome === Biome.Desert;
    case TerrainFeatureType.Rock:
      return biome === Biome.Hills || biome === Biome.Mountains;
    case TerrainFeatureType.Reeds:
    case TerrainFeatureType.WaterReeds:
      return biome === Biome.Swamp;
    case TerrainFeatureType.SnowyRock:
    case TerrainFeatureType.IcePatch:
      return biome === Biome.Snow;
    case TerrainFeatureType.Grass:
      return biome === Biome.Plains;
  }
};

// Features have wide artwork, so validating just their center tile lets a mountain rock visibly
// reach into a swamp pool. Require an all-compatible footprint around the object instead.
const hasSafeFeatureFootprint = (seed: string, tileX: number, tileY: number, feature: TerrainFeatureType): boolean => {
  const clearance = featureClearance[feature];
  const samples = [-clearance, 0, clearance];
  return samples.every((offsetY) => samples.every((offsetX) => {
    const surface = surfaceAtTile(seed, tileX + 0.5 + offsetX, tileY + 0.5 + offsetY);
    if (surface.isWater || surface.waterVisualAmount > 0.1) {
      return false;
    }

    return isBiomeCompatible(feature, surface.biome);
  }));
};

const acceptFeature = (seed: string, tileX: number, tileY: number, feature: TerrainFeatureType): TerrainFeatureType | null =>
  hasSafeFeatureFootprint(seed, tileX, tileY, feature) ? feature : null;

type SwampReedSite = 'water' | 'shore' | null;

const swampReedSiteAtTile = (seed: string, tileX: number, tileY: number): SwampReedSite => {
  const centerX = tileX + 0.5;
  const centerY = tileY + 0.5;
  const surface = surfaceAtTile(seed, centerX, centerY);
  if (surface.biome !== Biome.Swamp) {
    return null;
  }

  // Emergent reeds grow at the pond's shallow swim edge. Their shorter waterline art is kept
  // distinct from the taller bank reeds below.
  if (surface.isSwampWater && surface.isWater
    && surface.waterVisualAmount >= SWAMP_REED_WATER_MIN_VISUAL_AMOUNT
    && surface.waterVisualAmount <= SWAMP_REED_WATER_MAX_VISUAL_AMOUNT) {
    return 'water';
  }

  // The rest hug pond banks instead of appearing arbitrarily through dry swamp ground.
  if (surface.isWater || surface.waterVisualAmount > 0.12) {
    return null;
  }

  const radius = SWAMP_REED_SHORE_SEARCH_RADIUS_TILES;
  const offsets = [
    [-radius, 0], [radius, 0], [0, -radius], [0, radius],
    [-radius * 0.72, -radius * 0.72], [radius * 0.72, -radius * 0.72],
    [-radius * 0.72, radius * 0.72], [radius * 0.72, radius * 0.72]
  ];
  return offsets.some(([offsetX, offsetY]) => {
    const nearby = surfaceAtTile(seed, centerX + offsetX, centerY + offsetY);
    return nearby.biome === Biome.Swamp && nearby.isSwampWater && nearby.waterVisualAmount >= 0.22;
  }) ? 'shore' : null;
};

const hasSafeSwampReedFootprint = (seed: string, tileX: number, tileY: number, site: Exclude<SwampReedSite, null>): boolean => {
  if (site === 'water') {
    const surface = surfaceAtTile(seed, tileX + 0.5, tileY + 0.5);
    return surface.biome === Biome.Swamp && surface.isSwampWater && surface.isWater
      && surface.waterVisualAmount >= SWAMP_REED_WATER_MIN_VISUAL_AMOUNT
      && surface.waterVisualAmount <= SWAMP_REED_WATER_MAX_VISUAL_AMOUNT;
  }

  // Shore reeds can reach over the pool, but their rooted tile must remain solid swamp ground.
  const surface = surfaceAtTile(seed, tileX + 0.5, tileY + 0.5);
  return surface.biome === Biome.Swamp && !surface.isWater && surface.waterVisualAmount <= 0.12;
};

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

  switch (biome) {
    case Biome.Snow:
      if (shouldPlace(seed, tileX, tileY, 0x1a7f44bd, FEATURE_DENSITIES.snowyRock)) {
        return acceptFeature(seed, tileX, tileY, TerrainFeatureType.SnowyRock);
      }
      return shouldPlace(seed, tileX, tileY, 0x33c51981, FEATURE_DENSITIES.icePatch)
        ? acceptFeature(seed, tileX, tileY, TerrainFeatureType.IcePatch)
        : null;
    case Biome.Mountains:
    case Biome.Hills:
      return shouldPlace(seed, tileX, tileY, 0x47bd60a9, FEATURE_DENSITIES.rocky)
        ? acceptFeature(seed, tileX, tileY, TerrainFeatureType.Rock)
        : null;
    case Biome.Swamp:
      {
        const reedSite = swampReedSiteAtTile(seed, tileX, tileY);
        if (!reedSite) {
          return null;
        }
        const density = reedSite === 'water' ? SWAMP_REED_WATER_DENSITY : SWAMP_REED_SHORE_DENSITY;
        return shouldPlace(seed, tileX, tileY, 0x5d1be613, density)
          && hasSafeSwampReedFootprint(seed, tileX, tileY, reedSite)
          ? reedSite === 'water' ? TerrainFeatureType.WaterReeds : TerrainFeatureType.Reeds
          : null;
      }
    case Biome.Desert:
      return shouldPlace(seed, tileX, tileY, 0x6ea84c35, FEATURE_DENSITIES.desertCactus)
        ? acceptFeature(seed, tileX, tileY, TerrainFeatureType.Cactus)
        : null;
    case Biome.Forest:
      return shouldPlace(seed, tileX, tileY, 0x77a5c3d1, FEATURE_DENSITIES.forestTree)
        ? acceptFeature(seed, tileX, tileY, TerrainFeatureType.Tree)
        : null;
    case Biome.Plains:
      return shouldPlace(seed, tileX, tileY, 0x8df3524f, FEATURE_DENSITIES.plainsGrass)
        ? acceptFeature(seed, tileX, tileY, TerrainFeatureType.Grass)
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

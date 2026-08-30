import {
  LANDMARK_DEFINITIONS,
  LANDMARK_GENERATION_CONFIG,
  LANDMARK_RANDOM_SALTS,
  MAX_LANDMARK_FOOTPRINT_RADIUS_TILES,
  MAX_LANDMARK_RESERVATION_RADIUS_TILES,
  MAX_LANDMARK_VISUAL_RADIUS_TILES,
  LandmarkType,
  type LandmarkDefinition,
  type ProceduralLandmark
} from '../landmarkConfig';
import { biomeAtTile } from './biomeGenerator';
import { randomAtTile } from './noise';
import { surfaceAtTile } from './terrainGenerator';

export { LandmarkType };
export type {
  LandmarkDefinition,
  LandmarkGenerationConfig,
  LandmarkRandomSalts,
  ProceduralLandmark
} from '../landmarkConfig';

interface RawLandmark extends ProceduralLandmark {
  readonly cellX: number;
  readonly cellY: number;
  readonly priority: number;
}

interface LandmarkSeedCache {
  readonly rawCells: Map<string, RawLandmark | null>;
  readonly resolvedCells: Map<string, RawLandmark | null>;
}

const seedCaches = new Map<string, LandmarkSeedCache>();

// Versioning changes the coordinate streams themselves, not just a display label. A v2 world
// can therefore overhaul landmark sizes/types without silently reusing a v1 landmark identity.
const landmarkSalt = (salt: number): number => (
  salt ^ Math.imul(LANDMARK_GENERATION_CONFIG.generationVersion, 0x9e3779b1)
) >>> 0;

const landmarkRandomAt = (
  seed: string,
  tileX: number,
  tileY: number,
  salt: number
): number => randomAtTile(seed, tileX, tileY, landmarkSalt(salt));

const cellKey = (cellX: number, cellY: number): string => `${cellX},${cellY}`;

const distanceSquared = (firstX: number, firstY: number, secondX: number, secondY: number): number => {
  const deltaX = firstX - secondX;
  const deltaY = firstY - secondY;
  return deltaX * deltaX + deltaY * deltaY;
};

const cacheCell = <Value>(cache: Map<string, Value>, key: string, value: Value): Value => {
  // Reinsert on access/write for a small LRU cache. Null is deliberately cached too: most macro
  // cells have no landmark, and repeatedly recreating those negative results is avoidable work.
  cache.delete(key);
  cache.set(key, value);

  while (cache.size > LANDMARK_GENERATION_CONFIG.cellCacheLimit) {
    const oldestKey = cache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    cache.delete(oldestKey);
  }

  return value;
};

const getSeedCache = (seed: string): LandmarkSeedCache => {
  const cached = seedCaches.get(seed);

  if (cached) {
    seedCaches.delete(seed);
    seedCaches.set(seed, cached);
    return cached;
  }

  const cache: LandmarkSeedCache = {
    rawCells: new Map<string, RawLandmark | null>(),
    resolvedCells: new Map<string, RawLandmark | null>()
  };
  seedCaches.set(seed, cache);

  while (seedCaches.size > LANDMARK_GENERATION_CONFIG.seedCacheLimit) {
    const oldestSeed = seedCaches.keys().next().value;

    if (oldestSeed === undefined) {
      break;
    }

    seedCaches.delete(oldestSeed);
  }

  return cache;
};

const chooseDefinition = (seed: string, tileX: number, tileY: number): LandmarkDefinition | null => {
  const biome = biomeAtTile(seed, tileX, tileY);
  const definitions = (LANDMARK_DEFINITIONS as readonly LandmarkDefinition[])
    .filter((definition) => definition.validBiomes.includes(biome));

  if (definitions.length === 0) {
    return null;
  }

  const totalWeight = definitions.reduce((total, definition) => total + definition.selectionWeight, 0);
  let selectedWeight = landmarkRandomAt(seed, tileX, tileY, LANDMARK_RANDOM_SALTS.type) * totalWeight;

  for (const definition of definitions) {
    selectedWeight -= definition.selectionWeight;

    if (selectedWeight <= 0) {
      return definition;
    }
  }

  return definitions[definitions.length - 1];
};

const isInsideSpawnExclusion = (landmark: ProceduralLandmark): boolean => {
  const exclusionRadius = LANDMARK_GENERATION_CONFIG.spawnExclusionRadiusTiles
    + landmark.reservationRadiusTiles;

  return distanceSquared(
    landmark.centerTileX,
    landmark.centerTileY,
    LANDMARK_GENERATION_CONFIG.spawnTileX,
    LANDMARK_GENERATION_CONFIG.spawnTileY
  ) <= exclusionRadius * exclusionRadius;
};

// A few deterministic samples keep a landmark's broad footprint off water and mostly within a
// compatible region. We deliberately allow a small amount of biome blending at natural borders
// so this quality check does not make macro landmarks too scarce.
const fitsLandmarkTerrain = (
  seed: string,
  definition: LandmarkDefinition,
  centerTileX: number,
  centerTileY: number,
  footprintRadiusTiles: number
): boolean => {
  const sampleRadius = Math.max(2, Math.round(footprintRadiusTiles * 0.72));
  const samples: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [sampleRadius, 0],
    [-sampleRadius, 0],
    [0, sampleRadius],
    [0, -sampleRadius],
    [Math.round(sampleRadius * 0.7), Math.round(sampleRadius * 0.7)],
    [-Math.round(sampleRadius * 0.7), Math.round(sampleRadius * 0.7)],
    [Math.round(sampleRadius * 0.7), -Math.round(sampleRadius * 0.7)],
    [-Math.round(sampleRadius * 0.7), -Math.round(sampleRadius * 0.7)]
  ];
  let compatibleSamples = 0;

  for (const [offsetX, offsetY] of samples) {
    const surface = surfaceAtTile(seed, centerTileX + offsetX, centerTileY + offsetY);
    if (surface.isWater) {
      return false;
    }

    if (definition.validBiomes.includes(surface.biome)) {
      compatibleSamples += 1;
    }
  }

  return compatibleSamples >= samples.length - 2;
};

const createRawLandmark = (seed: string, cellX: number, cellY: number): RawLandmark | null => {
  if (landmarkRandomAt(seed, cellX, cellY, LANDMARK_RANDOM_SALTS.candidate) >= LANDMARK_GENERATION_CONFIG.candidateChance) {
    return null;
  }

  const { macroCellSizeTiles, candidatePositionPaddingTiles } = LANDMARK_GENERATION_CONFIG;
  const candidateSpan = macroCellSizeTiles - candidatePositionPaddingTiles * 2;
  const firstTileX = cellX * macroCellSizeTiles + candidatePositionPaddingTiles;
  const firstTileY = cellY * macroCellSizeTiles + candidatePositionPaddingTiles;
  const centerTileX = firstTileX + Math.floor(
    landmarkRandomAt(seed, cellX, cellY, LANDMARK_RANDOM_SALTS.centerX) * candidateSpan
  );
  const centerTileY = firstTileY + Math.floor(
    landmarkRandomAt(seed, cellX, cellY, LANDMARK_RANDOM_SALTS.centerY) * candidateSpan
  );
  const definition = chooseDefinition(seed, centerTileX, centerTileY);

  if (!definition) {
    return null;
  }

  const variation = landmarkRandomAt(seed, centerTileX, centerTileY, LANDMARK_RANDOM_SALTS.variation);
  // A restrained radius variation prevents repeated landmark silhouettes while leaving enough
  // reserved space for the largest placeholder visuals.
  const radiusScale = 0.9 + variation * 0.2;
  const footprintRadiusTiles = Math.max(1, Math.round(definition.footprintRadiusTiles * radiusScale));
  const visualRadiusTiles = Math.max(
    footprintRadiusTiles,
    Math.round(definition.visualRadiusTiles * radiusScale)
  );
  const reservationRadiusTiles = footprintRadiusTiles + definition.reservationPaddingTiles;
  if (!fitsLandmarkTerrain(seed, definition, centerTileX, centerTileY, footprintRadiusTiles)) {
    return null;
  }
  const landmark: RawLandmark = {
    id: `landmark:v${LANDMARK_GENERATION_CONFIG.generationVersion}:${definition.type}:${centerTileX}:${centerTileY}`,
    type: definition.type,
    label: definition.label,
    biome: biomeAtTile(seed, centerTileX, centerTileY),
    centerTileX,
    centerTileY,
    footprintRadiusTiles,
    visualRadiusTiles,
    reservationRadiusTiles,
    rotation: landmarkRandomAt(seed, centerTileX, centerTileY, LANDMARK_RANDOM_SALTS.rotation) * Math.PI * 2,
    variation,
    mapColor: definition.mapColor,
    cellX,
    cellY,
    priority: landmarkRandomAt(seed, cellX, cellY, LANDMARK_RANDOM_SALTS.priority)
  };

  return isInsideSpawnExclusion(landmark) ? null : landmark;
};

const rawLandmarkInCell = (
  seed: string,
  cellX: number,
  cellY: number,
  cache: LandmarkSeedCache
): RawLandmark | null => {
  const key = cellKey(cellX, cellY);
  const cached = cache.rawCells.get(key);

  if (cached !== undefined) {
    cacheCell(cache.rawCells, key, cached);
    return cached;
  }

  return cacheCell(cache.rawCells, key, createRawLandmark(seed, cellX, cellY));
};

const hasPriorityOver = (first: RawLandmark, second: RawLandmark): boolean => {
  if (first.priority !== second.priority) {
    return first.priority > second.priority;
  }

  if (first.cellY !== second.cellY) {
    return first.cellY < second.cellY;
  }

  return first.cellX < second.cellX;
};

const isSpacedFromNeighbors = (
  seed: string,
  landmark: RawLandmark,
  cache: LandmarkSeedCache
): boolean => {
  const { macroCellSizeTiles, candidatePositionPaddingTiles, minimumSeparationTiles } = LANDMARK_GENERATION_CONFIG;
  const candidateSpan = macroCellSizeTiles - candidatePositionPaddingTiles * 2;
  const maximumConflictDistance = Math.max(
    minimumSeparationTiles,
    MAX_LANDMARK_RESERVATION_RADIUS_TILES * 2
  );
  const neighborCellRadius = Math.max(1, Math.ceil((maximumConflictDistance + candidateSpan) / macroCellSizeTiles));

  for (let neighborY = landmark.cellY - neighborCellRadius; neighborY <= landmark.cellY + neighborCellRadius; neighborY += 1) {
    for (let neighborX = landmark.cellX - neighborCellRadius; neighborX <= landmark.cellX + neighborCellRadius; neighborX += 1) {
      if (neighborX === landmark.cellX && neighborY === landmark.cellY) {
        continue;
      }

      const neighbor = rawLandmarkInCell(seed, neighborX, neighborY, cache);

      if (!neighbor) {
        continue;
      }

      const requiredDistance = Math.max(
        minimumSeparationTiles,
        landmark.reservationRadiusTiles + neighbor.reservationRadiusTiles
      );
      const isTooClose = distanceSquared(
        landmark.centerTileX,
        landmark.centerTileY,
        neighbor.centerTileX,
        neighbor.centerTileY
      ) < requiredDistance * requiredDistance;

      if (isTooClose && !hasPriorityOver(landmark, neighbor)) {
        return false;
      }
    }
  }

  return true;
};

const landmarkInCell = (seed: string, cellX: number, cellY: number, cache: LandmarkSeedCache): RawLandmark | null => {
  const key = cellKey(cellX, cellY);
  const cached = cache.resolvedCells.get(key);

  if (cached !== undefined) {
    cacheCell(cache.resolvedCells, key, cached);
    return cached;
  }

  const rawLandmark = rawLandmarkInCell(seed, cellX, cellY, cache);
  const resolved = rawLandmark && isSpacedFromNeighbors(seed, rawLandmark, cache) ? rawLandmark : null;

  return cacheCell(cache.resolvedCells, key, resolved);
};

const cellRangeForTiles = (minimumTile: number, maximumTile: number, radiusTiles: number): readonly [number, number] => {
  const first = Math.floor((minimumTile - radiusTiles) / LANDMARK_GENERATION_CONFIG.macroCellSizeTiles);
  const last = Math.floor((maximumTile + radiusTiles) / LANDMARK_GENERATION_CONFIG.macroCellSizeTiles);
  return [first, last];
};

const landmarkIntersectsTileBounds = (
  landmark: ProceduralLandmark,
  minTileX: number,
  minTileY: number,
  maxTileX: number,
  maxTileY: number
): boolean => {
  const closestX = Math.max(minTileX, Math.min(landmark.centerTileX, maxTileX));
  const closestY = Math.max(minTileY, Math.min(landmark.centerTileY, maxTileY));

  return distanceSquared(landmark.centerTileX, landmark.centerTileY, closestX, closestY)
    <= landmark.visualRadiusTiles * landmark.visualRadiusTiles;
};

const containsTileWithinRadius = (landmark: ProceduralLandmark, tileX: number, tileY: number, radius: number): boolean =>
  distanceSquared(landmark.centerTileX, landmark.centerTileY, tileX, tileY) <= radius * radius;

const copyLandmark = (landmark: RawLandmark): ProceduralLandmark => ({
  id: landmark.id,
  type: landmark.type,
  label: landmark.label,
  biome: landmark.biome,
  centerTileX: landmark.centerTileX,
  centerTileY: landmark.centerTileY,
  footprintRadiusTiles: landmark.footprintRadiusTiles,
  visualRadiusTiles: landmark.visualRadiusTiles,
  reservationRadiusTiles: landmark.reservationRadiusTiles,
  rotation: landmark.rotation,
  variation: landmark.variation,
  mapColor: landmark.mapColor
});

const normalizedBounds = (
  firstTileX: number,
  firstTileY: number,
  secondTileX: number,
  secondTileY: number
): readonly [number, number, number, number] | null => {
  if (![firstTileX, firstTileY, secondTileX, secondTileY].every(Number.isFinite)) {
    return null;
  }

  const minTileX = Math.floor(Math.min(firstTileX, secondTileX));
  const maxTileX = Math.floor(Math.max(firstTileX, secondTileX));
  const minTileY = Math.floor(Math.min(firstTileY, secondTileY));
  const maxTileY = Math.floor(Math.max(firstTileY, secondTileY));
  return [minTileX, minTileY, maxTileX, maxTileY];
};

// Inclusive tile bounds. Visual radius is used so a landmark whose art overhangs a streamed
// chunk is still returned to its renderer.
export const landmarksIntersectingTiles = (
  seed: string,
  firstTileX: number,
  firstTileY: number,
  secondTileX: number,
  secondTileY: number
): ProceduralLandmark[] => {
  const bounds = normalizedBounds(firstTileX, firstTileY, secondTileX, secondTileY);

  if (!bounds) {
    return [];
  }

  const [minTileX, minTileY, maxTileX, maxTileY] = bounds;
  const [firstCellX, lastCellX] = cellRangeForTiles(minTileX, maxTileX, MAX_LANDMARK_VISUAL_RADIUS_TILES);
  const [firstCellY, lastCellY] = cellRangeForTiles(minTileY, maxTileY, MAX_LANDMARK_VISUAL_RADIUS_TILES);
  const cache = getSeedCache(seed);
  const landmarks: ProceduralLandmark[] = [];

  for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
      const landmark = landmarkInCell(seed, cellX, cellY, cache);

      if (landmark && landmarkIntersectsTileBounds(landmark, minTileX, minTileY, maxTileX, maxTileY)) {
        landmarks.push(copyLandmark(landmark));
      }
    }
  }

  return landmarks;
};

// Returns the landmark whose gameplay footprint contains the tile, if any. Visual overhangs do
// not count as being inside a landmark, which keeps the F3 label and reserved terrain precise.
export const landmarkAtTile = (seed: string, tileX: number, tileY: number): ProceduralLandmark | null => {
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
    return null;
  }

  const normalizedTileX = Math.floor(tileX);
  const normalizedTileY = Math.floor(tileY);
  const [firstCellX, lastCellX] = cellRangeForTiles(
    normalizedTileX,
    normalizedTileX,
    MAX_LANDMARK_FOOTPRINT_RADIUS_TILES
  );
  const [firstCellY, lastCellY] = cellRangeForTiles(
    normalizedTileY,
    normalizedTileY,
    MAX_LANDMARK_FOOTPRINT_RADIUS_TILES
  );
  const cache = getSeedCache(seed);
  let closest: RawLandmark | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
      const landmark = landmarkInCell(seed, cellX, cellY, cache);

      if (!landmark || !containsTileWithinRadius(landmark, normalizedTileX, normalizedTileY, landmark.footprintRadiusTiles)) {
        continue;
      }

      const distance = distanceSquared(landmark.centerTileX, landmark.centerTileY, normalizedTileX, normalizedTileY);
      if (!closest || distance < closestDistance || (distance === closestDistance && landmark.id < closest.id)) {
        closest = landmark;
        closestDistance = distance;
      }
    }
  }

  return closest ? copyLandmark(closest) : null;
};

export interface NearestLandmark {
  readonly landmark: ProceduralLandmark;
  readonly centerDistanceTiles: number;
  readonly edgeDistanceTiles: number;
  readonly deltaTileX: number;
  readonly deltaTileY: number;
}

// Finds the globally nearest landmark without generating an arbitrary square of world tiles.
// Macro cells are visited in expanding rings; once the closest possible candidate in every
// unvisited cell is farther away than the best result, the search is mathematically complete.
// In practice this normally resolves after one or two rings and only runs while F3 is visible.
export const nearestLandmarkToTile = (
  seed: string,
  tileX: number,
  tileY: number
): NearestLandmark | null => {
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
    return null;
  }

  const { macroCellSizeTiles, candidatePositionPaddingTiles } = LANDMARK_GENERATION_CONFIG;
  const centerCellX = Math.floor(tileX / macroCellSizeTiles);
  const centerCellY = Math.floor(tileY / macroCellSizeTiles);
  const cache = getSeedCache(seed);
  let nearest: RawLandmark | null = null;
  let nearestCenterDistanceSquared = Number.POSITIVE_INFINITY;
  let nearestEdgeDistance = Number.POSITIVE_INFINITY;

  // Sixty-four rings cover more than 49,000 tiles across. The cap is defensive against a
  // corrupted configuration while remaining far beyond any plausible deterministic dry spell.
  for (let ring = 0; ring <= 64; ring += 1) {
    for (let cellY = centerCellY - ring; cellY <= centerCellY + ring; cellY += 1) {
      for (let cellX = centerCellX - ring; cellX <= centerCellX + ring; cellX += 1) {
        if (ring > 0 && Math.abs(cellX - centerCellX) !== ring && Math.abs(cellY - centerCellY) !== ring) {
          continue;
        }

        const landmark = landmarkInCell(seed, cellX, cellY, cache);
        if (!landmark) {
          continue;
        }

        const candidateCenterDistanceSquared = distanceSquared(
          tileX,
          tileY,
          landmark.centerTileX,
          landmark.centerTileY
        );
        const candidateEdgeDistance = Math.max(
          0,
          Math.sqrt(candidateCenterDistanceSquared) - landmark.footprintRadiusTiles
        );
        if (
          candidateEdgeDistance < nearestEdgeDistance
          || (
            candidateEdgeDistance === nearestEdgeDistance
            && (
              candidateCenterDistanceSquared < nearestCenterDistanceSquared
              || (candidateCenterDistanceSquared === nearestCenterDistanceSquared && (!nearest || landmark.id < nearest.id))
            )
          )
        ) {
          nearest = landmark;
          nearestCenterDistanceSquared = candidateCenterDistanceSquared;
          nearestEdgeDistance = candidateEdgeDistance;
        }
      }
    }

    if (!nearest) {
      continue;
    }

    const nextLeftCenterX = (centerCellX - ring) * macroCellSizeTiles - candidatePositionPaddingTiles - 1;
    const nextRightCenterX = (centerCellX + ring + 1) * macroCellSizeTiles + candidatePositionPaddingTiles;
    const nextTopCenterY = (centerCellY - ring) * macroCellSizeTiles - candidatePositionPaddingTiles - 1;
    const nextBottomCenterY = (centerCellY + ring + 1) * macroCellSizeTiles + candidatePositionPaddingTiles;
    const closestUnvisitedDistance = Math.min(
      Math.abs(tileX - nextLeftCenterX),
      Math.abs(nextRightCenterX - tileX),
      Math.abs(tileY - nextTopCenterY),
      Math.abs(nextBottomCenterY - tileY)
    );
    const closestUnvisitedEdgeDistance = Math.max(
      0,
      closestUnvisitedDistance - MAX_LANDMARK_FOOTPRINT_RADIUS_TILES
    );
    if (nearestEdgeDistance <= closestUnvisitedEdgeDistance) {
      break;
    }
  }

  // TypeScript does not carry the loop assignment into its post-loop narrowing here.
  const resolvedNearest = nearest as RawLandmark | null;
  if (!resolvedNearest) {
    return null;
  }

  const deltaTileX = resolvedNearest.centerTileX - tileX;
  const deltaTileY = resolvedNearest.centerTileY - tileY;
  const centerDistanceTiles = Math.sqrt(nearestCenterDistanceSquared);
  return {
    landmark: copyLandmark(resolvedNearest),
    centerDistanceTiles,
    edgeDistanceTiles: Math.max(0, centerDistanceTiles - resolvedNearest.footprintRadiusTiles),
    deltaTileX,
    deltaTileY
  };
};

// Reservations extend beyond a gameplay footprint so ordinary terrain features can be skipped
// around a future landmark drawing. This is a pure lookup and works across negative coordinates.
export const isLandmarkReservedTile = (seed: string, tileX: number, tileY: number): boolean => {
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
    return false;
  }

  const normalizedTileX = Math.floor(tileX);
  const normalizedTileY = Math.floor(tileY);
  const [firstCellX, lastCellX] = cellRangeForTiles(
    normalizedTileX,
    normalizedTileX,
    MAX_LANDMARK_RESERVATION_RADIUS_TILES
  );
  const [firstCellY, lastCellY] = cellRangeForTiles(
    normalizedTileY,
    normalizedTileY,
    MAX_LANDMARK_RESERVATION_RADIUS_TILES
  );
  const cache = getSeedCache(seed);

  for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
      const landmark = landmarkInCell(seed, cellX, cellY, cache);

      if (landmark && containsTileWithinRadius(
        landmark,
        normalizedTileX,
        normalizedTileY,
        landmark.reservationRadiusTiles
      )) {
        return true;
      }
    }
  }

  return false;
};

// Helpful for controlled tests and world-seed changes; clearing this cache never changes output.
export const clearLandmarkGenerationCache = (): void => {
  seedCaches.clear();
};

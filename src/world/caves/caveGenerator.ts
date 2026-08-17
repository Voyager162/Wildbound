import { Biome, biomeAtTile } from '../generation/biomeGenerator';
import { featureAtTile } from '../generation/featureGenerator';
import { randomAtTile } from '../generation/noise';
import { surfaceAtTile } from '../generation/terrainGenerator';
import { CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from '../worldConfig';

export type CaveDepth = 'shallow' | 'medium' | 'deep';
export type CaveOreType = 'coal' | 'iron' | 'gold' | 'diamond';

export interface CaveEntrance {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly biome: Biome;
  readonly depth: CaveDepth;
}

export interface CaveOre {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly type: CaveOreType;
}

export interface CaveLayout {
  readonly entrance: CaveEntrance;
  readonly width: number;
  readonly height: number;
  readonly entranceTileX: number;
  readonly entranceTileY: number;
  readonly floorTiles: readonly (readonly boolean[])[];
  readonly ores: readonly CaveOre[];
}

export interface CaveWorldOrigin {
  readonly x: number;
  readonly y: number;
}

const CAVE_CHANCE_BY_BIOME: Readonly<Partial<Record<Biome, number>>> = {
  [Biome.Mountains]: 0.0075,
  [Biome.Hills]: 0.0028,
  [Biome.Snow]: 0.0012,
  [Biome.Forest]: 0.00045,
  [Biome.Plains]: 0.00032,
  [Biome.Desert]: 0.00025,
  [Biome.Swamp]: 0.0002,
};

const CAVE_ROLL_SALT = 71_209;
const CAVE_DEPTH_SALT = 71_213;
const CAVE_SHAPE_SALT = 71_219;
const CAVE_ORE_SALT = 71_227;
const CAVE_WORLD_OFFSET = 4_000_000;
const CAVE_WORLD_STRIDE = 2_048;

const depthForEntrance = (seed: string, tileX: number, tileY: number): CaveDepth => {
  // Do not sample the same hash coordinate used for the sparse entrance roll. At very small
  // entrance chances those values are conditioned near zero, which would bias depth selection.
  const roll = randomAtTile(seed, tileX * 31 + 17, tileY * 17 - 29, CAVE_DEPTH_SALT);
  if (roll < 0.1) {
    return 'deep';
  }
  return roll < 0.34 ? 'medium' : 'shallow';
};

/** Returns an entrance only when its tile can safely replace a surface feature. */
export const caveEntranceAtTile = (seed: string, tileX: number, tileY: number): CaveEntrance | null => {
  const biome = biomeAtTile(seed, tileX, tileY);
  const chance = CAVE_CHANCE_BY_BIOME[biome] ?? 0;
  if (chance <= 0 || randomAtTile(seed, tileX, tileY, CAVE_ROLL_SALT) >= chance) {
    return null;
  }

  const surface = surfaceAtTile(seed, tileX, tileY);
  if (surface.isWater || featureAtTile(seed, tileX, tileY)) {
    return null;
  }

  return {
    id: `${tileX}:${tileY}`,
    tileX,
    tileY,
    biome,
    depth: depthForEntrance(seed, tileX, tileY),
  };
};

export const generateChunkCaveEntrances = (
  seed: string,
  chunkX: number,
  chunkY: number,
): readonly CaveEntrance[] => {
  const entrances: CaveEntrance[] = [];
  const startTileX = chunkX * CHUNK_SIZE_TILES;
  const startTileY = chunkY * CHUNK_SIZE_TILES;
  for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
    for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
      const entrance = caveEntranceAtTile(seed, startTileX + localX, startTileY + localY);
      if (entrance) {
        entrances.push(entrance);
      }
    }
  }
  return entrances;
};

const caveDimensions = (depth: CaveDepth): { width: number; height: number } => {
  switch (depth) {
    case 'deep':
      return { width: 34, height: 27 };
    case 'medium':
      return { width: 27, height: 22 };
    default:
      return { width: 20, height: 17 };
  }
};

const oreForTile = (
  seed: string,
  entrance: CaveEntrance,
  tileX: number,
  tileY: number,
  normalizedDepth: number,
): CaveOreType | null => {
  const roll = randomAtTile(seed, entrance.tileX * 131 + tileX, entrance.tileY * 131 + tileY, CAVE_ORE_SALT);
  if (entrance.depth === 'deep' && normalizedDepth > 0.73 && roll < 0.012) {
    return 'diamond';
  }
  if (normalizedDepth > 0.55 && roll < 0.028) {
    return 'gold';
  }
  if (normalizedDepth > 0.3 && roll < 0.055) {
    return 'iron';
  }
  if (normalizedDepth > 0.06 && roll < 0.09) {
    return 'coal';
  }
  return null;
};

/**
 * The layout is entirely a pure function of the surface entrance.  The central
 * corridor deliberately keeps every generated cave connected to its exit.
 */
export const generateCaveLayout = (seed: string, entrance: CaveEntrance): CaveLayout => {
  const { width, height } = caveDimensions(entrance.depth);
  const entranceTileX = Math.floor(width / 2);
  const entranceTileY = height - 2;
  const floorTiles: boolean[][] = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  const centerX = (width - 1) / 2;
  const centerY = height * 0.49;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const horizontal = (x - centerX) / (width * 0.45);
      const vertical = (y - centerY) / (height * 0.49);
      const shapeNoise = randomAtTile(seed, entrance.tileX * 97 + x, entrance.tileY * 97 + y, CAVE_SHAPE_SALT);
      const lobe = Math.sin((x + shapeNoise * 4) * 0.68) * 0.075;
      floorTiles[y][x] = horizontal * horizontal + vertical * vertical < 0.9 + lobe + shapeNoise * 0.22;
    }
  }

  // A narrow, stable path ensures the entrance is never sealed by a noisy wall.
  for (let y = 2; y <= entranceTileY; y += 1) {
    for (let x = entranceTileX - 1; x <= entranceTileX + 1; x += 1) {
      floorTiles[y][x] = true;
    }
  }

  const ores: CaveOre[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (!floorTiles[y][x] || Math.abs(x - entranceTileX) <= 1 && y >= entranceTileY - 2) {
        continue;
      }
      const normalizedDepth = (entranceTileY - y) / Math.max(1, entranceTileY - 2);
      const type = oreForTile(seed, entrance, x, y, normalizedDepth);
      if (type) {
        ores.push({ id: `${entrance.id}:${x}:${y}`, tileX: x, tileY: y, type });
      }
    }
  }

  return { entrance, width, height, entranceTileX, entranceTileY, floorTiles, ores };
};

export const caveWorldOrigin = (entrance: CaveEntrance): CaveWorldOrigin => ({
  x: CAVE_WORLD_OFFSET + entrance.tileX * CAVE_WORLD_STRIDE,
  y: CAVE_WORLD_OFFSET + entrance.tileY * CAVE_WORLD_STRIDE,
});

export const caveWorldTilePosition = (origin: CaveWorldOrigin, tileX: number, tileY: number): CaveWorldOrigin => ({
  x: origin.x + tileX * WORLD_TILE_SIZE + WORLD_TILE_SIZE / 2,
  y: origin.y + tileY * WORLD_TILE_SIZE + WORLD_TILE_SIZE / 2,
});

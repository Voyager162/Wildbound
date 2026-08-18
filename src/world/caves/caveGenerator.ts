import { Biome, biomeAtTile } from '../generation/biomeGenerator';
import { featureAtTile } from '../generation/featureGenerator';
import { randomAtTile } from '../generation/noise';
import { surfaceAtTile } from '../generation/terrainGenerator';
import {
  CAVE_ORE_PLACEMENT_CHANCE,
  CAVE_ORE_SPAWN_RULES,
  CAVE_ORE_VEIN_STYLES,
  type CaveOreType,
  type CaveOreVeinStyle
} from './caveOreGenerationConfig';
import { CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from '../worldConfig';
import {
  CAVE_FORMATION_RADIUS_MAX_TILES,
  CAVE_FORMATION_RADIUS_MIN_TILES,
  CAVE_INTERIOR_DIMENSIONS,
  CAVE_MIN_SEPARATION_TILES,
  CAVE_MOUTH_FORWARD_OFFSET_MAX_SCALE,
  CAVE_MOUTH_FORWARD_OFFSET_MIN_SCALE,
  CAVE_MOUTH_FORWARD_RADIUS_MAX_SCALE,
  CAVE_MOUTH_FORWARD_RADIUS_MIN_SCALE,
  CAVE_MOUTH_RECESS_FORWARD_SHIFT_SCALE,
  CAVE_MOUTH_SIDE_OFFSET_MAX_SCALE,
  CAVE_MOUTH_SIDE_RADIUS_MAX_SCALE,
  CAVE_MOUTH_SIDE_RADIUS_MIN_SCALE,
  CAVE_SPAWN_CHANCE_BY_BIOME,
  CAVE_WORLD_ORIGIN_STRIDE,
} from './caveGenerationConfig';

export type CaveDepth = 'shallow' | 'medium' | 'deep';
export type CaveOrePlacement = 'floor' | 'wall';
export type { CaveOreType, CaveOreVeinStyle } from './caveOreGenerationConfig';

export interface CaveEntrance {
  readonly id: string; readonly tileX: number; readonly tileY: number; readonly biome: Biome; readonly depth: CaveDepth;
  readonly formationRadiusTiles: number; readonly mouthAngle: number;
  readonly mouthCenterForwardTiles: number; readonly mouthCenterSideTiles: number;
  readonly mouthForwardRadiusTiles: number; readonly mouthSideRadiusTiles: number;
}
export interface CaveOre {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly type: CaveOreType;
  readonly placement: CaveOrePlacement;
  readonly veinStyle: CaveOreVeinStyle;
  // For a wall deposit, this points from the rock tile toward its adjacent floor tile. The
  // renderer uses it to keep the mineral tucked into the wall face rather than spilling out.
  readonly wallFloorDirectionX: number;
  readonly wallFloorDirectionY: number;
}
export interface CaveLayout {
  readonly entrance: CaveEntrance; readonly width: number; readonly height: number; readonly entranceTileX: number; readonly entranceTileY: number;
  readonly floorTiles: readonly (readonly boolean[])[]; readonly depthByTile: readonly (readonly number[])[]; readonly ores: readonly CaveOre[];
}
export interface CaveWorldOrigin { readonly x: number; readonly y: number; }

const CAVE_ROLL_SALT = 71_209;
const CAVE_PRIORITY_SALT = 71_211;
const CAVE_DEPTH_SALT = 71_213;
const CAVE_FORMATION_SALT = 71_217;
const CAVE_GRAPH_SALT = 71_219;
const CAVE_ORE_SALT = 71_227;
const CAVE_ORE_STYLE_SALT = 71_229;
const CAVE_WORLD_OFFSET = 4_000_000;
const CAVE_CHUNK_CACHE_LIMIT = 512;
const caveChunkCache = new Map<string, readonly CaveEntrance[]>();
const CARDINAL_DIRECTIONS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface CaveMouthCenter {
  readonly x: number;
  readonly y: number;
}

const caveChanceAt = (seed: string, x: number, y: number): number => CAVE_SPAWN_CHANCE_BY_BIOME[biomeAtTile(seed, x, y)];
const isRawCaveCandidate = (seed: string, x: number, y: number): boolean => randomAtTile(seed, x, y, CAVE_ROLL_SALT) < caveChanceAt(seed, x, y);

const depthForEntrance = (seed: string, x: number, y: number): CaveDepth => {
  // This stream deliberately differs from the sparse candidate stream, avoiding conditioned rolls.
  const roll = randomAtTile(seed, x * 31 + 17, y * 17 - 29, CAVE_DEPTH_SALT);
  return roll < 0.1 ? 'deep' : roll < 0.34 ? 'medium' : 'shallow';
};

const hasNearestCandidatePriority = (seed: string, tileX: number, tileY: number): boolean => {
  const priority = randomAtTile(seed, tileX, tileY, CAVE_PRIORITY_SALT);
  for (let y = tileY - CAVE_MIN_SEPARATION_TILES; y <= tileY + CAVE_MIN_SEPARATION_TILES; y += 1) for (let x = tileX - CAVE_MIN_SEPARATION_TILES; x <= tileX + CAVE_MIN_SEPARATION_TILES; x += 1) {
    if ((x === tileX && y === tileY) || !isRawCaveCandidate(seed, x, y)) continue;
    const other = randomAtTile(seed, x, y, CAVE_PRIORITY_SALT);
    if (other < priority || (other === priority && (y < tileY || y === tileY && x < tileX))) return false;
  }
  return true;
};

/** A cave entrance is a sparse terrain landmark; water, beach, ocean, and normal features are excluded. */
export const caveEntranceAtTile = (seed: string, tileX: number, tileY: number): CaveEntrance | null => {
  if (!isRawCaveCandidate(seed, tileX, tileY) || !hasNearestCandidatePriority(seed, tileX, tileY)) return null;
  const surface = surfaceAtTile(seed, tileX, tileY);
  if (surface.isWater || featureAtTile(seed, tileX, tileY)) return null;
  const formation = randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT);
  const formationRadiusTiles = CAVE_FORMATION_RADIUS_MIN_TILES + formation * (CAVE_FORMATION_RADIUS_MAX_TILES - CAVE_FORMATION_RADIUS_MIN_TILES);
  const mouthForwardOffsetScale = CAVE_MOUTH_FORWARD_OFFSET_MIN_SCALE
    + randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT + 2) * (CAVE_MOUTH_FORWARD_OFFSET_MAX_SCALE - CAVE_MOUTH_FORWARD_OFFSET_MIN_SCALE);
  const mouthForwardRadiusScale = CAVE_MOUTH_FORWARD_RADIUS_MIN_SCALE
    + randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT + 3) * (CAVE_MOUTH_FORWARD_RADIUS_MAX_SCALE - CAVE_MOUTH_FORWARD_RADIUS_MIN_SCALE);
  const mouthSideRadiusScale = CAVE_MOUTH_SIDE_RADIUS_MIN_SCALE
    + randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT + 4) * (CAVE_MOUTH_SIDE_RADIUS_MAX_SCALE - CAVE_MOUTH_SIDE_RADIUS_MIN_SCALE);
  return {
    id: `${tileX}:${tileY}`, tileX, tileY, biome: biomeAtTile(seed, tileX, tileY), depth: depthForEntrance(seed, tileX, tileY),
    formationRadiusTiles,
    // Surface entrances read best as a broad, face-on rock mouth from the top-down camera.
    // A seed-derived sway keeps each one unique without turning the opening into a diagonal slit.
    mouthAngle: Math.PI / 2 + (randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT + 1) - 0.5) * 0.7,
    mouthCenterForwardTiles: formationRadiusTiles * mouthForwardOffsetScale,
    mouthCenterSideTiles: formationRadiusTiles * (randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT + 5) - 0.5) * CAVE_MOUTH_SIDE_OFFSET_MAX_SCALE * 2,
    mouthForwardRadiusTiles: formationRadiusTiles * mouthForwardRadiusScale,
    mouthSideRadiusTiles: formationRadiusTiles * mouthSideRadiusScale,
  };
};

export const caveMouthCenter = (entrance: CaveEntrance): CaveMouthCenter => {
  const centerX = (entrance.tileX + 0.5) * WORLD_TILE_SIZE;
  const centerY = (entrance.tileY + 0.5) * WORLD_TILE_SIZE;
  const forwardX = Math.cos(entrance.mouthAngle);
  const forwardY = Math.sin(entrance.mouthAngle);
  const sideX = -forwardY;
  const sideY = forwardX;
  return {
    x: centerX + (
      forwardX * (entrance.mouthCenterForwardTiles + entrance.mouthForwardRadiusTiles * CAVE_MOUTH_RECESS_FORWARD_SHIFT_SCALE)
      + sideX * entrance.mouthCenterSideTiles
    ) * WORLD_TILE_SIZE,
    y: centerY + (
      forwardY * (entrance.mouthCenterForwardTiles + entrance.mouthForwardRadiusTiles * CAVE_MOUTH_RECESS_FORWARD_SHIFT_SCALE)
      + sideY * entrance.mouthCenterSideTiles
    ) * WORLD_TILE_SIZE,
  };
};

export const generateChunkCaveEntrances = (seed: string, chunkX: number, chunkY: number): readonly CaveEntrance[] => {
  const cacheKey = `${seed}:${chunkX}:${chunkY}`;
  const cached = caveChunkCache.get(cacheKey);
  if (cached) return cached;
  const found: CaveEntrance[] = [];
  for (let y = 0; y < CHUNK_SIZE_TILES; y += 1) for (let x = 0; x < CHUNK_SIZE_TILES; x += 1) {
    const entrance = caveEntranceAtTile(seed, chunkX * CHUNK_SIZE_TILES + x, chunkY * CHUNK_SIZE_TILES + y);
    if (entrance) found.push(entrance);
  }
  if (caveChunkCache.size >= CAVE_CHUNK_CACHE_LIMIT) {
    const oldestKey = caveChunkCache.keys().next().value;
    if (oldestKey) caveChunkCache.delete(oldestKey);
  }
  caveChunkCache.set(cacheKey, found);
  return found;
};

const caveDimensions = (depth: CaveDepth): { width: number; height: number; chambers: number } => CAVE_INTERIOR_DIMENSIONS[depth];
interface CaveChamber { readonly x: number; readonly y: number; readonly radiusX: number; readonly radiusY: number; }
const graphRandom = (seed: string, cave: CaveEntrance, index: number, salt: number): number => randomAtTile(seed, cave.tileX * 97 + index * 23, cave.tileY * 97 - index * 29, CAVE_GRAPH_SALT + salt);

const carveTunnel = (tiles: boolean[][], from: CaveChamber, to: CaveChamber, width: number): void => {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 1.7));
  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(from.x + (to.x - from.x) * step / steps), y = Math.round(from.y + (to.y - from.y) * step / steps);
    for (let dy = -width; dy <= width; dy += 1) for (let dx = -width; dx <= width; dx += 1) {
      if (dx * dx + dy * dy > width * width + 0.45) continue;
      if (y + dy > 0 && y + dy < tiles.length - 1 && x + dx > 0 && x + dx < tiles[0].length - 1) tiles[y + dy][x + dx] = true;
    }
  }
};

const carveChamber = (seed: string, cave: CaveEntrance, tiles: boolean[][], chamber: CaveChamber, index: number): void => {
  for (let y = Math.floor(chamber.y - chamber.radiusY - 1); y <= Math.ceil(chamber.y + chamber.radiusY + 1); y += 1) for (let x = Math.floor(chamber.x - chamber.radiusX - 1); x <= Math.ceil(chamber.x + chamber.radiusX + 1); x += 1) {
    if (y <= 0 || y >= tiles.length - 1 || x <= 0 || x >= tiles[0].length - 1) continue;
    const h = (x - chamber.x) / chamber.radiusX, v = (y - chamber.y) / chamber.radiusY;
    if (h * h + v * v < 0.82 + randomAtTile(seed, cave.tileX * 193 + x, cave.tileY * 193 + y, CAVE_GRAPH_SALT + index * 31) * 0.27) tiles[y][x] = true;
  }
};

const buildDepthMap = (tiles: boolean[][], startX: number, startY: number): number[][] => {
  const distances = Array.from({ length: tiles.length }, () => Array<number>(tiles[0].length).fill(-1));
  const queue: Array<readonly [number, number]> = [[startX, startY]]; distances[startY][startX] = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index], distance = distances[y][x] + 1;
    CARDINAL_DIRECTIONS.forEach(([dx, dy]) => {
      const nextX = x + dx, nextY = y + dy;
      if (nextY >= 0 && nextY < tiles.length && nextX >= 0 && nextX < tiles[0].length && tiles[nextY][nextX] && distances[nextY][nextX] < 0) {
        distances[nextY][nextX] = distance; queue.push([nextX, nextY]);
      }
    });
  }
  const maximum = distances.reduce((max, row) => Math.max(max, ...row), 1);
  return distances.map((row) => row.map((distance) => distance < 0 ? -1 : distance / maximum));
};

const oreForDepth = (seed: string, cave: CaveEntrance, x: number, y: number, depth: number): CaveOreType | null => {
  const roll = randomAtTile(seed, cave.tileX * 131 + x, cave.tileY * 131 + y, CAVE_ORE_SALT);
  const rules = CAVE_ORE_SPAWN_RULES;
  if ((!rules.diamond.requiresDeepCave || cave.depth === 'deep') && depth > rules.diamond.minimumNormalizedDepth && roll < rules.diamond.chance) return 'diamond';
  if (depth > rules.gold.minimumNormalizedDepth && roll < rules.gold.chance) return 'gold';
  if (depth > rules.iron.minimumNormalizedDepth && roll < rules.iron.chance) return 'iron';
  return depth > rules.coal.minimumNormalizedDepth && roll < rules.coal.chance ? 'coal' : null;
};

const oreVeinStyleFor = (seed: string, cave: CaveEntrance, x: number, y: number, type: CaveOreType): CaveOreVeinStyle => {
  const styles = CAVE_ORE_VEIN_STYLES[type];
  const roll = randomAtTile(seed, cave.tileX * 149 + x, cave.tileY * 149 + y, CAVE_ORE_STYLE_SALT);
  return styles[Math.min(styles.length - 1, Math.floor(roll * styles.length))];
};

/** Connected irregular chambers form a readable spine, with deterministic dead-end side tunnels. */
export const generateCaveLayout = (seed: string, entrance: CaveEntrance): CaveLayout => {
  const { width, height, chambers: count } = caveDimensions(entrance.depth);
  const entranceTileX = Math.floor(width / 2), entranceTileY = height - 3;
  const floorTiles = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  const chambers: CaveChamber[] = [{ x: entranceTileX, y: entranceTileY, radiusX: 3.5, radiusY: 2.6 }];
  for (let index = 1; index < count; index += 1) {
    const progress = index / (count - 1), prior = chambers[index - 1];
    const curve = Math.sin(progress * Math.PI * 2 + graphRandom(seed, entrance, index, 1) * 1.8) * width * 0.12;
    const chamber: CaveChamber = {
      x: Math.max(7, Math.min(width - 8, entranceTileX + curve + (graphRandom(seed, entrance, index, 2) - 0.5) * width * 0.16)),
      y: Math.max(6, Math.min(height - 6, height - 4 - progress * (height - 13) + (graphRandom(seed, entrance, index, 3) - 0.5) * 5)),
      radiusX: 4 + graphRandom(seed, entrance, index, 4) * 5.5, radiusY: 3 + graphRandom(seed, entrance, index, 5) * 4.4,
    };
    chambers.push(chamber); carveTunnel(floorTiles, prior, chamber, 1 + Math.floor(graphRandom(seed, entrance, index, 6) * 2));
  }
  chambers.slice(1, -1).forEach((source, index) => {
    if (index % 2 || graphRandom(seed, entrance, index, 7) < 0.32) return;
    const branch: CaveChamber = { x: Math.max(6, Math.min(width - 7, source.x + (graphRandom(seed, entrance, index, 8) > 0.5 ? 1 : -1) * (7 + graphRandom(seed, entrance, index, 9) * 9))), y: Math.max(5, Math.min(height - 6, source.y + (graphRandom(seed, entrance, index, 10) - 0.5) * 9)), radiusX: 3.5 + graphRandom(seed, entrance, index, 11) * 3.5, radiusY: 2.8 + graphRandom(seed, entrance, index, 12) * 3 };
    chambers.push(branch); carveTunnel(floorTiles, source, branch, 1);
  });
  chambers.forEach((chamber, index) => carveChamber(seed, entrance, floorTiles, chamber, index));
  const depthByTile = buildDepthMap(floorTiles, entranceTileX, entranceTileY);
  const ores: CaveOre[] = [];
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const adjacentFloorDirections = CARDINAL_DIRECTIONS.filter(([dx, dy]) => floorTiles[y + dy][x + dx]);
    const placement: CaveOrePlacement = floorTiles[y][x] ? 'floor' : 'wall';
    // Floor deposits need one clear tile on every side. This prevents a wide seam from ever
    // crossing a rendered wall. Wall deposits instead use the adjoining floor's depth.
    if ((placement === 'floor' && adjacentFloorDirections.length !== CARDINAL_DIRECTIONS.length) || (placement === 'wall' && adjacentFloorDirections.length === 0)) continue;
    const depth = placement === 'floor'
      ? depthByTile[y][x]
      : Math.max(...adjacentFloorDirections.map(([dx, dy]) => depthByTile[y + dy][x + dx]));
    if (depth < 0.05 || x === entranceTileX && y >= entranceTileY - 3) continue;
    const ore = oreForDepth(seed, entrance, x, y, depth);
    if (ore && randomAtTile(seed, x + entrance.tileX * 41, y + entrance.tileY * 41, CAVE_ORE_SALT + 3) < CAVE_ORE_PLACEMENT_CHANCE[placement]) {
      const wallDirection = placement === 'wall'
        ? adjacentFloorDirections[Math.min(
          adjacentFloorDirections.length - 1,
          Math.floor(randomAtTile(seed, entrance.tileX * 43 + x, entrance.tileY * 43 + y, CAVE_ORE_STYLE_SALT + 2) * adjacentFloorDirections.length)
        )]
        : [0, 0] as const;
      ores.push({
        id: `${entrance.id}:${x}:${y}`,
        tileX: x,
        tileY: y,
        type: ore,
        placement,
        veinStyle: oreVeinStyleFor(seed, entrance, x, y, ore),
        wallFloorDirectionX: wallDirection[0],
        wallFloorDirectionY: wallDirection[1]
      });
    }
  }
  return { entrance, width, height, entranceTileX, entranceTileY, floorTiles, depthByTile, ores };
};

export const caveWorldOrigin = (entrance: CaveEntrance): CaveWorldOrigin => ({ x: CAVE_WORLD_OFFSET + entrance.tileX * CAVE_WORLD_ORIGIN_STRIDE, y: CAVE_WORLD_OFFSET + entrance.tileY * CAVE_WORLD_ORIGIN_STRIDE });
export const caveWorldTilePosition = (origin: CaveWorldOrigin, tileX: number, tileY: number): CaveWorldOrigin => ({ x: origin.x + tileX * WORLD_TILE_SIZE + WORLD_TILE_SIZE / 2, y: origin.y + tileY * WORLD_TILE_SIZE + WORLD_TILE_SIZE / 2 });

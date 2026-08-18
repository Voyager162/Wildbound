import { Biome, biomeAtTile } from '../generation/biomeGenerator';
import { featureAtTile } from '../generation/featureGenerator';
import { randomAtTile } from '../generation/noise';
import { surfaceAtTile } from '../generation/terrainGenerator';
import {
  CAVE_ORE_FLOOR_PLACEMENT_CHANCE,
  CAVE_ORE_MIN_SEPARATION_TILES,
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
export type CaveOrePlacement = 'floor';
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
}
export interface CaveLayout {
  readonly entrance: CaveEntrance; readonly width: number; readonly height: number; readonly entranceTileX: number; readonly entranceTileY: number;
  // The terrain field is the source of truth for the cave's visual shape. floorTiles are a
  // compact collision/readability grid sampled from the same continuous field.
  readonly terrain: CaveTerrain;
  readonly terrainContours: readonly (readonly CaveContourPoint[])[];
  readonly floorTiles: readonly (readonly boolean[])[]; readonly depthByTile: readonly (readonly number[])[]; readonly ores: readonly CaveOre[];
}
export interface CaveWorldOrigin { readonly x: number; readonly y: number; }
export interface CaveContourPoint { readonly x: number; readonly y: number; }
export interface CaveTerrainChamber {
  readonly x: number; readonly y: number; readonly radiusX: number; readonly radiusY: number;
  readonly rotation: number; readonly profile: readonly number[];
}
export interface CaveTerrainTunnel {
  readonly fromX: number; readonly fromY: number; readonly controlX: number; readonly controlY: number; readonly toX: number; readonly toY: number;
  readonly startRadius: number; readonly endRadius: number; readonly radiusProfile: readonly number[];
}
export interface CaveTerrain {
  readonly chambers: readonly CaveTerrainChamber[];
  readonly tunnels: readonly CaveTerrainTunnel[];
}

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
const graphRandom = (seed: string, cave: CaveEntrance, index: number, salt: number): number => randomAtTile(seed, cave.tileX * 97 + index * 23, cave.tileY * 97 - index * 29, CAVE_GRAPH_SALT + salt);
const CAVE_TERRAIN_PROFILE_SAMPLES = 14;
const CAVE_TUNNEL_DISTANCE_SAMPLES = 10;
const CAVE_VISUAL_CONTOUR_STEP_TILES = 0.5;

const profileValueAt = (profile: readonly number[], unitAngle: number): number => {
  const position = ((unitAngle % 1 + 1) % 1) * profile.length;
  const lower = Math.floor(position) % profile.length;
  const blend = position - Math.floor(position);
  return profile[lower] * (1 - blend) + profile[(lower + 1) % profile.length] * blend;
};

const quadraticPoint = (tunnel: CaveTerrainTunnel, progress: number): CaveContourPoint => {
  const inverse = 1 - progress;
  return {
    x: inverse * inverse * tunnel.fromX + 2 * inverse * progress * tunnel.controlX + progress * progress * tunnel.toX,
    y: inverse * inverse * tunnel.fromY + 2 * inverse * progress * tunnel.controlY + progress * progress * tunnel.toY
  };
};

const pointToSegmentDistance = (x: number, y: number, from: CaveContourPoint, to: CaveContourPoint): { readonly distance: number; readonly progress: number } => {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const denominator = deltaX * deltaX + deltaY * deltaY;
  const progress = denominator > 0 ? Math.max(0, Math.min(1, ((x - from.x) * deltaX + (y - from.y) * deltaY) / denominator)) : 0;
  return { distance: Math.hypot(x - (from.x + deltaX * progress), y - (from.y + deltaY * progress)), progress };
};

const chamberFieldAt = (chamber: CaveTerrainChamber, x: number, y: number): number => {
  const worldX = x - chamber.x;
  const worldY = y - chamber.y;
  const cosine = Math.cos(chamber.rotation);
  const sine = Math.sin(chamber.rotation);
  const localX = worldX * cosine + worldY * sine;
  const localY = -worldX * sine + worldY * cosine;
  const radialScale = profileValueAt(chamber.profile, Math.atan2(localY, localX) / (Math.PI * 2));
  const normalized = Math.hypot(localX / (chamber.radiusX * radialScale), localY / (chamber.radiusY * radialScale));
  return (1 - normalized) * Math.min(chamber.radiusX, chamber.radiusY);
};

const tunnelFieldAt = (tunnel: CaveTerrainTunnel, x: number, y: number): number => {
  const maximumRadius = Math.max(tunnel.startRadius, tunnel.endRadius) * 1.15;
  if (x < Math.min(tunnel.fromX, tunnel.controlX, tunnel.toX) - maximumRadius || x > Math.max(tunnel.fromX, tunnel.controlX, tunnel.toX) + maximumRadius
    || y < Math.min(tunnel.fromY, tunnel.controlY, tunnel.toY) - maximumRadius || y > Math.max(tunnel.fromY, tunnel.controlY, tunnel.toY) + maximumRadius) {
    return Number.NEGATIVE_INFINITY;
  }
  let strongest = Number.NEGATIVE_INFINITY;
  let previous = quadraticPoint(tunnel, 0);
  for (let index = 1; index <= CAVE_TUNNEL_DISTANCE_SAMPLES; index += 1) {
    const current = quadraticPoint(tunnel, index / CAVE_TUNNEL_DISTANCE_SAMPLES);
    const nearest = pointToSegmentDistance(x, y, previous, current);
    const progress = ((index - 1) + nearest.progress) / CAVE_TUNNEL_DISTANCE_SAMPLES;
    const radius = (tunnel.startRadius * (1 - progress) + tunnel.endRadius * progress)
      * profileValueAt(tunnel.radiusProfile, progress);
    strongest = Math.max(strongest, radius - nearest.distance);
    previous = current;
  }
  return strongest;
};

/** Samples the continuous chamber-and-tunnel terrain used by both collision and rendering. */
export const caveTerrainFieldAt = (terrain: CaveTerrain, x: number, y: number): number => {
  let strongest = Number.NEGATIVE_INFINITY;
  terrain.chambers.forEach((chamber) => {
    const reach = Math.max(chamber.radiusX, chamber.radiusY) * 1.22;
    if (Math.abs(x - chamber.x) <= reach && Math.abs(y - chamber.y) <= reach) {
      strongest = Math.max(strongest, chamberFieldAt(chamber, x, y));
    }
  });
  terrain.tunnels.forEach((tunnel) => {
    strongest = Math.max(strongest, tunnelFieldAt(tunnel, x, y));
  });
  return strongest;
};

const createChamber = (seed: string, cave: CaveEntrance, index: number, x: number, y: number, radiusX: number, radiusY: number): CaveTerrainChamber => ({
  x,
  y,
  radiusX,
  radiusY,
  rotation: graphRandom(seed, cave, index, 21) * Math.PI * 2,
  profile: Array.from({ length: CAVE_TERRAIN_PROFILE_SAMPLES }, (_, profileIndex) => 0.8 + graphRandom(seed, cave, index, 23 + profileIndex) * 0.34)
});

const connectChambers = (seed: string, cave: CaveEntrance, from: CaveTerrainChamber, to: CaveTerrainChamber, index: number): CaveTerrainTunnel => {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const perpendicularX = -deltaY / distance;
  const perpendicularY = deltaX / distance;
  const bend = (graphRandom(seed, cave, index, 41) - 0.5) * Math.min(7, distance * 0.26);
  return {
    fromX: from.x,
    fromY: from.y,
    controlX: (from.x + to.x) * 0.5 + perpendicularX * bend,
    controlY: (from.y + to.y) * 0.5 + perpendicularY * bend,
    toX: to.x,
    toY: to.y,
    startRadius: 1.5 + graphRandom(seed, cave, index, 42) * 0.72,
    endRadius: 1.5 + graphRandom(seed, cave, index, 43) * 0.72,
    radiusProfile: Array.from({ length: 6 }, (_, profileIndex) => 0.88 + graphRandom(seed, cave, index, 45 + profileIndex) * 0.24)
  };
};

const contourKey = (point: CaveContourPoint): string => `${Math.round(point.x * 100_000)}:${Math.round(point.y * 100_000)}`;

const smoothTerrainContour = (points: readonly CaveContourPoint[]): CaveContourPoint[] => {
  let smoothed = [...points];
  for (let pass = 0; pass < 2; pass += 1) {
    const next: CaveContourPoint[] = [];
    for (let index = 0; index < smoothed.length; index += 1) {
      const current = smoothed[index];
      const following = smoothed[(index + 1) % smoothed.length];
      next.push({ x: current.x * 0.74 + following.x * 0.26, y: current.y * 0.74 + following.y * 0.26 });
      next.push({ x: current.x * 0.26 + following.x * 0.74, y: current.y * 0.26 + following.y * 0.74 });
    }
    smoothed = next;
  }
  return smoothed;
};

interface CaveContourSegment { readonly from: CaveContourPoint; readonly to: CaveContourPoint; }

/** Extracts a smooth isocontour from the continuous cave field; no collision-tile edges are rendered. */
const createTerrainContours = (terrain: CaveTerrain, width: number, height: number): readonly (readonly CaveContourPoint[])[] => {
  const columns = Math.ceil(width / CAVE_VISUAL_CONTOUR_STEP_TILES);
  const rows = Math.ceil(height / CAVE_VISUAL_CONTOUR_STEP_TILES);
  const values = Array.from({ length: rows + 1 }, (_, row) => Array.from({ length: columns + 1 }, (_, column) => caveTerrainFieldAt(
    terrain,
    Math.min(width, column * CAVE_VISUAL_CONTOUR_STEP_TILES),
    Math.min(height, row * CAVE_VISUAL_CONTOUR_STEP_TILES)
  )));
  const segments: CaveContourSegment[] = [];
  const addSegment = (from: CaveContourPoint, to: CaveContourPoint): void => {
    segments.push({ from, to });
  };

  for (let row = 0; row < rows; row += 1) {
    const topY = Math.min(height, row * CAVE_VISUAL_CONTOUR_STEP_TILES);
    const bottomY = Math.min(height, (row + 1) * CAVE_VISUAL_CONTOUR_STEP_TILES);
    for (let column = 0; column < columns; column += 1) {
      const leftX = Math.min(width, column * CAVE_VISUAL_CONTOUR_STEP_TILES);
      const rightX = Math.min(width, (column + 1) * CAVE_VISUAL_CONTOUR_STEP_TILES);
      const corners = [
        { x: leftX, y: topY, value: values[row][column] },
        { x: rightX, y: topY, value: values[row][column + 1] },
        { x: rightX, y: bottomY, value: values[row + 1][column + 1] },
        { x: leftX, y: bottomY, value: values[row + 1][column] }
      ];
      const mask = corners.reduce((result, corner, index) => result | (corner.value >= 0 ? 1 << index : 0), 0);
      if (mask === 0 || mask === 15) {
        continue;
      }
      const edgePoint = (edge: number): CaveContourPoint => {
        const from = corners[edge];
        const to = corners[(edge + 1) % 4];
        const denominator = from.value - to.value;
        const progress = Math.max(0, Math.min(1, Math.abs(denominator) < 0.00001 ? 0.5 : from.value / denominator));
        return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
      };
      const edgePairsByMask: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
        1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
        5: [[0, 1], [2, 3]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]],
        9: [[0, 2]], 10: [[0, 3], [1, 2]], 11: [[1, 2]], 12: [[3, 1]],
        13: [[0, 1]], 14: [[3, 0]]
      };
      const edgePairs = edgePairsByMask[mask] ?? [];
      edgePairs.forEach(([fromEdge, toEdge]) => addSegment(edgePoint(fromEdge), edgePoint(toEdge)));
    }
  }

  const segmentsByPoint = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    [segment.from, segment.to].forEach((point) => {
      const key = contourKey(point);
      const linked = segmentsByPoint.get(key) ?? [];
      linked.push(index);
      segmentsByPoint.set(key, linked);
    });
  });
  const used = new Set<number>();
  const contours: CaveContourPoint[][] = [];
  segments.forEach((segment, startingIndex) => {
    if (used.has(startingIndex)) {
      return;
    }
    used.add(startingIndex);
    const points = [segment.from];
    const startingKey = contourKey(segment.from);
    let current = segment.to;
    let closed = false;
    for (let guard = 0; guard <= segments.length; guard += 1) {
      const currentKey = contourKey(current);
      if (currentKey === startingKey) {
        closed = true;
        break;
      }
      points.push(current);
      const nextIndex = (segmentsByPoint.get(currentKey) ?? []).find((index) => !used.has(index));
      if (nextIndex === undefined) {
        break;
      }
      used.add(nextIndex);
      const next = segments[nextIndex];
      current = contourKey(next.from) === currentKey ? next.to : next.from;
    }
    if (closed && points.length >= 8) {
      contours.push(smoothTerrainContour(points));
    }
  });
  return contours;
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
  // Leave a full rock margin around the first chamber so the continuous visual contour always
  // closes inside the cave world rather than leaking through its generation boundary.
  const entranceTileX = Math.floor(width / 2), entranceTileY = height - 6;
  const chambers: CaveTerrainChamber[] = [createChamber(seed, entrance, 0, entranceTileX, entranceTileY, 4.3, 3.2)];
  const tunnels: CaveTerrainTunnel[] = [];
  for (let index = 1; index < count; index += 1) {
    const progress = index / (count - 1), prior = chambers[index - 1];
    const curve = Math.sin(progress * Math.PI * 2 + graphRandom(seed, entrance, index, 1) * 1.8) * width * 0.12;
    const chamber = createChamber(
      seed,
      entrance,
      index,
      Math.max(11, Math.min(width - 12, entranceTileX + curve + (graphRandom(seed, entrance, index, 2) - 0.5) * width * 0.16)),
      Math.max(9, Math.min(height - 10, height - 4 - progress * (height - 13) + (graphRandom(seed, entrance, index, 3) - 0.5) * 5)),
      4.8 + graphRandom(seed, entrance, index, 4) * 5.2,
      3.8 + graphRandom(seed, entrance, index, 5) * 4.2
    );
    chambers.push(chamber);
    tunnels.push(connectChambers(seed, entrance, prior, chamber, index));
  }
  chambers.slice(1, -1).forEach((source, index) => {
    if (index % 2 || graphRandom(seed, entrance, index, 7) < 0.32) return;
    const branchIndex = count + index;
    const branch = createChamber(
      seed,
      entrance,
      branchIndex,
      Math.max(9, Math.min(width - 10, source.x + (graphRandom(seed, entrance, index, 8) > 0.5 ? 1 : -1) * (8 + graphRandom(seed, entrance, index, 9) * 10))),
      Math.max(8, Math.min(height - 9, source.y + (graphRandom(seed, entrance, index, 10) - 0.5) * 10)),
      4.1 + graphRandom(seed, entrance, index, 11) * 3.8,
      3.2 + graphRandom(seed, entrance, index, 12) * 3.3
    );
    chambers.push(branch);
    tunnels.push(connectChambers(seed, entrance, source, branch, branchIndex));
  });
  const terrain: CaveTerrain = { chambers, tunnels };
  const floorTiles = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      return false;
    }
    // Collision stays fractionally inside the continuous visual edge, avoiding invisible
    // walkable slivers while retaining a stable compact lookup during movement.
    return caveTerrainFieldAt(terrain, x + 0.5, y + 0.5) >= 0.12;
  }));
  floorTiles[entranceTileY][entranceTileX] = true;
  const depthByTile = buildDepthMap(floorTiles, entranceTileX, entranceTileY);
  const ores: CaveOre[] = [];
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    if (!floorTiles[y][x]) continue;
    const adjacentFloorDirections = CARDINAL_DIRECTIONS.filter(([dx, dy]) => floorTiles[y + dy][x + dx]);
    // A clear tile on every side keeps the deposit fully within terrain rather than against a wall.
    if (adjacentFloorDirections.length !== CARDINAL_DIRECTIONS.length) continue;
    const depth = depthByTile[y][x];
    if (depth < 0.05 || x === entranceTileX && y >= entranceTileY - 3) continue;
    const ore = oreForDepth(seed, entrance, x, y, depth);
    const hasClearanceFromOtherOre = ores.every((existing) => Math.hypot(existing.tileX - x, existing.tileY - y) >= CAVE_ORE_MIN_SEPARATION_TILES);
    if (ore && hasClearanceFromOtherOre && randomAtTile(seed, x + entrance.tileX * 41, y + entrance.tileY * 41, CAVE_ORE_SALT + 3) < CAVE_ORE_FLOOR_PLACEMENT_CHANCE) {
      ores.push({
        id: `${entrance.id}:${x}:${y}`,
        tileX: x,
        tileY: y,
        type: ore,
        placement: 'floor',
        veinStyle: oreVeinStyleFor(seed, entrance, x, y, ore)
      });
    }
  }
  return {
    entrance,
    width,
    height,
    entranceTileX,
    entranceTileY,
    terrain,
    terrainContours: createTerrainContours(terrain, width, height),
    floorTiles,
    depthByTile,
    ores
  };
};

export const caveWorldOrigin = (entrance: CaveEntrance): CaveWorldOrigin => ({ x: CAVE_WORLD_OFFSET + entrance.tileX * CAVE_WORLD_ORIGIN_STRIDE, y: CAVE_WORLD_OFFSET + entrance.tileY * CAVE_WORLD_ORIGIN_STRIDE });
export const caveWorldTilePosition = (origin: CaveWorldOrigin, tileX: number, tileY: number): CaveWorldOrigin => ({ x: origin.x + tileX * WORLD_TILE_SIZE + WORLD_TILE_SIZE / 2, y: origin.y + tileY * WORLD_TILE_SIZE + WORLD_TILE_SIZE / 2 });

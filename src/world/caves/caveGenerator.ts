import { Biome, biomeAtTile } from '../generation/biomeGenerator';
import { featureAtTile } from '../generation/featureGenerator';
import { coherentNoise, randomAtTile } from '../generation/noise';
import { surfaceAtTile } from '../generation/terrainGenerator';
import {
  CAVE_ORE_FLOOR_PLACEMENT_CHANCE,
  CAVE_ORE_MIN_SEPARATION_TILES,
  CAVE_ORE_SPAWN_RULES,
  CAVE_ORE_VEIN_STYLES,
  type CaveOreType,
  type CaveOreVeinStyle
} from './caveOreGenerationConfig';
import {
  CAVE_DEPTH_SCALE_MAX,
  CAVE_LAVA_MAX_POOLS,
  CAVE_LAVA_START_DEPTH,
  CAVE_LINKED_SYSTEM_CHANCE,
  CAVE_LINKED_SYSTEM_DISTANCE_TILES,
  CAVE_STALAGMITE_START_DEPTH,
  CAVE_STALAGMITE_CHANCE,
  CAVE_SYSTEM_SIZE_SCALE,
  CAVE_SYSTEM_DEPTHS,
  CAVE_SYSTEM_DEPTH_WEIGHTS,
  CAVE_SYSTEM_PROFILES,
  CAVE_VISUAL_CONTOUR_TARGET_CELLS,
  type CaveSystemDepth
} from './caveInteriorGenerationConfig';
import {
  CAVE_ADDITIONAL_CONNECTION_RARITY_FALLOFF,
  CAVE_CONNECTION_DISTANCE_RING_GROWTH
} from './caveConnectionConfig';
import { CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from '../worldConfig';
import {
  CAVE_FORMATION_RADIUS_MAX_TILES,
  CAVE_FORMATION_RADIUS_MIN_TILES,
  CAVE_MIN_SEPARATION_CHUNKS,
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

export type CaveDepth = CaveSystemDepth;
export type CaveOrePlacement = 'floor';
export type { CaveOreType, CaveOreVeinStyle } from './caveOreGenerationConfig';

export interface CaveLinkedEntrance {
  readonly tileX: number;
  readonly tileY: number;
  readonly connectionIndex: number;
}

export interface CaveEntrance {
  readonly id: string; readonly tileX: number; readonly tileY: number; readonly biome: Biome; readonly depth: CaveDepth;
  readonly formationRadiusTiles: number; readonly mouthAngle: number;
  readonly mouthCenterForwardTiles: number; readonly mouthCenterSideTiles: number;
  readonly mouthForwardRadiusTiles: number; readonly mouthSideRadiusTiles: number;
  // Linked systems share one interior while retaining distinct, deterministic surface mouths.
  readonly systemRootTileX: number;
  readonly systemRootTileY: number;
  // Every linked mouth shares the root cave interior. The legacy first-link fields stay in the
  // shape for existing save/runtime consumers, while this list supports an uncapped chain.
  readonly linkedEntrances: readonly CaveLinkedEntrance[];
  readonly linkedEntranceTileX: number | null;
  readonly linkedEntranceTileY: number | null;
}
export interface CaveOre {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly type: CaveOreType;
  readonly placement: CaveOrePlacement;
  readonly veinStyle: CaveOreVeinStyle;
}
export interface CaveLavaPool {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly radiusX: number;
  readonly radiusY: number;
}
export interface CaveStalagmite {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly scale: number;
}
export interface CaveSurfaceExit {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly surfaceTileX: number;
  readonly surfaceTileY: number;
  readonly label: string;
}
export interface CaveLayout {
  readonly entrance: CaveEntrance; readonly width: number; readonly height: number; readonly entranceTileX: number; readonly entranceTileY: number;
  readonly spawnTileX: number; readonly spawnTileY: number;
  // The terrain field is the source of truth for the cave's visual shape. floorTiles are a
  // compact analysis grid for depth, feature placement, and route validation.
  readonly terrain: CaveTerrain;
  readonly terrainContours: readonly CaveTerrainContour[];
  readonly floorTiles: readonly (readonly boolean[])[]; readonly depthByTile: readonly (readonly number[])[];
  readonly ores: readonly CaveOre[];
  readonly lavaPools: readonly CaveLavaPool[];
  readonly stalagmites: readonly CaveStalagmite[];
  readonly surfaceExits: readonly CaveSurfaceExit[];
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
export interface CaveTerrainContour {
  readonly points: readonly CaveContourPoint[];
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  // A field contour can bound either connected floor or a sealed rock pocket. Keeping that
  // distinction lets the renderer preserve dark enclosed walls instead of filling them green.
  readonly enclosesFloor: boolean;
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
const CAVE_ENTRANCE_CACHE_LIMIT = 8_192;
const CAVE_OFFSET_SEED_CACHE_LIMIT = 8;
const caveChunkCache = new Map<string, readonly CaveEntrance[]>();
const caveEntranceCache = new Map<string, CaveEntrance | null>();
const linkedConnectionOffsetCache = new Map<string, Map<number, { readonly x: number; readonly y: number }>>();
const CARDINAL_DIRECTIONS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface CaveMouthCenter {
  readonly x: number;
  readonly y: number;
}

/**
 * The exposed surface face is a world-space field rather than a per-chunk shape.  Rendering,
 * foliage placement, and interaction all use this same test so a terrain object cannot be
 * hidden by a cave while remaining harvestable.
 */
export const caveFormationContainsWorldPoint = (
  seed: string,
  entrance: CaveEntrance,
  worldPixelX: number,
  worldPixelY: number,
  edgePaddingPixels = 0
): boolean => {
  const centerWorldX = (entrance.tileX + 0.5) * WORLD_TILE_SIZE;
  const centerWorldY = (entrance.tileY + 0.5) * WORLD_TILE_SIZE;
  const forwardX = Math.cos(entrance.mouthAngle);
  const forwardY = Math.sin(entrance.mouthAngle);
  const deltaX = worldPixelX - centerWorldX;
  const deltaY = worldPixelY - centerWorldY;
  const forward = deltaX * forwardX + deltaY * forwardY;
  const side = -deltaX * forwardY + deltaY * forwardX;
  const radiusPixels = entrance.formationRadiusTiles * WORLD_TILE_SIZE;
  const sideRadius = radiusPixels * 1.28;
  const sideAmount = Math.abs(side) / sideRadius;
  const ridgeProfile = (coherentNoise(seed, worldPixelX, worldPixelY, 74, 0x3c719a) - 0.5) * 0.28
    + (coherentNoise(seed, worldPixelX, worldPixelY, 21, 0x8f21d4) - 0.5) * 0.17
    + (coherentNoise(seed, worldPixelX, worldPixelY, 6, 0x6e24a1) - 0.5) * 0.08;
  const sideNoise = (coherentNoise(seed, worldPixelX, worldPixelY, 31, 0x3b1169) - 0.5) * 0.16;
  const shoulder = Math.max(0, 1 - sideAmount ** 1.75);
  const backEdge = -radiusPixels * (0.42 + shoulder * 0.48 + ridgeProfile);
  const frontEdge = radiusPixels * (0.1 + shoulder * 0.2 + ridgeProfile * 0.34);
  return sideAmount < 1 + sideNoise + edgePaddingPixels / sideRadius
    && forward > backEdge - edgePaddingPixels
    && forward < frontEdge + edgePaddingPixels;
};

const maximumCaveSpawnChance = Math.max(...Object.values(CAVE_SPAWN_CHANCE_BY_BIOME));
// Keep the public spacing control in chunks, but perform the deterministic priority test in
// world tiles where cave candidates are generated. No upper clamp: larger values deliberately
// create a more widely spaced wilderness.
const minimumCaveSeparationTiles = Math.max(0, CAVE_MIN_SEPARATION_CHUNKS) * CHUNK_SIZE_TILES;
const caveChanceAt = (seed: string, x: number, y: number): number => CAVE_SPAWN_CHANCE_BY_BIOME[biomeAtTile(seed, x, y)];
const isRawCaveCandidate = (seed: string, x: number, y: number): boolean => {
  // Cave probability is always bounded by the largest biome probability. Most tiles can be
  // rejected from their cheap deterministic roll before sampling the three climate noise fields.
  // This is mathematically identical to comparing the roll directly against the final biome rate.
  const roll = randomAtTile(seed, x, y, CAVE_ROLL_SALT);
  return roll < maximumCaveSpawnChance && roll < caveChanceAt(seed, x, y);
};

const depthForEntrance = (seed: string, x: number, y: number): CaveDepth => {
  // This stream deliberately differs from the sparse candidate stream, avoiding conditioned rolls.
  const roll = randomAtTile(seed, x * 31 + 17, y * 17 - 29, CAVE_DEPTH_SALT);
  let threshold = 0;
  for (const depth of CAVE_SYSTEM_DEPTHS) {
    threshold += CAVE_SYSTEM_DEPTH_WEIGHTS[depth];
    if (roll < threshold) {
      return depth;
    }
  }
  return 'abyssal';
};

const hasNearestCandidatePriority = (seed: string, tileX: number, tileY: number): boolean => {
  if (minimumCaveSeparationTiles <= 0) {
    return true;
  }

  const priority = randomAtTile(seed, tileX, tileY, CAVE_PRIORITY_SALT);
  const radius = Math.ceil(minimumCaveSeparationTiles);
  const minimumDistanceSquared = minimumCaveSeparationTiles * minimumCaveSeparationTiles;
  for (let y = tileY - radius; y <= tileY + radius; y += 1) for (let x = tileX - radius; x <= tileX + radius; x += 1) {
    const distanceSquared = (x - tileX) ** 2 + (y - tileY) ** 2;
    if (distanceSquared >= minimumDistanceSquared) continue;
    if ((x === tileX && y === tileY) || !isRawCaveCandidate(seed, x, y)) continue;
    const other = randomAtTile(seed, x, y, CAVE_PRIORITY_SALT);
    if (other < priority || (other === priority && (y < tileY || y === tileY && x < tileX))) return false;
  }
  return true;
};

const surfaceCanHostCave = (seed: string, tileX: number, tileY: number): boolean => {
  const surface = surfaceAtTile(seed, tileX, tileY);
  const biome = biomeAtTile(seed, tileX, tileY);
  return !surface.isWater && !featureAtTile(seed, tileX, tileY) && biome !== Biome.Ocean && biome !== Biome.Beach;
};

const createSurfaceEntrance = (
  seed: string,
  tileX: number,
  tileY: number,
  depth: CaveDepth,
  systemRootTileX: number,
  systemRootTileY: number,
  linkedEntranceTileX: number | null,
  linkedEntranceTileY: number | null
): CaveEntrance => {
  const formation = randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT);
  const formationRadiusTiles = CAVE_FORMATION_RADIUS_MIN_TILES + formation * (CAVE_FORMATION_RADIUS_MAX_TILES - CAVE_FORMATION_RADIUS_MIN_TILES);
  const mouthForwardOffsetScale = CAVE_MOUTH_FORWARD_OFFSET_MIN_SCALE
    + randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT + 2) * (CAVE_MOUTH_FORWARD_OFFSET_MAX_SCALE - CAVE_MOUTH_FORWARD_OFFSET_MIN_SCALE);
  const mouthForwardRadiusScale = CAVE_MOUTH_FORWARD_RADIUS_MIN_SCALE
    + randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT + 3) * (CAVE_MOUTH_FORWARD_RADIUS_MAX_SCALE - CAVE_MOUTH_FORWARD_RADIUS_MIN_SCALE);
  const mouthSideRadiusScale = CAVE_MOUTH_SIDE_RADIUS_MIN_SCALE
    + randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT + 4) * (CAVE_MOUTH_SIDE_RADIUS_MAX_SCALE - CAVE_MOUTH_SIDE_RADIUS_MIN_SCALE);
  return {
    id: `${tileX}:${tileY}`, tileX, tileY, biome: biomeAtTile(seed, tileX, tileY), depth,
    formationRadiusTiles,
    // Surface entrances read best as a broad, face-on rock mouth from the top-down camera.
    // A seed-derived sway keeps each one unique without turning the opening into a diagonal slit.
    mouthAngle: Math.PI / 2 + (randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT + 1) - 0.5) * 0.7,
    mouthCenterForwardTiles: formationRadiusTiles * mouthForwardOffsetScale,
    mouthCenterSideTiles: formationRadiusTiles * (randomAtTile(seed, tileX, tileY, CAVE_FORMATION_SALT + 5) - 0.5) * CAVE_MOUTH_SIDE_OFFSET_MAX_SCALE * 2,
    mouthForwardRadiusTiles: formationRadiusTiles * mouthForwardRadiusScale,
    mouthSideRadiusTiles: formationRadiusTiles * mouthSideRadiusScale,
    systemRootTileX,
    systemRootTileY,
    linkedEntrances: [],
    linkedEntranceTileX,
    linkedEntranceTileY
  };
};

/** A raw entrance does not resolve companion mouths, which keeps the inverse link lookup bounded. */
const baseCaveEntranceAtTile = (seed: string, tileX: number, tileY: number): CaveEntrance | null => {
  if (!isRawCaveCandidate(seed, tileX, tileY) || !hasNearestCandidatePriority(seed, tileX, tileY) || !surfaceCanHostCave(seed, tileX, tileY)) {
    return null;
  }
  return createSurfaceEntrance(seed, tileX, tileY, depthForEntrance(seed, tileX, tileY), tileX, tileY, null, null);
};

const CAVE_CONNECTION_CHANCE_MINIMUM = Number.EPSILON;
const safeConnectionRarityFalloff = (
  CAVE_ADDITIONAL_CONNECTION_RARITY_FALLOFF > 0 && CAVE_ADDITIONAL_CONNECTION_RARITY_FALLOFF < 1
    ? CAVE_ADDITIONAL_CONNECTION_RARITY_FALLOFF
    : 0.5
);

const connectionChanceAt = (connectionIndex: number): number => (
  CAVE_LINKED_SYSTEM_CHANCE * safeConnectionRarityFalloff ** connectionIndex
);

// This offset only depends on the world seed and connection index, so it is reversible when a
// distant chunk asks whether one of its tiles is a linked surface mouth. The widening rings keep
// repeated rare links visually and spatially distinct without imposing a connection-count cap.
const linkedConnectionOffsetAt = (seed: string, connectionIndex: number): { readonly x: number; readonly y: number } => {
  let offsets = linkedConnectionOffsetCache.get(seed);
  if (!offsets) {
    if (linkedConnectionOffsetCache.size >= CAVE_OFFSET_SEED_CACHE_LIMIT) {
      const oldestSeed = linkedConnectionOffsetCache.keys().next().value;
      if (oldestSeed) linkedConnectionOffsetCache.delete(oldestSeed);
    }
    offsets = new Map();
    linkedConnectionOffsetCache.set(seed, offsets);
  }
  const cached = offsets.get(connectionIndex);
  if (cached) {
    return cached;
  }
  const distanceIndex = connectionIndex % CAVE_LINKED_SYSTEM_DISTANCE_TILES.length;
  const ring = Math.floor(connectionIndex / CAVE_LINKED_SYSTEM_DISTANCE_TILES.length);
  const baseDistance = CAVE_LINKED_SYSTEM_DISTANCE_TILES[distanceIndex];
  const distance = baseDistance * (1 + ring * CAVE_CONNECTION_DISTANCE_RING_GROWTH);
  const angle = randomAtTile(seed, connectionIndex, -connectionIndex, CAVE_GRAPH_SALT + 67) * Math.PI * 2;
  const offset = { x: Math.round(Math.cos(angle) * distance), y: Math.round(Math.sin(angle) * distance) };
  offsets.set(connectionIndex, offset);
  return offset;
};

/**
 * Repeated successes form an uncapped geometric chain: every additional outlet is rarer than
 * the previous one, and a failure stops this root's deterministic connection list.
 */
const linkedTargetsForRoot = (seed: string, root: CaveEntrance): readonly CaveLinkedEntrance[] => {
  if (root.depth === 'shallow') {
    return [];
  }
  const targets: CaveLinkedEntrance[] = [];
  const usedTiles = new Set<string>();
  for (let connectionIndex = 0; ; connectionIndex += 1) {
    const chance = connectionChanceAt(connectionIndex);
    if (chance <= CAVE_CONNECTION_CHANCE_MINIMUM
      || randomAtTile(seed, root.tileX, root.tileY, CAVE_GRAPH_SALT + 61 + connectionIndex * 7) >= chance) {
      break;
    }
    const offset = linkedConnectionOffsetAt(seed, connectionIndex);
    const tileX = root.tileX + offset.x;
    const tileY = root.tileY + offset.y;
    const key = `${tileX}:${tileY}`;
    // A genuine cave root retains ownership of its own entrance. Linked mouths only occupy
    // otherwise empty viable terrain, which prevents two cave systems from claiming one exit.
    if (usedTiles.has(key) || !surfaceCanHostCave(seed, tileX, tileY) || baseCaveEntranceAtTile(seed, tileX, tileY)) {
      continue;
    }
    usedTiles.add(key);
    targets.push({ tileX, tileY, connectionIndex });
  }
  return targets;
};

const withLinkedEntrances = (entrance: CaveEntrance, linkedEntrances: readonly CaveLinkedEntrance[]): CaveEntrance => ({
  ...entrance,
  linkedEntrances,
  linkedEntranceTileX: linkedEntrances[0]?.tileX ?? null,
  linkedEntranceTileY: linkedEntrances[0]?.tileY ?? null
});

const linkedRootAtTile = (seed: string, tileX: number, tileY: number): CaveEntrance | null => {
  // The chance curve itself establishes the finite numeric lookup horizon; it is not a gameplay
  // cap, so a root may gain as many increasingly unlikely connections as its deterministic
  // rolls allow.
  for (let connectionIndex = 0; connectionChanceAt(connectionIndex) > CAVE_CONNECTION_CHANCE_MINIMUM; connectionIndex += 1) {
    const offset = linkedConnectionOffsetAt(seed, connectionIndex);
    const root = baseCaveEntranceAtTile(seed, tileX - offset.x, tileY - offset.y);
    if (!root) {
      continue;
    }
    const matchesTarget = linkedTargetsForRoot(seed, root).some((target) => (
      target.tileX === tileX && target.tileY === tileY
    ));
    if (matchesTarget) {
      return root;
    }
  }
  return null;
};

/** A cave entrance is a sparse terrain landmark with a deterministic, progressively rare outlet chain. */
export const caveEntranceAtTile = (seed: string, tileX: number, tileY: number): CaveEntrance | null => {
  const cacheKey = `${seed}:${tileX}:${tileY}`;
  if (caveEntranceCache.has(cacheKey)) {
    return caveEntranceCache.get(cacheKey) ?? null;
  }

  let entrance: CaveEntrance | null;
  const root = baseCaveEntranceAtTile(seed, tileX, tileY);
  if (root) {
    entrance = withLinkedEntrances(root, linkedTargetsForRoot(seed, root));
  } else {
    const linkedRoot = linkedRootAtTile(seed, tileX, tileY);
    entrance = linkedRoot
      ? withLinkedEntrances(createSurfaceEntrance(
        seed,
        tileX,
        tileY,
        linkedRoot.depth,
        linkedRoot.tileX,
        linkedRoot.tileY,
        linkedRoot.tileX,
        linkedRoot.tileY
      ), linkedTargetsForRoot(seed, linkedRoot))
      : null;
  }

  if (caveEntranceCache.size >= CAVE_ENTRANCE_CACHE_LIMIT) {
    const oldestKey = caveEntranceCache.keys().next().value;
    if (oldestKey) caveEntranceCache.delete(oldestKey);
  }
  caveEntranceCache.set(cacheKey, entrance);
  return entrance;
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

const caveDimensions = (depth: CaveDepth) => {
  const profile = CAVE_SYSTEM_PROFILES[depth];
  // There is deliberately no upper clamp: the public size control is allowed to make truly
  // enormous systems. The small lower guard only prevents invalid zero/negative dimensions.
  const scale = Math.max(0.1, CAVE_SYSTEM_SIZE_SCALE);
  return {
    ...profile,
    width: Math.max(24, Math.round(profile.width * scale)),
    height: Math.max(24, Math.round(profile.height * scale)),
    spineSegments: Math.max(3, Math.round(profile.spineSegments * scale)),
    branchSegments: Math.max(1, Math.round(profile.branchSegments * scale)),
    largeChambers: Math.max(1, Math.round(profile.largeChambers * scale)),
    loopConnections: Math.max(0, Math.round(profile.loopConnections * scale))
  };
};
const graphRandom = (seed: string, cave: CaveEntrance, index: number, salt: number): number => randomAtTile(seed, cave.tileX * 97 + index * 23, cave.tileY * 97 - index * 29, CAVE_GRAPH_SALT + salt);
const CAVE_TERRAIN_PROFILE_SAMPLES = 14;
const CAVE_TUNNEL_DISTANCE_SAMPLES = 10;
const CAVE_TUNNEL_CLEARANCE_SAMPLES = 18;
// Every generated route must retain a rock band wide enough to draw as an actual wall, while
// individual tunnel radii below guarantee a comfortably walkable floor rather than a slit.
const CAVE_TUNNEL_MIN_WALL_GAP_TILES = 1.45;
const CAVE_MIN_TRAVERSABLE_TUNNEL_WIDTH_TILES = 3.25;
const CAVE_TUNNEL_RADIUS_PROFILE_MINIMUM = 0.86;
// A route is made from several small nodes, but its nodes must still be far enough apart that
// the wall-separation check recognizes them as a continuing tunnel rather than a self-collision.
const CAVE_PASSAGE_TARGET_STRIDE_TILES = 7.2;
// Existing passages are allowed to meet at their common node. Beyond this small junction zone,
// regular clearance applies again so unrelated walls cannot merge or leave phantom blockers.
const CAVE_TUNNEL_JUNCTION_EXEMPT_RADIUS_TILES = 4.3;

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

const tunnelRadiusAt = (tunnel: CaveTerrainTunnel, progress: number): number => (
  (tunnel.startRadius * (1 - progress) + tunnel.endRadius * progress)
  * profileValueAt(tunnel.radiusProfile, progress)
);

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
  // Keep the sampled field finite. A negative infinity outside every primitive is useful for
  // early-outs, but it would make marching-square interpolation produce NaN at thin passages.
  return strongest === Number.NEGATIVE_INFINITY ? -8 : strongest;
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
    startRadius: Math.max(
      CAVE_MIN_TRAVERSABLE_TUNNEL_WIDTH_TILES / (2 * CAVE_TUNNEL_RADIUS_PROFILE_MINIMUM),
      1.42 + graphRandom(seed, cave, index, 42) * 0.68
    ),
    endRadius: Math.max(
      CAVE_MIN_TRAVERSABLE_TUNNEL_WIDTH_TILES / (2 * CAVE_TUNNEL_RADIUS_PROFILE_MINIMUM),
      1.42 + graphRandom(seed, cave, index, 43) * 0.68
    ),
    radiusProfile: Array.from({ length: 6 }, (_, profileIndex) => 0.86 + graphRandom(seed, cave, index, 45 + profileIndex) * 0.25)
  };
};

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

// Chaikin smoothing makes the rock silhouette organic, but it also moves points away from the
// mathematical floor boundary. Projecting every point back to the same signed field used by
// player collision prevents a polished-looking opening from hiding an invisible blocker.
const projectContourPointToTerrain = (terrain: CaveTerrain, point: CaveContourPoint): CaveContourPoint => {
  let x = point.x;
  let y = point.y;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const value = caveTerrainFieldAt(terrain, x, y);
    if (Math.abs(value) < 0.004) {
      break;
    }
    const sampleOffset = 0.08;
    const gradientX = (caveTerrainFieldAt(terrain, x + sampleOffset, y) - caveTerrainFieldAt(terrain, x - sampleOffset, y)) / (sampleOffset * 2);
    const gradientY = (caveTerrainFieldAt(terrain, x, y + sampleOffset) - caveTerrainFieldAt(terrain, x, y - sampleOffset)) / (sampleOffset * 2);
    const gradientLengthSquared = gradientX * gradientX + gradientY * gradientY;
    if (gradientLengthSquared < 0.0001) {
      break;
    }
    const correction = Math.max(-0.5, Math.min(0.5, -value / gradientLengthSquared));
    x += gradientX * correction;
    y += gradientY * correction;
  }
  return { x, y };
};

interface CaveContourEdge { readonly point: CaveContourPoint; readonly key: string; }
interface CaveContourSegment { readonly from: CaveContourEdge; readonly to: CaveContourEdge; }

const pointIsInsideContour = (points: readonly CaveContourPoint[], x: number, y: number): boolean => {
  let isInside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index];
    const previousPoint = points[previous];
    if ((currentPoint.y > y) !== (previousPoint.y > y)
      && x < (previousPoint.x - currentPoint.x) * (y - currentPoint.y) / (previousPoint.y - currentPoint.y) + currentPoint.x) {
      isInside = !isInside;
    }
  }
  return isInside;
};

/** Tests the exact smoothed cave region that is rendered, including enclosed rock pockets. */
export const caveTerrainContainsPoint = (contours: readonly CaveTerrainContour[], x: number, y: number): boolean => {
  let insideFloor = false;
  let insideRockPocket = false;
  contours.forEach((contour) => {
    if (x < contour.minX || x > contour.maxX || y < contour.minY || y > contour.maxY
      || !pointIsInsideContour(contour.points, x, y)) {
      return;
    }
    if (contour.enclosesFloor) {
      insideFloor = true;
    } else {
      insideRockPocket = true;
    }
  });
  return insideFloor && !insideRockPocket;
};

const contourEnclosesFloor = (terrain: CaveTerrain, points: readonly CaveContourPoint[]): boolean => {
  // Probe the geometric interior beside a contour edge rather than relying on a centroid, which
  // can be outside a winding tunnel contour. This makes holes in a ring of rock unambiguous.
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length < 0.01) continue;
    const midpointX = (from.x + to.x) * 0.5;
    const midpointY = (from.y + to.y) * 0.5;
    const normalX = -deltaY / length * 0.28;
    const normalY = deltaX / length * 0.28;
    for (const direction of [-1, 1]) {
      const sampleX = midpointX + normalX * direction;
      const sampleY = midpointY + normalY * direction;
      if (pointIsInsideContour(points, sampleX, sampleY)) {
        return caveTerrainFieldAt(terrain, sampleX, sampleY) >= 0;
      }
    }
  }
  return false;
};

/** Extracts a smooth isocontour from the continuous cave field; no collision-tile edges are rendered. */
const createTerrainContours = (terrain: CaveTerrain, width: number, height: number): readonly CaveTerrainContour[] => {
  const contourStepTiles = Math.max(0.5, Math.sqrt(width * height / CAVE_VISUAL_CONTOUR_TARGET_CELLS));
  const columns = Math.ceil(width / contourStepTiles);
  const rows = Math.ceil(height / contourStepTiles);
  const values = Array.from({ length: rows + 1 }, (_, row) => Array.from({ length: columns + 1 }, (_, column) => caveTerrainFieldAt(
    terrain,
    Math.min(width, column * contourStepTiles),
    Math.min(height, row * contourStepTiles)
  )));
  const segments: CaveContourSegment[] = [];
  const addSegment = (from: CaveContourEdge, to: CaveContourEdge): void => {
    segments.push({ from, to });
  };

  for (let row = 0; row < rows; row += 1) {
    const topY = Math.min(height, row * contourStepTiles);
    const bottomY = Math.min(height, (row + 1) * contourStepTiles);
    for (let column = 0; column < columns; column += 1) {
      const leftX = Math.min(width, column * contourStepTiles);
      const rightX = Math.min(width, (column + 1) * contourStepTiles);
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
      const edgePoint = (edge: number): CaveContourEdge => {
        const from = corners[edge];
        const to = corners[(edge + 1) % 4];
        const denominator = from.value - to.value;
        const progress = Math.max(0, Math.min(1, Math.abs(denominator) < 0.00001 ? 0.5 : from.value / denominator));
        const key = edge === 0
          ? `h:${row}:${column}`
          : edge === 1
            ? `v:${row}:${column + 1}`
            : edge === 2
              ? `h:${row + 1}:${column}`
              : `v:${row}:${column}`;
        return { point: { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress }, key };
      };
      const edgePairsByMask: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
        1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
        6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]],
        9: [[0, 2]], 11: [[1, 2]], 12: [[3, 1]],
        13: [[0, 1]], 14: [[3, 0]]
      };
      // Ambiguous diagonal cells need the field at their centre to select the same topology as
      // collision. A fixed pairing can draw a fake doorway through a solid wall.
      const centreValue = caveTerrainFieldAt(terrain, (leftX + rightX) * 0.5, (topY + bottomY) * 0.5);
      const edgePairs = mask === 5
        ? (centreValue >= 0 ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]])
        : mask === 10
          ? (centreValue >= 0 ? [[0, 3], [1, 2]] : [[0, 1], [2, 3]])
          : edgePairsByMask[mask] ?? [];
      edgePairs.forEach(([fromEdge, toEdge]) => addSegment(edgePoint(fromEdge), edgePoint(toEdge)));
    }
  }

  const segmentsByPoint = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    [segment.from, segment.to].forEach((edge) => {
      const linked = segmentsByPoint.get(edge.key) ?? [];
      linked.push(index);
      segmentsByPoint.set(edge.key, linked);
    });
  });
  const used = new Set<number>();
  const contours: CaveTerrainContour[] = [];
  segments.forEach((segment, startingIndex) => {
    if (used.has(startingIndex)) {
      return;
    }
    used.add(startingIndex);
    const points = [segment.from.point];
    const startingKey = segment.from.key;
    let current = segment.to;
    let closed = false;
    for (let guard = 0; guard <= segments.length; guard += 1) {
      const currentKey = current.key;
      if (currentKey === startingKey) {
        closed = true;
        break;
      }
      points.push(current.point);
      const nextIndex = (segmentsByPoint.get(currentKey) ?? []).find((index) => !used.has(index));
      if (nextIndex === undefined) {
        break;
      }
      used.add(nextIndex);
      const next = segments[nextIndex];
      current = next.from.key === currentKey ? next.to : next.from;
    }
    if (closed && points.length >= 8) {
      const smoothed = smoothTerrainContour(points).map((point) => projectContourPointToTerrain(terrain, point));
      const minX = Math.min(...smoothed.map((point) => point.x));
      const minY = Math.min(...smoothed.map((point) => point.y));
      const maxX = Math.max(...smoothed.map((point) => point.x));
      const maxY = Math.max(...smoothed.map((point) => point.y));
      contours.push({
        points: smoothed,
        minX,
        minY,
        maxX,
        maxY,
        enclosesFloor: contourEnclosesFloor(terrain, smoothed)
      });
    }
  });
  return contours;
};

const buildDepthMap = (tiles: boolean[][], starts: readonly (readonly [number, number])[]): number[][] => {
  const distances = Array.from({ length: tiles.length }, () => Array<number>(tiles[0].length).fill(-1));
  const queue: Array<readonly [number, number]> = [];
  starts.forEach(([startX, startY]) => {
    if (!tiles[startY]?.[startX] || distances[startY][startX] === 0) {
      return;
    }
    distances[startY][startX] = 0;
    queue.push([startX, startY]);
  });
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

// Designers work with an intuitive 1–1000 progression, while generation uses a normalized
// route distance. Clamp only these geological thresholds so an accidental out-of-range value
// cannot make a formation unreachable or appear at the entrance.
const normalizedCaveStartDepth = (startDepth: number): number => Math.max(1, Math.min(CAVE_DEPTH_SCALE_MAX, startDepth)) / CAVE_DEPTH_SCALE_MAX;

const oreForDepth = (seed: string, cave: CaveEntrance, x: number, y: number, depth: number, hasLavaReach: boolean): CaveOreType | null => {
  const roll = randomAtTile(seed, cave.tileX * 131 + x, cave.tileY * 131 + y, CAVE_ORE_SALT);
  const rules = CAVE_ORE_SPAWN_RULES;
  if ((!rules.diamond.requiresDeepCave || hasLavaReach) && depth > Math.max(normalizedCaveStartDepth(rules.diamond.startDepth), normalizedCaveStartDepth(CAVE_LAVA_START_DEPTH)) && roll < rules.diamond.chance) return 'diamond';
  if (depth > normalizedCaveStartDepth(rules.gold.startDepth) && roll < rules.gold.chance) return 'gold';
  if (depth > normalizedCaveStartDepth(rules.iron.startDepth) && roll < rules.iron.chance) return 'iron';
  return depth > normalizedCaveStartDepth(rules.coal.startDepth) && roll < rules.coal.chance ? 'coal' : null;
};

const oreVeinStyleFor = (seed: string, cave: CaveEntrance, x: number, y: number, type: CaveOreType): CaveOreVeinStyle => {
  const styles = CAVE_ORE_VEIN_STYLES[type];
  const roll = randomAtTile(seed, cave.tileX * 149 + x, cave.tileY * 149 + y, CAVE_ORE_STYLE_SALT);
  return styles[Math.min(styles.length - 1, Math.floor(roll * styles.length))];
};

/** Connected irregular chambers form long, branching cave systems with occasional loops and outlets. */
export const generateCaveLayout = (seed: string, entrance: CaveEntrance): CaveLayout => {
  const root = baseCaveEntranceAtTile(seed, entrance.systemRootTileX, entrance.systemRootTileY) ?? entrance;
  const linkedTargets = linkedTargetsForRoot(seed, root);
  const systemEntrance = withLinkedEntrances(root, linkedTargets);
  const profile = caveDimensions(systemEntrance.depth);
  const { width, height } = profile;
  const entranceTileX = Math.floor(width / 2);
  // Entrances sit within the system instead of on its lower edge. This leaves a shorter
  // rear route behind the player as well as the long forward descent into the cave.
  const entranceTileY = Math.round(height * (0.48 + graphRandom(seed, systemEntrance, 0, 1) * 0.14));
  const clampX = (x: number): number => Math.max(12, Math.min(width - 13, x));
  const clampY = (y: number): number => Math.max(11, Math.min(height - 12, y));
  // Passage nodes only keep curving tunnels connected; they are deliberately much smaller
  // than a room. The rare larger replacements below are the cave's true chambers.
  const chambers: CaveTerrainChamber[] = [createChamber(seed, systemEntrance, 0, entranceTileX, entranceTileY, 3.2, 2.65)];
  const tunnels: CaveTerrainTunnel[] = [];
  const nodeHeadings: number[] = [-Math.PI / 2];
  const spineIndices = [0];
  const createPassageNode = (index: number, x: number, y: number): CaveTerrainChamber => createChamber(
    seed,
    systemEntrance,
    index,
    x,
    y,
    1.6 + graphRandom(seed, systemEntrance, index, 31) * 0.65,
    1.42 + graphRandom(seed, systemEntrance, index, 32) * 0.56
  );
  const hasClearanceFromOtherNodes = (x: number, y: number, parentIndex: number): boolean => chambers.every((node, index) => (
    index === parentIndex || Math.hypot(node.x - x, node.y - y) >= 5.1
  ));
  const hasSafePassageClearance = (
    passage: CaveTerrainTunnel,
    allowedChambers: readonly CaveTerrainChamber[]
  ): boolean => {
    for (let sampleIndex = 1; sampleIndex < CAVE_TUNNEL_CLEARANCE_SAMPLES; sampleIndex += 1) {
      const progress = sampleIndex / CAVE_TUNNEL_CLEARANCE_SAMPLES;
      const point = quadraticPoint(passage, progress);
      // A passage is allowed to blend into its endpoints, but once it leaves those chambers it
      // must retain a real strip of rock between every existing tunnel. Otherwise two walls can
      // visually touch or create a misleading pinched route.
      const isAtAllowedJunction = allowedChambers.some((chamber) => (
        chambers.includes(chamber)
        && Math.hypot(chamber.x - point.x, chamber.y - point.y)
          <= Math.max(chamber.radiusX, chamber.radiusY) + CAVE_TUNNEL_JUNCTION_EXEMPT_RADIUS_TILES
      ));
      if (isAtAllowedJunction) {
        continue;
      }
      const requiredGap = tunnelRadiusAt(passage, progress) + CAVE_TUNNEL_MIN_WALL_GAP_TILES;
      if (chambers.some((chamber) => !allowedChambers.includes(chamber) && chamberFieldAt(chamber, point.x, point.y) >= -requiredGap)) {
        return false;
      }
      if (tunnels.some((existing) => tunnelFieldAt(existing, point.x, point.y) >= -requiredGap)) {
        return false;
      }
    }
    return true;
  };

  // Scaling the system footprint must not scale its spine density one-for-one: doing so makes
  // every proposed node only a couple tiles from its grandparent, which correctly trips the
  // wall-clearance guard but incorrectly collapses the whole cave into its entry chamber.
  const forwardRouteLength = Math.max(0, entranceTileY - 13);
  const spineSegments = Math.max(
    3,
    Math.min(profile.spineSegments, Math.floor(forwardRouteLength / CAVE_PASSAGE_TARGET_STRIDE_TILES) + 1)
  );
  for (let index = 1; index < spineSegments; index += 1) {
    const progress = index / (spineSegments - 1);
    const prior = chambers[spineIndices[index - 1]];
    const heading = -Math.PI / 2
      + Math.sin(progress * Math.PI * 3 + graphRandom(seed, systemEntrance, index, 1) * Math.PI * 2) * 0.18
      + (graphRandom(seed, systemEntrance, index, 2) - 0.5) * 0.46;
    const stride = forwardRouteLength / (spineSegments - 1) * (0.84 + graphRandom(seed, systemEntrance, index, 3) * 0.28);
    const node = createPassageNode(index, clampX(prior.x + Math.cos(heading) * stride), clampY(prior.y + Math.sin(heading) * stride));
    const passage = connectChambers(seed, systemEntrance, prior, node, index);
    if (!hasClearanceFromOtherNodes(node.x, node.y, spineIndices[index - 1]) || !hasSafePassageClearance(passage, [prior, node])) {
      // A clean dead end is always preferable to a second corridor pinching through an existing
      // wall. Side branches can still grow from the safe portion of this main route.
      break;
    }
    const nodeIndex = chambers.length;
    chambers.push(node);
    nodeHeadings.push(heading);
    spineIndices.push(nodeIndex);
    tunnels.push(passage);
  }

  // A deliberately shorter arm runs behind the entrance. It prevents every cave from reading
  // as a single upward march and gives the first decision point some immediate exploration.
  const rearRouteLength = Math.max(0, height - 13 - entranceTileY);
  const rearSegments = Math.max(
    3,
    Math.min(
      Math.round(spineSegments * 0.32),
      Math.floor(rearRouteLength / CAVE_PASSAGE_TARGET_STRIDE_TILES)
    )
  );
  const rearIndices = [0];
  for (let index = 1; index <= rearSegments; index += 1) {
    const prior = chambers[rearIndices[index - 1]];
    const progress = index / rearSegments;
    const heading = Math.PI / 2
      + Math.sin(progress * Math.PI * 2.4 + graphRandom(seed, systemEntrance, index, 51) * Math.PI) * 0.2
      + (graphRandom(seed, systemEntrance, index, 52) - 0.5) * 0.52;
    const stride = rearRouteLength / rearSegments * (0.82 + graphRandom(seed, systemEntrance, index, 53) * 0.3);
    const node = createPassageNode(4_000 + index, clampX(prior.x + Math.cos(heading) * stride), clampY(prior.y + Math.sin(heading) * stride));
    const passage = connectChambers(seed, systemEntrance, prior, node, 4_000 + index);
    if (!hasClearanceFromOtherNodes(node.x, node.y, rearIndices[index - 1]) || !hasSafePassageClearance(passage, [prior, node])) {
      break;
    }
    const nodeIndex = chambers.length;
    chambers.push(node);
    nodeHeadings.push(heading);
    rearIndices.push(nodeIndex);
    tunnels.push(passage);
  }

  for (let branchIndex = 0; branchIndex < profile.branchSegments; branchIndex += 1) {
    // New passage nodes can become parents themselves. Biasing selection toward recent nodes
    // produces several generations of thin, twisting offshoots rather than a hub-and-spoke room.
    const parentIndex = Math.min(chambers.length - 1, Math.floor(Math.pow(graphRandom(seed, systemEntrance, branchIndex, 70), 0.55) * chambers.length));
    const parent = chambers[parentIndex];
    const parentHeading = nodeHeadings[parentIndex];
    const continuesForward = graphRandom(seed, systemEntrance, branchIndex, 71) < 0.22;
    const turn = continuesForward
      ? (graphRandom(seed, systemEntrance, branchIndex, 72) - 0.5) * 0.72
      : (graphRandom(seed, systemEntrance, branchIndex, 72) < 0.5 ? -1 : 1) * (0.6 + graphRandom(seed, systemEntrance, branchIndex, 73) * 1.15);
    const stride = 6.2 + graphRandom(seed, systemEntrance, branchIndex, 74) * 9.4;
    let nextNode: CaveTerrainChamber | null = null;
    let nextHeading = parentHeading + turn;
    for (let attempt = 0; attempt < 4 && !nextNode; attempt += 1) {
      const heading = parentHeading + turn + (attempt === 0 ? 0 : (attempt % 2 ? 1 : -1) * (0.42 + attempt * 0.21));
      const candidateX = clampX(parent.x + Math.cos(heading) * stride);
      const candidateY = clampY(parent.y + Math.sin(heading) * stride);
      if (Math.hypot(candidateX - parent.x, candidateY - parent.y) < 4.2 || !hasClearanceFromOtherNodes(candidateX, candidateY, parentIndex)) {
        continue;
      }
      const nodeIndex = spineSegments + rearSegments + branchIndex;
      nextNode = createPassageNode(nodeIndex, candidateX, candidateY);
      nextHeading = heading;
    }
    if (!nextNode) {
      continue;
    }
    const passage = connectChambers(seed, systemEntrance, parent, nextNode, spineSegments + rearSegments + branchIndex);
    if (!hasSafePassageClearance(passage, [parent, nextNode])) {
      continue;
    }
    chambers.push(nextNode);
    nodeHeadings.push(nextHeading);
    tunnels.push(passage);
  }

  for (let loopIndex = 0; loopIndex < profile.loopConnections; loopIndex += 1) {
    const firstIndex = Math.min(chambers.length - 1, Math.floor(graphRandom(seed, systemEntrance, loopIndex, 80) * chambers.length));
    const secondIndex = Math.min(chambers.length - 1, Math.floor(graphRandom(seed, systemEntrance, loopIndex, 81) * chambers.length));
    const first = chambers[firstIndex];
    const second = chambers[secondIndex];
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    if (firstIndex !== secondIndex && distance > 7 && distance < 25) {
      const passage = connectChambers(seed, systemEntrance, first, second, 10_000 + loopIndex);
      if (hasSafePassageClearance(passage, [first, second])) {
        tunnels.push(passage);
      }
    }
  }

  // Promote only a small, spread-out selection of passage nodes into landmark-sized rooms.
  // Their locations remain tied to the cave's seed while the surrounding system stays tunnel-led.
  const usedLargeChamberIndices = new Set<number>();
  for (let chamberIndex = 0; chamberIndex < profile.largeChambers; chamberIndex += 1) {
    const spacing = (chambers.length - 2) / (profile.largeChambers + 1);
    const baseIndex = 1 + Math.round((chamberIndex + 1) * spacing);
    const jitter = Math.round((graphRandom(seed, systemEntrance, chamberIndex, 90) - 0.5) * Math.max(2, spacing * 0.58));
    let nodeIndex = Math.max(1, Math.min(chambers.length - 1, baseIndex + jitter));
    while (usedLargeChamberIndices.has(nodeIndex) && nodeIndex < chambers.length - 1) {
      nodeIndex += 1;
    }
    usedLargeChamberIndices.add(nodeIndex);
    const node = chambers[nodeIndex];
    chambers[nodeIndex] = createChamber(
      seed,
      systemEntrance,
      20_000 + chamberIndex,
      node.x,
      node.y,
      4.3 + graphRandom(seed, systemEntrance, chamberIndex, 91) * 2.25,
      3.15 + graphRandom(seed, systemEntrance, chamberIndex, 92) * 1.75
    );
  }

  const terrain: CaveTerrain = { chambers, tunnels };
  const floorTiles = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      return false;
    }
    // The grid supports path depth, features, and route validation. Its threshold matches the
    // terrain field so cave depth remains faithful to the visible floor region.
    return caveTerrainFieldAt(terrain, x + 0.5, y + 0.5) >= 0;
  }));
  floorTiles[entranceTileY][entranceTileX] = true;
  const findFloorNear = (centerX: number, centerY: number): { readonly x: number; readonly y: number } => {
    for (let radius = 0; radius < 20; radius += 1) {
      for (let y = Math.max(1, Math.floor(centerY) - radius); y <= Math.min(height - 2, Math.floor(centerY) + radius); y += 1) {
        for (let x = Math.max(1, Math.floor(centerX) - radius); x <= Math.min(width - 2, Math.floor(centerX) + radius); x += 1) {
          if (floorTiles[y][x]) return { x, y };
        }
      }
    }
    return { x: entranceTileX, y: entranceTileY };
  };
  // Each connected surface mouth gets its own interior outlet. The first stays at the deepest
  // safe point while later rare connections distribute back along the spine, so no pair of
  // exits stacks in one chamber and every surface mouth remains a meaningful way through.
  const deepestSpineSlot = Math.max(0, spineIndices.length - 1);
  const linkedOutlets = linkedTargets.map((target, outletIndex) => {
    const spineSlot = Math.max(
      0,
      deepestSpineSlot - Math.round(outletIndex * deepestSpineSlot / Math.max(1, linkedTargets.length))
    );
    const chamber = chambers[spineIndices[spineSlot]];
    return { target, tile: findFloorNear(chamber.x, chamber.y) };
  });
  const incomingLinkedOutlet = linkedOutlets.find(({ target }) => (
    target.tileX === entrance.tileX && target.tileY === entrance.tileY
  ));
  const spawn = incomingLinkedOutlet?.tile ?? { x: entranceTileX, y: entranceTileY };
  // A cave system can have multiple surface entrances. All of them are real daylight openings,
  // so each must reset the geological depth field. This keeps stalagmites, lava, and deep ores
  // away from every entrance rather than only away from the original root mouth.
  const depthByTile = buildDepthMap(
    floorTiles,
    [{ x: entranceTileX, y: entranceTileY }, ...linkedOutlets.map(({ tile }) => tile)]
      .map(({ x, y }) => [x, y] as const)
  );
  const protectedSurfaceExitTiles = [
    { x: entranceTileX, y: entranceTileY },
    ...linkedOutlets.map(({ tile }) => tile)
  ];

  const lavaPools: CaveLavaPool[] = [];
  if (profile.lavaPoolChance > 0 && randomAtTile(seed, systemEntrance.tileX, systemEntrance.tileY, CAVE_GRAPH_SALT + 91) < profile.lavaPoolChance) {
    for (let attempt = 0; attempt < 280 && lavaPools.length < CAVE_LAVA_MAX_POOLS; attempt += 1) {
      const x = 2 + Math.floor(randomAtTile(seed, systemEntrance.tileX * 37 + attempt, systemEntrance.tileY, CAVE_GRAPH_SALT + 92) * (width - 4));
      const y = 2 + Math.floor(randomAtTile(seed, systemEntrance.tileX, systemEntrance.tileY * 37 + attempt, CAVE_GRAPH_SALT + 93) * (height - 4));
      const depth = depthByTile[y][x];
      if (
        !floorTiles[y][x]
        || depth < normalizedCaveStartDepth(CAVE_LAVA_START_DEPTH)
        || protectedSurfaceExitTiles.some((exit) => Math.hypot(x - exit.x, y - exit.y) < 18)
      ) continue;
      const radiusX = 2.5 + randomAtTile(seed, x, y, CAVE_GRAPH_SALT + 94) * 3.2;
      const radiusY = 1.8 + randomAtTile(seed, x, y, CAVE_GRAPH_SALT + 95) * 2.4;
      // The drawn pool has a seeded, uneven edge plus a narrow mineral rim. Require its full
      // conservative envelope to sit on cave floor cells so neither lava nor ripples can appear
      // through an adjacent wall.
      const fitsInsideCaveFloor = (() => {
        const envelopeScale = 1.25;
        const envelopeRadiusX = radiusX * envelopeScale;
        const envelopeRadiusY = radiusY * envelopeScale;
        for (let sampleY = Math.max(1, Math.floor(y - envelopeRadiusY)); sampleY <= Math.min(height - 2, Math.ceil(y + envelopeRadiusY)); sampleY += 1) {
          for (let sampleX = Math.max(1, Math.floor(x - envelopeRadiusX)); sampleX <= Math.min(width - 2, Math.ceil(x + envelopeRadiusX)); sampleX += 1) {
            const normalized = (sampleX + 0.5 - x) ** 2 / (envelopeRadiusX * envelopeRadiusX)
              + (sampleY + 0.5 - y) ** 2 / (envelopeRadiusY * envelopeRadiusY);
            if (normalized <= 1 && !floorTiles[sampleY][sampleX]) {
              return false;
            }
          }
        }
        return true;
      })();
      if (!fitsInsideCaveFloor) continue;
      if (lavaPools.some((pool) => Math.hypot(pool.tileX - x, pool.tileY - y) < pool.radiusX + radiusX + 5)) continue;
      lavaPools.push({ id: `${systemEntrance.id}:lava:${x}:${y}`, tileX: x, tileY: y, radiusX, radiusY });
    }
  }

  const stalagmites: CaveStalagmite[] = [];
  for (let y = 2; y < height - 2; y += 1) for (let x = 2; x < width - 2; x += 1) {
    const depth = depthByTile[y][x];
    if (!floorTiles[y][x] || depth < normalizedCaveStartDepth(CAVE_STALAGMITE_START_DEPTH) || randomAtTile(seed, systemEntrance.tileX * 131 + x, systemEntrance.tileY * 131 + y, CAVE_GRAPH_SALT + 101) >= CAVE_STALAGMITE_CHANCE) continue;
    if (lavaPools.some((pool) => Math.hypot(pool.tileX - x, pool.tileY - y) < pool.radiusX + 3)) continue;
    if (stalagmites.every((feature) => Math.hypot(feature.tileX - x, feature.tileY - y) >= 3)) {
      stalagmites.push({ id: `${systemEntrance.id}:stalagmite:${x}:${y}`, tileX: x, tileY: y, scale: 0.84 + randomAtTile(seed, x, y, CAVE_GRAPH_SALT + 102) * 0.95 });
    }
  }

  const ores: CaveOre[] = [];
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    if (!floorTiles[y][x]) continue;
    const adjacentFloorDirections = CARDINAL_DIRECTIONS.filter(([dx, dy]) => floorTiles[y + dy][x + dx]);
    if (adjacentFloorDirections.length !== CARDINAL_DIRECTIONS.length) continue;
    const depth = depthByTile[y][x];
    if (depth < 0.05 || x === entranceTileX && y >= entranceTileY - 3) continue;
    const ore = oreForDepth(seed, systemEntrance, x, y, depth, lavaPools.length > 0);
    const hasClearanceFromOtherOre = ores.every((existing) => Math.hypot(existing.tileX - x, existing.tileY - y) >= CAVE_ORE_MIN_SEPARATION_TILES);
    if (ore && hasClearanceFromOtherOre && randomAtTile(seed, x + systemEntrance.tileX * 41, y + systemEntrance.tileY * 41, CAVE_ORE_SALT + 3) < CAVE_ORE_FLOOR_PLACEMENT_CHANCE) {
      ores.push({ id: `${systemEntrance.id}:${x}:${y}`, tileX: x, tileY: y, type: ore, placement: 'floor', veinStyle: oreVeinStyleFor(seed, systemEntrance, x, y, ore) });
    }
  }

  const surfaceExits: CaveSurfaceExit[] = [{
    id: systemEntrance.id,
    tileX: entranceTileX,
    tileY: entranceTileY,
    surfaceTileX: systemEntrance.tileX,
    surfaceTileY: systemEntrance.tileY,
    label: 'Press E to return to the surface'
  }];
  linkedOutlets.forEach(({ target, tile }, index) => {
    surfaceExits.push({
      id: `${systemEntrance.id}:linked:${target.connectionIndex}`,
      tileX: tile.x,
      tileY: tile.y,
      surfaceTileX: target.tileX,
      surfaceTileY: target.tileY,
      label: `Press E to emerge at connected cave mouth ${index + 1}`
    });
  });
  return {
    entrance: systemEntrance,
    width,
    height,
    entranceTileX,
    entranceTileY,
    spawnTileX: spawn.x,
    spawnTileY: spawn.y,
    terrain,
    terrainContours: createTerrainContours(terrain, width, height),
    floorTiles,
    depthByTile,
    ores,
    lavaPools,
    stalagmites,
    surfaceExits
  };
};

export const caveWorldOrigin = (entrance: CaveEntrance): CaveWorldOrigin => ({ x: CAVE_WORLD_OFFSET + entrance.systemRootTileX * CAVE_WORLD_ORIGIN_STRIDE, y: CAVE_WORLD_OFFSET + entrance.systemRootTileY * CAVE_WORLD_ORIGIN_STRIDE });
export const caveWorldTilePosition = (origin: CaveWorldOrigin, tileX: number, tileY: number): CaveWorldOrigin => ({ x: origin.x + tileX * WORLD_TILE_SIZE + WORLD_TILE_SIZE / 2, y: origin.y + tileY * WORLD_TILE_SIZE + WORLD_TILE_SIZE / 2 });

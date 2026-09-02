import { LandmarkType } from '../landmarkConfig';
import { ResourceType } from '../resources';
import { WORLD_TILE_SIZE } from '../worldConfig';

export const LANDMARK_INTERIOR_GENERATION_VERSION = 2;

export const LANDMARK_INTERIOR_TYPES = [
  LandmarkType.GiantAncientTree,
  LandmarkType.Waterfall,
  LandmarkType.Watchtower
] as const;

export type LandmarkInteriorType = (typeof LANDMARK_INTERIOR_TYPES)[number];
export type LandmarkInteriorThemeId = 'hollow-tree' | 'hidden-grotto' | 'watchtower';
export type LandmarkInteriorRoomShape = 'ellipse' | 'rounded-rect';
export type LandmarkInteriorDecorationLayer = 'floor' | 'object' | 'overhead';
export type LandmarkInteriorExitFacing = 'north' | 'east' | 'south' | 'west';

export type LandmarkInteriorMaterialStyle =
  | 'ancient-wood-knot'
  | 'amber-sap-well'
  | 'glow-spore-bloom'
  | 'woven-vine-cluster'
  | 'heartwood-core'
  | 'damp-crystal-cluster'
  | 'moss-fiber-bank'
  | 'spring-stone-shelf'
  | 'luminous-mushroom-ring'
  | 'map-cache'
  | 'mechanical-salvage'
  | 'lens-case';

export type LandmarkInteriorDecorationKind =
  | 'root-ridge'
  | 'bark-rib'
  | 'sap-runnel'
  | 'spore-cluster'
  | 'moss-carpet'
  | 'glowing-berry-cluster'
  | 'shelf-fungus'
  | 'hanging-vines'
  | 'growth-rings'
  | 'firefly-motes'
  | 'shallow-pool'
  | 'rivulet'
  | 'wet-rock'
  | 'crystal-shard'
  | 'moss-bank'
  | 'mushroom-cluster'
  | 'mist-plume'
  | 'timber-beam'
  | 'gear-train'
  | 'map-table'
  | 'lens-stand'
  | 'book-stack'
  | 'broken-stair'
  | 'faded-banner'
  | 'rubble';

export interface LandmarkInteriorLandmark {
  readonly id: string;
  readonly type: LandmarkType;
  readonly centerTileX: number;
  readonly centerTileY: number;
}

export interface LandmarkInteriorPoint {
  readonly x: number;
  readonly y: number;
}

export interface LandmarkInteriorWorldPoint {
  readonly x: number;
  readonly y: number;
}

export interface LandmarkInteriorRoom {
  readonly id: string;
  readonly role: string;
  readonly shape: LandmarkInteriorRoomShape;
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly rotation: number;
  readonly cornerRadius: number;
  readonly edgeRoughness: number;
  readonly edgeFrequency: number;
  readonly edgePhase: number;
}

export interface LandmarkInteriorPassagePoint extends LandmarkInteriorPoint {
  readonly radius: number;
}

export interface LandmarkInteriorPassage {
  readonly id: string;
  readonly points: readonly LandmarkInteriorPassagePoint[];
}

export interface LandmarkInteriorTerrain {
  readonly rooms: readonly LandmarkInteriorRoom[];
  readonly passages: readonly LandmarkInteriorPassage[];
}

export interface LandmarkInteriorPalette {
  readonly background: number;
  readonly floorBase: number;
  readonly floorAccent: number;
  readonly floorDetail: number;
  readonly wallBase: number;
  readonly wallEdge: number;
  readonly wallHighlight: number;
  readonly wallShadow: number;
  readonly primaryAccent: number;
  readonly secondaryAccent: number;
  readonly glow: number;
  readonly water: number;
  readonly mist: number;
  readonly ambientLight: number;
  readonly ambientLightStrength: number;
}

export interface LandmarkInteriorTheme {
  readonly id: LandmarkInteriorThemeId;
  readonly label: string;
  readonly floorLabel: string;
  readonly exitLabel: string;
  readonly palette: LandmarkInteriorPalette;
  readonly materialResources: readonly ResourceType[];
  readonly decorationKinds: readonly LandmarkInteriorDecorationKind[];
}

export interface LandmarkInteriorMaterialNode {
  readonly id: string;
  readonly resource: ResourceType;
  readonly tileX: number;
  readonly tileY: number;
  readonly scale: number;
  readonly rotation: number;
  readonly style: LandmarkInteriorMaterialStyle;
  readonly variant: number;
  readonly yieldAmount: number;
  readonly glowStrength: number;
}

export interface LandmarkInteriorDecoration {
  readonly id: string;
  readonly kind: LandmarkInteriorDecorationKind;
  readonly tileX: number;
  readonly tileY: number;
  readonly scale: number;
  readonly rotation: number;
  readonly variant: number;
  readonly layer: LandmarkInteriorDecorationLayer;
  readonly opacity: number;
}

export interface LandmarkInteriorExit {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly facing: LandmarkInteriorExitFacing;
  readonly label: string;
  readonly interactionRadiusTiles: number;
}

export interface LandmarkInteriorLayout {
  readonly id: string;
  readonly generationVersion: number;
  readonly landmarkId: string;
  readonly landmarkType: LandmarkInteriorType;
  readonly themeId: LandmarkInteriorThemeId;
  readonly themeLabel: string;
  readonly floorLabel: string;
  readonly width: number;
  readonly height: number;
  readonly spawnTileX: number;
  readonly spawnTileY: number;
  readonly exit: LandmarkInteriorExit;
  readonly terrain: LandmarkInteriorTerrain;
  readonly floorTiles: readonly (readonly boolean[])[];
  readonly materialNodes: readonly LandmarkInteriorMaterialNode[];
  readonly decorations: readonly LandmarkInteriorDecoration[];
  readonly palette: LandmarkInteriorPalette;
}

const TREE_MATERIALS = [
  ResourceType.AncientWood,
  ResourceType.AmberSap,
  ResourceType.GlowSpores,
  ResourceType.VineFiber
] as const;

const WATERFALL_MATERIALS = [
  ResourceType.DampCrystal,
  ResourceType.MossFiber,
  ResourceType.SpringStone,
  ResourceType.LuminousMushrooms
] as const;

const WATCHTOWER_MATERIALS = [
  ResourceType.MapFragments,
  ResourceType.MechanicalParts,
  ResourceType.LensGlass
] as const;

export const LANDMARK_INTERIOR_THEMES: Readonly<Record<LandmarkInteriorType, LandmarkInteriorTheme>> = {
  [LandmarkType.GiantAncientTree]: {
    id: 'hollow-tree',
    label: 'Ancient Tree Sanctuary',
    floorLabel: 'Ancient growth-ring floor',
    exitLabel: 'Return through the root hollow',
    palette: {
      background: 0x050604,
      floorBase: 0x4a301b,
      floorAccent: 0x704923,
      floorDetail: 0xa06d39,
      wallBase: 0x2b1c10,
      wallEdge: 0x1b110a,
      wallHighlight: 0x90643a,
      wallShadow: 0x0d0906,
      primaryAccent: 0xe6a238,
      secondaryAccent: 0x315f30,
      glow: 0xf5ffd0,
      water: 0x73512e,
      mist: 0xa8c978,
      ambientLight: 0xffd982,
      ambientLightStrength: 0.5
    },
    materialResources: TREE_MATERIALS,
    decorationKinds: [
      'moss-carpet', 'root-ridge', 'glowing-berry-cluster', 'bark-rib',
      'moss-carpet', 'hanging-vines', 'glowing-berry-cluster', 'sap-runnel',
      'shelf-fungus', 'growth-rings', 'firefly-motes', 'moss-carpet'
    ]
  },
  [LandmarkType.Waterfall]: {
    id: 'hidden-grotto',
    label: 'Veiled Spring Grotto',
    floorLabel: 'Water-worn stone',
    exitLabel: 'Pass through the waterfall veil',
    palette: {
      background: 0x071317,
      floorBase: 0x36545a,
      floorAccent: 0x4d7375,
      floorDetail: 0x779999,
      wallBase: 0x233b40,
      wallEdge: 0x14272c,
      wallHighlight: 0x6c9697,
      wallShadow: 0x07161a,
      primaryAccent: 0x63d8e8,
      secondaryAccent: 0x79a65b,
      glow: 0xc186f3,
      water: 0x2b91ad,
      mist: 0xb9edf0,
      ambientLight: 0x75cfdd,
      ambientLightStrength: 0.46
    },
    materialResources: WATERFALL_MATERIALS,
    decorationKinds: [
      'shallow-pool', 'rivulet', 'wet-rock', 'crystal-shard',
      'moss-bank', 'mushroom-cluster', 'mist-plume'
    ]
  },
  [LandmarkType.Watchtower]: {
    id: 'watchtower',
    label: 'Forgotten Watchtower',
    floorLabel: 'Aged tower boards',
    exitLabel: 'Descend to the wilderness',
    palette: {
      background: 0x0d1112,
      floorBase: 0x66513d,
      floorAccent: 0x8a704f,
      floorDetail: 0xb0996f,
      wallBase: 0x3c4545,
      wallEdge: 0x222929,
      wallHighlight: 0x85908b,
      wallShadow: 0x101516,
      primaryAccent: 0xc89b55,
      secondaryAccent: 0x789aa0,
      glow: 0x9beef0,
      water: 0x435d61,
      mist: 0xaebdbb,
      ambientLight: 0xe0bd7d,
      ambientLightStrength: 0.38
    },
    materialResources: WATCHTOWER_MATERIALS,
    decorationKinds: [
      'timber-beam', 'gear-train', 'map-table', 'lens-stand',
      'book-stack', 'broken-stair', 'faded-banner', 'rubble'
    ]
  }
};

interface InteriorTemplate {
  readonly width: number;
  readonly height: number;
  readonly terrain: LandmarkInteriorTerrain;
  readonly desiredExit: LandmarkInteriorPoint;
  readonly desiredSpawn: LandmarkInteriorPoint;
}

interface CandidateTile {
  readonly tileX: number;
  readonly tileY: number;
}

const INTERIOR_WORLD_OFFSET = 20_000_013;
const INTERIOR_WORLD_ORIGIN_STRIDE = 32_768;
const MAX_LANDMARK_ID_LENGTH = 200;
const TWO_PI = Math.PI * 2;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
};

class InteriorRandom {
  private state: number;

  constructor(key: string) {
    this.state = hashString(key);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  range(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }

  integer(minimum: number, maximumInclusive: number): number {
    return minimum + Math.floor(this.next() * (maximumInclusive - minimum + 1));
  }

  pick<Value>(values: readonly Value[]): Value {
    return values[Math.min(values.length - 1, Math.floor(this.next() * values.length))];
  }
}

export const isLandmarkInteriorType = (value: unknown): value is LandmarkInteriorType =>
  LANDMARK_INTERIOR_TYPES.includes(value as LandmarkInteriorType);

const createRoom = (
  random: InteriorRandom,
  id: string,
  role: string,
  shape: LandmarkInteriorRoomShape,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  roughness: number,
  rotationScale = 1
): LandmarkInteriorRoom => ({
  id,
  role,
  shape,
  x,
  y,
  radiusX,
  radiusY,
  rotation: random.range(-0.22, 0.22) * rotationScale,
  cornerRadius: shape === 'rounded-rect' ? random.range(1.1, 2.4) : 0,
  edgeRoughness: roughness * random.range(0.82, 1.18),
  edgeFrequency: random.integer(3, 6),
  edgePhase: random.range(0, TWO_PI)
});

const createPassage = (
  random: InteriorRandom,
  id: string,
  from: LandmarkInteriorRoom,
  to: LandmarkInteriorRoom,
  radius: number,
  bendScale = 0.12
): LandmarkInteriorPassage => {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const bend = random.range(-1, 1) * Math.min(3.4, distance * bendScale);
  const midpointX = (from.x + to.x) * 0.5 - deltaY / distance * bend;
  const midpointY = (from.y + to.y) * 0.5 + deltaX / distance * bend;
  return {
    id,
    points: [
      { x: from.x, y: from.y, radius: radius * random.range(1.02, 1.18) },
      { x: midpointX, y: midpointY, radius: radius * random.range(0.84, 1.04) },
      { x: to.x, y: to.y, radius: radius * random.range(1.02, 1.18) }
    ]
  };
};

const treeTemplate = (random: InteriorRandom): InteriorTemplate => {
  const width = random.integer(42, 46);
  const height = random.integer(36, 40);
  const centerX = width * random.range(0.49, 0.51);
  const centerY = height * random.range(0.48, 0.51);
  const room = createRoom(
    random,
    'ancient-sanctuary',
    'ancient-sanctuary',
    'ellipse',
    centerX,
    centerY,
    width * random.range(0.39, 0.415),
    height * random.range(0.385, 0.41),
    0.055,
    0.32
  );
  return {
    width,
    height,
    terrain: { rooms: [room], passages: [] },
    desiredExit: { x: centerX, y: centerY + room.radiusY * 0.9 },
    desiredSpawn: { x: centerX, y: centerY + room.radiusY * 0.64 }
  };
};

const waterfallTemplate = (random: InteriorRandom): InteriorTemplate => {
  const width = random.integer(49, 56);
  const height = random.integer(39, 45);
  const rooms = [
    createRoom(random, 'water-veil', 'entry', 'ellipse', width * 0.49, height - 5.2, 6.2, 4.7, 0.12),
    createRoom(random, 'mirror-pool', 'pool', 'ellipse', width * 0.49, height * 0.60, 11.5, 7.7, 0.14),
    createRoom(random, 'crystal-gallery', 'crystal-gallery', 'ellipse', width * 0.77, height * 0.52, 7.2, 5.6, 0.15),
    createRoom(random, 'moss-terrace', 'moss-terrace', 'ellipse', width * 0.23, height * 0.57, 7.4, 5.5, 0.14),
    createRoom(random, 'spring-sanctum', 'spring-sanctum', 'ellipse', width * 0.51, height * 0.25, 8.7, 6.1, 0.13),
    createRoom(random, 'fungal-alcove', 'fungal-alcove', 'ellipse', width * 0.75, height * 0.22, 6.2, 4.5, 0.15)
  ];
  const passages = [
    createPassage(random, 'veil-to-pool', rooms[0], rooms[1], 3.05),
    createPassage(random, 'pool-to-crystal', rooms[1], rooms[2], 2.65, 0.18),
    createPassage(random, 'pool-to-moss', rooms[1], rooms[3], 2.55, 0.18),
    createPassage(random, 'pool-to-spring', rooms[1], rooms[4], 2.75, 0.16),
    createPassage(random, 'spring-to-fungal', rooms[4], rooms[5], 2.25, 0.18)
  ];
  return {
    width,
    height,
    terrain: { rooms, passages },
    desiredExit: { x: width * 0.49, y: height - 2.6 },
    desiredSpawn: { x: width * 0.49, y: height - 7.4 }
  };
};

const watchtowerTemplate = (random: InteriorRandom): InteriorTemplate => {
  const width = random.integer(37, 42);
  const height = random.integer(42, 48);
  const rooms = [
    createRoom(random, 'tower-door', 'entry', 'rounded-rect', width * 0.50, height - 5, 4.8, 4.2, 0.025, 0.35),
    createRoom(random, 'round-hall', 'round-hall', 'ellipse', width * 0.50, height * 0.61, 9.4, 8.4, 0.025, 0.3),
    createRoom(random, 'map-archive', 'map-archive', 'rounded-rect', width * 0.25, height * 0.57, 6.1, 5.1, 0.025, 0.35),
    createRoom(random, 'mechanism-bay', 'mechanism-bay', 'rounded-rect', width * 0.76, height * 0.56, 6.2, 5.3, 0.028, 0.35),
    createRoom(random, 'lens-observatory', 'lens-observatory', 'ellipse', width * 0.50, height * 0.27, 8.1, 6.9, 0.022, 0.25),
    createRoom(random, 'collapsed-study', 'collapsed-study', 'rounded-rect', width * 0.26, height * 0.25, 5.3, 4.4, 0.04, 0.55)
  ];
  const passages = [
    createPassage(random, 'door-to-hall', rooms[0], rooms[1], 2.35, 0.04),
    createPassage(random, 'hall-to-archive', rooms[1], rooms[2], 2.15, 0.04),
    createPassage(random, 'hall-to-mechanism', rooms[1], rooms[3], 2.15, 0.04),
    createPassage(random, 'hall-to-observatory', rooms[1], rooms[4], 2.35, 0.04),
    createPassage(random, 'observatory-to-study', rooms[4], rooms[5], 1.95, 0.04)
  ];
  return {
    width,
    height,
    terrain: { rooms, passages },
    desiredExit: { x: width * 0.50, y: height - 2.5 },
    desiredSpawn: { x: width * 0.50, y: height - 7.1 }
  };
};

const pointInRoom = (
  room: LandmarkInteriorRoom,
  pointX: number,
  pointY: number,
  edgePaddingTiles: number
): boolean => {
  const cosine = Math.cos(room.rotation);
  const sine = Math.sin(room.rotation);
  const deltaX = pointX - room.x;
  const deltaY = pointY - room.y;
  const localX = deltaX * cosine + deltaY * sine;
  const localY = -deltaX * sine + deltaY * cosine;
  const radiusX = Math.max(0.35, room.radiusX + edgePaddingTiles);
  const radiusY = Math.max(0.35, room.radiusY + edgePaddingTiles);

  if (room.shape === 'ellipse') {
    const normalizedX = localX / radiusX;
    const normalizedY = localY / radiusY;
    const angle = Math.atan2(normalizedY, normalizedX);
    const boundary = 1
      + Math.sin(angle * room.edgeFrequency + room.edgePhase) * room.edgeRoughness
      + Math.sin(angle * (room.edgeFrequency + 2) - room.edgePhase * 0.63) * room.edgeRoughness * 0.38;
    return Math.hypot(normalizedX, normalizedY) <= boundary;
  }

  const angle = Math.atan2(localY / radiusY, localX / radiusX);
  const edge = 1 + Math.sin(angle * room.edgeFrequency + room.edgePhase) * room.edgeRoughness * 0.25;
  // The 8.333 Lamé exponent is the implicit form of the 0.24-power superellipse used by the
  // scene renderer. Sharing the same equation keeps the visible square masonry and collision
  // boundary aligned instead of treating the tower rooms as ordinary rectangles.
  const superellipsePower = 2 / 0.24;
  return (Math.abs(localX) / (radiusX * edge)) ** superellipsePower
    + (Math.abs(localY) / (radiusY * edge)) ** superellipsePower <= 1;
};

const pointInPassage = (
  passage: LandmarkInteriorPassage,
  pointX: number,
  pointY: number,
  edgePaddingTiles: number
): boolean => {
  for (let index = 1; index < passage.points.length; index += 1) {
    const from = passage.points[index - 1];
    const to = passage.points[index];
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const progress = lengthSquared <= 0.0001
      ? 0
      : clamp(((pointX - from.x) * deltaX + (pointY - from.y) * deltaY) / lengthSquared, 0, 1);
    const nearestX = from.x + deltaX * progress;
    const nearestY = from.y + deltaY * progress;
    const radius = Math.max(0.25, from.radius + (to.radius - from.radius) * progress + edgePaddingTiles);
    if (Math.hypot(pointX - nearestX, pointY - nearestY) <= radius) {
      return true;
    }
  }
  return false;
};

const terrainContainsPoint = (
  terrain: LandmarkInteriorTerrain,
  pointX: number,
  pointY: number,
  edgePaddingTiles = 0
): boolean => terrain.rooms.some((room) => pointInRoom(room, pointX, pointY, edgePaddingTiles))
  || terrain.passages.some((passage) => pointInPassage(passage, pointX, pointY, edgePaddingTiles));

export const landmarkInteriorContainsPoint = (
  layout: LandmarkInteriorLayout,
  localTileX: number,
  localTileY: number,
  edgePaddingTiles = 0
): boolean => Number.isFinite(localTileX)
  && Number.isFinite(localTileY)
  && Number.isFinite(edgePaddingTiles)
  && terrainContainsPoint(layout.terrain, localTileX, localTileY, edgePaddingTiles);

export const landmarkInteriorContainsWorldPoint = (
  layout: LandmarkInteriorLayout,
  origin: LandmarkInteriorWorldPoint,
  worldX: number,
  worldY: number,
  edgePaddingPixels = 0
): boolean => Number.isFinite(worldX)
  && Number.isFinite(worldY)
  && Number.isFinite(edgePaddingPixels)
  && landmarkInteriorContainsPoint(
    layout,
    (worldX - origin.x) / WORLD_TILE_SIZE,
    (worldY - origin.y) / WORLD_TILE_SIZE,
    edgePaddingPixels / WORLD_TILE_SIZE
  );

const createFloorTiles = (
  width: number,
  height: number,
  terrain: LandmarkInteriorTerrain
): readonly (readonly boolean[])[] => Array.from(
  { length: height },
  (_, tileY) => Array.from(
    { length: width },
    (_, tileX) => terrainContainsPoint(terrain, tileX + 0.5, tileY + 0.5, -0.04)
  )
);

const nearestFloorTile = (
  floorTiles: readonly (readonly boolean[])[],
  desired: LandmarkInteriorPoint
): CandidateTile => {
  let nearest: CandidateTile | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let tileY = 0; tileY < floorTiles.length; tileY += 1) {
    for (let tileX = 0; tileX < (floorTiles[tileY]?.length ?? 0); tileX += 1) {
      if (!floorTiles[tileY][tileX]) {
        continue;
      }
      const distance = (tileX + 0.5 - desired.x) ** 2 + (tileY + 0.5 - desired.y) ** 2;
      if (distance < nearestDistance
        || (distance === nearestDistance && (nearest === null || tileY < nearest.tileY
          || (tileY === nearest.tileY && tileX < nearest.tileX)))) {
        nearest = { tileX, tileY };
        nearestDistance = distance;
      }
    }
  }
  if (!nearest) {
    throw new Error('Landmark interior generation produced no walkable floor.');
  }
  return nearest;
};

const materialStyleFor = (resource: ResourceType): LandmarkInteriorMaterialStyle => {
  switch (resource) {
    case ResourceType.AncientWood: return 'ancient-wood-knot';
    case ResourceType.AmberSap: return 'amber-sap-well';
    case ResourceType.GlowSpores: return 'glow-spore-bloom';
    case ResourceType.VineFiber: return 'woven-vine-cluster';
    case ResourceType.Heartwood: return 'heartwood-core';
    case ResourceType.DampCrystal: return 'damp-crystal-cluster';
    case ResourceType.MossFiber: return 'moss-fiber-bank';
    case ResourceType.SpringStone: return 'spring-stone-shelf';
    case ResourceType.LuminousMushrooms: return 'luminous-mushroom-ring';
    case ResourceType.MapFragments: return 'map-cache';
    case ResourceType.MechanicalParts: return 'mechanical-salvage';
    case ResourceType.LensGlass: return 'lens-case';
    default: throw new Error(`Unsupported landmark interior material: ${resource}`);
  }
};

const materialRoomRole = (resource: ResourceType): string => {
  switch (resource) {
    case ResourceType.AncientWood: return 'west-root';
    case ResourceType.AmberSap: return 'sap-vault';
    case ResourceType.GlowSpores: return 'canopy';
    case ResourceType.VineFiber: return 'east-root';
    case ResourceType.Heartwood: return 'heart';
    case ResourceType.DampCrystal: return 'crystal-gallery';
    case ResourceType.MossFiber: return 'moss-terrace';
    case ResourceType.SpringStone: return 'spring-sanctum';
    case ResourceType.LuminousMushrooms: return 'fungal-alcove';
    case ResourceType.MapFragments: return 'map-archive';
    case ResourceType.MechanicalParts: return 'mechanism-bay';
    case ResourceType.LensGlass: return 'lens-observatory';
    default: return 'entry';
  }
};

const glowingMaterial = (resource: ResourceType): boolean => [
  ResourceType.AmberSap,
  ResourceType.GlowSpores,
  ResourceType.Heartwood,
  ResourceType.DampCrystal,
  ResourceType.LuminousMushrooms,
  ResourceType.LensGlass
].includes(resource);

const materialCandidates = (
  floorTiles: readonly (readonly boolean[])[],
  terrain: LandmarkInteriorTerrain,
  exit: CandidateTile,
  spawn: CandidateTile
): CandidateTile[] => {
  const candidates: CandidateTile[] = [];
  for (let tileY = 1; tileY < floorTiles.length - 1; tileY += 1) {
    for (let tileX = 1; tileX < floorTiles[tileY].length - 1; tileX += 1) {
      if (!floorTiles[tileY][tileX]
        || !terrainContainsPoint(terrain, tileX + 0.5, tileY + 0.5, -0.58)
        || Math.hypot(tileX - exit.tileX, tileY - exit.tileY) < 4
        || Math.hypot(tileX - spawn.tileX, tileY - spawn.tileY) < 3) {
        continue;
      }
      candidates.push({ tileX, tileY });
    }
  }
  return candidates;
};

const chooseMaterialTile = (
  random: InteriorRandom,
  candidates: readonly CandidateTile[],
  room: LandmarkInteriorRoom,
  usedTiles: ReadonlySet<string>
): CandidateTile => {
  let selected: CandidateTile | null = null;
  let selectedScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const key = `${candidate.tileX},${candidate.tileY}`;
    if (usedTiles.has(key)) {
      continue;
    }
    const normalizedDistance = Math.hypot(
      (candidate.tileX + 0.5 - room.x) / Math.max(1, room.radiusX),
      (candidate.tileY + 0.5 - room.y) / Math.max(1, room.radiusY)
    );
    const score = normalizedDistance + random.next() * 0.58;
    if (score < selectedScore) {
      selected = candidate;
      selectedScore = score;
    }
  }
  if (!selected) {
    throw new Error('Landmark interior does not have enough distinct material-node positions.');
  }
  return selected;
};

const createMaterialNodes = (
  random: InteriorRandom,
  landmarkId: string,
  theme: LandmarkInteriorTheme,
  terrain: LandmarkInteriorTerrain,
  candidates: readonly CandidateTile[]
): LandmarkInteriorMaterialNode[] => {
  const usedTiles = new Set<string>();
  const resources: ResourceType[] = [...theme.materialResources];
  const extraCount = random.integer(2, 5);
  for (let index = 0; index < extraCount; index += 1) {
    resources.push(random.pick(theme.materialResources));
  }

  return resources.map((resource, index) => {
    const role = materialRoomRole(resource);
    const room = terrain.rooms.find((candidate) => candidate.role === role) ?? terrain.rooms[0];
    const tile = chooseMaterialTile(random, candidates, room, usedTiles);
    usedTiles.add(`${tile.tileX},${tile.tileY}`);
    const glowing = glowingMaterial(resource);
    return {
      id: `${landmarkId}:interior-material:${index}:${resource.replaceAll(' ', '-')}`,
      resource,
      tileX: tile.tileX,
      tileY: tile.tileY,
      scale: random.range(0.84, 1.24),
      rotation: random.range(0, TWO_PI),
      style: materialStyleFor(resource),
      variant: random.integer(0, 4),
      yieldAmount: random.next() < 0.24 ? 2 : 1,
      glowStrength: glowing ? random.range(0.48, 0.92) : random.range(0.05, 0.2)
    };
  });
};

const decorationLayer = (kind: LandmarkInteriorDecorationKind): LandmarkInteriorDecorationLayer => {
  switch (kind) {
    case 'rivulet':
    case 'shallow-pool':
    case 'growth-rings':
    case 'sap-runnel':
    case 'moss-carpet':
      return 'floor';
    case 'hanging-vines':
    case 'glowing-berry-cluster':
    case 'mist-plume':
    case 'faded-banner':
    case 'firefly-motes':
      return 'overhead';
    default:
      return 'object';
  }
};

const createDecorations = (
  random: InteriorRandom,
  landmarkId: string,
  theme: LandmarkInteriorTheme,
  terrain: LandmarkInteriorTerrain,
  candidates: readonly CandidateTile[],
  materialNodes: readonly LandmarkInteriorMaterialNode[]
): LandmarkInteriorDecoration[] => {
  const materialTiles = new Set(materialNodes.map((node) => `${node.tileX},${node.tileY}`));
  const available = candidates.filter((tile) => !materialTiles.has(`${tile.tileX},${tile.tileY}`));
  const isAncientTree = theme.id === 'hollow-tree';
  const count = Math.min(
    isAncientTree ? 64 : 34,
    (isAncientTree ? 52 : 23) + random.integer(0, isAncientTree ? 10 : 9),
    available.length
  );
  const decorations: LandmarkInteriorDecoration[] = [];
  const usedObjectTiles = new Set<string>();
  const usedTreeLayerTiles = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const kind = theme.decorationKinds[index % theme.decorationKinds.length];
    const room = terrain.rooms[(index + random.integer(0, terrain.rooms.length - 1)) % terrain.rooms.length];
    const layer = decorationLayer(kind);
    const targetAngle = random.range(0, TWO_PI);
    const targetRadius = isAncientTree
      ? random.range(
        kind === 'growth-rings' || kind === 'firefly-motes' ? 0.22 : 0.5,
        kind === 'moss-carpet' || kind === 'glowing-berry-cluster' || kind === 'hanging-vines' ? 0.93 : 0.84
      )
      : 0;
    const targetX = room.x + Math.cos(targetAngle) * room.radiusX * targetRadius;
    const targetY = room.y + Math.sin(targetAngle) * room.radiusY * targetRadius;
    let selected: CandidateTile | null = null;
    let selectedScore = Number.POSITIVE_INFINITY;
    for (const candidate of available) {
      const key = `${candidate.tileX},${candidate.tileY}`;
      if ((layer === 'object' && usedObjectTiles.has(key))
        || (isAncientTree && usedTreeLayerTiles.has(`${layer}:${key}`))) {
        continue;
      }
      const distance = isAncientTree
        ? Math.hypot(candidate.tileX + 0.5 - targetX, candidate.tileY + 0.5 - targetY)
        : Math.hypot(candidate.tileX + 0.5 - room.x, candidate.tileY + 0.5 - room.y);
      const score = distance + random.next() * (isAncientTree ? 2.8 : 7.5);
      if (score < selectedScore) {
        selected = candidate;
        selectedScore = score;
      }
    }
    if (!selected) {
      break;
    }
    if (layer === 'object') {
      usedObjectTiles.add(`${selected.tileX},${selected.tileY}`);
    }
    if (isAncientTree) {
      usedTreeLayerTiles.add(`${layer}:${selected.tileX},${selected.tileY}`);
    }
    decorations.push({
      id: `${landmarkId}:interior-decoration:${index}:${kind}`,
      kind,
      tileX: selected.tileX,
      tileY: selected.tileY,
      scale: random.range(0.62, 1.42),
      rotation: random.range(0, TWO_PI),
      variant: random.integer(0, 5),
      layer,
      opacity: layer === 'floor' ? random.range(0.42, 0.76) : random.range(0.68, 1)
    });
  }
  return decorations;
};

const templateFor = (type: LandmarkInteriorType, random: InteriorRandom): InteriorTemplate => {
  switch (type) {
    case LandmarkType.GiantAncientTree: return treeTemplate(random);
    case LandmarkType.Waterfall: return waterfallTemplate(random);
    case LandmarkType.Watchtower: return watchtowerTemplate(random);
  }
};

export const generateLandmarkInterior = (
  worldSeed: string,
  landmark: LandmarkInteriorLandmark
): LandmarkInteriorLayout => {
  if (typeof worldSeed !== 'string') {
    throw new TypeError('Landmark interior world seed must be a string.');
  }
  if (!landmark || typeof landmark.id !== 'string' || landmark.id.length === 0
    || landmark.id.length > MAX_LANDMARK_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(landmark.id)) {
    throw new TypeError('Landmark interior requires a stable, printable landmark id.');
  }
  if (!isLandmarkInteriorType(landmark.type)) {
    throw new RangeError(`Landmark type ${String(landmark.type)} does not have an interior.`);
  }
  if (!Number.isSafeInteger(landmark.centerTileX) || !Number.isSafeInteger(landmark.centerTileY)) {
    throw new TypeError('Landmark interior center coordinates must be safe integers.');
  }

  const generationKey = `${worldSeed}\u0000${landmark.id}\u0000${LANDMARK_INTERIOR_GENERATION_VERSION}`;
  const random = new InteriorRandom(generationKey);
  const template = templateFor(landmark.type, random);
  const theme = LANDMARK_INTERIOR_THEMES[landmark.type];
  const floorTiles = createFloorTiles(template.width, template.height, template.terrain);
  const exitTile = nearestFloorTile(floorTiles, template.desiredExit);
  const spawnTile = nearestFloorTile(floorTiles, template.desiredSpawn);
  const candidates = materialCandidates(floorTiles, template.terrain, exitTile, spawnTile);
  const materialNodes = createMaterialNodes(random, landmark.id, theme, template.terrain, candidates);
  const decorations = createDecorations(
    random,
    landmark.id,
    theme,
    template.terrain,
    candidates,
    materialNodes
  );

  return {
    id: `${landmark.id}:interior:v${LANDMARK_INTERIOR_GENERATION_VERSION}`,
    generationVersion: LANDMARK_INTERIOR_GENERATION_VERSION,
    landmarkId: landmark.id,
    landmarkType: landmark.type,
    themeId: theme.id,
    themeLabel: theme.label,
    floorLabel: theme.floorLabel,
    width: template.width,
    height: template.height,
    spawnTileX: spawnTile.tileX,
    spawnTileY: spawnTile.tileY,
    exit: {
      id: `${landmark.id}:interior-exit`,
      tileX: exitTile.tileX,
      tileY: exitTile.tileY,
      facing: 'south',
      label: theme.exitLabel,
      interactionRadiusTiles: 2.4
    },
    terrain: template.terrain,
    floorTiles,
    materialNodes,
    decorations,
    palette: { ...theme.palette }
  };
};

export const landmarkInteriorWorldOrigin = (
  worldSeed: string,
  landmark: LandmarkInteriorLandmark
): LandmarkInteriorWorldPoint => {
  if (!Number.isSafeInteger(landmark.centerTileX) || !Number.isSafeInteger(landmark.centerTileY)) {
    throw new TypeError('Landmark interior center coordinates must be safe integers.');
  }
  const laneHash = hashString(`${worldSeed}\u0000${landmark.id}\u0000origin-v${LANDMARK_INTERIOR_GENERATION_VERSION}`);
  const laneX = laneHash & 31;
  const laneY = (laneHash >>> 5) & 31;
  return {
    x: INTERIOR_WORLD_OFFSET + landmark.centerTileX * INTERIOR_WORLD_ORIGIN_STRIDE + laneX * 64,
    y: INTERIOR_WORLD_OFFSET + landmark.centerTileY * INTERIOR_WORLD_ORIGIN_STRIDE + laneY * 64
  };
};

export const landmarkInteriorWorldTilePosition = (
  origin: LandmarkInteriorWorldPoint,
  tileX: number,
  tileY: number
): LandmarkInteriorWorldPoint => ({
  x: origin.x + tileX * WORLD_TILE_SIZE + WORLD_TILE_SIZE / 2,
  y: origin.y + tileY * WORLD_TILE_SIZE + WORLD_TILE_SIZE / 2
});

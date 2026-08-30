import { ToolId } from './toolConfig';

// Placeables are inventory items until the player places them in the world. Keeping their
// identity here, separate from terrain generation, makes new crafting content data-only.
export enum PlaceableId {
  TrailLantern = 'trail lantern',
  Waypoint = 'waypoint',
  TravelStone = 'travel stone',
  Workbench = 'workbench',
  Furnace = 'furnace',
  UpgradeTable = 'upgrade table',
  BrewingStation = 'brewing station',
  Anvil = 'anvil',
  SmallChest = 'small chest',
  ReinforcedChest = 'reinforced chest',
  DiamondVault = 'diamond vault',
  Campfire = 'campfire',
  WoodenShelter = 'wooden shelter',
  StoneShelter = 'stone shelter'
}

export const PLACEABLE_IDS = Object.values(PlaceableId) as PlaceableId[];

export const isPlaceableId = (value: unknown): value is PlaceableId =>
  typeof value === 'string' && PLACEABLE_IDS.includes(value as PlaceableId);

export type CraftingCategoryId = 'tools' | 'items' | 'workstations' | 'storage' | 'housing';

export interface CraftingCategoryDefinition {
  readonly id: CraftingCategoryId;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
}

export const CRAFTING_CATEGORIES: readonly CraftingCategoryDefinition[] = [
  { id: 'tools', label: 'Tools', description: 'Pickaxes, axes, hoes, and swords.', icon: 'tools' },
  { id: 'items', label: 'Items', description: 'Useful field equipment and discoveries.', icon: 'items' },
  { id: 'workstations', label: 'Workstations', description: 'Build stations for a growing homestead.', icon: 'workstations' },
  { id: 'storage', label: 'Storage', description: 'Keep supplies safe and organized.', icon: 'storage' },
  { id: 'housing', label: 'Housing', description: 'Create a place to rest and recover.', icon: 'housing' }
];

// Trail-lantern lighting is deliberately kept as named top-level tuning so it can be adjusted
// without touching renderer code. Radius is measured in streamed chunks; intensity controls the
// perceived brightness of the full bubble, including its center.
export const TRAIL_LANTERN_LIGHT_RADIUS_CHUNKS = 8;
export const TRAIL_LANTERN_LIGHT_INTENSITY = 0.55;
// Warmth blends the light from neutral white (0) to deep firelight (1). Clarity controls the
// falloff: 0 is deliberately diffuse, while 1 keeps the bright pool tight and terrain crisp.
// These values are independent for the trail lantern and an active furnace.
export const TRAIL_LANTERN_LIGHT_WARMTH = .8;
export const TRAIL_LANTERN_LIGHT_CLARITY = 2000;
export const FURNACE_LIGHT_WARMTH = 2;
export const FURNACE_LIGHT_CLARITY = 0.88;
// Ember-red furnace color. Change this hexadecimal RGB value to art-direct the fire tone
// without affecting lanterns or other placed lights.
export const FURNACE_LIGHT_COLOR = 0xff4422;
// Furnace light uses world pixels because it is a compact, local source rather than a
// chunk-scale landmark. Increase this value to make an actively refining furnace light a
// larger area; it does not affect the trail lantern.
export const FURNACE_LIGHT_RADIUS_PIXELS = 1200;
// Projected-light positioning is measured in world pixels relative to each light source. The
// furnace shares this tuned correction with the trail lantern. Deliberately use player-facing
// directions here: positive X moves the glow left and positive Y moves it up; negative values
// move it right/down. Leave both at zero to anchor to the visible flame.
export const TRAIL_LANTERN_LIGHT_OFFSET_X = -700;
export const TRAIL_LANTERN_LIGHT_OFFSET_Y = -420;

// Waypoints are player-authored map annotations. Keeping their limits beside the item definition
// makes both the interaction menu and persisted world state agree on the same safe label shape.
export const WAYPOINT_DEFAULT_LABEL = 'Waypoint';
export const WAYPOINT_LABEL_MAX_LENGTH = 32;

export interface PlaceableDefinition {
  readonly id: PlaceableId;
  readonly label: string;
  readonly category: Exclude<CraftingCategoryId, 'tools'>;
  readonly description: string;
  readonly footprint: readonly [width: number, height: number];
  readonly storageSlots?: number;
  readonly interaction: 'storage' | 'rest' | 'station' | 'light' | 'waypoint' | 'travel';
  // World-space lighting remains data-driven so additional placeables can be balanced without
  // coupling their crafting entry to rendering code. `radiusChunks` is deliberately measured in
  // streamed-world chunks rather than display pixels.
  readonly light?: {
    readonly radiusChunks: number;
    readonly color: number;
    readonly intensity: number;
    readonly warmth: number;
    readonly clarity: number;
    // A permanent field has the same configured brightness day and night. It simply reads as
    // subtler against bright daylight terrain.
    readonly alwaysOn: boolean;
  };
}

export const PLACEABLE_DEFINITIONS: Readonly<Record<PlaceableId, PlaceableDefinition>> = {
  [PlaceableId.TrailLantern]: {
    id: PlaceableId.TrailLantern,
    label: 'Trail Lantern',
    category: 'items',
    description: 'A warm landmark that lights the surrounding ground at night.',
    footprint: [1, 1],
    interaction: 'light',
    light: {
      radiusChunks: TRAIL_LANTERN_LIGHT_RADIUS_CHUNKS,
      color: 0xffc56b,
      intensity: TRAIL_LANTERN_LIGHT_INTENSITY,
      warmth: TRAIL_LANTERN_LIGHT_WARMTH,
      clarity: TRAIL_LANTERN_LIGHT_CLARITY,
      alwaysOn: true
    }
  },
  [PlaceableId.Waypoint]: {
    id: PlaceableId.Waypoint,
    label: 'Waypoint',
    category: 'items',
    description: 'Mark a place in the wilderness and give it a name on your map.',
    footprint: [1, 1],
    interaction: 'waypoint'
  },
  [PlaceableId.TravelStone]: {
    id: PlaceableId.TravelStone,
    label: 'Travel Stone',
    category: 'items',
    description: 'Open the discovered world map and travel instantly between placed stones.',
    footprint: [1, 1],
    interaction: 'travel'
  },
  [PlaceableId.Workbench]: {
    id: PlaceableId.Workbench,
    label: 'Workbench',
    category: 'workstations',
    description: 'A solid work surface for construction blueprints and field equipment.',
    footprint: [2, 1],
    interaction: 'station'
  },
  [PlaceableId.Furnace]: {
    id: PlaceableId.Furnace,
    label: 'Furnace',
    category: 'workstations',
    description: 'Burn coal to refine raw iron and gold ore into usable ingots.',
    footprint: [1, 1],
    interaction: 'station'
  },
  [PlaceableId.UpgradeTable]: {
    id: PlaceableId.UpgradeTable,
    label: 'Upgrade Table',
    category: 'workstations',
    description: 'A precise station for comparing and crafting the next material tier of a tool.',
    footprint: [2, 1],
    interaction: 'station'
  },
  [PlaceableId.BrewingStation]: {
    id: PlaceableId.BrewingStation,
    label: 'Brewing Station',
    category: 'workstations',
    description: 'A carefully arranged station for expedition equipment, brews, and tonics.',
    footprint: [2, 1],
    interaction: 'station'
  },
  [PlaceableId.Anvil]: {
    id: PlaceableId.Anvil,
    label: 'Anvil',
    category: 'workstations',
    description: 'A heavy anvil for forging the game’s growing tool catalogue.',
    footprint: [1, 1],
    interaction: 'station'
  },
  [PlaceableId.SmallChest]: {
    id: PlaceableId.SmallChest,
    label: 'Small Chest',
    category: 'storage',
    description: 'A compact wooden chest with twelve storage slots.',
    footprint: [1, 1],
    storageSlots: 12,
    interaction: 'storage'
  },
  [PlaceableId.ReinforcedChest]: {
    id: PlaceableId.ReinforcedChest,
    label: 'Reinforced Chest',
    category: 'storage',
    description: 'A metal-banded chest with twenty-four storage slots.',
    footprint: [1, 1],
    storageSlots: 24,
    interaction: 'storage'
  },
  [PlaceableId.DiamondVault]: {
    id: PlaceableId.DiamondVault,
    label: 'Diamond Vault',
    category: 'storage',
    description: 'A high-security vault with thirty-six storage slots.',
    footprint: [2, 2],
    storageSlots: 36,
    interaction: 'storage'
  },
  [PlaceableId.Campfire]: {
    id: PlaceableId.Campfire,
    label: 'Campfire',
    category: 'housing',
    description: 'Rest by its warmth and pass the night safely.',
    footprint: [1, 1],
    interaction: 'rest'
  },
  [PlaceableId.WoodenShelter]: {
    id: PlaceableId.WoodenShelter,
    label: 'Wooden Shelter',
    category: 'housing',
    description: 'A simple covered refuge for a growing campsite.',
    footprint: [2, 2],
    interaction: 'rest'
  },
  [PlaceableId.StoneShelter]: {
    id: PlaceableId.StoneShelter,
    label: 'Stone Shelter',
    category: 'housing',
    description: 'A durable stone refuge for long expeditions.',
    footprint: [2, 2],
    interaction: 'rest'
  }
};

export type CraftableOutputId = ToolId | PlaceableId;

export const isCraftableOutputId = (value: unknown): value is CraftableOutputId =>
  typeof value === 'string' && (Object.values(ToolId).includes(value as ToolId) || isPlaceableId(value));

export const isStoragePlaceable = (id: PlaceableId): boolean =>
  (PLACEABLE_DEFINITIONS[id].storageSlots ?? 0) > 0;

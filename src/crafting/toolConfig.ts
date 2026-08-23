export enum ToolId {
  WoodenAxe = 'wooden axe',
  StoneAxe = 'stone axe',
  IronAxe = 'iron axe',
  GoldAxe = 'gold axe',
  DiamondAxe = 'diamond axe',
  WoodenPickaxe = 'wooden pickaxe',
  StonePickaxe = 'stone pickaxe',
  IronPickaxe = 'iron pickaxe',
  GoldPickaxe = 'gold pickaxe',
  DiamondPickaxe = 'diamond pickaxe',
  WoodenHoe = 'wooden hoe',
  StoneHoe = 'stone hoe',
  IronHoe = 'iron hoe',
  GoldHoe = 'gold hoe',
  DiamondHoe = 'diamond hoe',
  WoodenSword = 'wooden sword',
  StoneSword = 'stone sword',
  IronSword = 'iron sword',
  GoldSword = 'gold sword',
  DiamondSword = 'diamond sword'
}

export type ToolKind = 'axe' | 'pickaxe' | 'hoe' | 'sword';
export type ToolHeadMaterial = 'wood' | 'stone' | 'iron' | 'gold' | 'diamond';

export interface ToolHeadPalette {
  readonly fill: number;
  readonly edge: number;
}

// Shared in-world tool palette. The inventory uses matching CSS colors so equipped and stored
// tools retain a clear material identity.
export const TOOL_HEAD_PALETTES: Readonly<Record<ToolHeadMaterial, ToolHeadPalette>> = {
  wood: { fill: 0xb77a3d, edge: 0x704124 },
  stone: { fill: 0xaeb8bd, edge: 0x52646b },
  iron: { fill: 0xd79a7c, edge: 0x74443b },
  gold: { fill: 0xf1c75a, edge: 0x9a681b },
  diamond: { fill: 0x8ce2e4, edge: 0x2e7e95 }
};

export interface ToolDefinition {
  id: ToolId;
  label: string;
  kind: ToolKind;
  headMaterial: ToolHeadMaterial;
}

// Tool balance is gameplay data, deliberately independent from feature generation. New tools
// only need a definition here and a recipe in recipeConfig.ts.
export const TOOL_DEFINITIONS: Readonly<Record<ToolId, ToolDefinition>> = {
  [ToolId.WoodenAxe]: {
    id: ToolId.WoodenAxe,
    label: 'Wooden Axe',
    kind: 'axe',
    headMaterial: 'wood'
  },
  [ToolId.StoneAxe]: {
    id: ToolId.StoneAxe,
    label: 'Stone Axe',
    kind: 'axe',
    headMaterial: 'stone'
  },
  [ToolId.IronAxe]: {
    id: ToolId.IronAxe,
    label: 'Iron Axe',
    kind: 'axe',
    headMaterial: 'iron'
  },
  [ToolId.GoldAxe]: {
    id: ToolId.GoldAxe,
    label: 'Gold Axe',
    kind: 'axe',
    headMaterial: 'gold'
  },
  [ToolId.DiamondAxe]: {
    id: ToolId.DiamondAxe,
    label: 'Diamond Axe',
    kind: 'axe',
    headMaterial: 'diamond'
  },
  [ToolId.WoodenPickaxe]: {
    id: ToolId.WoodenPickaxe,
    label: 'Wooden Pickaxe',
    kind: 'pickaxe',
    headMaterial: 'wood'
  },
  [ToolId.StonePickaxe]: {
    id: ToolId.StonePickaxe,
    label: 'Stone Pickaxe',
    kind: 'pickaxe',
    headMaterial: 'stone'
  },
  [ToolId.IronPickaxe]: {
    id: ToolId.IronPickaxe,
    label: 'Iron Pickaxe',
    kind: 'pickaxe',
    headMaterial: 'iron'
  },
  [ToolId.GoldPickaxe]: {
    id: ToolId.GoldPickaxe,
    label: 'Gold Pickaxe',
    kind: 'pickaxe',
    headMaterial: 'gold'
  },
  [ToolId.DiamondPickaxe]: {
    id: ToolId.DiamondPickaxe,
    label: 'Diamond Pickaxe',
    kind: 'pickaxe',
    headMaterial: 'diamond'
  },
  [ToolId.WoodenHoe]: {
    id: ToolId.WoodenHoe,
    label: 'Wooden Hoe',
    kind: 'hoe',
    headMaterial: 'wood'
  },
  [ToolId.StoneHoe]: {
    id: ToolId.StoneHoe,
    label: 'Stone Hoe',
    kind: 'hoe',
    headMaterial: 'stone'
  },
  [ToolId.IronHoe]: {
    id: ToolId.IronHoe,
    label: 'Iron Hoe',
    kind: 'hoe',
    headMaterial: 'iron'
  },
  [ToolId.GoldHoe]: {
    id: ToolId.GoldHoe,
    label: 'Gold Hoe',
    kind: 'hoe',
    headMaterial: 'gold'
  },
  [ToolId.DiamondHoe]: {
    id: ToolId.DiamondHoe,
    label: 'Diamond Hoe',
    kind: 'hoe',
    headMaterial: 'diamond'
  },
  [ToolId.WoodenSword]: {
    id: ToolId.WoodenSword,
    label: 'Wooden Sword',
    kind: 'sword',
    headMaterial: 'wood'
  },
  [ToolId.StoneSword]: {
    id: ToolId.StoneSword,
    label: 'Stone Sword',
    kind: 'sword',
    headMaterial: 'stone'
  },
  [ToolId.IronSword]: {
    id: ToolId.IronSword,
    label: 'Iron Sword',
    kind: 'sword',
    headMaterial: 'iron'
  },
  [ToolId.GoldSword]: {
    id: ToolId.GoldSword,
    label: 'Gold Sword',
    kind: 'sword',
    headMaterial: 'gold'
  },
  [ToolId.DiamondSword]: {
    id: ToolId.DiamondSword,
    label: 'Diamond Sword',
    kind: 'sword',
    headMaterial: 'diamond'
  }
};
export const TOOL_IDS = Object.values(ToolId) as ToolId[];

export const isToolId = (value: unknown): value is ToolId =>
  typeof value === 'string' && TOOL_IDS.includes(value as ToolId);

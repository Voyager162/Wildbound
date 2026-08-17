export enum ToolId {
  WoodenAxe = 'wooden axe',
  StoneAxe = 'stone axe',
  WoodenPickaxe = 'wooden pickaxe',
  StonePickaxe = 'stone pickaxe'
}

export type ToolKind = 'axe' | 'pickaxe';

export interface ToolDefinition {
  id: ToolId;
  label: string;
  kind: ToolKind;
  headMaterial: 'wood' | 'stone';
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
  }
};
export const TOOL_IDS = Object.values(ToolId) as ToolId[];

export const isToolId = (value: unknown): value is ToolId =>
  typeof value === 'string' && TOOL_IDS.includes(value as ToolId);

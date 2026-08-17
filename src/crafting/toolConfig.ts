import { TerrainFeatureType } from '../world/generation/featureGenerator';

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
  harvestSpeedMultiplier: number;
}

// Tool balance is gameplay data, deliberately independent from feature generation. New tools
// only need a definition here and a recipe in recipeConfig.ts.
export const TOOL_DEFINITIONS: Readonly<Record<ToolId, ToolDefinition>> = {
  [ToolId.WoodenAxe]: {
    id: ToolId.WoodenAxe,
    label: 'Wooden Axe',
    kind: 'axe',
    harvestSpeedMultiplier: 1.65
  },
  [ToolId.StoneAxe]: {
    id: ToolId.StoneAxe,
    label: 'Stone Axe',
    kind: 'axe',
    harvestSpeedMultiplier: 2.35
  },
  [ToolId.WoodenPickaxe]: {
    id: ToolId.WoodenPickaxe,
    label: 'Wooden Pickaxe',
    kind: 'pickaxe',
    harvestSpeedMultiplier: 1.65
  },
  [ToolId.StonePickaxe]: {
    id: ToolId.StonePickaxe,
    label: 'Stone Pickaxe',
    kind: 'pickaxe',
    harvestSpeedMultiplier: 2.35
  }
};
export const TOOL_IDS = Object.values(ToolId) as ToolId[];

export const isToolId = (value: unknown): value is ToolId =>
  typeof value === 'string' && TOOL_IDS.includes(value as ToolId);

const AXE_FEATURES = new Set<TerrainFeatureType>([
  TerrainFeatureType.Tree,
  TerrainFeatureType.Cactus,
  TerrainFeatureType.Reeds,
  TerrainFeatureType.WaterReeds,
  TerrainFeatureType.Grass
]);

const PICKAXE_FEATURES = new Set<TerrainFeatureType>([
  TerrainFeatureType.Rock,
  TerrainFeatureType.SnowyRock,
  TerrainFeatureType.IcePatch
]);

export const toolSpeedForFeature = (toolId: ToolId | null, feature: TerrainFeatureType): number => {
  if (!toolId) {
    return 1;
  }

  const tool = TOOL_DEFINITIONS[toolId];
  const isEffective = tool.kind === 'axe'
    ? AXE_FEATURES.has(feature)
    : PICKAXE_FEATURES.has(feature);
  return isEffective ? tool.harvestSpeedMultiplier : 1;
};

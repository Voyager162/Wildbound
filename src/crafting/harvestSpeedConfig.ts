import { ToolId } from './toolConfig';
import { TerrainFeatureType } from '../world/generation/featureGenerator';

export type HarvestMethodId = 'hand' | ToolId;
export type FeatureHarvestSpeeds = Readonly<Record<TerrainFeatureType, number>>;

// Harvest balance lives here rather than in terrain generation or UI code. Values are speed
// multipliers: 1 is the normal hand pace, values above 1 harvest faster, and values below 1
// harvest slower. "hand" also applies while a resource stack is selected in the hotbar.
export const HARVEST_SPEEDS: Readonly<Record<HarvestMethodId, FeatureHarvestSpeeds>> = {
  hand: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.IcePatch]: .5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.WoodenAxe]: {
    [TerrainFeatureType.Tree]: 1,
    [TerrainFeatureType.Cactus]: 1,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: 1,
    [TerrainFeatureType.WaterReeds]: 1,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.IcePatch]: .5,
    [TerrainFeatureType.Grass]: 1
  },
  [ToolId.StoneAxe]: {
    [TerrainFeatureType.Tree]: 2,
    [TerrainFeatureType.Cactus]: 2,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: 2,
    [TerrainFeatureType.WaterReeds]: 2,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.IcePatch]: .5,
    [TerrainFeatureType.Grass]: 2
  },
  [ToolId.IronAxe]: {
    [TerrainFeatureType.Tree]: 3,
    [TerrainFeatureType.Cactus]: 3,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: 3,
    [TerrainFeatureType.WaterReeds]: 3,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.IcePatch]: .5,
    [TerrainFeatureType.Grass]: 3
  },
  [ToolId.GoldAxe]: {
    [TerrainFeatureType.Tree]: 3.5,
    [TerrainFeatureType.Cactus]: 3.5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: 3.5,
    [TerrainFeatureType.WaterReeds]: 3.5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.IcePatch]: .5,
    [TerrainFeatureType.Grass]: 3.5
  },
  [ToolId.DiamondAxe]: {
    [TerrainFeatureType.Tree]: 4.5,
    [TerrainFeatureType.Cactus]: 4.5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: 4.5,
    [TerrainFeatureType.WaterReeds]: 4.5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.IcePatch]: .5,
    [TerrainFeatureType.Grass]: 4.5
  },
  [ToolId.WoodenPickaxe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: 1,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: 1,
    [TerrainFeatureType.IcePatch]: 1,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.StonePickaxe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: 2,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: 2,
    [TerrainFeatureType.IcePatch]: 2,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.IronPickaxe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: 3,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: 3,
    [TerrainFeatureType.IcePatch]: 3,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.GoldPickaxe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: 3.5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: 3.5,
    [TerrainFeatureType.IcePatch]: 3.5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.DiamondPickaxe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: 4.5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: 4.5,
    [TerrainFeatureType.IcePatch]: 4.5,
    [TerrainFeatureType.Grass]: .5
  }
};

// Cave deposits use a separate time-based mining pace. Keeping it here makes every harvest
// speed—including hand mining—designer-editable in one balance file.
export const CAVE_ORE_MINING_SPEEDS: Readonly<Record<HarvestMethodId, number>> = {
  hand: .55,
  [ToolId.WoodenAxe]: .7,
  [ToolId.StoneAxe]: .7,
  [ToolId.IronAxe]: .7,
  [ToolId.GoldAxe]: .7,
  [ToolId.DiamondAxe]: .7,
  [ToolId.WoodenPickaxe]: 1.6,
  [ToolId.StonePickaxe]: 2.35,
  [ToolId.IronPickaxe]: 3.1,
  [ToolId.GoldPickaxe]: 3.5,
  [ToolId.DiamondPickaxe]: 4.5
};

export const harvestSpeedForFeature = (toolId: ToolId | null, feature: TerrainFeatureType): number =>
  HARVEST_SPEEDS[toolId ?? 'hand'][feature];

export const caveOreMiningSpeedForTool = (toolId: ToolId | null): number =>
  CAVE_ORE_MINING_SPEEDS[toolId ?? 'hand'];

export const peakHarvestSpeedForTool = (toolId: ToolId): number =>
  Math.max(...Object.values(HARVEST_SPEEDS[toolId]));

import { ToolId } from './toolConfig';
import { TerrainFeatureType } from '../world/generation/featureGenerator';
import type { CaveOreType } from '../world/caves/caveOreGenerationConfig';

export type HarvestMethodId = 'hand' | ToolId;
export type FeatureHarvestSpeeds = Readonly<Record<TerrainFeatureType, number>>;

// Mining progression is kept with the harvest balance rather than cave generation or UI code.
// The required pickaxe is the *minimum* tier; a higher-tier pickaxe remains valid. `null` means
// that the target can be harvested with the hand or any selected non-tool resource.
export const SURFACE_MINING_REQUIREMENTS: Readonly<Partial<Record<TerrainFeatureType, ToolId>>> = {
  [TerrainFeatureType.Rock]: ToolId.WoodenPickaxe,
  [TerrainFeatureType.SnowyRock]: ToolId.WoodenPickaxe
};

export const CAVE_ORE_MINING_REQUIREMENTS: Readonly<Partial<Record<CaveOreType, ToolId>>> = {
  iron: ToolId.StonePickaxe,
  gold: ToolId.IronPickaxe,
  diamond: ToolId.GoldPickaxe
};

const PICKAXE_TIER: Readonly<Partial<Record<ToolId, number>>> = {
  [ToolId.WoodenPickaxe]: 1,
  [ToolId.StonePickaxe]: 2,
  [ToolId.IronPickaxe]: 3,
  [ToolId.GoldPickaxe]: 4,
  [ToolId.DiamondPickaxe]: 5
};

export const miningRequirementForFeature = (feature: TerrainFeatureType): ToolId | null =>
  SURFACE_MINING_REQUIREMENTS[feature] ?? null;

export const miningRequirementForCaveOre = (ore: CaveOreType): ToolId | null =>
  CAVE_ORE_MINING_REQUIREMENTS[ore] ?? null;

export const meetsMiningRequirement = (toolId: ToolId | null, requiredTool: ToolId | null): boolean => {
  if (!requiredTool) {
    return true;
  }

  const equippedTier = toolId ? PICKAXE_TIER[toolId] ?? 0 : 0;
  const requiredTier = PICKAXE_TIER[requiredTool] ?? Number.POSITIVE_INFINITY;
  return equippedTier >= requiredTier;
};

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
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.WoodenAxe]: {
    [TerrainFeatureType.Tree]: 1,
    [TerrainFeatureType.Cactus]: 1,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.StoneAxe]: {
    [TerrainFeatureType.Tree]: 2,
    [TerrainFeatureType.Cactus]: 2,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.IronAxe]: {
    [TerrainFeatureType.Tree]: 3,
    [TerrainFeatureType.Cactus]: 3,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.GoldAxe]: {
    [TerrainFeatureType.Tree]: 3.5,
    [TerrainFeatureType.Cactus]: 3.5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.DiamondAxe]: {
    [TerrainFeatureType.Tree]: 4.5,
    [TerrainFeatureType.Cactus]: 4.5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.WoodenPickaxe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: 1,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: 1,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.StonePickaxe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: 2,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: 2,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.IronPickaxe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: 3,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: 3,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.GoldPickaxe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: 3.5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: 3.5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.DiamondPickaxe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: 4.5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: 4.5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.WoodenHoe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: 1,
    [TerrainFeatureType.WaterReeds]: 1,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: 1
  },
  [ToolId.StoneHoe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: 2,
    [TerrainFeatureType.WaterReeds]: 2,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: 2
  },
  [ToolId.IronHoe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: 3,
    [TerrainFeatureType.WaterReeds]: 3,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: 3
  },
  [ToolId.GoldHoe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: 3.5,
    [TerrainFeatureType.WaterReeds]: 3.5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: 3.5
  },
  [ToolId.DiamondHoe]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: 4.5,
    [TerrainFeatureType.WaterReeds]: 4.5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: 4.5
  },
  [ToolId.WoodenSword]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.StoneSword]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.IronSword]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.GoldSword]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
    [TerrainFeatureType.Grass]: .5
  },
  [ToolId.DiamondSword]: {
    [TerrainFeatureType.Tree]: .5,
    [TerrainFeatureType.Cactus]: .5,
    [TerrainFeatureType.Rock]: .5,
    [TerrainFeatureType.Reeds]: .5,
    [TerrainFeatureType.WaterReeds]: .5,
    [TerrainFeatureType.SnowyRock]: .5,
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
  [ToolId.DiamondPickaxe]: 4.5,
  [ToolId.WoodenHoe]: .6,
  [ToolId.StoneHoe]: .6,
  [ToolId.IronHoe]: .6,
  [ToolId.GoldHoe]: .6,
  [ToolId.DiamondHoe]: .6,
  [ToolId.WoodenSword]: .5,
  [ToolId.StoneSword]: .5,
  [ToolId.IronSword]: .5,
  [ToolId.GoldSword]: .5,
  [ToolId.DiamondSword]: .5
};

export const harvestSpeedForFeature = (toolId: ToolId | null, feature: TerrainFeatureType): number =>
  HARVEST_SPEEDS[toolId ?? 'hand'][feature];

export const caveOreMiningSpeedForTool = (toolId: ToolId | null): number =>
  CAVE_ORE_MINING_SPEEDS[toolId ?? 'hand'];

export const peakHarvestSpeedForTool = (toolId: ToolId): number =>
  Math.max(...Object.values(HARVEST_SPEEDS[toolId]));

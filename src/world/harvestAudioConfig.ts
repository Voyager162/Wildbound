import { TOOL_DEFINITIONS, type ToolHeadMaterial, type ToolId } from '../crafting/toolConfig';
import type { CaveOreType } from './caves/caveOreGenerationConfig';
import { TerrainFeatureType } from './generation/featureGenerator';

export type HarvestSoundToolTier = 'hand' | ToolHeadMaterial;
type HarvestSoundContactCounts = Readonly<Record<HarvestSoundToolTier, number>>;

// Contact count is designer-facing audio data. Each feature has one value for every tool tier:
// 4 keeps a complete, deliberate phrase; 2 keeps a very fast tool from becoming a click train.
// Gameplay selects a material tier only when that equipped tool actually beats the hand speed for
// the target; an unsuitable diamond tool correctly uses the feature's `hand` count.
export const HARVEST_SOUND_CONTACT_COUNTS: Readonly<Record<TerrainFeatureType, HarvestSoundContactCounts>> = {
  [TerrainFeatureType.Tree]: { hand: 8, wood: 4, stone: 3, iron: 2, gold: 2, diamond: 2 },
  [TerrainFeatureType.Grass]: { hand: 6, wood: 4, stone: 3, iron: 2, gold: 2, diamond: 2 },
  [TerrainFeatureType.Reeds]: { hand: 4, wood: 4, stone: 3, iron: 2, gold: 2, diamond: 2 },
  [TerrainFeatureType.WaterReeds]: { hand: 4, wood: 4, stone: 3, iron: 2, gold: 2, diamond: 2 },
  [TerrainFeatureType.Cactus]: { hand: 8, wood: 4, stone: 3, iron: 2, gold: 2, diamond: 2 },
  [TerrainFeatureType.Rock]: { hand: 4, wood: 4, stone: 3, iron: 2, gold: 2, diamond: 2 },
  [TerrainFeatureType.SnowyRock]: { hand: 4, wood: 4, stone: 3, iron: 2, gold: 2, diamond: 2 }
};

export const harvestSoundContactCountFor = (feature: TerrainFeatureType, toolId: ToolId | null): number => {
  const tier: HarvestSoundToolTier = toolId ? TOOL_DEFINITIONS[toolId].headMaterial : 'hand';
  return HARVEST_SOUND_CONTACT_COUNTS[feature][tier];
};

// Recordings are never accelerated beyond this value, preserving their real material character.
export const GRASS_HARVEST_MAX_PLAYBACK_RATE = 1.45;
export const GRASS_HARVEST_RECORDING_VOLUME = 0.22;

export const GRASS_HARVEST_RECORDING_URL = new URL(
  '../../assets/audio/harvest/grass-harvest-loop.mp3',
  import.meta.url
).toString();

export const TREE_HARVEST_RECORDING_VOLUME = 0.4;

export const TREE_HARVEST_RECORDING_URL = new URL(
  '../../assets/audio/harvest/tree-harvest-thud.mp3',
  import.meta.url
).toString();

// Shared by exposed rock and snowy rock. Keeping the recording and volume here makes the stone
// contact independently tunable without changing the deterministic contact scheduling.
export const ROCK_HARVEST_RECORDING_VOLUME = 0.34;

export const ROCK_HARVEST_RECORDING_URL = new URL(
  '../../assets/audio/harvest/rock-harvest-thunk.wav',
  import.meta.url
).toString();

// Cave contacts are derived from the final mining duration, after both ore toughness and the
// actual equipped tool speed are applied. Harder ores use a slightly denser cadence, while the
// cap prevents very slow hand/incorrect-tool coal mining from becoming an endless repeated loop.
export const CAVE_ORE_HARVEST_SOUND_CADENCE_SECONDS: Readonly<Record<CaveOreType, number>> = {
  coal: 0.62,
  iron: 0.58,
  gold: 0.52,
  diamond: 0.48
};

export const CAVE_ORE_HARVEST_SOUND_MAX_CONTACTS = 6;

export const caveOreHarvestSoundContactCountFor = (ore: CaveOreType, durationMs: number): number =>
  Math.max(1, Math.min(
    CAVE_ORE_HARVEST_SOUND_MAX_CONTACTS,
    Math.round(Math.max(0, durationMs) / 1_000 / CAVE_ORE_HARVEST_SOUND_CADENCE_SECONDS[ore])
  ));

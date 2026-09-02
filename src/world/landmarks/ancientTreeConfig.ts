import { DAY_NIGHT_CYCLE_DURATION_MS } from '../explorationConfig';

// Change this one value to control the exact number of luminous fruit generated on every ancient
// tree. Their positions, colors, and subtle size variation remain deterministic from the world
// seed and landmark ID.
export const ANCIENT_TREE_FRUIT_COUNT = 24;

// Change this value to control ancient-tree canopy density. The multiplier scales both axes of
// the deterministic leaf field, so 0.5 gives roughly half as many leaves, 1 keeps the standard
// density, and 2 gives roughly twice as many. Runtime use is clamped from 0 (no leaves) through 3
// to protect frame rate if this tuning value is accidentally set extremely high.
export const ANCIENT_TREE_LEAF_DENSITY_MULTIPLIER = 2;

// Harvestable materials inside an ancient tree independently return after this many complete
// in-game day cycles. Each harvest gets a deterministic value within the range from the world
// seed, material ID, and harvest time, so save/load never rerolls the deadline.
export const ANCIENT_TREE_FEATURE_REGROWTH_MIN_DAYS = 2;
export const ANCIENT_TREE_FEATURE_REGROWTH_MAX_DAYS = 3;

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

export const ancientTreeFeatureRegrowthDelayMs = (
  worldSeed: string,
  materialId: string,
  harvestedAtWorldAgeMs: number
): number => {
  const random = hashString(
    `${worldSeed}\u0000${materialId}\u0000${Math.max(0, Math.floor(harvestedAtWorldAgeMs))}`
  ) / 4_294_967_296;
  const days = ANCIENT_TREE_FEATURE_REGROWTH_MIN_DAYS
    + random * (ANCIENT_TREE_FEATURE_REGROWTH_MAX_DAYS - ANCIENT_TREE_FEATURE_REGROWTH_MIN_DAYS);
  return Math.round(days * DAY_NIGHT_CYCLE_DURATION_MS);
};

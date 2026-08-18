// Interior cave-system controls. These only affect deterministic cave layouts; surface cave
// spawn probability remains in caveGenerationConfig.ts.
export const CAVE_SYSTEM_DEPTHS = ['shallow', 'medium', 'deep', 'abyssal'] as const;
export type CaveSystemDepth = (typeof CAVE_SYSTEM_DEPTHS)[number];

export interface CaveSystemProfile {
  readonly width: number;
  readonly height: number;
  readonly spineChambers: number;
  readonly branchChambers: number;
  readonly loopConnections: number;
  readonly lavaPoolChance: number;
}

// Compact caves remain intentionally uncommon. The other four fifths are progressively more
// extensive systems with a longer main descent and recursively branching side routes.
export const CAVE_SYSTEM_DEPTH_WEIGHTS: Readonly<Record<CaveSystemDepth, number>> = {
  shallow: 0.2,
  medium: 0.34,
  deep: 0.31,
  abyssal: 0.15
};

export const CAVE_SYSTEM_PROFILES: Readonly<Record<CaveSystemDepth, CaveSystemProfile>> = {
  shallow: { width: 70, height: 56, spineChambers: 8, branchChambers: 3, loopConnections: 1, lavaPoolChance: 0 },
  medium: { width: 150, height: 116, spineChambers: 23, branchChambers: 18, loopConnections: 7, lavaPoolChance: 0 },
  deep: { width: 230, height: 178, spineChambers: 43, branchChambers: 47, loopConnections: 16, lavaPoolChance: 0.12 },
  abyssal: { width: 300, height: 228, spineChambers: 66, branchChambers: 84, loopConnections: 28, lavaPoolChance: 0.78 }
};

// A secondary surface outlet is only available in non-compact cave systems. It is deliberately
// uncommon so finding one feels like discovering a true cross-country cave passage.
export const CAVE_LINKED_SYSTEM_CHANCE = 0.22;
export const CAVE_LINKED_SYSTEM_DISTANCE_TILES: readonly number[] = [42, 58, 76];

export const CAVE_LAVA_MINIMUM_NORMALIZED_DEPTH = 0.78;
export const CAVE_LAVA_MAX_POOLS = 3;
export const CAVE_STALAGMITE_MINIMUM_NORMALIZED_DEPTH = 0.54;
export const CAVE_STALAGMITE_CHANCE = 0.1;

// Bounds continuous contour work when generating massive systems. The cave is built once on
// entry, while movement remains a compact grid lookup.
export const CAVE_VISUAL_CONTOUR_TARGET_CELLS = 100_000;

// Interior cave-system controls. These only affect deterministic cave layouts; surface cave
// spawn probability remains in caveGenerationConfig.ts.
export const CAVE_SYSTEM_DEPTHS = ['shallow', 'medium', 'deep', 'abyssal'] as const;
export type CaveSystemDepth = (typeof CAVE_SYSTEM_DEPTHS)[number];

// Global cave scale. This deliberately has no upper cap: increasing it expands both each
// system's footprint and the amount of connected tunnel work it generates. Very large values
// naturally need more generation time and memory when a cave is entered.
export const CAVE_SYSTEM_SIZE_SCALE = 2.5;

// Geological thresholds below use this designer-facing depth scale rather than fractions.
// Set any start value from 1 (near an entrance) to 1000 (the deepest reachable passage).
export const CAVE_DEPTH_SCALE_MAX = 1000;

export interface CaveSystemProfile {
  readonly width: number;
  readonly height: number;
  readonly spineSegments: number;
  readonly branchSegments: number;
  readonly largeChambers: number;
  readonly loopConnections: number;
  readonly lavaPoolChance: number;
}

// Compact caves remain intentionally uncommon. The other four fifths are progressively more
// extensive trees of narrow passages. Large chambers are intentionally scarce landmarks,
// rather than the material from which the whole cave is built.
export const CAVE_SYSTEM_DEPTH_WEIGHTS: Readonly<Record<CaveSystemDepth, number>> = {
  shallow: .1,
  medium: .2,
  deep: .5,
  abyssal: .3
};

export const CAVE_SYSTEM_PROFILES: Readonly<Record<CaveSystemDepth, CaveSystemProfile>> = {
  shallow: { width: 70, height: 56, spineSegments: 10, branchSegments: 14, largeChambers: 2, loopConnections: 1, lavaPoolChance: 0 },
  medium: { width: 150, height: 116, spineSegments: 22, branchSegments: 42, largeChambers: 5, loopConnections: 7, lavaPoolChance: 0 },
  deep: { width: 230, height: 178, spineSegments: 35, branchSegments: 76, largeChambers: 9, loopConnections: 14, lavaPoolChance: 0.12 },
  abyssal: { width: 300, height: 228, spineSegments: 48, branchSegments: 120, largeChambers: 15, loopConnections: 24, lavaPoolChance: 0.78 }
};

// A secondary surface outlet is only available in non-compact cave systems. It is deliberately
// uncommon so finding one feels like discovering a true cross-country cave passage.
export const CAVE_LINKED_SYSTEM_CHANCE = 1;
export const CAVE_LINKED_SYSTEM_DISTANCE_TILES: readonly number[] = [42, 58, 76];

// Mineral formations begin well below the shallow cave strata; magma is reserved for the
// final reaches beyond them, so it is an expedition objective rather than an early landmark.
export const CAVE_STALAGMITE_START_DEPTH = 660;
export const CAVE_LAVA_START_DEPTH = 900;
export const CAVE_LAVA_MAX_POOLS = 3;
export const CAVE_STALAGMITE_CHANCE = 0.1;

// Bounds continuous contour work when generating massive systems. The cave is built once on
// entry, while movement remains a compact grid lookup.
export const CAVE_VISUAL_CONTOUR_TARGET_CELLS = 100_000;

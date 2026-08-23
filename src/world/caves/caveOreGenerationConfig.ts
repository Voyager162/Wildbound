// Public cave-ore controls. Set each start depth on the same 1–1000 scale as the interior
// generation settings, then adjust `chance` to tune frequency after that depth is reached.
// Values are evaluated deterministically from the world seed, so changing them affects newly
// generated layouts without adding run-to-run randomness.
export const CAVE_ORE_TYPES = ['coal', 'iron', 'gold', 'diamond'] as const;
export type CaveOreType = (typeof CAVE_ORE_TYPES)[number];

export interface CaveOreSpawnRule {
  readonly startDepth: number;
  readonly chance: number;
  readonly requiresDeepCave?: boolean;
}

export const CAVE_COAL_START_DEPTH = 80;
export const CAVE_IRON_START_DEPTH = 340;
export const CAVE_GOLD_START_DEPTH = 610;
export const CAVE_DIAMOND_START_DEPTH = 800;

export const CAVE_ORE_SPAWN_RULES: Readonly<Record<CaveOreType, CaveOreSpawnRule>> = {
  coal: { startDepth: CAVE_COAL_START_DEPTH, chance: 0.065 },
  iron: { startDepth: CAVE_IRON_START_DEPTH, chance: 0.065 },
  gold: { startDepth: CAVE_GOLD_START_DEPTH, chance: 0.036 },
  diamond: { startDepth: CAVE_DIAMOND_START_DEPTH, chance: 0.008, requiresDeepCave: true },
};

// Ores are intentionally limited to clear cave floor so mineral formations never paint over a
// wall face. Raise this to make deposits more common after the type-specific roll succeeds.
export const CAVE_ORE_FLOOR_PLACEMENT_CHANCE = 0.42;

// Keeps separately generated formations from crossing into one another. This is measured from
// their logical floor-tile anchors, preserving deterministic layouts without visual overlap.
export const CAVE_ORE_MIN_SEPARATION_TILES = 3;

export type CaveOreVeinStyle = 'thread' | 'seam' | 'pocket' | 'fan' | 'ribbon' | 'cluster';

// Each deposit deterministically selects one of these terrain-integrated forms. Keeping the
// options per mineral gives coal, iron, gold, and diamond recognisably different geology.
export const CAVE_ORE_VEIN_STYLES: Readonly<Record<CaveOreType, readonly CaveOreVeinStyle[]>> = {
  coal: ['thread', 'seam', 'pocket', 'cluster'],
  iron: ['seam', 'fan', 'cluster', 'ribbon'],
  gold: ['ribbon', 'pocket', 'fan', 'seam'],
  diamond: ['cluster', 'fan', 'ribbon'],
};

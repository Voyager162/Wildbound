// Public cave-ore controls. Raise or lower a `chance` value to change how frequently that ore
// attempts to generate once the player has reached the ore's minimum normalized cave depth.
// Values are evaluated deterministically from the world seed, so changing them affects newly
// generated layouts without adding run-to-run randomness.
export const CAVE_ORE_TYPES = ['coal', 'iron', 'gold', 'diamond'] as const;
export type CaveOreType = (typeof CAVE_ORE_TYPES)[number];

export interface CaveOreSpawnRule {
  readonly minimumNormalizedDepth: number;
  readonly chance: number;
  readonly requiresDeepCave?: boolean;
}

export const CAVE_ORE_SPAWN_RULES: Readonly<Record<CaveOreType, CaveOreSpawnRule>> = {
  coal: { minimumNormalizedDepth: 0.08, chance: 0.1 },
  iron: { minimumNormalizedDepth: 0.34, chance: 0.065 },
  gold: { minimumNormalizedDepth: 0.61, chance: 0.036 },
  diamond: { minimumNormalizedDepth: 0.79, chance: 0.018, requiresDeepCave: true },
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

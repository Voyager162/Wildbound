import type { CaveOreType } from './caveOreGenerationConfig';

export interface CaveOreYieldRange {
  readonly minimum: number;
  readonly maximum: number;
}

// Public ore-yield controls. Each mined deposit rolls one deterministic amount in its inclusive
// range, so the same seeded cave gives the same reward before and after saving/loading.
export const CAVE_ORE_YIELD_RANGES: Readonly<Record<CaveOreType, CaveOreYieldRange>> = {
  coal: { minimum: 1, maximum: 5 },
  iron: { minimum: 1, maximum: 3 },
  gold: { minimum: 1, maximum: 2 },
  diamond: { minimum: 1, maximum: 1 }
};

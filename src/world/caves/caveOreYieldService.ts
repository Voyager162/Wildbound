import { randomAtTile } from '../generation/noise';
import type { CaveOre } from './caveGenerator';
import { CAVE_ORE_YIELD_RANGES } from './caveOreYieldConfig';

const CAVE_ORE_YIELD_SALT = 71_241;

// Rewards are derived from stable cave-root and deposit coordinates instead of Math.random(),
// preserving the world's deterministic layout and making a save/load unable to reroll a vein.
export const caveOreYieldFor = (
  seed: string,
  caveRootTileX: number,
  caveRootTileY: number,
  ore: CaveOre
): number => {
  const range = CAVE_ORE_YIELD_RANGES[ore.type];
  const minimum = Math.max(1, Math.floor(range.minimum));
  const maximum = Math.max(minimum, Math.floor(range.maximum));
  const roll = randomAtTile(
    seed,
    caveRootTileX * 257 + ore.tileX,
    caveRootTileY * 263 + ore.tileY,
    CAVE_ORE_YIELD_SALT
  );
  return minimum + Math.floor(roll * (maximum - minimum + 1));
};

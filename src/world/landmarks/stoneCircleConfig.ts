import { DAY_NIGHT_CYCLE_DURATION_MS } from '../explorationConfig';

export const STONE_CIRCLE_RUNE_REGROWTH_MIN_DAYS = 2;
export const STONE_CIRCLE_RUNE_REGROWTH_MAX_DAYS = 3;

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

// The harvest age is part of the key, so each return time varies without ever rerolling during
// save/load. World age is monotonic even though the visible clock wraps every day.
export const stoneCircleRuneRegrowthDelayMs = (
  worldSeed: string,
  materialId: string,
  harvestedAtWorldAgeMs: number
): number => {
  const random = hashString(
    `${worldSeed}\u0000${materialId}\u0000${Math.max(0, Math.floor(harvestedAtWorldAgeMs))}`
  ) / 4_294_967_296;
  const days = STONE_CIRCLE_RUNE_REGROWTH_MIN_DAYS
    + random * (STONE_CIRCLE_RUNE_REGROWTH_MAX_DAYS - STONE_CIRCLE_RUNE_REGROWTH_MIN_DAYS);
  return Math.round(days * DAY_NIGHT_CYCLE_DURATION_MS);
};

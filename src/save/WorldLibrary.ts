// World summaries are intentionally small. The full mutable state for each world remains in its
// own save file, while this index is all the main menu needs to display a stable world list.
export type WorldMode = 'survival' | 'creative';

export const WORLD_MODES: readonly WorldMode[] = ['survival', 'creative'];

export const isWorldMode = (value: unknown): value is WorldMode =>
  typeof value === 'string' && WORLD_MODES.includes(value as WorldMode);

export interface WorldSummary {
  readonly id: string;
  readonly ordinal: number;
  readonly name: string;
  readonly seed: string;
  readonly mode: WorldMode;
}

export interface WorldSelection {
  readonly id: string;
  readonly seed: string;
  readonly mode: WorldMode;
}

export const MAX_WORLD_SEED_LENGTH = 80;
export const MAX_WORLD_NAME_LENGTH = 40;
export const DEFAULT_WORLD_NAME = 'New World';

export const isWorldName = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_WORLD_NAME_LENGTH;

export const isWorldSummary = (value: unknown): value is WorldSummary => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const world = value as Partial<WorldSummary>;
  return typeof world.id === 'string'
    && /^world-[1-9]\d*$/.test(world.id)
    && typeof world.ordinal === 'number'
    && Number.isInteger(world.ordinal)
    && world.ordinal > 0
    && isWorldName(world.name)
    && typeof world.seed === 'string'
    && world.seed.length > 0
    && world.seed.length <= MAX_WORLD_SEED_LENGTH
    && isWorldMode(world.mode);
};

export const isWorldSummaryList = (value: unknown): value is readonly WorldSummary[] =>
  Array.isArray(value) && value.every(isWorldSummary);

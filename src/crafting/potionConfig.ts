import { ResourceType } from '../world/resources';

// Potions are normal inventory items, while their recipes remain intentionally separate from
// the brewing UI. This lets players discover mixtures through experimentation without the menu
// advertising the answer, and keeps future potion additions data-only.
export enum PotionId {
  Haste = 'haste tonic',
  Swiftness = 'swiftness tonic',
  Might = 'might tonic',
  NightSight = 'night sight tonic'
}

export const POTION_IDS = Object.values(PotionId) as PotionId[];

export const isPotionId = (value: unknown): value is PotionId =>
  typeof value === 'string' && POTION_IDS.includes(value as PotionId);

export type PotionEffect = 'haste' | 'speed' | 'strength' | 'nightSight';

export const POTION_EFFECTS: readonly PotionEffect[] = ['haste', 'speed', 'strength', 'nightSight'];

export const isPotionEffect = (value: unknown): value is PotionEffect =>
  typeof value === 'string' && POTION_EFFECTS.includes(value as PotionEffect);

export interface PotionDefinition {
  readonly id: PotionId;
  readonly label: string;
  // Compact text stamped directly onto its bottle and used by the active-effect badge.
  readonly shortLabel: string;
  readonly effect: PotionEffect;
  readonly durationMs: number;
  readonly brewDurationMs: number;
  readonly color: number;
  readonly detail: string;
}

export const POTION_DEFINITIONS: Readonly<Record<PotionId, PotionDefinition>> = {
  [PotionId.Haste]: {
    id: PotionId.Haste,
    label: 'Haste Tonic',
    shortLabel: 'Haste',
    effect: 'haste',
    durationMs: 120_000,
    brewDurationMs: 30_000,
    color: 0xf0bd48,
    detail: 'Your hands move with renewed purpose.'
  },
  [PotionId.Swiftness]: {
    id: PotionId.Swiftness,
    label: 'Swiftness Tonic',
    shortLabel: 'Speed',
    effect: 'speed',
    durationMs: 120_000,
    brewDurationMs: 38_000,
    color: 0x64cce1,
    detail: 'A bright current carries each step.'
  },
  [PotionId.Might]: {
    id: PotionId.Might,
    label: 'Might Tonic',
    shortLabel: 'Might',
    effect: 'strength',
    durationMs: 150_000,
    brewDurationMs: 48_000,
    color: 0xd96b57,
    detail: 'A steady strength settles into your arms.'
  },
  [PotionId.NightSight]: {
    id: PotionId.NightSight,
    label: 'Night Sight Tonic',
    shortLabel: 'Night',
    effect: 'nightSight',
    durationMs: 180_000,
    brewDurationMs: 60_000,
    color: 0x9d81e8,
    detail: 'The darkness seems less certain of itself.'
  }
};

export interface BrewingRecipe {
  readonly ingredients: readonly [ResourceType, ResourceType];
  readonly output: PotionId;
}

// Do not surface this table in the UI: it is deliberately the station's private matching data.
// The pairs are unordered, so dragging the same two materials into opposite ingredient slots
// always starts the same deterministic brew.
export const BREWING_RECIPES: readonly BrewingRecipe[] = [
  { ingredients: [ResourceType.Coal, ResourceType.Fiber], output: PotionId.Haste },
  { ingredients: [ResourceType.Cactus, ResourceType.Fiber], output: PotionId.Swiftness },
  { ingredients: [ResourceType.Iron, ResourceType.Cactus], output: PotionId.Might },
  { ingredients: [ResourceType.Diamond, ResourceType.Coal], output: PotionId.NightSight }
];

export const potionForIngredients = (
  first: ResourceType,
  second: ResourceType
): PotionDefinition | null => {
  const recipe = BREWING_RECIPES.find(({ ingredients }) =>
    (ingredients[0] === first && ingredients[1] === second)
    || (ingredients[0] === second && ingredients[1] === first)
  );
  return recipe ? POTION_DEFINITIONS[recipe.output] : null;
};

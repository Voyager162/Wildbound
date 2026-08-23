import { ResourceType } from '../world/resources';

export interface FurnaceRecipe {
  readonly input: ResourceType;
  readonly output: ResourceType;
  readonly durationMs: number;
}

// Furnace inputs and its refined-material output intentionally use the same compact capacity as
// the rest of the inventory. A full load is processed sequentially, never all at once.
export const FURNACE_SLOT_STACK_LIMIT = 10;
export const FURNACE_REFINE_DURATION_MS = 20_000;

// One coal powers one refining job. Diamond intentionally has no entry: it is already a usable
// rare material when mined, while iron and gold gain distinct refined ingot forms.
export const FURNACE_RECIPES: readonly FurnaceRecipe[] = [
  { input: ResourceType.Iron, output: ResourceType.IronIngot, durationMs: FURNACE_REFINE_DURATION_MS },
  { input: ResourceType.Gold, output: ResourceType.GoldIngot, durationMs: FURNACE_REFINE_DURATION_MS }
];

export const furnaceRecipeFor = (input: ResourceType): FurnaceRecipe | null =>
  FURNACE_RECIPES.find((recipe) => recipe.input === input) ?? null;

export const furnaceRecipeForOutput = (output: ResourceType): FurnaceRecipe | null =>
  FURNACE_RECIPES.find((recipe) => recipe.output === output) ?? null;

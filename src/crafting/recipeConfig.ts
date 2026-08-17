import { ResourceType } from '../world/resources';
import { ToolId } from './toolConfig';

export interface RecipeIngredient {
  resource: ResourceType;
  amount: number;
}

export interface CraftingRecipe {
  id: ToolId;
  output: ToolId;
  ingredients: readonly RecipeIngredient[];
}

// Recipes are immutable data so the UI, crafting rules, and future stations can all share them.
export const CRAFTING_RECIPES: readonly CraftingRecipe[] = [
  {
    id: ToolId.WoodenAxe,
    output: ToolId.WoodenAxe,
    ingredients: [
      { resource: ResourceType.Wood, amount: 3 },
      { resource: ResourceType.Fiber, amount: 2 }
    ]
  },
  {
    id: ToolId.StoneAxe,
    output: ToolId.StoneAxe,
    ingredients: [
      { resource: ResourceType.Wood, amount: 2 },
      { resource: ResourceType.Stone, amount: 3 },
      { resource: ResourceType.Fiber, amount: 2 }
    ]
  },
  {
    id: ToolId.WoodenPickaxe,
    output: ToolId.WoodenPickaxe,
    ingredients: [
      { resource: ResourceType.Wood, amount: 3 },
      { resource: ResourceType.Fiber, amount: 2 }
    ]
  },
  {
    id: ToolId.StonePickaxe,
    output: ToolId.StonePickaxe,
    ingredients: [
      { resource: ResourceType.Wood, amount: 2 },
      { resource: ResourceType.Stone, amount: 3 },
      { resource: ResourceType.Fiber, amount: 2 }
    ]
  }
];

export const recipeFor = (id: ToolId): CraftingRecipe | undefined =>
  CRAFTING_RECIPES.find((recipe) => recipe.id === id);

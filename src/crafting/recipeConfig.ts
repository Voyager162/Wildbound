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
    id: ToolId.IronAxe,
    output: ToolId.IronAxe,
    ingredients: [
      { resource: ResourceType.Wood, amount: 2 },
      { resource: ResourceType.Iron, amount: 3 },
      { resource: ResourceType.Fiber, amount: 2 }
    ]
  },
  {
    id: ToolId.GoldAxe,
    output: ToolId.GoldAxe,
    ingredients: [
      { resource: ResourceType.Wood, amount: 2 },
      { resource: ResourceType.Gold, amount: 3 },
      { resource: ResourceType.Fiber, amount: 2 }
    ]
  },
  {
    id: ToolId.DiamondAxe,
    output: ToolId.DiamondAxe,
    ingredients: [
      { resource: ResourceType.Wood, amount: 2 },
      { resource: ResourceType.Diamond, amount: 3 },
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
  },
  {
    id: ToolId.IronPickaxe,
    output: ToolId.IronPickaxe,
    ingredients: [
      { resource: ResourceType.Wood, amount: 2 },
      { resource: ResourceType.Iron, amount: 3 },
      { resource: ResourceType.Fiber, amount: 2 }
    ]
  },
  {
    id: ToolId.GoldPickaxe,
    output: ToolId.GoldPickaxe,
    ingredients: [
      { resource: ResourceType.Wood, amount: 2 },
      { resource: ResourceType.Gold, amount: 3 },
      { resource: ResourceType.Fiber, amount: 2 }
    ]
  },
  {
    id: ToolId.DiamondPickaxe,
    output: ToolId.DiamondPickaxe,
    ingredients: [
      { resource: ResourceType.Wood, amount: 2 },
      { resource: ResourceType.Diamond, amount: 3 },
      { resource: ResourceType.Fiber, amount: 2 }
    ]
  }
];

export const recipeFor = (id: ToolId): CraftingRecipe | undefined =>
  CRAFTING_RECIPES.find((recipe) => recipe.id === id);

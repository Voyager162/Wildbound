import type { Inventory } from '../player/Inventory';
import type { CraftingRecipe } from './recipeConfig';

export type CraftResult = 'crafted' | 'missing-ingredients' | 'inventory-full';

export const canCraftRecipe = (inventory: Inventory, recipe: CraftingRecipe): boolean =>
  recipe.ingredients.every((ingredient) => inventory.get(ingredient.resource) >= ingredient.amount)
  && inventory.canAdd(recipe.output, 1);

// This intentionally owns the atomic inventory mutation. Rendering layers only ask to craft a
// recipe, and world generation never needs to know about tool creation or resource costs.
export const craftRecipe = (inventory: Inventory, recipe: CraftingRecipe): CraftResult => {
  if (!recipe.ingredients.every((ingredient) => inventory.get(ingredient.resource) >= ingredient.amount)) {
    return 'missing-ingredients';
  }
  if (!inventory.canAdd(recipe.output, 1)) {
    return 'inventory-full';
  }

  recipe.ingredients.forEach((ingredient) => inventory.remove(ingredient.resource, ingredient.amount));
  inventory.add(recipe.output, 1);
  return 'crafted';
};

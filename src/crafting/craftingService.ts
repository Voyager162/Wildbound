import type { Inventory } from '../player/Inventory';
import type { CraftingRecipe } from './recipeConfig';

export type CraftResult = 'crafted' | 'missing-ingredients' | 'inventory-full';

export const canCraftRecipe = (inventory: Inventory, recipe: CraftingRecipe): boolean =>
  recipe.ingredients.every((ingredient) => inventory.get(ingredient.resource) >= ingredient.amount);

// This intentionally owns the atomic inventory mutation. Rendering layers only ask to craft a
// recipe, and world generation never needs to know about tool creation or resource costs.
export const craftRecipe = (inventory: Inventory, recipe: CraftingRecipe): CraftResult => {
  if (!canCraftRecipe(inventory, recipe)) {
    return 'missing-ingredients';
  }
  if (!inventory.canAdd(recipe.output, 1)) {
    return 'inventory-full';
  }

  recipe.ingredients.forEach((ingredient) => inventory.remove(ingredient.resource, ingredient.amount));
  inventory.add(recipe.output, 1);
  return 'crafted';
};

// The combined inventory/crafting UI keeps the finished tool under the cursor until the player
// chooses an inventory slot. This keeps the resource cost and the destination assignment as one
// atomic action rather than allowing a transient crafted item to be lost on save/load.
export const craftRecipeIntoSlot = (
  inventory: Inventory,
  recipe: CraftingRecipe,
  destinationIndex: number
): CraftResult => {
  if (!canCraftRecipe(inventory, recipe)) {
    return 'missing-ingredients';
  }
  if (!inventory.canPlaceInSlot(destinationIndex, recipe.output, 1)) {
    return 'inventory-full';
  }

  recipe.ingredients.forEach((ingredient) => inventory.remove(ingredient.resource, ingredient.amount));
  if (!inventory.placeInSlot(destinationIndex, recipe.output, 1)) {
    // `canPlaceInSlot` above and resource-only removals make this unreachable. Keep the guard so
    // future inventory changes cannot silently consume ingredients without yielding the tool.
    throw new Error('Crafting destination changed unexpectedly.');
  }
  return 'crafted';
};

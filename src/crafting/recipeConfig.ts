import { ResourceType } from '../world/resources';
import { type CraftableOutputId, type CraftingCategoryId, PlaceableId } from './placeableConfig';
import { TOOL_DEFINITIONS, type ToolHeadMaterial, type ToolKind } from './toolConfig';

export interface RecipeIngredient {
  readonly resource: ResourceType;
  readonly amount: number;
}

export interface CraftingRecipe {
  readonly id: CraftableOutputId;
  readonly output: CraftableOutputId;
  readonly category: CraftingCategoryId;
  readonly ingredients: readonly RecipeIngredient[];
}

const recipe = (
  output: CraftableOutputId,
  category: CraftingCategoryId,
  ingredients: readonly RecipeIngredient[]
): CraftingRecipe => ({ id: output, output, category, ingredients });

const toolIngredients = (material: ToolHeadMaterial, kind: ToolKind): readonly RecipeIngredient[] => {
  const materialIngredient = (resource: ResourceType, amount: number): readonly RecipeIngredient[] => [
    { resource: ResourceType.Wood, amount: 2 },
    { resource, amount },
    { resource: ResourceType.Fiber, amount: kind === 'sword' ? 3 : 2 }
  ];
  switch (material) {
    case 'wood':
      return [
        { resource: ResourceType.Wood, amount: kind === 'sword' ? 4 : 3 },
        { resource: ResourceType.Fiber, amount: kind === 'sword' ? 3 : 2 }
      ];
    case 'stone':
      return materialIngredient(ResourceType.Stone, kind === 'sword' ? 4 : 3);
    case 'iron':
      return materialIngredient(ResourceType.IronIngot, kind === 'sword' ? 4 : 3);
    case 'gold':
      return materialIngredient(ResourceType.GoldIngot, kind === 'sword' ? 4 : 3);
    case 'diamond':
      return materialIngredient(ResourceType.Diamond, kind === 'sword' ? 4 : 3);
  }
};

// Recipes are immutable data. The drawer, crafting rules, and later station upgrades all read
// this single list; adding a future item only needs an entry here plus its item definition.
const TOOL_RECIPES: readonly CraftingRecipe[] = Object.values(TOOL_DEFINITIONS).map((tool) =>
  recipe(tool.id, 'tools', toolIngredients(tool.headMaterial, tool.kind))
);

export const CRAFTING_RECIPES: readonly CraftingRecipe[] = [
  ...TOOL_RECIPES,
  recipe(PlaceableId.TrailLantern, 'items', [
    { resource: ResourceType.Wood, amount: 4 },
    { resource: ResourceType.Coal, amount: 3 },
    { resource: ResourceType.IronIngot, amount: 1 }
  ]),
  recipe(PlaceableId.Waypoint, 'items', [
    { resource: ResourceType.Wood, amount: 8 },
    { resource: ResourceType.Stone, amount: 8 },
    { resource: ResourceType.GoldIngot, amount: 1 }
  ]),
  recipe(PlaceableId.TravelStone, 'items', [
    { resource: ResourceType.Stone, amount: 24 },
    { resource: ResourceType.GoldIngot, amount: 4 },
    { resource: ResourceType.Diamond, amount: 1 }
  ]),
  recipe(PlaceableId.Workbench, 'workstations', [
    { resource: ResourceType.Wood, amount: 12 },
    { resource: ResourceType.Fiber, amount: 6 }
  ]),
  recipe(PlaceableId.Furnace, 'workstations', [
    { resource: ResourceType.Stone, amount: 18 },
    { resource: ResourceType.Coal, amount: 4 }
  ]),
  recipe(PlaceableId.UpgradeTable, 'workstations', [
    { resource: ResourceType.Wood, amount: 12 },
    { resource: ResourceType.Stone, amount: 12 },
    { resource: ResourceType.IronIngot, amount: 4 }
  ]),
  recipe(PlaceableId.BrewingStation, 'workstations', [
    { resource: ResourceType.Stone, amount: 10 },
    { resource: ResourceType.IronIngot, amount: 4 },
    { resource: ResourceType.Fiber, amount: 6 }
  ]),
  recipe(PlaceableId.Anvil, 'workstations', [
    { resource: ResourceType.IronIngot, amount: 10 },
    { resource: ResourceType.Stone, amount: 8 }
  ]),
  recipe(PlaceableId.SmallChest, 'storage', [
    { resource: ResourceType.Wood, amount: 14 },
    { resource: ResourceType.Fiber, amount: 4 }
  ]),
  recipe(PlaceableId.ReinforcedChest, 'storage', [
    { resource: ResourceType.Wood, amount: 12 },
    { resource: ResourceType.IronIngot, amount: 8 }
  ]),
  recipe(PlaceableId.DiamondVault, 'storage', [
    { resource: ResourceType.Stone, amount: 18 },
    { resource: ResourceType.GoldIngot, amount: 6 },
    { resource: ResourceType.Diamond, amount: 6 }
  ]),
  recipe(PlaceableId.Campfire, 'housing', [
    { resource: ResourceType.Wood, amount: 6 },
    { resource: ResourceType.Stone, amount: 8 }
  ]),
  recipe(PlaceableId.WoodenShelter, 'housing', [
    { resource: ResourceType.Wood, amount: 32 },
    { resource: ResourceType.Fiber, amount: 16 }
  ]),
  recipe(PlaceableId.StoneShelter, 'housing', [
    { resource: ResourceType.Wood, amount: 24 },
    { resource: ResourceType.Stone, amount: 32 },
    { resource: ResourceType.IronIngot, amount: 4 }
  ])
];

export const recipeFor = (id: CraftableOutputId): CraftingRecipe | undefined =>
  CRAFTING_RECIPES.find((entry) => entry.id === id);

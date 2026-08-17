import { CRAFTING_RECIPES, type CraftingRecipe } from '../crafting/recipeConfig';
import { TOOL_DEFINITIONS } from '../crafting/toolConfig';
import { peakHarvestSpeedForTool } from '../crafting/harvestSpeedConfig';
import type { Inventory } from '../player/Inventory';
import { resourceLabel } from '../world/resources';

export class CraftingOverlay {
  private readonly element: HTMLDivElement;
  private readonly recipes: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly inventory: Inventory,
    private readonly onCraft: (recipe: CraftingRecipe) => boolean
  ) {
    this.element = document.createElement('div');
    this.element.className = 'crafting-overlay';
    this.element.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('section');
    panel.className = 'crafting-panel';
    panel.setAttribute('aria-label', 'Crafting');

    const title = document.createElement('div');
    title.className = 'crafting-title';
    title.textContent = 'Crafting';
    const hint = document.createElement('span');
    hint.textContent = 'C to close';
    title.append(hint);

    const description = document.createElement('p');
    description.className = 'crafting-description';
    description.textContent = 'Craft a tool, then place it in quick access and select it to equip.';

    this.recipes = document.createElement('div');
    this.recipes.className = 'crafting-recipes';
    panel.append(title, description, this.recipes);
    this.element.append(panel);
    parent.append(this.element);
    this.render();
  }

  setOpen(open: boolean): void {
    this.element.classList.toggle('is-open', open);
    this.element.setAttribute('aria-hidden', String(!open));
    if (open) {
      this.render();
    }
  }

  refresh(): void {
    this.render();
  }

  destroy(): void {
    this.element.remove();
  }

  private render(): void {
    this.recipes.replaceChildren(...CRAFTING_RECIPES.map((recipe) => this.createRecipe(recipe)));
  }

  private createRecipe(recipe: CraftingRecipe): HTMLButtonElement {
    const canCraft = recipe.ingredients.every((ingredient) => this.inventory.get(ingredient.resource) >= ingredient.amount)
      && this.inventory.canAdd(recipe.output, 1);
    const tool = TOOL_DEFINITIONS[recipe.output];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crafting-recipe';
    button.disabled = !canCraft;
    button.setAttribute('aria-label', `Craft ${tool.label}`);

    const icon = document.createElement('span');
    icon.className = `tool-icon tool-icon--${tool.kind} tool-icon--${tool.headMaterial}`;
    icon.setAttribute('aria-hidden', 'true');

    const details = document.createElement('span');
    details.className = 'crafting-recipe__details';
    const label = document.createElement('strong');
    label.textContent = tool.label;
    const speed = document.createElement('small');
    speed.textContent = `Up to ${peakHarvestSpeedForTool(tool.id).toFixed(2)}× harvest speed`;
    const ingredients = document.createElement('span');
    ingredients.className = 'crafting-recipe__ingredients';
    ingredients.textContent = recipe.ingredients.map((ingredient) => {
      const available = this.inventory.get(ingredient.resource);
      return `${resourceLabel(ingredient.resource)} ${available}/${ingredient.amount}`;
    }).join(' · ');
    details.append(label, speed, ingredients);
    button.append(icon, details);
    button.addEventListener('click', () => {
      if (this.onCraft(recipe)) {
        this.render();
      }
    });
    return button;
  }
}

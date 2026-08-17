import { TOOL_DEFINITIONS, isToolId, type ToolId } from '../crafting/toolConfig';
import { peakHarvestSpeedForTool } from '../crafting/harvestSpeedConfig';
import { CRAFTING_RECIPES, type CraftingRecipe } from '../crafting/recipeConfig';
import { HOTBAR_SLOT_COUNT, type Inventory, type InventoryItem, type InventorySlot } from '../player/Inventory';
import { resourceLabel } from '../world/resources';

export class InventoryOverlay {
  private readonly element: HTMLDivElement;
  private readonly panel: HTMLElement;
  private readonly titleLabel: HTMLSpanElement;
  private readonly titleHint: HTMLSpanElement;
  private readonly hotbar: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly inventoryContent: HTMLDivElement;
  private readonly crafting: HTMLDivElement;
  private craftingOpen = false;
  private draggingIndex: number | null = null;
  private dragSourceSlot: HTMLButtonElement | null = null;
  private dragItemElement: HTMLDivElement | null = null;
  private activePointerId: number | null = null;
  private dragOriginX = 0;
  private dragOriginY = 0;
  private dragGrabOffsetX = 0;
  private dragGrabOffsetY = 0;
  private dragHasMoved = false;

  constructor(
    parent: HTMLElement,
    private readonly inventory: Inventory,
    private readonly onChanged: () => void,
    private readonly onDropOutside: (slot: InventorySlot) => void,
    private readonly equippedTool: () => ToolId | null,
    private readonly onEquipTool: (tool: ToolId | null) => void,
    private readonly onCraft: (recipe: CraftingRecipe) => boolean
  ) {
    this.element = document.createElement('div');
    this.element.className = 'inventory-overlay';
    this.element.setAttribute('aria-hidden', 'true');

    this.panel = document.createElement('section');
    this.panel.className = 'inventory-panel';
    this.panel.setAttribute('aria-label', 'Inventory');

    const title = document.createElement('div');
    title.className = 'inventory-title';
    this.titleLabel = document.createElement('span');
    this.titleLabel.className = 'inventory-title__label';
    this.titleLabel.textContent = 'Inventory';
    this.titleHint = document.createElement('span');
    this.titleHint.className = 'inventory-title__hint';
    title.append(this.titleLabel, this.titleHint);

    const equipped = document.createElement('div');
    equipped.className = 'inventory-equipped';
    this.panel.append(title, equipped);

    this.inventoryContent = document.createElement('div');
    this.inventoryContent.className = 'inventory-content';
    const hotbarLabel = document.createElement('div');
    hotbarLabel.className = 'inventory-hotbar-label';
    hotbarLabel.textContent = 'Quick access';
    this.hotbar = document.createElement('div');
    this.hotbar.className = 'inventory-hotbar';
    this.grid = document.createElement('div');
    this.grid.className = 'inventory-grid';
    this.inventoryContent.append(hotbarLabel, this.hotbar, this.grid);

    this.crafting = document.createElement('div');
    this.crafting.className = 'inventory-crafting';
    this.panel.append(this.inventoryContent, this.crafting);
    this.element.append(this.panel);
    parent.append(this.element);
    this.render();
  }

  setOpen(open: boolean): void {
    if (!open) {
      this.cancelDrag();
    }

    this.element.classList.toggle('is-open', open);
    this.element.setAttribute('aria-hidden', String(!open));

    if (open) {
      this.render();
    }
  }

  setCraftingOpen(open: boolean): void {
    if (this.craftingOpen === open) {
      return;
    }

    this.cancelDrag();
    this.craftingOpen = open;
    this.panel.classList.toggle('is-crafting', open);
    this.panel.setAttribute('aria-label', open ? 'Crafting in inventory' : 'Inventory');
    this.render();
  }

  destroy(): void {
    this.cancelDrag();
    this.element.remove();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.grid.replaceChildren();
    this.hotbar.replaceChildren();
    this.titleLabel.textContent = this.craftingOpen ? 'Crafting' : 'Inventory';
    this.titleHint.textContent = this.craftingOpen ? 'C inventory · E close' : 'C crafting · E close';
    const equippedLabel = this.element.querySelector<HTMLElement>('.inventory-equipped');
    const equipped = this.equippedTool();
    if (equippedLabel) {
      equippedLabel.textContent = equipped ? `Equipped: ${TOOL_DEFINITIONS[equipped].label}` : 'Equipped: None';
    }

    this.inventory.getSlots().forEach((slot, index) => {
      const slotElement = this.createSlot(index, slot, equipped);
      (index < HOTBAR_SLOT_COUNT ? this.hotbar : this.grid).append(slotElement);
    });

    this.crafting.replaceChildren();
    if (this.craftingOpen) {
      const description = document.createElement('p');
      description.className = 'inventory-crafting__description';
      description.textContent = 'Craft tools using resources from this inventory.';
      const recipes = document.createElement('div');
      recipes.className = 'inventory-crafting__recipes';
      recipes.append(...CRAFTING_RECIPES.map((recipe) => this.createRecipe(recipe)));
      this.crafting.append(description, recipes);
    }
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

  private createSlot(index: number, slot: InventorySlot | null, equipped: ToolId | null): HTMLButtonElement {
    const slotElement = document.createElement('button');
    slotElement.type = 'button';
    slotElement.className = 'inventory-slot';
    slotElement.dataset.inventorySlot = String(index);
    slotElement.setAttribute('aria-label', slot ? `${this.itemLabel(slot.item)}, ${slot.amount}` : 'Empty inventory slot');

    const indexLabel = document.createElement('span');
    indexLabel.className = 'inventory-slot__key';
    indexLabel.textContent = String(index + 1);
    slotElement.append(indexLabel);

    if (slot) {
      const itemElement = document.createElement('div');
      itemElement.className = 'inventory-item';
      itemElement.append(this.createItemIcon(slot.item));
      if (!isToolId(slot.item)) {
        const amount = document.createElement('span');
        amount.className = 'inventory-slot__amount';
        amount.textContent = String(slot.amount);
        itemElement.append(amount);
      }
      slotElement.append(itemElement);
      if (slot.item === equipped) {
        slotElement.classList.add('is-equipped');
      }
    }

    slotElement.addEventListener('pointerdown', (event) => this.beginDrag(event, index, slotElement));
    return slotElement;
  }

  private beginDrag(event: PointerEvent, slotIndex: number, sourceSlot: HTMLButtonElement): void {
    const slot = this.inventory.getSlots()[slotIndex];
    const itemElement = sourceSlot.querySelector<HTMLDivElement>('.inventory-item');
    if (!slot || !itemElement || event.button !== 0 || this.draggingIndex !== null) {
      return;
    }

    event.preventDefault();
    const rect = itemElement.getBoundingClientRect();
    this.draggingIndex = slotIndex;
    this.dragSourceSlot = sourceSlot;
    this.dragItemElement = itemElement;
    this.activePointerId = event.pointerId;
    this.dragOriginX = rect.left;
    this.dragOriginY = rect.top;
    this.dragGrabOffsetX = event.clientX - rect.left;
    this.dragGrabOffsetY = event.clientY - rect.top;
    this.dragHasMoved = false;

    sourceSlot.setPointerCapture(event.pointerId);
    sourceSlot.classList.add('is-dragging');
    itemElement.style.width = `${Math.round(rect.width)}px`;
    itemElement.style.height = `${Math.round(rect.height)}px`;
    itemElement.style.zIndex = '100';
    itemElement.style.pointerEvents = 'none';
    itemElement.style.willChange = 'transform';
    this.positionDraggedItem(event.clientX, event.clientY);

    document.addEventListener('pointermove', this.handlePointerMove, true);
    document.addEventListener('pointerup', this.handlePointerUp, true);
    document.addEventListener('pointercancel', this.handlePointerCancel, true);
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.activePointerId) {
      this.dragHasMoved = this.dragHasMoved
        || Math.abs(event.clientX - (this.dragOriginX + this.dragGrabOffsetX)) > 5
        || Math.abs(event.clientY - (this.dragOriginY + this.dragGrabOffsetY)) > 5;
      this.positionDraggedItem(event.clientX, event.clientY);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    const sourceIndex = this.draggingIndex;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-inventory-slot]');
    const targetIndex = target ? Number(target.dataset.inventorySlot) : Number.NaN;
    let changed = false;

    if (sourceIndex !== null && targetIndex === sourceIndex && !this.dragHasMoved) {
      const slot = this.inventory.getSlots()[sourceIndex];
      if (slot && isToolId(slot.item)) {
        this.onEquipTool(this.equippedTool() === slot.item ? null : slot.item);
        changed = true;
      }
    } else if (sourceIndex !== null && Number.isInteger(targetIndex)) {
      changed = this.inventory.moveSlot(sourceIndex, targetIndex);
    } else if (sourceIndex !== null) {
      const sourceSlot = this.inventory.getSlots()[sourceIndex];
      // World drops are resource entities today. Keep tools safely in the inventory rather than
      // discarding them while that future drop representation does not exist yet.
      const dropped = sourceSlot && !isToolId(sourceSlot.item) ? this.inventory.takeSlot(sourceIndex) : null;
      if (dropped) {
        this.onDropOutside(dropped);
        changed = true;
      }
    }

    this.cancelDrag();
    if (changed) {
      this.onChanged();
      this.render();
    }
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.activePointerId) {
      this.cancelDrag();
      this.render();
    }
  };

  private cancelDrag(): void {
    document.removeEventListener('pointermove', this.handlePointerMove, true);
    document.removeEventListener('pointerup', this.handlePointerUp, true);
    document.removeEventListener('pointercancel', this.handlePointerCancel, true);
    if (this.dragSourceSlot && this.activePointerId !== null && this.dragSourceSlot.hasPointerCapture(this.activePointerId)) {
      this.dragSourceSlot.releasePointerCapture(this.activePointerId);
    }

    this.dragSourceSlot?.classList.remove('is-dragging');
    if (this.dragItemElement) {
      this.dragItemElement.style.removeProperty('width');
      this.dragItemElement.style.removeProperty('height');
      this.dragItemElement.style.removeProperty('z-index');
      this.dragItemElement.style.removeProperty('pointer-events');
      this.dragItemElement.style.removeProperty('transform');
      this.dragItemElement.style.removeProperty('will-change');
    }

    this.dragSourceSlot = null;
    this.dragItemElement = null;
    this.draggingIndex = null;
    this.activePointerId = null;
    this.dragOriginX = 0;
    this.dragOriginY = 0;
    this.dragGrabOffsetX = 0;
    this.dragGrabOffsetY = 0;
    this.dragHasMoved = false;
  }

  private positionDraggedItem(clientX: number, clientY: number): void {
    if (!this.dragItemElement) {
      return;
    }

    const x = clientX - this.dragGrabOffsetX - this.dragOriginX;
    const y = clientY - this.dragGrabOffsetY - this.dragOriginY;
    this.dragItemElement.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) scale(1.12)`;
  }

  private itemLabel(item: InventoryItem): string {
    return isToolId(item) ? TOOL_DEFINITIONS[item].label : resourceLabel(item);
  }

  private createItemIcon(item: InventoryItem): HTMLSpanElement {
    const icon = document.createElement('span');
    if (isToolId(item)) {
      const tool = TOOL_DEFINITIONS[item];
      icon.className = `tool-icon tool-icon--${tool.kind} tool-icon--${tool.headMaterial}`;
    } else {
      icon.className = `resource-icon resource-icon--${item.replaceAll(' ', '-')}`;
    }
    icon.setAttribute('aria-hidden', 'true');
    const detail = document.createElement('span');
    detail.className = 'resource-icon__detail';
    icon.append(detail);
    return icon;
  }
}

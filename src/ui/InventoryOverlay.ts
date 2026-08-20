import { TOOL_DEFINITIONS, isToolId, type ToolId, type ToolKind } from '../crafting/toolConfig';
import { peakHarvestSpeedForTool } from '../crafting/harvestSpeedConfig';
import { CRAFTING_RECIPES, type CraftingRecipe } from '../crafting/recipeConfig';
import { HOTBAR_SLOT_COUNT, type Inventory, type InventoryItem, type InventorySlot } from '../player/Inventory';
import { resourceLabel } from '../world/resources';

interface ToolCategory {
  readonly kind: ToolKind;
  readonly label: string;
  readonly description: string;
}

const TOOL_CATEGORIES: readonly ToolCategory[] = [
  { kind: 'axe', label: 'Axes', description: 'Fell trees, shrubs, and cacti faster.' },
  { kind: 'pickaxe', label: 'Pickaxes', description: 'Mine stone and ore features faster.' }
];

export class InventoryOverlay {
  private readonly element: HTMLDivElement;
  private readonly panel: HTMLElement;
  private readonly titleLabel: HTMLSpanElement;
  private readonly titleHint: HTMLSpanElement;
  private readonly hotbar: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly crafting: HTMLElement;
  private selectedToolKind: ToolKind | null = null;
  private pendingCraft: CraftingRecipe | null = null;
  private draggingIndex: number | null = null;
  private draggingCraftOutput = false;
  private dragSourceSlot: HTMLElement | null = null;
  private dragItemElement: HTMLElement | null = null;
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
    private readonly onClaimCraft: (recipe: CraftingRecipe, destinationIndex: number) => boolean
  ) {
    this.element = document.createElement('div');
    this.element.className = 'inventory-overlay';
    this.element.setAttribute('aria-hidden', 'true');

    this.panel = document.createElement('section');
    this.panel.className = 'inventory-panel';
    this.panel.setAttribute('aria-label', 'Inventory and crafting');

    const title = document.createElement('div');
    title.className = 'inventory-title';
    this.titleLabel = document.createElement('span');
    this.titleLabel.className = 'inventory-title__label';
    this.titleLabel.textContent = 'Inventory & Crafting';
    this.titleHint = document.createElement('span');
    this.titleHint.className = 'inventory-title__hint';
    title.append(this.titleLabel, this.titleHint);

    const equipped = document.createElement('div');
    equipped.className = 'inventory-equipped';
    this.panel.append(title, equipped);

    const workspace = document.createElement('div');
    workspace.className = 'inventory-workspace';
    const inventoryContent = document.createElement('div');
    inventoryContent.className = 'inventory-content';
    const hotbarLabel = document.createElement('div');
    hotbarLabel.className = 'inventory-hotbar-label';
    hotbarLabel.textContent = 'Quick access';
    this.hotbar = document.createElement('div');
    this.hotbar.className = 'inventory-hotbar';
    this.grid = document.createElement('div');
    this.grid.className = 'inventory-grid';
    inventoryContent.append(hotbarLabel, this.hotbar, this.grid);

    this.crafting = document.createElement('aside');
    this.crafting.className = 'inventory-crafting';
    this.crafting.setAttribute('aria-label', 'Tool crafting');
    workspace.append(inventoryContent, this.crafting);
    this.panel.append(workspace);
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

  // Crafting is now always beside the inventory. Keep this small compatibility boundary for
  // older scene state without allowing either side of the workspace to disappear.
  setCraftingOpen(_open: boolean): void {
    this.cancelDrag();
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
    this.titleLabel.textContent = 'Inventory & Crafting';
    this.titleHint.textContent = 'E or C close';
    const equippedLabel = this.element.querySelector<HTMLElement>('.inventory-equipped');
    const equipped = this.equippedTool();
    if (equippedLabel) {
      equippedLabel.textContent = equipped ? `Equipped: ${TOOL_DEFINITIONS[equipped].label}` : 'Equipped: None';
    }

    this.inventory.getSlots().forEach((slot, index) => {
      const slotElement = this.createSlot(index, slot, equipped);
      (index < HOTBAR_SLOT_COUNT ? this.hotbar : this.grid).append(slotElement);
    });
    this.renderCrafting();
  }

  private renderCrafting(): void {
    this.crafting.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'inventory-crafting__heading';
    const title = document.createElement('strong');
    title.textContent = 'Craft tools';
    const description = document.createElement('p');
    description.className = 'inventory-crafting__description';
    description.textContent = this.pendingCraft
      ? 'Drag the finished tool into an empty inventory slot.'
      : 'Choose a tool type, then select a material variant.';
    heading.append(title, description);
    this.crafting.append(heading);

    if (this.pendingCraft) {
      this.crafting.append(this.createPendingCraft(this.pendingCraft));
    }

    const categories = document.createElement('div');
    categories.className = 'crafting-categories';
    categories.append(...TOOL_CATEGORIES.map((category) => this.createCategory(category)));
    this.crafting.append(categories);

    if (this.selectedToolKind) {
      const selectedCategory = TOOL_CATEGORIES.find((category) => category.kind === this.selectedToolKind)!;
      const variants = document.createElement('section');
      variants.className = 'crafting-variants';
      const variantsHeading = document.createElement('div');
      variantsHeading.className = 'crafting-variants__heading';
      const label = document.createElement('strong');
      label.textContent = `${selectedCategory.label} variants`;
      const change = document.createElement('button');
      change.type = 'button';
      change.className = 'crafting-variants__close';
      change.textContent = 'Change';
      change.addEventListener('click', () => {
        this.selectedToolKind = null;
        this.render();
      });
      variantsHeading.append(label, change);

      const list = document.createElement('div');
      list.className = 'crafting-variants__list';
      const recipes = CRAFTING_RECIPES.filter((recipe) => TOOL_DEFINITIONS[recipe.output].kind === this.selectedToolKind);
      list.append(...recipes.map((recipe) => this.createRecipe(recipe)));
      variants.append(variantsHeading, list);
      this.crafting.append(variants);
    }
  }

  private createCategory(category: ToolCategory): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crafting-category';
    button.classList.toggle('is-selected', this.selectedToolKind === category.kind);
    button.setAttribute('aria-pressed', String(this.selectedToolKind === category.kind));

    const icon = document.createElement('span');
    icon.className = `tool-icon tool-icon--${category.kind} tool-icon--stone`;
    icon.setAttribute('aria-hidden', 'true');
    const details = document.createElement('span');
    details.className = 'crafting-category__details';
    const label = document.createElement('strong');
    label.textContent = category.label;
    const description = document.createElement('small');
    description.textContent = category.description;
    details.append(label, description);
    button.append(icon, details);
    button.addEventListener('click', () => {
      this.selectedToolKind = category.kind;
      this.render();
    });
    return button;
  }

  private createRecipe(recipe: CraftingRecipe): HTMLButtonElement {
    const canCraft = !this.pendingCraft
      && recipe.ingredients.every((ingredient) => this.inventory.get(ingredient.resource) >= ingredient.amount);
    const tool = TOOL_DEFINITIONS[recipe.output];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crafting-variant';
    button.disabled = !canCraft;
    button.setAttribute('aria-label', canCraft ? `Craft ${tool.label}` : `Need resources for ${tool.label}`);

    const icon = this.createItemIcon(recipe.output);
    const details = document.createElement('span');
    details.className = 'crafting-variant__details';
    const label = document.createElement('strong');
    label.textContent = tool.label;
    const speed = document.createElement('small');
    speed.textContent = `Up to ${peakHarvestSpeedForTool(tool.id).toFixed(2)}× harvest speed`;
    const ingredients = document.createElement('span');
    ingredients.className = 'crafting-variant__ingredients';
    ingredients.append(...recipe.ingredients.map((ingredient) => {
      const requirement = document.createElement('span');
      const available = this.inventory.get(ingredient.resource);
      requirement.className = 'crafting-requirement';
      requirement.classList.toggle('is-ready', available >= ingredient.amount);
      requirement.classList.toggle('is-missing', available < ingredient.amount);
      requirement.title = `${resourceLabel(ingredient.resource)}: ${available}/${ingredient.amount}`;
      const resourceIcon = this.createItemIcon(ingredient.resource);
      const amount = document.createElement('span');
      amount.textContent = `${available}/${ingredient.amount}`;
      requirement.append(resourceIcon, amount);
      return requirement;
    }));
    details.append(label, speed, ingredients);
    button.append(icon, details);
    button.addEventListener('click', () => {
      if (canCraft) {
        this.pendingCraft = recipe;
        this.render();
      }
    });
    return button;
  }

  private createPendingCraft(recipe: CraftingRecipe): HTMLElement {
    const pending = document.createElement('div');
    pending.className = 'crafting-pending';
    const instruction = document.createElement('span');
    instruction.className = 'crafting-pending__instruction';
    instruction.textContent = 'Finished tool';
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'crafting-pending__item';
    item.setAttribute('aria-label', `Drag ${TOOL_DEFINITIONS[recipe.output].label} to an empty inventory slot`);
    item.append(this.createItemIcon(recipe.output));
    item.addEventListener('pointerdown', (event) => this.beginCraftOutputDrag(event, item));
    const name = document.createElement('strong');
    name.textContent = TOOL_DEFINITIONS[recipe.output].label;
    pending.append(instruction, item, name);
    return pending;
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
    if (!slot || !itemElement || event.button !== 0 || this.activePointerId !== null) {
      return;
    }
    this.startDrag(event, sourceSlot, itemElement, slotIndex, false);
  }

  private beginCraftOutputDrag(event: PointerEvent, itemElement: HTMLButtonElement): void {
    if (!this.pendingCraft || event.button !== 0 || this.activePointerId !== null) {
      return;
    }
    this.startDrag(event, itemElement, itemElement, null, true);
  }

  private startDrag(
    event: PointerEvent,
    source: HTMLElement,
    itemElement: HTMLElement,
    slotIndex: number | null,
    isCraftOutput: boolean
  ): void {
    event.preventDefault();
    const rect = itemElement.getBoundingClientRect();
    this.draggingIndex = slotIndex;
    this.draggingCraftOutput = isCraftOutput;
    this.dragSourceSlot = source;
    this.dragItemElement = itemElement;
    this.activePointerId = event.pointerId;
    this.dragOriginX = rect.left;
    this.dragOriginY = rect.top;
    this.dragGrabOffsetX = event.clientX - rect.left;
    this.dragGrabOffsetY = event.clientY - rect.top;
    this.dragHasMoved = false;
    source.setPointerCapture(event.pointerId);
    source.classList.add('is-dragging');
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
    const wasCraftOutput = this.draggingCraftOutput;
    const pendingCraft = this.pendingCraft;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-inventory-slot]');
    const targetIndex = target ? Number(target.dataset.inventorySlot) : Number.NaN;
    let changed = false;

    if (wasCraftOutput && pendingCraft && Number.isInteger(targetIndex)) {
      if (this.inventory.canPlaceInSlot(targetIndex, pendingCraft.output, 1)
        && this.onClaimCraft(pendingCraft, targetIndex)) {
        this.pendingCraft = null;
        changed = true;
      }
    } else if (sourceIndex !== null && targetIndex === sourceIndex && !this.dragHasMoved) {
      const slot = this.inventory.getSlots()[sourceIndex];
      if (slot && isToolId(slot.item)) {
        this.onEquipTool(this.equippedTool() === slot.item ? null : slot.item);
        changed = true;
      }
    } else if (sourceIndex !== null && Number.isInteger(targetIndex)) {
      changed = this.inventory.moveSlot(sourceIndex, targetIndex);
    } else if (sourceIndex !== null) {
      const sourceSlot = this.inventory.getSlots()[sourceIndex];
      // Tools remain protected in inventory; only resources have a matching world-drop entity.
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
    this.draggingCraftOutput = false;
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

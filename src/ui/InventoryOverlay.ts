import {
  CRAFTING_CATEGORIES,
  PLACEABLE_DEFINITIONS,
  PLACEABLE_IDS,
  type CraftingCategoryId,
  isPlaceableId
} from '../crafting/placeableConfig';
import { CRAFTING_RECIPES, type CraftingRecipe } from '../crafting/recipeConfig';
import { TOOL_DEFINITIONS, TOOL_IDS, isToolId, type ToolId, type ToolKind } from '../crafting/toolConfig';
import { POTION_DEFINITIONS, POTION_IDS, isPotionId } from '../crafting/potionConfig';
import {
  HOTBAR_SLOT_COUNT,
  inventoryItemStackLimit,
  type Inventory,
  type InventoryItem,
  type InventorySlot
} from '../player/Inventory';
import { RESOURCE_TYPES, resourceLabel } from '../world/resources';

interface ToolCategory {
  readonly kind: ToolKind;
  readonly label: string;
}

const TOOL_CATEGORIES: readonly ToolCategory[] = [
  { kind: 'pickaxe', label: 'Pickaxes' },
  { kind: 'axe', label: 'Axes' },
  { kind: 'hoe', label: 'Hoes' },
  { kind: 'sword', label: 'Swords' }
];

// This catalogue is intentionally data-only: every entry is an existing inventory item, so
// creative mode cannot produce a special item that normal saves or placement code do not know.
const CREATIVE_CATALOGUE_ITEMS: readonly InventoryItem[] = [
  ...RESOURCE_TYPES,
  ...TOOL_IDS,
  ...PLACEABLE_IDS,
  ...POTION_IDS
];

export class InventoryOverlay {
  private readonly element: HTMLDivElement;
  private readonly panel: HTMLElement;
  private readonly hotbar: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly creativeMode: boolean;
  private readonly creative: HTMLElement;
  private readonly creativeTab: HTMLButtonElement;
  private readonly crafting: HTMLElement;
  private readonly craftingTab: HTMLButtonElement;
  private selectedCraftingCategory: CraftingCategoryId = 'tools';
  private selectedToolKind: ToolKind = 'pickaxe';
  private creativeOpen = false;
  private craftingOpen = false;
  private pendingCraft: CraftingRecipe | null = null;
  private draggingIndex: number | null = null;
  private draggingAmount = 0;
  private isSplitDrag = false;
  private dragSourceSlot: HTMLElement | null = null;
  private dragCursorItem: HTMLDivElement | null = null;
  private activePointerId: number | null = null;
  private dragOriginX = 0;
  private dragOriginY = 0;
  private dragGrabOffsetX = 0;
  private dragGrabOffsetY = 0;
  private dragHasMoved = false;
  private craftCursorItem: HTMLDivElement | null = null;
  private creativeDragItem: InventoryItem | null = null;
  private creativeDragAmount = 0;
  private creativeDragSource: HTMLElement | null = null;
  private creativeDragCursor: HTMLDivElement | null = null;
  private creativePointerId: number | null = null;

  constructor(
    parent: HTMLElement,
    private readonly inventory: Inventory,
    private readonly onChanged: () => void,
    private readonly onDropOutside: (slot: InventorySlot) => void,
    private readonly equippedTool: () => ToolId | null,
    private readonly onEquipTool: (tool: ToolId | null) => void,
    private readonly onClaimCraft: (recipe: CraftingRecipe, destinationIndex: number) => boolean,
    creativeMode = false
  ) {
    this.creativeMode = creativeMode;
    this.element = document.createElement('div');
    this.element.className = 'inventory-overlay';
    this.element.setAttribute('aria-hidden', 'true');

    this.panel = document.createElement('section');
    this.panel.className = 'inventory-panel';
    this.panel.setAttribute('aria-label', 'Inventory');

    const workspace = document.createElement('div');
    workspace.className = 'inventory-workspace';
    const inventoryContent = document.createElement('div');
    inventoryContent.className = 'inventory-content';
    this.hotbar = document.createElement('div');
    this.hotbar.className = 'inventory-hotbar';
    this.grid = document.createElement('div');
    this.grid.className = 'inventory-grid';
    // Keep the hotbar at the bottom of the pack, matching its in-world placement and leaving
    // the main 5×5 inventory as the first thing the player scans.
    inventoryContent.append(this.grid, this.hotbar);

    this.creative = document.createElement('aside');
    this.creative.className = 'inventory-creative';
    this.creative.setAttribute('aria-label', 'Creative item catalogue');
    // The open creative catalogue doubles as a safe disposal target: creative players never
    // need to throw unwanted items into the world just to clear their pack.
    this.creative.dataset.creativeDisposal = 'true';

    this.crafting = document.createElement('aside');
    this.crafting.className = 'inventory-crafting';
    this.crafting.setAttribute('aria-label', 'Crafting drawer');
    workspace.append(this.creative, inventoryContent, this.crafting);
    this.panel.append(workspace);

    this.craftingTab = document.createElement('button');
    this.craftingTab.type = 'button';
    this.craftingTab.className = 'inventory-crafting-tab';
    this.craftingTab.textContent = 'Crafting';
    this.craftingTab.setAttribute('aria-expanded', 'false');
    this.craftingTab.addEventListener('click', () => this.setCraftingOpen(!this.craftingOpen));
    this.panel.append(this.craftingTab);

    this.creativeTab = document.createElement('button');
    this.creativeTab.type = 'button';
    this.creativeTab.className = 'inventory-creative-tab';
    this.creativeTab.textContent = 'Creative';
    this.creativeTab.setAttribute('aria-expanded', 'false');
    this.creativeTab.addEventListener('click', () => this.setCreativeOpen(!this.creativeOpen));
    if (this.creativeMode) {
      this.element.classList.add('is-creative-mode');
      this.panel.append(this.creativeTab);
    }

    this.element.append(this.panel);
    parent.append(this.element);
    this.render();
  }

  setOpen(open: boolean): void {
    if (!open) {
      this.cancelDrag();
      this.cancelCraftCursor();
      this.cancelCreativeDrag();
      this.setCraftingOpen(false, false);
      this.setCreativeOpen(false, false);
    }
    this.element.classList.toggle('is-open', open);
    this.element.setAttribute('aria-hidden', String(!open));
    if (open) {
      this.render();
    }
  }

  setCraftingOpen(open: boolean, shouldRender = true): void {
    if (open && this.creativeOpen) {
      this.setCreativeOpen(false, false);
    }
    this.craftingOpen = open;
    if (!open) {
      this.cancelDrag();
      this.cancelCraftCursor();
    }
    this.element.classList.toggle('is-crafting-open', open);
    this.craftingTab.setAttribute('aria-expanded', String(open));
    this.craftingTab.textContent = open ? 'Close crafting' : 'Crafting';
    if (shouldRender) {
      this.render();
    }
  }

  private setCreativeOpen(open: boolean, shouldRender = true): void {
    if (!this.creativeMode) {
      return;
    }
    if (open && this.craftingOpen) {
      this.setCraftingOpen(false, false);
    }
    this.creativeOpen = open;
    if (!open) {
      this.cancelCreativeDrag();
    }
    this.element.classList.toggle('is-creative-open', open);
    this.creativeTab.setAttribute('aria-expanded', String(open));
    this.creativeTab.textContent = open ? 'Close creative' : 'Creative';
    if (shouldRender) {
      this.render();
    }
  }

  /** Opens the catalogue from an in-world station without duplicating crafting UI. */
  openCraftingDrawer(category: CraftingCategoryId = 'tools', toolKind?: ToolKind): void {
    this.selectedCraftingCategory = category;
    if (toolKind) {
      this.selectedToolKind = toolKind;
    }
    this.setCraftingOpen(true);
  }

  destroy(): void {
    this.cancelDrag();
    this.cancelCraftCursor();
    this.cancelCreativeDrag();
    this.element.remove();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.grid.replaceChildren();
    this.hotbar.replaceChildren();
    const equipped = this.equippedTool();

    this.inventory.getSlots().forEach((slot, index) => {
      const slotElement = this.createSlot(index, slot, equipped);
      (index < HOTBAR_SLOT_COUNT ? this.hotbar : this.grid).append(slotElement);
    });
    this.renderCreative();
    this.renderCrafting();
  }

  private renderCreative(): void {
    this.creative.replaceChildren();
    if (!this.creativeMode) {
      return;
    }
    const heading = document.createElement('div');
    heading.className = 'inventory-creative__heading';
    const title = document.createElement('strong');
    title.textContent = 'Creative catalogue';
    heading.append(title);
    const catalogue = document.createElement('div');
    catalogue.className = 'creative-catalogue';
    catalogue.append(...CREATIVE_CATALOGUE_ITEMS.map((item) => this.createCreativeItem(item)));
    this.creative.append(heading, catalogue);
  }

  private createCreativeItem(item: InventoryItem): HTMLButtonElement {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'creative-catalogue__item';
    entry.title = this.itemLabel(item);
    entry.setAttribute('aria-label', this.itemLabel(item));
    entry.append(this.createItemIcon(item));
    if (!isToolId(item)) {
      const amount = document.createElement('span');
      amount.className = 'creative-catalogue__amount';
      amount.textContent = String(inventoryItemStackLimit(item));
      entry.append(amount);
    }
    entry.addEventListener('contextmenu', (event) => event.preventDefault());
    entry.addEventListener('pointerdown', (event) => this.beginCreativeDrag(event, item, entry));
    return entry;
  }

  private renderCrafting(): void {
    this.crafting.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'inventory-crafting__heading';
    const title = document.createElement('strong');
    title.textContent = 'Crafting';
    heading.append(title);

    const body = document.createElement('div');
    body.className = 'crafting-drawer__body';
    const categories = document.createElement('div');
    categories.className = 'crafting-drawer__categories';
    categories.append(...CRAFTING_CATEGORIES.map((category) => this.createCraftingCategory(category.id)));
    const content = document.createElement('div');
    content.className = 'crafting-drawer__content';
    content.append(this.createCraftingContent());
    body.append(categories, content);
    this.crafting.append(heading, body);
  }

  private createCraftingCategory(categoryId: CraftingCategoryId): HTMLButtonElement {
    const category = CRAFTING_CATEGORIES.find((entry) => entry.id === categoryId)!;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crafting-drawer__category';
    button.classList.toggle('is-selected', this.selectedCraftingCategory === categoryId);
    button.setAttribute('aria-pressed', String(this.selectedCraftingCategory === categoryId));
    const icon = document.createElement('span');
    icon.className = `crafting-category-icon crafting-category-icon--${category.icon}`;
    icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    const label = document.createElement('strong');
    label.textContent = category.label;
    copy.append(label);
    button.append(icon, copy);
    button.addEventListener('click', () => {
      this.selectedCraftingCategory = categoryId;
      this.render();
    });
    return button;
  }

  private createCraftingContent(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'crafting-variants';
    const heading = document.createElement('div');
    heading.className = 'crafting-variants__heading';
    const title = document.createElement('strong');
    const category = CRAFTING_CATEGORIES.find((entry) => entry.id === this.selectedCraftingCategory)!;
    title.textContent = category.label;
    heading.append(title);
    section.append(heading);

    if (this.selectedCraftingCategory === 'tools') {
      const toolKinds = document.createElement('div');
      toolKinds.className = 'crafting-tool-kinds';
      toolKinds.append(...TOOL_CATEGORIES.map((toolCategory) => this.createToolCategory(toolCategory)));
      section.append(toolKinds);
    }

    const list = document.createElement('div');
    list.className = 'crafting-variants__list';
    const recipes = CRAFTING_RECIPES.filter((recipe) => recipe.category === this.selectedCraftingCategory)
      .filter((recipe) => this.selectedCraftingCategory !== 'tools'
        || (isToolId(recipe.output) && TOOL_DEFINITIONS[recipe.output].kind === this.selectedToolKind));
    list.append(...recipes.map((recipe) => this.createRecipe(recipe)));
    section.append(list);
    return section;
  }

  private createToolCategory(category: ToolCategory): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crafting-tool-kind';
    button.classList.toggle('is-selected', this.selectedToolKind === category.kind);
    const icon = document.createElement('span');
    icon.className = `tool-icon tool-icon--${category.kind} tool-icon--stone`;
    icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    const label = document.createElement('strong');
    label.textContent = category.label;
    copy.append(label);
    button.append(icon, copy);
    button.addEventListener('click', () => {
      this.selectedToolKind = category.kind;
      this.render();
    });
    return button;
  }

  private createRecipe(recipe: CraftingRecipe): HTMLButtonElement {
    const canCraft = !this.pendingCraft
      && recipe.ingredients.every((ingredient) => this.inventory.get(ingredient.resource) >= ingredient.amount);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crafting-variant';
    button.disabled = !canCraft;
    const outputLabel = this.itemLabel(recipe.output);
    button.setAttribute('aria-label', canCraft ? `Craft ${outputLabel}` : `Need resources for ${outputLabel}`);

    const icon = this.createItemIcon(recipe.output);
    const details = document.createElement('span');
    details.className = 'crafting-variant__details';
    const label = document.createElement('strong');
    label.textContent = outputLabel;
    const ingredients = document.createElement('span');
    ingredients.className = 'crafting-variant__ingredients';
    ingredients.append(...recipe.ingredients.map((ingredient) => {
      const requirement = document.createElement('span');
      const available = this.inventory.get(ingredient.resource);
      requirement.className = 'crafting-requirement';
      requirement.classList.toggle('is-ready', available >= ingredient.amount);
      requirement.classList.toggle('is-missing', available < ingredient.amount);
      requirement.title = `${resourceLabel(ingredient.resource)}: ${available} available, ${ingredient.amount} required`;
      const resourceIcon = this.createItemIcon(ingredient.resource);
      const amount = document.createElement('span');
      amount.className = 'crafting-requirement__amount';
      amount.textContent = String(ingredient.amount);
      requirement.append(resourceIcon, amount);
      return requirement;
    }));
    details.append(label, ingredients);
    button.append(icon, details);
    button.addEventListener('click', (event) => {
      if (canCraft) {
        this.pendingCraft = recipe;
        this.render();
        this.startCraftCursor(recipe, event.clientX, event.clientY);
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
    // Right-drag is used to split a stack, so suppress the browser menu for inventory slots.
    slotElement.addEventListener('contextmenu', (event) => event.preventDefault());
    return slotElement;
  }

  private beginDrag(event: PointerEvent, slotIndex: number, sourceSlot: HTMLButtonElement): void {
    const slot = this.inventory.getSlots()[slotIndex];
    const itemElement = sourceSlot.querySelector<HTMLDivElement>('.inventory-item');
    if (!slot || !itemElement || (event.button !== 0 && event.button !== 2)
      || this.activePointerId !== null || this.pendingCraft) {
      return;
    }
    // A right-drag only starts from a genuine stack. Single items retain the familiar left-drag
    // behaviour and cannot accidentally be swapped or equipped by a right click.
    if (event.button === 2 && (slot.amount <= 1 || isToolId(slot.item))) {
      return;
    }
    this.startDrag(event, sourceSlot, itemElement, slotIndex, event.button === 2 ? 1 : slot.amount, event.button === 2);
  }

  private startDrag(
    event: PointerEvent,
    source: HTMLElement,
    itemElement: HTMLElement,
    slotIndex: number,
    amount: number,
    isSplitDrag: boolean
  ): void {
    event.preventDefault();
    const rect = itemElement.getBoundingClientRect();
    this.draggingIndex = slotIndex;
    this.draggingAmount = amount;
    this.isSplitDrag = isSplitDrag;
    this.dragSourceSlot = source;
    this.activePointerId = event.pointerId;
    this.dragOriginX = rect.left;
    this.dragOriginY = rect.top;
    this.dragGrabOffsetX = event.clientX - rect.left;
    this.dragGrabOffsetY = event.clientY - rect.top;
    this.dragHasMoved = false;
    source.setPointerCapture(event.pointerId);
    source.classList.add('is-dragging');
    const cursorItem = document.createElement('div');
    cursorItem.className = 'inventory-drag-cursor';
    cursorItem.setAttribute('aria-hidden', 'true');
    const itemClone = itemElement.cloneNode(true) as HTMLElement;
    const amountLabel = itemClone.querySelector<HTMLElement>('.inventory-slot__amount');
    if (amountLabel) {
      amountLabel.textContent = String(amount);
    }
    cursorItem.append(itemClone);
    this.element.append(cursorItem);
    this.dragCursorItem = cursorItem;
    document.body.classList.add('is-item-dragging');
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
      this.creative.classList.toggle('is-disposal-target', this.isCreativeDisposalTarget(event.clientX, event.clientY));
      this.positionDraggedItem(event.clientX, event.clientY);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    const sourceIndex = this.draggingIndex;
    const draggedAmount = this.draggingAmount;
    const elementAtPointer = document.elementFromPoint(event.clientX, event.clientY);
    const target = elementAtPointer?.closest<HTMLElement>('[data-inventory-slot]');
    const disposeInCreative = this.creativeMode && this.creativeOpen
      && Boolean(elementAtPointer?.closest<HTMLElement>('[data-creative-disposal]'));
    const directTargetIndex = target ? Number(target.dataset.inventorySlot) : Number.NaN;
    // Grid and hotbar gutters are intentionally spacious for readability. Treat a release in
    // either inventory area's empty space as a drop on its closest slot, rather than treating
    // that harmless in-panel miss as a request to throw the item into the world.
    const targetIndex = Number.isInteger(directTargetIndex)
      ? directTargetIndex
      : disposeInCreative
        ? Number.NaN
        : this.nearestInventorySlotAt(event.clientX, event.clientY);
    let changed = false;
    if (sourceIndex !== null && targetIndex === sourceIndex && !this.dragHasMoved && !this.isSplitDrag) {
      const slot = this.inventory.getSlots()[sourceIndex];
      if (slot && isToolId(slot.item)) {
        this.onEquipTool(this.equippedTool() === slot.item ? null : slot.item);
        changed = true;
      }
    } else if (sourceIndex !== null && Number.isInteger(targetIndex)) {
      const source = this.inventory.getSlots()[sourceIndex];
      changed = source !== null && this.isSplitDrag
        ? this.inventory.moveAmount(sourceIndex, targetIndex, draggedAmount)
        : this.inventory.moveSlot(sourceIndex, targetIndex);
    } else if (sourceIndex !== null) {
      const dropped = draggedAmount > 0
        ? this.inventory.takeFromSlot(sourceIndex, draggedAmount)
        : null;
      if (dropped) {
        if (!disposeInCreative) {
          this.onDropOutside(dropped);
        }
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
    this.creative.classList.remove('is-disposal-target');
    this.dragCursorItem?.remove();
    document.body.classList.remove('is-item-dragging');
    this.dragSourceSlot = null;
    this.dragCursorItem = null;
    this.draggingIndex = null;
    this.draggingAmount = 0;
    this.isSplitDrag = false;
    this.activePointerId = null;
    this.dragOriginX = 0;
    this.dragOriginY = 0;
    this.dragGrabOffsetX = 0;
    this.dragGrabOffsetY = 0;
    this.dragHasMoved = false;
  }

  private positionDraggedItem(clientX: number, clientY: number): void {
    if (this.dragCursorItem) {
      this.dragCursorItem.style.transform = `translate3d(${Math.round(clientX - 28)}px, ${Math.round(clientY - 28)}px, 0)`;
    }
  }

  private isCreativeDisposalTarget(clientX: number, clientY: number): boolean {
    if (!this.creativeMode || !this.creativeOpen) {
      return false;
    }
    return Boolean(document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-creative-disposal]'));
  }

  private nearestInventorySlotAt(clientX: number, clientY: number): number {
    const within = (element: HTMLElement): boolean => {
      const bounds = element.getBoundingClientRect();
      return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
    };
    if (!within(this.grid) && !within(this.hotbar)) {
      return Number.NaN;
    }

    let nearestIndex = Number.NaN;
    let nearestDistanceSquared = Infinity;
    this.element.querySelectorAll<HTMLElement>('[data-inventory-slot]').forEach((slot) => {
      const index = Number(slot.dataset.inventorySlot);
      if (!Number.isInteger(index)) {
        return;
      }
      const bounds = slot.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const distanceSquared = (clientX - centerX) ** 2 + (clientY - centerY) ** 2;
      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  }

  private beginCreativeDrag(event: PointerEvent, item: InventoryItem, source: HTMLButtonElement): void {
    if ((event.button !== 0 && event.button !== 2) || this.activePointerId !== null
      || this.creativePointerId !== null || this.pendingCraft) {
      return;
    }
    event.preventDefault();
    const amount = event.button === 2 ? inventoryItemStackLimit(item) : 1;
    this.creativeDragItem = item;
    this.creativeDragAmount = amount;
    this.creativeDragSource = source;
    this.creativePointerId = event.pointerId;
    source.setPointerCapture(event.pointerId);
    source.classList.add('is-dragging');

    const cursor = document.createElement('div');
    cursor.className = 'inventory-drag-cursor inventory-drag-cursor--creative';
    cursor.setAttribute('aria-hidden', 'true');
    const cursorItem = document.createElement('div');
    cursorItem.className = 'inventory-item';
    cursorItem.append(this.createItemIcon(item));
    if (!isToolId(item)) {
      const amountLabel = document.createElement('span');
      amountLabel.className = 'inventory-slot__amount';
      amountLabel.textContent = String(amount);
      cursorItem.append(amountLabel);
    }
    cursor.append(cursorItem);
    this.element.append(cursor);
    this.creativeDragCursor = cursor;
    document.body.classList.add('is-item-dragging');
    this.positionCreativeCursor(event.clientX, event.clientY);
    document.addEventListener('pointermove', this.handleCreativePointerMove, true);
    document.addEventListener('pointerup', this.handleCreativePointerUp, true);
    document.addEventListener('pointercancel', this.handleCreativePointerCancel, true);
    document.addEventListener('contextmenu', this.handleCreativeContextMenu, true);
  }

  private readonly handleCreativePointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.creativePointerId) {
      this.positionCreativeCursor(event.clientX, event.clientY);
    }
  };

  private readonly handleCreativePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.creativePointerId) {
      return;
    }
    const item = this.creativeDragItem;
    const amount = this.creativeDragAmount;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-inventory-slot]');
    const targetIndex = target ? Number(target.dataset.inventorySlot) : Number.NaN;
    const added = item !== null && Number.isInteger(targetIndex)
      && this.inventory.canPlaceInSlot(targetIndex, item, amount)
      && this.inventory.placeInSlot(targetIndex, item, amount);
    this.cancelCreativeDrag();
    if (added) {
      this.onChanged();
      this.render();
    }
  };

  private readonly handleCreativePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.creativePointerId) {
      this.cancelCreativeDrag();
    }
  };

  private readonly handleCreativeContextMenu = (event: MouseEvent): void => event.preventDefault();

  private cancelCreativeDrag(): void {
    document.removeEventListener('pointermove', this.handleCreativePointerMove, true);
    document.removeEventListener('pointerup', this.handleCreativePointerUp, true);
    document.removeEventListener('pointercancel', this.handleCreativePointerCancel, true);
    document.removeEventListener('contextmenu', this.handleCreativeContextMenu, true);
    if (this.creativeDragSource && this.creativePointerId !== null && this.creativeDragSource.hasPointerCapture(this.creativePointerId)) {
      this.creativeDragSource.releasePointerCapture(this.creativePointerId);
    }
    this.creativeDragSource?.classList.remove('is-dragging');
    this.creativeDragCursor?.remove();
    document.body.classList.remove('is-item-dragging');
    this.creativeDragItem = null;
    this.creativeDragAmount = 0;
    this.creativeDragSource = null;
    this.creativeDragCursor = null;
    this.creativePointerId = null;
  }

  private positionCreativeCursor(clientX: number, clientY: number): void {
    this.creativeDragCursor?.style.setProperty(
      'transform',
      `translate3d(${Math.round(clientX - 28)}px, ${Math.round(clientY - 28)}px, 0)`
    );
  }

  private startCraftCursor(recipe: CraftingRecipe, clientX: number, clientY: number): void {
    this.cancelCraftCursor(false);
    const item = document.createElement('div');
    item.className = 'crafting-cursor-item';
    item.setAttribute('aria-hidden', 'true');
    item.append(this.createItemIcon(recipe.output));
    this.element.append(item);
    this.craftCursorItem = item;
    document.body.classList.add('is-item-dragging');
    this.positionCraftCursor(clientX, clientY);
    document.addEventListener('pointermove', this.handleCraftCursorMove, true);
    document.addEventListener('pointerdown', this.handleCraftCursorDrop, true);
  }

  private readonly handleCraftCursorMove = (event: PointerEvent): void => this.positionCraftCursor(event.clientX, event.clientY);

  private readonly handleCraftCursorDrop = (event: PointerEvent): void => {
    const recipe = this.pendingCraft;
    if (!recipe || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-inventory-slot]');
    const targetIndex = target ? Number(target.dataset.inventorySlot) : Number.NaN;
    if (!Number.isInteger(targetIndex) || !this.inventory.canPlaceInSlot(targetIndex, recipe.output, 1)
      || !this.onClaimCraft(recipe, targetIndex)) {
      this.craftCursorItem?.classList.add('is-rejected');
      return;
    }
    this.pendingCraft = null;
    this.cancelCraftCursor(false);
    this.onChanged();
    this.render();
  };

  private cancelCraftCursor(clearPending = true): void {
    document.removeEventListener('pointermove', this.handleCraftCursorMove, true);
    document.removeEventListener('pointerdown', this.handleCraftCursorDrop, true);
    this.craftCursorItem?.remove();
    document.body.classList.remove('is-item-dragging');
    this.craftCursorItem = null;
    if (clearPending) {
      this.pendingCraft = null;
    }
  }

  private positionCraftCursor(clientX: number, clientY: number): void {
    if (this.craftCursorItem) {
      this.craftCursorItem.classList.remove('is-rejected');
      this.craftCursorItem.style.transform = `translate3d(${Math.round(clientX - 28)}px, ${Math.round(clientY - 28)}px, 0)`;
    }
  }

  private itemLabel(item: InventoryItem): string {
    if (isToolId(item)) return TOOL_DEFINITIONS[item].label;
    if (isPlaceableId(item)) return PLACEABLE_DEFINITIONS[item].label;
    if (isPotionId(item)) return POTION_DEFINITIONS[item].label;
    return resourceLabel(item);
  }

  private createItemIcon(item: InventoryItem): HTMLSpanElement {
    const icon = document.createElement('span');
    if (isToolId(item)) {
      const tool = TOOL_DEFINITIONS[item];
      icon.className = `tool-icon tool-icon--${tool.kind} tool-icon--${tool.headMaterial}`;
    } else if (isPlaceableId(item)) {
      icon.className = `placeable-icon placeable-icon--${item.replaceAll(' ', '-')}`;
    } else if (isPotionId(item)) {
      icon.className = `potion-icon potion-icon--${item.replaceAll(' ', '-')}`;
    } else {
      icon.className = `resource-icon resource-icon--${item.replaceAll(' ', '-')}`;
    }
    icon.setAttribute('aria-hidden', 'true');
    if (isPotionId(item)) {
      const label = document.createElement('span');
      label.className = 'potion-icon__label';
      label.textContent = POTION_DEFINITIONS[item].shortLabel;
      icon.append(label);
    }
    const detail = document.createElement('span');
    detail.className = 'resource-icon__detail';
    icon.append(detail);
    return icon;
  }
}

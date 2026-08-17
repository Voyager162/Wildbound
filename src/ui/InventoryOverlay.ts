import { TOOL_DEFINITIONS, isToolId, type ToolId } from '../crafting/toolConfig';
import type { Inventory, InventoryItem, InventorySlot } from '../player/Inventory';
import { resourceLabel } from '../world/resources';

export class InventoryOverlay {
  private readonly element: HTMLDivElement;
  private readonly grid: HTMLDivElement;
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
    private readonly onEquipTool: (tool: ToolId | null) => void
  ) {
    this.element = document.createElement('div');
    this.element.className = 'inventory-overlay';
    this.element.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('section');
    panel.className = 'inventory-panel';
    panel.setAttribute('aria-label', 'Inventory');

    const title = document.createElement('div');
    title.className = 'inventory-title';
    title.textContent = 'Inventory';
    const hint = document.createElement('span');
    hint.textContent = 'E to close';
    title.append(hint);

    const equipped = document.createElement('div');
    equipped.className = 'inventory-equipped';
    panel.append(title, equipped);

    this.grid = document.createElement('div');
    this.grid.className = 'inventory-grid';
    panel.append(this.grid);
    this.element.append(panel);
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

  destroy(): void {
    this.cancelDrag();
    this.element.remove();
  }

  private render(): void {
    this.grid.replaceChildren();
    const equippedLabel = this.element.querySelector<HTMLElement>('.inventory-equipped');
    const equipped = this.equippedTool();
    if (equippedLabel) {
      equippedLabel.textContent = equipped ? `Equipped: ${TOOL_DEFINITIONS[equipped].label}` : 'Equipped: None';
    }

    this.inventory.getSlots().forEach((slot, index) => {
      const slotElement = document.createElement('button');
      slotElement.type = 'button';
      slotElement.className = 'inventory-slot';
      slotElement.dataset.inventorySlot = String(index);
      slotElement.setAttribute('aria-label', slot ? `${this.itemLabel(slot.item)}, ${slot.amount}` : 'Empty inventory slot');

      if (slot) {
        const itemElement = document.createElement('div');
        itemElement.className = 'inventory-item';
        itemElement.append(this.createItemIcon(slot.item));
        const amount = document.createElement('span');
        amount.className = 'inventory-slot__amount';
        amount.textContent = String(slot.amount);
        itemElement.append(amount);
        slotElement.append(itemElement);
        if (slot.item === equipped) {
          slotElement.classList.add('is-equipped');
        }
      }

      slotElement.addEventListener('pointerdown', (event) => this.beginDrag(event, index, slotElement));
      this.grid.append(slotElement);
    });
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
      icon.className = `tool-icon tool-icon--${TOOL_DEFINITIONS[item].kind}`;
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

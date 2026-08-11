import type { Inventory, InventorySlot } from '../player/Inventory';
import { resourceLabel, ResourceType } from '../world/resources';

export class InventoryOverlay {
  private readonly element: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private draggingIndex: number | null = null;
  private dragGhost: HTMLDivElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly inventory: Inventory,
    private readonly onChanged: () => void,
    private readonly onDropOutside: (slot: InventorySlot) => void
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

    this.grid = document.createElement('div');
    this.grid.className = 'inventory-grid';
    panel.append(title, this.grid);
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

    this.inventory.getSlots().forEach((slot, index) => {
      const slotElement = document.createElement('button');
      slotElement.type = 'button';
      slotElement.className = 'inventory-slot';
      slotElement.dataset.inventorySlot = String(index);
      slotElement.setAttribute('aria-label', slot ? `${resourceLabel(slot.resource)}, ${slot.amount}` : 'Empty inventory slot');

      if (slot) {
        slotElement.append(this.createItemIcon(slot.resource));
        const amount = document.createElement('span');
        amount.className = 'inventory-slot__amount';
        amount.textContent = String(slot.amount);
        slotElement.append(amount);
      }

      slotElement.addEventListener('pointerdown', (event) => this.beginDrag(event, index));
      this.grid.append(slotElement);
    });
  }

  private beginDrag(event: PointerEvent, slotIndex: number): void {
    const slot = this.inventory.getSlots()[slotIndex];

    if (!slot || event.button !== 0) {
      return;
    }

    event.preventDefault();
    this.draggingIndex = slotIndex;
    this.dragGhost = document.createElement('div');
    this.dragGhost.className = 'inventory-drag-ghost';
    this.dragGhost.append(this.createItemIcon(slot.resource));
    const amount = document.createElement('span');
    amount.textContent = String(slot.amount);
    this.dragGhost.append(amount);
    document.body.append(this.dragGhost);
    this.positionDragGhost(event.clientX, event.clientY);
    document.addEventListener('pointermove', this.handlePointerMove);
    document.addEventListener('pointerup', this.handlePointerUp, { once: true });
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.positionDragGhost(event.clientX, event.clientY);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const sourceIndex = this.draggingIndex;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-inventory-slot]');
    const targetIndex = target ? Number(target.dataset.inventorySlot) : Number.NaN;
    let changed = false;

    if (sourceIndex !== null && Number.isInteger(targetIndex)) {
      changed = this.inventory.moveSlot(sourceIndex, targetIndex);
    } else if (sourceIndex !== null) {
      const dropped = this.inventory.takeSlot(sourceIndex);

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

  private cancelDrag(): void {
    document.removeEventListener('pointermove', this.handlePointerMove);
    this.dragGhost?.remove();
    this.dragGhost = null;
    this.draggingIndex = null;
  }

  private positionDragGhost(clientX: number, clientY: number): void {
    if (!this.dragGhost) {
      return;
    }

    this.dragGhost.style.transform = `translate(${clientX + 14}px, ${clientY + 14}px)`;
  }

  private createItemIcon(resource: ResourceType): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className = `resource-icon resource-icon--${resource.replaceAll(' ', '-')}`;
    icon.setAttribute('aria-hidden', 'true');
    const detail = document.createElement('span');
    detail.className = 'resource-icon__detail';
    icon.append(detail);
    return icon;
  }
}

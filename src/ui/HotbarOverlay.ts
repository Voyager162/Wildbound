import { TOOL_DEFINITIONS, isToolId } from '../crafting/toolConfig';
import { HOTBAR_SLOT_COUNT, type Inventory, type InventoryItem, type InventorySlot } from '../player/Inventory';
import { resourceLabel } from '../world/resources';

export class HotbarOverlay {
  private readonly element: HTMLDivElement;
  private readonly slots: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly inventory: Inventory,
    private readonly selectedSlot: () => number,
    private readonly onSelectSlot: (slotIndex: number) => void,
    private readonly isInteractionEnabled: () => boolean
  ) {
    this.element = document.createElement('div');
    this.element.className = 'hotbar-overlay';
    this.element.setAttribute('aria-label', 'Quick access hotbar');

    const frame = document.createElement('div');
    frame.className = 'hotbar-frame';
    this.slots = document.createElement('div');
    this.slots.className = 'hotbar-slots';
    frame.append(this.slots);
    this.element.append(frame);
    parent.append(this.element);
    window.addEventListener('wheel', this.handleWheel, { passive: false });
    this.render();
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
    this.element.setAttribute('aria-hidden', String(!visible));
  }

  refresh(): void {
    this.render();
  }

  destroy(): void {
    window.removeEventListener('wheel', this.handleWheel);
    this.element.remove();
  }

  private render(): void {
    this.slots.replaceChildren();
    const inventorySlots = this.inventory.getSlots();
    const selectedSlot = this.selectedSlot();

    for (let index = 0; index < HOTBAR_SLOT_COUNT; index += 1) {
      const slot = inventorySlots[index];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotbar-slot';
      button.setAttribute('aria-label', slot ? `${this.itemLabel(slot.item)}, ${slot.amount}` : `Empty hotbar slot ${index + 1}`);
      if (index === selectedSlot) {
        button.classList.add('is-active');
      }

      const key = document.createElement('span');
      key.className = 'hotbar-slot__key';
      key.textContent = String(index + 1);
      button.append(key);

      if (slot) {
        const item = document.createElement('span');
        item.className = 'hotbar-slot__item';
        item.append(this.createItemIcon(slot.item));
        if (!isToolId(slot.item)) {
          const amount = document.createElement('span');
          amount.className = 'hotbar-slot__amount';
          amount.textContent = String(slot.amount);
          item.append(amount);
        }
        button.append(item);
      }

      button.addEventListener('click', () => this.onSelectSlot(index));
      this.slots.append(button);
    }
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.isInteractionEnabled() || Math.abs(event.deltaY) < 1) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY > 0 ? 1 : -1;
    const nextSlot = (this.selectedSlot() + direction + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT;
    this.onSelectSlot(nextSlot);
  };

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

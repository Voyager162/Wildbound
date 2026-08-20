import { RESOURCE_TYPES, ResourceType } from '../world/resources';

import { isToolId, type ToolId } from '../crafting/toolConfig';

export const INVENTORY_SLOT_COUNT = 16;
export const HOTBAR_SLOT_COUNT = 6;
export const MAX_STACK_SIZE = 10;

export type InventoryItem = ResourceType | ToolId;

export interface InventorySlot {
  item: InventoryItem;
  amount: number;
}

const isResourceType = (value: unknown): value is ResourceType =>
  typeof value === 'string' && Object.values(ResourceType).includes(value as ResourceType);

export const isInventoryItem = (value: unknown): value is InventoryItem => isResourceType(value) || isToolId(value);

export const inventoryItemStackLimit = (item: InventoryItem): number => isToolId(item) ? 1 : MAX_STACK_SIZE;

const isSlot = (value: unknown): value is InventorySlot => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const slot = value as Partial<InventorySlot>;
  return isInventoryItem(slot.item)
    && Number.isInteger(slot.amount)
    && (slot.amount ?? 0) > 0
    && (slot.amount ?? 0) <= inventoryItemStackLimit(slot.item);
};

const legacySlotItem = (value: unknown): InventorySlot | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const legacy = value as { resource?: unknown; amount?: unknown };
  return isResourceType(legacy.resource)
    && typeof legacy.amount === 'number'
    && Number.isInteger(legacy.amount)
    && legacy.amount > 0
    && legacy.amount <= MAX_STACK_SIZE
    ? { item: legacy.resource, amount: legacy.amount }
    : null;
};

export class Inventory {
  private readonly slots: Array<InventorySlot | null> = Array.from({ length: INVENTORY_SLOT_COUNT }, () => null);

  canAdd(item: InventoryItem, amount: number): boolean {
    let capacity = 0;
    const stackLimit = inventoryItemStackLimit(item);

    for (const slot of this.slots) {
      if (!slot) {
        capacity += stackLimit;
      } else if (slot.item === item) {
        capacity += stackLimit - slot.amount;
      }
    }

    return capacity >= amount;
  }

  add(item: InventoryItem, amount: number): number {
    let remaining = amount;
    const stackLimit = inventoryItemStackLimit(item);

    for (const slot of this.slots) {
      if (!slot || slot.item !== item || slot.amount >= stackLimit) {
        continue;
      }

      const added = Math.min(stackLimit - slot.amount, remaining);
      slot.amount += added;
      remaining -= added;

      if (remaining === 0) {
        return amount;
      }
    }

    for (let index = 0; index < this.slots.length && remaining > 0; index += 1) {
      if (this.slots[index]) {
        continue;
      }

      const added = Math.min(stackLimit, remaining);
      this.slots[index] = { item, amount: added };
      remaining -= added;
    }

    return amount - remaining;
  }

  moveSlot(sourceIndex: number, destinationIndex: number): boolean {
    if (!this.isValidIndex(sourceIndex) || !this.isValidIndex(destinationIndex) || sourceIndex === destinationIndex) {
      return false;
    }

    const source = this.slots[sourceIndex];
    const destination = this.slots[destinationIndex];

    if (!source) {
      return false;
    }

    if (!destination) {
      this.slots[destinationIndex] = source;
      this.slots[sourceIndex] = null;
      return true;
    }

    const stackLimit = inventoryItemStackLimit(source.item);
    if (source.item === destination.item && destination.amount < stackLimit) {
      const moved = Math.min(stackLimit - destination.amount, source.amount);
      destination.amount += moved;
      source.amount -= moved;

      if (source.amount === 0) {
        this.slots[sourceIndex] = null;
      }

      return moved > 0;
    }

    this.slots[sourceIndex] = destination;
    this.slots[destinationIndex] = source;
    return true;
  }

  canPlaceInSlot(index: number, item: InventoryItem, amount: number): boolean {
    if (!this.isValidIndex(index) || !Number.isInteger(amount) || amount < 1) {
      return false;
    }

    const slot = this.slots[index];
    const stackLimit = inventoryItemStackLimit(item);
    if (!slot) {
      return amount <= stackLimit;
    }

    return slot.item === item && slot.amount + amount <= stackLimit;
  }

  placeInSlot(index: number, item: InventoryItem, amount: number): boolean {
    if (!this.canPlaceInSlot(index, item, amount)) {
      return false;
    }

    const slot = this.slots[index];
    if (slot) {
      slot.amount += amount;
    } else {
      this.slots[index] = { item, amount };
    }
    return true;
  }

  takeSlot(index: number): InventorySlot | null {
    if (!this.isValidIndex(index) || !this.slots[index]) {
      return null;
    }

    const slot = this.slots[index];
    this.slots[index] = null;
    return slot ? { ...slot } : null;
  }

  restore(savedSlots: unknown): void {
    this.slots.fill(null);

    if (!Array.isArray(savedSlots)) {
      return;
    }

    savedSlots.slice(0, INVENTORY_SLOT_COUNT).forEach((slot, index) => {
      if (isSlot(slot)) {
        this.slots[index] = { ...slot };
      } else {
        const legacySlot = legacySlotItem(slot);
        if (legacySlot) {
          this.slots[index] = legacySlot;
        }
      }
    });
  }

  get(item: InventoryItem): number {
    return this.slots.reduce((total, slot) => total + (slot?.item === item ? slot.amount : 0), 0);
  }

  remove(item: InventoryItem, amount: number): boolean {
    if (!Number.isInteger(amount) || amount < 1 || this.get(item) < amount) {
      return false;
    }

    let remaining = amount;
    this.slots.forEach((slot, index) => {
      if (!slot || slot.item !== item || remaining === 0) {
        return;
      }

      const removed = Math.min(slot.amount, remaining);
      slot.amount -= removed;
      remaining -= removed;
      if (slot.amount === 0) {
        this.slots[index] = null;
      }
    });
    return true;
  }

  entries(): ReadonlyArray<readonly [ResourceType, number]> {
    return RESOURCE_TYPES.map((resource) => [resource, this.get(resource)] as const);
  }

  getSlots(): ReadonlyArray<InventorySlot | null> {
    return this.slots.map((slot) => (slot ? { ...slot } : null));
  }

  private isValidIndex(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this.slots.length;
  }
}

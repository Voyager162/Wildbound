import { RESOURCE_TYPES, ResourceType } from '../world/resources';

import { isToolId, type ToolId } from '../crafting/toolConfig';
import { isPlaceableId, PlaceableId } from '../crafting/placeableConfig';
import { isPotionId, type PotionId } from '../crafting/potionConfig';

export const HOTBAR_SLOT_COUNT = 6;
export const INVENTORY_GRID_COLUMNS = 5;
export const INVENTORY_GRID_ROWS = 5;
export const INVENTORY_SLOT_COUNT = HOTBAR_SLOT_COUNT + INVENTORY_GRID_COLUMNS * INVENTORY_GRID_ROWS;
export const MAX_STACK_SIZE = 10;

export type InventoryItem = ResourceType | ToolId | PlaceableId | PotionId;

export interface InventorySlot {
  item: InventoryItem;
  amount: number;
}

const isResourceType = (value: unknown): value is ResourceType =>
  typeof value === 'string' && Object.values(ResourceType).includes(value as ResourceType);

export const isInventoryItem = (value: unknown): value is InventoryItem =>
  isResourceType(value) || isToolId(value) || isPlaceableId(value) || isPotionId(value);

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

// Refined stone was briefly part of the experimental furnace progression. It is intentionally
// no longer a game item, but this one-way migration prevents an existing save from losing it.
const retiredRefinedStoneSlot = (value: unknown): InventorySlot | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const slot = value as { item?: unknown; amount?: unknown };
  return slot.item === 'refined stone'
    && typeof slot.amount === 'number'
    && Number.isInteger(slot.amount)
    && slot.amount > 0
    && slot.amount <= MAX_STACK_SIZE
    ? { item: ResourceType.Stone, amount: slot.amount }
    : null;
};

// Survey beacons became editable waypoints. Preserve the player's crafted items when opening a
// pre-waypoint save instead of silently discarding an otherwise valid inventory stack.
const legacySurveyBeaconSlot = (value: unknown): InventorySlot | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const slot = value as { item?: unknown; amount?: unknown };
  return slot.item === 'survey beacon'
    && typeof slot.amount === 'number'
    && Number.isInteger(slot.amount)
    && slot.amount > 0
    && slot.amount <= MAX_STACK_SIZE
    ? { item: PlaceableId.Waypoint, amount: slot.amount }
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

  /**
   * Moves part of a stack without changing the identity of either remaining stack. This powers
   * right-drag splitting in the inventory and deliberately only permits an empty or matching
   * destination: swapping a single item with an unrelated stack would be surprising.
   */
  moveAmount(sourceIndex: number, destinationIndex: number, amount: number): boolean {
    if (!this.isValidIndex(sourceIndex) || !this.isValidIndex(destinationIndex)
      || sourceIndex === destinationIndex || !Number.isInteger(amount) || amount < 1) {
      return false;
    }

    const source = this.slots[sourceIndex];
    if (!source || source.amount < amount || !this.canPlaceInSlot(destinationIndex, source.item, amount)) {
      return false;
    }

    const destination = this.slots[destinationIndex];
    source.amount -= amount;
    if (source.amount === 0) {
      this.slots[sourceIndex] = null;
    }
    if (destination) {
      destination.amount += amount;
    } else {
      this.slots[destinationIndex] = { item: source.item, amount };
    }
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

  // Utility inputs consume one material at a time. Keeping this operation inside Inventory
  // avoids taking an entire stack during a drag and trying to reconstruct it afterward.
  takeFromSlot(index: number, amount: number): InventorySlot | null {
    if (!this.isValidIndex(index) || !Number.isInteger(amount) || amount < 1) {
      return null;
    }
    const slot = this.slots[index];
    if (!slot || slot.amount < amount) {
      return null;
    }
    slot.amount -= amount;
    const taken = { item: slot.item, amount };
    if (slot.amount === 0) {
      this.slots[index] = null;
    }
    return taken;
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
        const legacySlot = retiredRefinedStoneSlot(slot) ?? legacySurveyBeaconSlot(slot) ?? legacySlotItem(slot);
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

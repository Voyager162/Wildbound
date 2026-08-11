import { RESOURCE_TYPES, ResourceType } from '../world/resources';

export const INVENTORY_SLOT_COUNT = 16;
export const MAX_STACK_SIZE = 10;

export interface InventorySlot {
  resource: ResourceType;
  amount: number;
}

const isResourceType = (value: unknown): value is ResourceType =>
  typeof value === 'string' && Object.values(ResourceType).includes(value as ResourceType);

const isSlot = (value: unknown): value is InventorySlot => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const slot = value as Partial<InventorySlot>;
  return isResourceType(slot.resource)
    && Number.isInteger(slot.amount)
    && (slot.amount ?? 0) > 0
    && (slot.amount ?? 0) <= MAX_STACK_SIZE;
};

export class Inventory {
  private readonly slots: Array<InventorySlot | null> = Array.from({ length: INVENTORY_SLOT_COUNT }, () => null);

  canAdd(resource: ResourceType, amount: number): boolean {
    let capacity = 0;

    for (const slot of this.slots) {
      if (!slot) {
        capacity += MAX_STACK_SIZE;
      } else if (slot.resource === resource) {
        capacity += MAX_STACK_SIZE - slot.amount;
      }
    }

    return capacity >= amount;
  }

  add(resource: ResourceType, amount: number): number {
    let remaining = amount;

    for (const slot of this.slots) {
      if (!slot || slot.resource !== resource || slot.amount >= MAX_STACK_SIZE) {
        continue;
      }

      const added = Math.min(MAX_STACK_SIZE - slot.amount, remaining);
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

      const added = Math.min(MAX_STACK_SIZE, remaining);
      this.slots[index] = { resource, amount: added };
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

    if (source.resource === destination.resource && destination.amount < MAX_STACK_SIZE) {
      const moved = Math.min(MAX_STACK_SIZE - destination.amount, source.amount);
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
      }
    });
  }

  get(resource: ResourceType): number {
    return this.slots.reduce((total, slot) => total + (slot?.resource === resource ? slot.amount : 0), 0);
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

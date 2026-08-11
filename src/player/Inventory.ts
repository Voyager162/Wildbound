import { RESOURCE_TYPES, ResourceType } from '../world/resources';

export const INVENTORY_SLOT_COUNT = 16;
export const MAX_STACK_SIZE = 10;

export interface InventorySlot {
  resource: ResourceType;
  amount: number;
}

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

  get(resource: ResourceType): number {
    return this.slots.reduce((total, slot) => total + (slot?.resource === resource ? slot.amount : 0), 0);
  }

  entries(): ReadonlyArray<readonly [ResourceType, number]> {
    return RESOURCE_TYPES.map((resource) => [resource, this.get(resource)] as const);
  }

  getSlots(): ReadonlyArray<InventorySlot | null> {
    return this.slots.map((slot) => (slot ? { ...slot } : null));
  }
}
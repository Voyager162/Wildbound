import { RESOURCE_TYPES, ResourceType } from '../world/resources';

export class Inventory {
  private readonly counts = new Map<ResourceType, number>(RESOURCE_TYPES.map((resource) => [resource, 0]));

  add(resource: ResourceType, amount: number): void {
    this.counts.set(resource, this.get(resource) + amount);
  }

  get(resource: ResourceType): number {
    return this.counts.get(resource) ?? 0;
  }

  entries(): ReadonlyArray<readonly [ResourceType, number]> {
    return RESOURCE_TYPES.map((resource) => [resource, this.get(resource)] as const);
  }
}
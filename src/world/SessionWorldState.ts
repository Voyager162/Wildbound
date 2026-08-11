import { ResourceType } from './resources';
import { WORLD_TILE_SIZE } from './worldConfig';

export interface DroppedItem {
  id: string;
  resource: ResourceType;
  amount: number;
  worldX: number;
  worldY: number;
}

// Session-only changes layer over deterministic generation; persistence can replace this later.
export class SessionWorldState {
  private readonly harvestedFeatureKeys = new Set<string>();
  private readonly drops = new Map<string, DroppedItem>();
  private nextDropId = 0;

  isFeatureHarvested(tileX: number, tileY: number): boolean {
    return this.harvestedFeatureKeys.has(this.featureKey(tileX, tileY));
  }

  harvestFeature(tileX: number, tileY: number): boolean {
    const key = this.featureKey(tileX, tileY);

    if (this.harvestedFeatureKeys.has(key)) {
      return false;
    }

    this.harvestedFeatureKeys.add(key);
    return true;
  }

  createDrop(tileX: number, tileY: number, resource: ResourceType, amount = 1): DroppedItem {
    const id = `${tileX},${tileY}:${resource}:${this.nextDropId}`;
    this.nextDropId += 1;
    const drop: DroppedItem = {
      id,
      resource,
      amount,
      worldX: (tileX + 0.5) * WORLD_TILE_SIZE,
      worldY: (tileY + 0.5) * WORLD_TILE_SIZE
    };

    this.drops.set(drop.id, drop);
    return drop;
  }

  getDrops(): ReadonlyArray<DroppedItem> {
    return Array.from(this.drops.values());
  }

  removeDrop(id: string): DroppedItem | null {
    const drop = this.drops.get(id) ?? null;

    if (drop) {
      this.drops.delete(id);
    }

    return drop;
  }

  get harvestedFeatureCount(): number {
    return this.harvestedFeatureKeys.size;
  }

  get dropCount(): number {
    return this.drops.size;
  }

  private featureKey(tileX: number, tileY: number): string {
    return `${tileX},${tileY}`;
  }
}
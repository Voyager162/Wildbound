import { ResourceType } from './resources';
import { WORLD_TILE_SIZE } from './worldConfig';

export interface DroppedItem {
  id: string;
  resource: ResourceType;
  amount: number;
  worldX: number;
  worldY: number;
}

export interface SessionWorldStateData {
  harvestedFeatureKeys: string[];
  drops: DroppedItem[];
  nextDropId: number;
}

const isResourceType = (value: unknown): value is ResourceType =>
  typeof value === 'string' && Object.values(ResourceType).includes(value as ResourceType);

const isDroppedItem = (value: unknown): value is DroppedItem => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const drop = value as Partial<DroppedItem>;
  return typeof drop.id === 'string'
    && isResourceType(drop.resource)
    && typeof drop.amount === 'number'
    && Number.isFinite(drop.amount)
    && drop.amount > 0
    && Number.isFinite(drop.worldX)
    && Number.isFinite(drop.worldY);
};

// Runtime world changes layer over deterministic generation. This is intentionally compact so
// save games only record changes, never every procedurally generated terrain tile.
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
    return this.createDropAt(
      (tileX + 0.5) * WORLD_TILE_SIZE,
      (tileY + 0.5) * WORLD_TILE_SIZE,
      resource,
      amount
    );
  }

  createDropAt(worldX: number, worldY: number, resource: ResourceType, amount = 1): DroppedItem {
    const id = `drop:${this.nextDropId}`;
    this.nextDropId += 1;
    const drop: DroppedItem = { id, resource, amount, worldX, worldY };
    this.drops.set(drop.id, drop);
    return drop;
  }

  getDrops(): DroppedItem[] {
    return Array.from(this.drops.values(), (drop) => ({ ...drop }));
  }

  removeDrop(id: string): DroppedItem | null {
    const drop = this.drops.get(id) ?? null;

    if (drop) {
      this.drops.delete(id);
    }

    return drop ? { ...drop } : null;
  }

  toSaveData(): SessionWorldStateData {
    return {
      harvestedFeatureKeys: Array.from(this.harvestedFeatureKeys),
      drops: this.getDrops(),
      nextDropId: this.nextDropId
    };
  }

  restore(data: unknown): void {
    this.harvestedFeatureKeys.clear();
    this.drops.clear();
    this.nextDropId = 0;

    if (!data || typeof data !== 'object') {
      return;
    }

    const state = data as Partial<SessionWorldStateData>;
    if (Array.isArray(state.harvestedFeatureKeys)) {
      state.harvestedFeatureKeys.forEach((key) => {
        if (typeof key === 'string') {
          this.harvestedFeatureKeys.add(key);
        }
      });
    }

    if (Array.isArray(state.drops)) {
      state.drops.filter(isDroppedItem).forEach((drop) => this.drops.set(drop.id, { ...drop }));
    }

    if (typeof state.nextDropId === 'number' && Number.isInteger(state.nextDropId) && state.nextDropId >= 0) {
      this.nextDropId = state.nextDropId;
    }
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

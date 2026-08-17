import { ResourceType } from './resources';
import { EXPLORATION_SAVE_REGION_SIZE_TILES } from './explorationConfig';
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
  harvestedCaveOreKeys?: string[];
  drops: DroppedItem[];
  nextDropId: number;
  // Exploration is deliberately coarse: each key represents a fixed map region, not a tile.
  // This keeps a long-running save compact while still making every journey permanent.
  exploredRegionKeys?: string[];
  explorationRegionSizeTiles?: number;
  explorationRevealStampKeys?: string[];
  worldTimeMs?: number;
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
  private readonly harvestedCaveOreKeys = new Set<string>();
  private readonly drops = new Map<string, DroppedItem>();
  private readonly exploredRegionKeys = new Set<string>();
  private readonly explorationRevealStampKeys = new Set<string>();
  private nextDropId = 0;
  private savedWorldTimeMs: number | null = null;

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

  isCaveOreHarvested(oreId: string): boolean {
    return this.harvestedCaveOreKeys.has(oreId);
  }

  harvestCaveOre(oreId: string): boolean {
    if (!oreId || this.harvestedCaveOreKeys.has(oreId)) {
      return false;
    }

    this.harvestedCaveOreKeys.add(oreId);
    return true;
  }

  revealRegion(regionX: number, regionY: number): boolean {
    if (!Number.isInteger(regionX) || !Number.isInteger(regionY)) {
      return false;
    }

    const key = this.regionKey(regionX, regionY);
    if (this.exploredRegionKeys.has(key)) {
      return false;
    }

    this.exploredRegionKeys.add(key);
    return true;
  }

  revealRegionsAround(regionX: number, regionY: number, radius: number): boolean {
    if (!Number.isInteger(regionX) || !Number.isInteger(regionY) || !Number.isInteger(radius) || radius < 0) {
      return false;
    }

    let revealedNewRegion = false;
    // A radial stamp mirrors the circular local map instead of exposing a blocky square of
    // saved regions. Fine regions keep the permanent map edge smooth as the player travels.
    const revealRadiusSquared = radius * radius + 0.35;
    for (let y = regionY - radius; y <= regionY + radius; y += 1) {
      for (let x = regionX - radius; x <= regionX + radius; x += 1) {
        const deltaX = x - regionX;
        const deltaY = y - regionY;
        if (deltaX * deltaX + deltaY * deltaY > revealRadiusSquared) {
          continue;
        }
        revealedNewRegion = this.revealRegion(x, y) || revealedNewRegion;
      }
    }

    return revealedNewRegion;
  }

  isRegionExplored(regionX: number, regionY: number): boolean {
    return this.exploredRegionKeys.has(this.regionKey(regionX, regionY));
  }

  revealMapStamp(tileX: number, tileY: number, spacingTiles: number): boolean {
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY) || !Number.isInteger(spacingTiles) || spacingTiles < 1) {
      return false;
    }

    const stampX = Math.floor(tileX / spacingTiles) * spacingTiles + spacingTiles / 2;
    const stampY = Math.floor(tileY / spacingTiles) * spacingTiles + spacingTiles / 2;
    const key = this.regionKey(stampX, stampY);
    if (this.explorationRevealStampKeys.has(key)) {
      return false;
    }

    this.explorationRevealStampKeys.add(key);
    return true;
  }

  getExplorationRevealStamps(): Array<readonly [number, number]> {
    const stamps: Array<readonly [number, number]> = [];
    this.explorationRevealStampKeys.forEach((key) => {
      const [tileX, tileY] = this.parseRegionKey(key);
      if (tileX !== null && tileY !== null) {
        stamps.push([tileX, tileY]);
      }
    });
    return stamps;
  }

  getExploredRegions(): Array<readonly [number, number]> {
    const regions: Array<readonly [number, number]> = [];
    this.exploredRegionKeys.forEach((key) => {
      const [x, y] = this.parseRegionKey(key);
      if (x !== null && y !== null) {
        regions.push([x, y]);
      }
    });
    return regions;
  }

  setWorldTimeMs(worldTimeMs: number): boolean {
    if (!Number.isFinite(worldTimeMs)) {
      return false;
    }

    if (this.savedWorldTimeMs === worldTimeMs) {
      return false;
    }

    this.savedWorldTimeMs = worldTimeMs;
    return true;
  }

  get worldTimeMs(): number | null {
    return this.savedWorldTimeMs;
  }

  toSaveData(): SessionWorldStateData {
    return {
      harvestedFeatureKeys: Array.from(this.harvestedFeatureKeys),
      harvestedCaveOreKeys: Array.from(this.harvestedCaveOreKeys),
      drops: this.getDrops(),
      nextDropId: this.nextDropId,
      exploredRegionKeys: Array.from(this.exploredRegionKeys),
      explorationRegionSizeTiles: EXPLORATION_SAVE_REGION_SIZE_TILES,
      explorationRevealStampKeys: Array.from(this.explorationRevealStampKeys),
      worldTimeMs: this.savedWorldTimeMs ?? undefined
    };
  }

  restore(data: unknown): void {
    this.harvestedFeatureKeys.clear();
    this.harvestedCaveOreKeys.clear();
    this.drops.clear();
    this.exploredRegionKeys.clear();
    this.explorationRevealStampKeys.clear();
    this.nextDropId = 0;
    this.savedWorldTimeMs = null;

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

    if (Array.isArray(state.harvestedCaveOreKeys)) {
      state.harvestedCaveOreKeys.forEach((key) => {
        if (typeof key === 'string' && key.length <= 160) {
          this.harvestedCaveOreKeys.add(key);
        }
      });
    }

    if (Array.isArray(state.exploredRegionKeys)) {
      const savedSize = typeof state.explorationRegionSizeTiles === 'number'
        && Number.isInteger(state.explorationRegionSizeTiles)
        && state.explorationRegionSizeTiles >= EXPLORATION_SAVE_REGION_SIZE_TILES
        && state.explorationRegionSizeTiles <= 256
        ? state.explorationRegionSizeTiles
        : 16;
      const cellsPerSavedRegion = Math.max(1, Math.round(savedSize / EXPLORATION_SAVE_REGION_SIZE_TILES));
      state.exploredRegionKeys.forEach((key) => {
        if (typeof key !== 'string') {
          return;
        }

        const [regionX, regionY] = this.parseRegionKey(key);
        if (regionX !== null && regionY !== null) {
          for (let cellY = 0; cellY < cellsPerSavedRegion; cellY += 1) {
            for (let cellX = 0; cellX < cellsPerSavedRegion; cellX += 1) {
              this.exploredRegionKeys.add(this.regionKey(
                regionX * cellsPerSavedRegion + cellX,
                regionY * cellsPerSavedRegion + cellY
              ));
            }
          }
        }
      });
    }

    if (Array.isArray(state.explorationRevealStampKeys)) {
      state.explorationRevealStampKeys.forEach((key) => {
        if (typeof key !== 'string') {
          return;
        }

        const [tileX, tileY] = this.parseRegionKey(key);
        if (tileX !== null && tileY !== null) {
          this.explorationRevealStampKeys.add(this.regionKey(tileX, tileY));
        }
      });
    }

    if (typeof state.worldTimeMs === 'number' && Number.isFinite(state.worldTimeMs)) {
      this.savedWorldTimeMs = state.worldTimeMs;
    }
  }

  get harvestedFeatureCount(): number {
    return this.harvestedFeatureKeys.size;
  }

  get dropCount(): number {
    return this.drops.size;
  }

  get harvestedCaveOreCount(): number {
    return this.harvestedCaveOreKeys.size;
  }

  get exploredRegionCount(): number {
    return this.exploredRegionKeys.size;
  }

  private featureKey(tileX: number, tileY: number): string {
    return `${tileX},${tileY}`;
  }

  private regionKey(regionX: number, regionY: number): string {
    return `${regionX},${regionY}`;
  }

  private parseRegionKey(key: string): readonly [number | null, number | null] {
    const match = /^(-?\d+),(-?\d+)$/.exec(key);
    if (!match) {
      return [null, null];
    }

    const regionX = Number(match[1]);
    const regionY = Number(match[2]);
    return Number.isSafeInteger(regionX) && Number.isSafeInteger(regionY)
      ? [regionX, regionY]
      : [null, null];
  }
}

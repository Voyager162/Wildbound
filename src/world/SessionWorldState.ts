import { inventoryItemStackLimit, isInventoryItem, type InventoryItem, type InventorySlot } from '../player/Inventory';
import {
  isPlaceableId,
  PLACEABLE_DEFINITIONS,
  PlaceableId,
  WAYPOINT_DEFAULT_LABEL,
  WAYPOINT_LABEL_MAX_LENGTH
} from '../crafting/placeableConfig';
import { isPotionId, potionForIngredients, type PotionId } from '../crafting/potionConfig';
import {
  FURNACE_SLOT_STACK_LIMIT,
  furnaceRecipeFor,
  furnaceRecipeForOutput
} from '../crafting/furnaceConfig';
import { ResourceType } from './resources';
import { EXPLORATION_SAVE_REGION_SIZE_TILES } from './explorationConfig';
import { WORLD_TILE_SIZE } from './worldConfig';

export interface DroppedItem {
  id: string;
  item: InventoryItem;
  amount: number;
  worldX: number;
  worldY: number;
}

export interface PlacedObject {
  id: string;
  placeable: PlaceableId;
  tileX: number;
  tileY: number;
  // Waypoints are intentionally world-state metadata, not a generated feature. This keeps a
  // player label persistent without coupling it to procedural terrain or map rendering.
  waypointLabel?: string;
  storage?: Array<InventorySlot | null>;
  brewing?: BrewingStationState;
  furnace?: FurnaceState;
}

export interface WaypointLocation {
  id: string;
  tileX: number;
  tileY: number;
  label: string;
}

export interface BrewingJob {
  output: PotionId;
  finishesAtMs: number;
}

export interface BrewingStationState {
  ingredients: [InventorySlot | null, InventorySlot | null];
  job?: BrewingJob;
}

export interface FurnaceJob {
  output: ResourceType;
  finishesAtMs: number;
}

export interface FurnaceState {
  fuel: InventorySlot | null;
  ore: InventorySlot | null;
  // Finished bars accumulate here while the furnace proceeds through its queued inputs.
  output: InventorySlot | null;
  job?: FurnaceJob;
}

export interface LandmarkMaterialRegrowthState {
  materialId: string;
  regrowsAtWorldAgeMs: number;
}

export interface SessionWorldStateData {
  harvestedFeatureKeys: string[];
  harvestedCaveOreKeys?: string[];
  harvestedLandmarkMaterialKeys?: string[];
  landmarkMaterialRegrowth?: LandmarkMaterialRegrowthState[];
  landmarkMaterialMigrationVersion?: number;
  drops: DroppedItem[];
  nextDropId: number;
  placedObjects?: PlacedObject[];
  nextPlacedObjectId?: number;
  // Exploration is deliberately coarse: each key represents a fixed map region, not a tile.
  // This keeps a long-running save compact while still making every journey permanent.
  exploredRegionKeys?: string[];
  explorationRegionSizeTiles?: number;
  explorationRevealStampKeys?: string[];
  worldTimeMs?: number;
  // Unlike worldTimeMs, world age never wraps at dawn. It supports multi-day deterministic
  // systems without tying progression to wall-clock time.
  worldAgeMs?: number;
}

const isResourceType = (value: unknown): value is ResourceType =>
  typeof value === 'string' && Object.values(ResourceType).includes(value as ResourceType);

const readDroppedItem = (value: unknown): DroppedItem | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const drop = value as Partial<DroppedItem> & { resource?: unknown };
  // Older saves named this resource-only field `resource`. Read it once and immediately save
  // the generalized item form so crafted tools and placeables can live on the ground too.
  const item = isInventoryItem(drop.item)
    ? drop.item
    : isResourceType(drop.resource)
      ? drop.resource
      : null;
  if (typeof drop.id !== 'string' || !item || typeof drop.amount !== 'number'
    || !Number.isInteger(drop.amount) || drop.amount < 1 || drop.amount > inventoryItemStackLimit(item)
    || typeof drop.worldX !== 'number' || !Number.isFinite(drop.worldX)
    || typeof drop.worldY !== 'number' || !Number.isFinite(drop.worldY)) {
    return null;
  }
  return { id: drop.id, item, amount: drop.amount, worldX: drop.worldX, worldY: drop.worldY };
};

const isInventorySlot = (value: unknown): value is InventorySlot => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const slot = value as Partial<InventorySlot>;
  return isInventoryItem(slot.item)
    && Number.isInteger(slot.amount)
    && (slot.amount ?? 0) > 0
    && (slot.amount ?? 0) <= inventoryItemStackLimit(slot.item);
};

const isBrewingIngredient = (value: unknown): value is InventorySlot =>
  isInventorySlot(value) && isResourceType(value.item) && value.amount === 1;

const isBrewingState = (value: unknown): value is BrewingStationState => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Partial<BrewingStationState>;
  const job = state.job as unknown;
  return Array.isArray(state.ingredients)
    && state.ingredients.length === 2
    && state.ingredients.every((ingredient) => ingredient === null || isBrewingIngredient(ingredient))
    && (job === undefined || (job !== null && typeof job === 'object'
      && isPotionId((job as Partial<BrewingJob>).output)
      && typeof (job as Partial<BrewingJob>).finishesAtMs === 'number'
      && Number.isFinite((job as Partial<BrewingJob>).finishesAtMs)
      && (job as Partial<BrewingJob>).finishesAtMs! > 0));
};

const isFurnaceFuel = (value: InventorySlot): boolean =>
  value.item === ResourceType.Coal && value.amount <= FURNACE_SLOT_STACK_LIMIT;

const isFurnaceOre = (value: InventorySlot): boolean =>
  isResourceType(value.item) && value.amount <= FURNACE_SLOT_STACK_LIMIT && furnaceRecipeFor(value.item) !== null;

const isFurnaceOutput = (value: InventorySlot): boolean =>
  isResourceType(value.item) && value.amount <= FURNACE_SLOT_STACK_LIMIT && furnaceRecipeForOutput(value.item) !== null;

const isFurnaceState = (value: unknown): value is FurnaceState => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Partial<FurnaceState>;
  const job = state.job as unknown;
  return (state.fuel === null || (isInventorySlot(state.fuel) && isFurnaceFuel(state.fuel)))
    && (state.ore === null || (isInventorySlot(state.ore) && isFurnaceOre(state.ore)))
    // Pre-queue saves had no output property. Treat it as an empty output vessel during restore.
    && (state.output === undefined || state.output === null || (isInventorySlot(state.output) && isFurnaceOutput(state.output)))
    && (job === undefined || (job !== null && typeof job === 'object'
      && isResourceType((job as Partial<FurnaceJob>).output)
      && furnaceRecipeForOutput((job as Partial<FurnaceJob>).output!) !== null
      && typeof (job as Partial<FurnaceJob>).finishesAtMs === 'number'
      && Number.isFinite((job as Partial<FurnaceJob>).finishesAtMs)
      && (job as Partial<FurnaceJob>).finishesAtMs! > 0));
};

const LEGACY_SURVEY_BEACON_ID = 'survey beacon';
const LANDMARK_MATERIAL_KEY_MAX_LENGTH = 240;
const MAX_HARVESTED_LANDMARK_MATERIAL_KEYS = 50_000;

const isLandmarkMaterialKey = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length > 0
  && value.length <= LANDMARK_MATERIAL_KEY_MAX_LENGTH
  && !/[\u0000-\u001f\u007f]/.test(value);

const normalizeWaypointLabel = (label: unknown): string => {
  if (typeof label !== 'string') {
    return WAYPOINT_DEFAULT_LABEL;
  }
  const normalized = label.trim().replace(/\s+/g, ' ').slice(0, WAYPOINT_LABEL_MAX_LENGTH);
  return normalized || WAYPOINT_DEFAULT_LABEL;
};

const isPlacedObject = (value: unknown): value is PlacedObject => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const object = value as Partial<PlacedObject>;
  const normalizedPlaceable = (object.placeable as unknown) === LEGACY_SURVEY_BEACON_ID
    ? PlaceableId.Waypoint
    : object.placeable;
  if (typeof object.id !== 'string' || !isPlaceableId(normalizedPlaceable)
    || !Number.isInteger(object.tileX) || !Number.isInteger(object.tileY)) {
    return false;
  }
  const capacity = PLACEABLE_DEFINITIONS[normalizedPlaceable].storageSlots;
  const hasValidStorage = object.storage === undefined || (capacity !== undefined
    && Array.isArray(object.storage)
    && object.storage.length <= capacity
    && object.storage.every((slot) => slot === null || isInventorySlot(slot)));
  const hasValidBrewing = object.brewing === undefined
    || (normalizedPlaceable === PlaceableId.BrewingStation && isBrewingState(object.brewing));
  const hasValidFurnace = object.furnace === undefined
    || (normalizedPlaceable === PlaceableId.Furnace && isFurnaceState(object.furnace));
  const hasValidWaypointLabel = object.waypointLabel === undefined
    || (normalizedPlaceable === PlaceableId.Waypoint
      && typeof object.waypointLabel === 'string');
  return hasValidStorage && hasValidBrewing && hasValidFurnace && hasValidWaypointLabel;
};

// Runtime world changes layer over deterministic generation. This is intentionally compact so
// save games only record changes, never every procedurally generated terrain tile.
export class SessionWorldState {
  private readonly harvestedFeatureKeys = new Set<string>();
  private readonly harvestedCaveOreKeys = new Set<string>();
  private readonly harvestedLandmarkMaterialKeys = new Set<string>();
  private readonly landmarkMaterialRegrowth = new Map<string, number>();
  private readonly drops = new Map<string, DroppedItem>();
  private readonly placedObjects = new Map<string, PlacedObject>();
  private readonly exploredRegionKeys = new Set<string>();
  private readonly explorationRevealStampKeys = new Set<string>();
  private nextDropId = 0;
  private nextPlacedObjectId = 0;
  private savedWorldTimeMs: number | null = null;
  private savedWorldAgeMs = 0;
  private nextLandmarkMaterialRegrowthAtMs = Number.POSITIVE_INFINITY;
  private savedLandmarkMaterialMigrationVersion = 0;

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

  createDrop(tileX: number, tileY: number, item: InventoryItem, amount = 1): DroppedItem {
    return this.createDropAt(
      (tileX + 0.5) * WORLD_TILE_SIZE,
      (tileY + 0.5) * WORLD_TILE_SIZE,
      item,
      amount
    );
  }

  createDropAt(worldX: number, worldY: number, item: InventoryItem, amount = 1): DroppedItem {
    const id = `drop:${this.nextDropId}`;
    this.nextDropId += 1;
    const drop: DroppedItem = { id, item, amount, worldX, worldY };
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

  getPlacedObjects(): PlacedObject[] {
    return Array.from(this.placedObjects.values(), (object) => this.clonePlacedObject(object));
  }

  getPlacedObject(id: string): PlacedObject | null {
    const object = this.placedObjects.get(id);
    return object ? this.clonePlacedObject(object) : null;
  }

  getWaypoints(): WaypointLocation[] {
    const waypoints: WaypointLocation[] = [];
    this.placedObjects.forEach((object) => {
      if (object.placeable === PlaceableId.Waypoint) {
        waypoints.push({
          id: object.id,
          tileX: object.tileX,
          tileY: object.tileY,
          label: object.waypointLabel ?? WAYPOINT_DEFAULT_LABEL
        });
      }
    });
    return waypoints;
  }

  placeObject(placeable: PlaceableId, tileX: number, tileY: number): PlacedObject | null {
    if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) {
      return null;
    }
    const definition = PLACEABLE_DEFINITIONS[placeable];
    const object: PlacedObject = {
      id: `placed:${this.nextPlacedObjectId}`,
      placeable,
      tileX,
      tileY,
      waypointLabel: placeable === PlaceableId.Waypoint ? WAYPOINT_DEFAULT_LABEL : undefined,
      storage: definition.storageSlots
        ? Array.from({ length: definition.storageSlots }, () => null)
        : undefined,
      brewing: placeable === PlaceableId.BrewingStation
        ? { ingredients: [null, null] }
        : undefined,
      furnace: placeable === PlaceableId.Furnace
        ? { fuel: null, ore: null, output: null }
        : undefined
    };
    this.nextPlacedObjectId += 1;
    this.placedObjects.set(object.id, object);
    return this.clonePlacedObject(object);
  }

  setWaypointLabel(objectId: string, label: string): boolean {
    const object = this.placedObjects.get(objectId);
    if (!object || object.placeable !== PlaceableId.Waypoint) {
      return false;
    }
    const normalized = normalizeWaypointLabel(label);
    if (object.waypointLabel === normalized) {
      return false;
    }
    object.waypointLabel = normalized;
    return true;
  }

  storageCanAccept(objectId: string, item: InventoryItem, amount: number): boolean {
    const object = this.placedObjects.get(objectId);
    if (!object?.storage || !Number.isInteger(amount) || amount < 1) {
      return false;
    }
    const limit = inventoryItemStackLimit(item);
    const capacity = object.storage.reduce((total, slot) => {
      if (!slot) {
        return total + limit;
      }
      return total + (slot.item === item ? limit - slot.amount : 0);
    }, 0);
    return capacity >= amount;
  }

  storeInObject(objectId: string, item: InventoryItem, amount: number): number {
    const object = this.placedObjects.get(objectId);
    if (!object?.storage || !Number.isInteger(amount) || amount < 1) {
      return 0;
    }
    const limit = inventoryItemStackLimit(item);
    let remaining = amount;
    object.storage.forEach((slot) => {
      if (!slot || slot.item !== item || remaining === 0) {
        return;
      }
      const stored = Math.min(limit - slot.amount, remaining);
      slot.amount += stored;
      remaining -= stored;
    });
    object.storage.forEach((slot, index) => {
      if (slot || remaining === 0) {
        return;
      }
      const stored = Math.min(limit, remaining);
      object.storage![index] = { item, amount: stored };
      remaining -= stored;
    });
    return amount - remaining;
  }

  takeFromObject(objectId: string, slotIndex: number, requestedAmount?: number): InventorySlot | null {
    const object = this.placedObjects.get(objectId);
    if (!object?.storage || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= object.storage.length) {
      return null;
    }
    const slot = object.storage[slotIndex];
    if (!slot) {
      return null;
    }
    const amount = Math.min(slot.amount, requestedAmount ?? slot.amount);
    if (!Number.isInteger(amount) || amount < 1) {
      return null;
    }
    const taken = { item: slot.item, amount };
    slot.amount -= amount;
    if (slot.amount === 0) {
      object.storage[slotIndex] = null;
    }
    return taken;
  }

  restoreObjectSlot(objectId: string, slotIndex: number, slot: InventorySlot): boolean {
    const object = this.placedObjects.get(objectId);
    if (!object?.storage || !isInventorySlot(slot) || !Number.isInteger(slotIndex)
      || slotIndex < 0 || slotIndex >= object.storage.length || object.storage[slotIndex]) {
      return false;
    }
    object.storage[slotIndex] = { ...slot };
    return true;
  }

  getBrewingState(objectId: string): BrewingStationState | null {
    const brewing = this.placedObjects.get(objectId)?.brewing;
    return brewing ? this.cloneBrewingState(brewing) : null;
  }

  putBrewingIngredient(objectId: string, index: number, ingredient: InventorySlot): boolean {
    const brewing = this.placedObjects.get(objectId)?.brewing;
    if (!brewing || !isBrewingIngredient(ingredient) || !Number.isInteger(index) || index < 0 || index >= 2
      || brewing.ingredients[index] || brewing.job) {
      return false;
    }
    brewing.ingredients[index] = { ...ingredient };
    return true;
  }

  takeBrewingIngredient(objectId: string, index: number): InventorySlot | null {
    const brewing = this.placedObjects.get(objectId)?.brewing;
    if (!brewing || !Number.isInteger(index) || index < 0 || index >= 2 || brewing.job) {
      return null;
    }
    const ingredient = brewing.ingredients[index];
    if (!ingredient) {
      return null;
    }
    brewing.ingredients[index] = null;
    return { ...ingredient };
  }

  startBrewing(objectId: string, nowMs = Date.now()): PotionId | null {
    const brewing = this.placedObjects.get(objectId)?.brewing;
    const [first, second] = brewing?.ingredients ?? [];
    if (!brewing || brewing.job || !first || !second || !isResourceType(first.item) || !isResourceType(second.item)
      || !Number.isFinite(nowMs)) {
      return null;
    }
    const potion = potionForIngredients(first.item, second.item);
    if (!potion) {
      return null;
    }
    brewing.ingredients = [null, null];
    brewing.job = { output: potion.id, finishesAtMs: nowMs + potion.brewDurationMs };
    return potion.id;
  }

  brewingOutput(objectId: string, nowMs = Date.now()): PotionId | null {
    const job = this.placedObjects.get(objectId)?.brewing?.job;
    return job && nowMs >= job.finishesAtMs ? job.output : null;
  }

  collectBrewingOutput(objectId: string, nowMs = Date.now()): PotionId | null {
    const brewing = this.placedObjects.get(objectId)?.brewing;
    if (!brewing?.job || nowMs < brewing.job.finishesAtMs) {
      return null;
    }
    const output = brewing.job.output;
    brewing.job = undefined;
    return output;
  }

  getFurnaceState(objectId: string): FurnaceState | null {
    const furnace = this.placedObjects.get(objectId)?.furnace;
    return furnace ? this.cloneFurnaceState(furnace) : null;
  }

  // The active job has already reserved one coal and one raw ore internally. Expose those
  // reserved materials with the visible input stack so the UI can let either vessel cancel a
  // refinement, including the common one-item batch where the stored stack is otherwise empty.
  furnaceItemAvailableToTake(objectId: string, slot: 'fuel' | 'ore'): InventorySlot | null {
    const furnace = this.placedObjects.get(objectId)?.furnace;
    if (!furnace) {
      return null;
    }
    const item = furnace[slot] ? { ...furnace[slot] } : null;
    if (!furnace.job) {
      return item;
    }
    const reservedItem = slot === 'fuel'
      ? ResourceType.Coal
      : furnaceRecipeForOutput(furnace.job.output)?.input ?? null;
    if (!reservedItem) {
      return item;
    }
    if (item && item.item !== reservedItem) {
      return item;
    }
    return { item: reservedItem, amount: (item?.amount ?? 0) + 1 };
  }

  furnaceItemCapacity(objectId: string, slot: 'fuel' | 'ore', item: InventoryItem, nowMs = Date.now()): number {
    const furnace = this.placedObjects.get(objectId)?.furnace;
    if (!furnace || !Number.isFinite(nowMs)) {
      return 0;
    }
    this.advanceFurnace(furnace, nowMs);
    const candidate: InventorySlot = { item, amount: 1 };
    if ((slot === 'fuel' && !isFurnaceFuel(candidate)) || (slot === 'ore' && !isFurnaceOre(candidate))) {
      return 0;
    }
    if (slot === 'ore' && furnace.job && furnaceRecipeFor(item as ResourceType)?.output !== furnace.job.output) {
      return 0;
    }
    if (slot === 'ore' && furnace.output && furnaceRecipeFor(item as ResourceType)?.output !== furnace.output.item) {
      return 0;
    }
    const stored = furnace[slot];
    if (stored && stored.item !== item) {
      return 0;
    }
    return FURNACE_SLOT_STACK_LIMIT - (stored?.amount ?? 0);
  }

  putFurnaceItem(objectId: string, slot: 'fuel' | 'ore', item: InventorySlot): boolean {
    const furnace = this.placedObjects.get(objectId)?.furnace;
    if (!furnace || !isInventorySlot(item)) {
      return false;
    }
    const nowMs = Date.now();
    this.advanceFurnace(furnace, nowMs);
    if ((slot === 'fuel' && !isFurnaceFuel(item)) || (slot === 'ore' && !isFurnaceOre(item))) {
      return false;
    }
    if (item.amount > this.furnaceItemCapacity(objectId, slot, item.item)) {
      return false;
    }
    const stored = furnace[slot];
    if (stored) {
      stored.amount += item.amount;
    } else {
      furnace[slot] = { ...item };
    }
    // A furnace is self-lighting: the moment both compatible inputs exist, begin the first
    // 20-second refinement. Subsequent jobs are also started by advanceFurnace.
    this.startNextFurnaceJob(furnace, nowMs);
    return true;
  }

  takeFurnaceItem(objectId: string, slot: 'fuel' | 'ore', requestedAmount?: number): InventorySlot | null {
    const furnace = this.placedObjects.get(objectId)?.furnace;
    if (!furnace) {
      return null;
    }
    this.cancelFurnaceJob(furnace);
    const item = furnace[slot];
    if (!item) {
      return null;
    }
    const amount = Math.min(item.amount, requestedAmount ?? item.amount);
    if (!Number.isInteger(amount) || amount < 1) {
      return null;
    }
    const taken = { item: item.item, amount };
    item.amount -= amount;
    if (item.amount === 0) {
      furnace[slot] = null;
    }
    return taken;
  }

  furnaceOutput(objectId: string, nowMs = Date.now()): InventorySlot | null {
    const furnace = this.placedObjects.get(objectId)?.furnace;
    if (!furnace || !Number.isFinite(nowMs)) {
      return null;
    }
    this.advanceFurnace(furnace, nowMs);
    return furnace.output ? { ...furnace.output } : null;
  }

  collectFurnaceOutput(objectId: string, nowMs = Date.now(), requestedAmount?: number): InventorySlot | null {
    const furnace = this.placedObjects.get(objectId)?.furnace;
    if (!furnace || !Number.isFinite(nowMs)) {
      return null;
    }
    this.advanceFurnace(furnace, nowMs);
    const output = furnace.output;
    if (!output) {
      return null;
    }
    const amount = Math.min(output.amount, requestedAmount ?? output.amount);
    if (!Number.isInteger(amount) || amount < 1) {
      return null;
    }
    const collected = { item: output.item, amount };
    output.amount -= amount;
    if (output.amount === 0) {
      furnace.output = null;
    }
    // A full output vessel is the only thing that can pause an otherwise fueled queue. Once it
    // is emptied, first flush a completed job that was waiting for output space, then restart
    // the next individual refinement without asking the player to relight.
    this.advanceFurnace(furnace, nowMs);
    this.startNextFurnaceJob(furnace, nowMs);
    return collected;
  }

  furnaceIsRefining(objectId: string, nowMs = Date.now()): boolean {
    const furnace = this.placedObjects.get(objectId)?.furnace;
    if (!furnace || !Number.isFinite(nowMs)) {
      return false;
    }
    this.advanceFurnace(furnace, nowMs);
    return Boolean(furnace.job && nowMs < furnace.job.finishesAtMs);
  }

  private startNextFurnaceJob(furnace: FurnaceState, startsAtMs: number): ResourceType | null {
    if (furnace.job || !furnace.fuel || !furnace.ore || !isFurnaceFuel(furnace.fuel) || !isFurnaceOre(furnace.ore)) {
      return null;
    }
    const recipe = furnaceRecipeFor(furnace.ore.item as ResourceType);
    if (!recipe || (furnace.output && (furnace.output.item !== recipe.output || furnace.output.amount >= FURNACE_SLOT_STACK_LIMIT))) {
      return null;
    }
    furnace.fuel.amount -= 1;
    furnace.ore.amount -= 1;
    if (furnace.fuel.amount === 0) {
      furnace.fuel = null;
    }
    if (furnace.ore.amount === 0) {
      furnace.ore = null;
    }
    furnace.job = { output: recipe.output, finishesAtMs: startsAtMs + recipe.durationMs };
    return recipe.output;
  }

  private cancelFurnaceJob(furnace: FurnaceState): boolean {
    const job = furnace.job;
    if (!job) {
      return false;
    }
    const recipe = furnaceRecipeForOutput(job.output);
    furnace.job = undefined;
    if (!recipe) {
      return true;
    }
    this.returnFurnaceItem(furnace, 'fuel', ResourceType.Coal);
    this.returnFurnaceItem(furnace, 'ore', recipe.input);
    return true;
  }

  private returnFurnaceItem(furnace: FurnaceState, slot: 'fuel' | 'ore', item: ResourceType): void {
    const stored = furnace[slot];
    if (stored && stored.item === item) {
      stored.amount += 1;
    } else if (!stored) {
      furnace[slot] = { item, amount: 1 };
    }
  }

  private advanceFurnace(furnace: FurnaceState, nowMs: number): boolean {
    let changed = false;
    while (furnace.job && nowMs >= furnace.job.finishesAtMs) {
      const completedJob = furnace.job;
      if (furnace.output && (furnace.output.item !== completedJob.output || furnace.output.amount >= FURNACE_SLOT_STACK_LIMIT)) {
        break;
      }
      if (furnace.output) {
        furnace.output.amount += 1;
      } else {
        furnace.output = { item: completedJob.output, amount: 1 };
      }
      furnace.job = undefined;
      changed = true;
      // Use the previous finish time as the next start time so a loaded save processes each
      // queued ore at its true 20-second cadence rather than collapsing the batch into one tick.
      if (!this.startNextFurnaceJob(furnace, completedJob.finishesAtMs)) {
        break;
      }
      changed = true;
    }
    // This covers legacy saves that may contain queued fuel and ore without an active job.
    if (!furnace.job && this.startNextFurnaceJob(furnace, nowMs)) {
      changed = true;
    }
    return changed;
  }

  canPickUpObject(objectId: string): boolean {
    const object = this.placedObjects.get(objectId);
    return object !== undefined
      && !object.storage?.some((slot) => slot !== null)
      && !object.brewing?.ingredients.some((slot) => slot !== null)
      && !object.brewing?.job
      && !object.furnace?.fuel
      && !object.furnace?.ore
      && !object.furnace?.output
      && !object.furnace?.job;
  }

  removeObject(objectId: string): PlacedObject | null {
    if (!this.canPickUpObject(objectId)) {
      return null;
    }
    const object = this.placedObjects.get(objectId);
    if (!object) {
      return null;
    }
    this.placedObjects.delete(objectId);
    return this.clonePlacedObject(object);
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

  isLandmarkMaterialHarvested(materialId: string): boolean {
    return isLandmarkMaterialKey(materialId) && this.harvestedLandmarkMaterialKeys.has(materialId);
  }

  harvestLandmarkMaterial(materialId: string, regrowDelayMs?: number): boolean {
    if (!isLandmarkMaterialKey(materialId)
      || this.harvestedLandmarkMaterialKeys.has(materialId)
      || (regrowDelayMs !== undefined && (!Number.isFinite(regrowDelayMs) || regrowDelayMs <= 0))
      || this.harvestedLandmarkMaterialKeys.size >= MAX_HARVESTED_LANDMARK_MATERIAL_KEYS) {
      return false;
    }

    this.harvestedLandmarkMaterialKeys.add(materialId);
    if (regrowDelayMs !== undefined) {
      this.scheduleLandmarkMaterialRegrowth(materialId, regrowDelayMs);
    } else {
      this.landmarkMaterialRegrowth.delete(materialId);
    }
    return true;
  }

  scheduleLandmarkMaterialRegrowth(materialId: string, regrowDelayMs: number): boolean {
    if (!isLandmarkMaterialKey(materialId)
      || !this.harvestedLandmarkMaterialKeys.has(materialId)
      || this.landmarkMaterialRegrowth.has(materialId)
      || !Number.isFinite(regrowDelayMs)
      || regrowDelayMs <= 0) {
      return false;
    }
    const regrowsAtMs = this.savedWorldAgeMs + regrowDelayMs;
    this.landmarkMaterialRegrowth.set(materialId, regrowsAtMs);
    this.nextLandmarkMaterialRegrowthAtMs = Math.min(this.nextLandmarkMaterialRegrowthAtMs, regrowsAtMs);
    return true;
  }

  getHarvestedLandmarkMaterialIds(): string[] {
    return Array.from(this.harvestedLandmarkMaterialKeys);
  }

  restoreLandmarkMaterial(materialId: string): boolean {
    if (!isLandmarkMaterialKey(materialId)) {
      return false;
    }
    const restored = this.harvestedLandmarkMaterialKeys.delete(materialId);
    const removedDeadline = this.landmarkMaterialRegrowth.delete(materialId);
    if (removedDeadline) {
      this.nextLandmarkMaterialRegrowthAtMs = Array.from(this.landmarkMaterialRegrowth.values()).reduce(
        (next, regrowsAtMs) => Math.min(next, regrowsAtMs),
        Number.POSITIVE_INFINITY
      );
    }
    return restored || removedDeadline;
  }

  get landmarkMaterialMigrationVersion(): number {
    return this.savedLandmarkMaterialMigrationVersion;
  }

  setLandmarkMaterialMigrationVersion(version: number): boolean {
    if (!Number.isInteger(version) || version < 0 || version <= this.savedLandmarkMaterialMigrationVersion) {
      return false;
    }
    this.savedLandmarkMaterialMigrationVersion = version;
    return true;
  }

  advanceWorldAge(deltaMs: number): string[] {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return [];
    }
    this.savedWorldAgeMs += deltaMs;
    if (this.savedWorldAgeMs < this.nextLandmarkMaterialRegrowthAtMs) {
      return [];
    }

    const regrownMaterialIds: string[] = [];
    let nextRegrowthAtMs = Number.POSITIVE_INFINITY;
    this.landmarkMaterialRegrowth.forEach((regrowsAtMs, materialId) => {
      if (regrowsAtMs <= this.savedWorldAgeMs) {
        this.landmarkMaterialRegrowth.delete(materialId);
        if (this.harvestedLandmarkMaterialKeys.delete(materialId)) {
          regrownMaterialIds.push(materialId);
        }
      } else {
        nextRegrowthAtMs = Math.min(nextRegrowthAtMs, regrowsAtMs);
      }
    });
    this.nextLandmarkMaterialRegrowthAtMs = nextRegrowthAtMs;
    return regrownMaterialIds;
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

  get worldAgeMs(): number {
    return this.savedWorldAgeMs;
  }

  toSaveData(): SessionWorldStateData {
    return {
      harvestedFeatureKeys: Array.from(this.harvestedFeatureKeys),
      harvestedCaveOreKeys: Array.from(this.harvestedCaveOreKeys),
      harvestedLandmarkMaterialKeys: Array.from(this.harvestedLandmarkMaterialKeys),
      landmarkMaterialRegrowth: Array.from(
        this.landmarkMaterialRegrowth,
        ([materialId, regrowsAtWorldAgeMs]) => ({ materialId, regrowsAtWorldAgeMs })
      ),
      landmarkMaterialMigrationVersion: this.savedLandmarkMaterialMigrationVersion,
      drops: this.getDrops(),
      nextDropId: this.nextDropId,
      placedObjects: this.getPlacedObjects(),
      nextPlacedObjectId: this.nextPlacedObjectId,
      exploredRegionKeys: Array.from(this.exploredRegionKeys),
      explorationRegionSizeTiles: EXPLORATION_SAVE_REGION_SIZE_TILES,
      explorationRevealStampKeys: Array.from(this.explorationRevealStampKeys),
      worldTimeMs: this.savedWorldTimeMs ?? undefined,
      worldAgeMs: this.savedWorldAgeMs
    };
  }

  restore(data: unknown): void {
    this.harvestedFeatureKeys.clear();
    this.harvestedCaveOreKeys.clear();
    this.harvestedLandmarkMaterialKeys.clear();
    this.landmarkMaterialRegrowth.clear();
    this.drops.clear();
    this.placedObjects.clear();
    this.exploredRegionKeys.clear();
    this.explorationRevealStampKeys.clear();
    this.nextDropId = 0;
    this.nextPlacedObjectId = 0;
    this.savedWorldTimeMs = null;
    this.savedWorldAgeMs = 0;
    this.nextLandmarkMaterialRegrowthAtMs = Number.POSITIVE_INFINITY;
    this.savedLandmarkMaterialMigrationVersion = 0;

    if (!data || typeof data !== 'object') {
      return;
    }

    const state = data as Partial<SessionWorldStateData>;
    if (typeof state.worldAgeMs === 'number' && Number.isFinite(state.worldAgeMs) && state.worldAgeMs >= 0) {
      this.savedWorldAgeMs = state.worldAgeMs;
    }
    if (typeof state.landmarkMaterialMigrationVersion === 'number'
      && Number.isInteger(state.landmarkMaterialMigrationVersion)
      && state.landmarkMaterialMigrationVersion >= 0) {
      this.savedLandmarkMaterialMigrationVersion = state.landmarkMaterialMigrationVersion;
    }
    if (Array.isArray(state.harvestedFeatureKeys)) {
      state.harvestedFeatureKeys.forEach((key) => {
        if (typeof key === 'string') {
          this.harvestedFeatureKeys.add(key);
        }
      });
    }

    if (Array.isArray(state.drops)) {
      state.drops.forEach((savedDrop) => {
        const drop = readDroppedItem(savedDrop);
        if (drop) {
          this.drops.set(drop.id, drop);
        }
      });
    }

    if (typeof state.nextDropId === 'number' && Number.isInteger(state.nextDropId) && state.nextDropId >= 0) {
      this.nextDropId = state.nextDropId;
    }

    if (Array.isArray(state.placedObjects)) {
      state.placedObjects.filter(isPlacedObject).forEach((savedObject) => {
        const rawPlaceable = savedObject.placeable as unknown;
        const object: PlacedObject = {
          ...savedObject,
          placeable: rawPlaceable === LEGACY_SURVEY_BEACON_ID ? PlaceableId.Waypoint : savedObject.placeable,
          waypointLabel: rawPlaceable === LEGACY_SURVEY_BEACON_ID || savedObject.placeable === PlaceableId.Waypoint
            ? normalizeWaypointLabel(savedObject.waypointLabel)
            : undefined
        };
        const definition = PLACEABLE_DEFINITIONS[object.placeable];
        const storage = definition.storageSlots
          ? Array.from(
            { length: definition.storageSlots },
            (_, index) => object.storage?.[index] ? { ...object.storage[index]! } : null
          )
          : undefined;
        const brewing = object.placeable === PlaceableId.BrewingStation
          ? object.brewing && isBrewingState(object.brewing)
            ? this.cloneBrewingState(object.brewing)
            : { ingredients: [null, null] as [null, null] }
          : undefined;
        const furnace = object.placeable === PlaceableId.Furnace
          ? object.furnace && isFurnaceState(object.furnace)
            ? this.cloneFurnaceState(object.furnace)
            : { fuel: null, ore: null, output: null }
          : undefined;
        this.placedObjects.set(object.id, { ...object, storage, brewing, furnace });
      });
    }
    if (typeof state.nextPlacedObjectId === 'number' && Number.isInteger(state.nextPlacedObjectId) && state.nextPlacedObjectId >= 0) {
      this.nextPlacedObjectId = state.nextPlacedObjectId;
    } else {
      this.nextPlacedObjectId = this.placedObjects.size;
    }

    if (Array.isArray(state.harvestedCaveOreKeys)) {
      state.harvestedCaveOreKeys.forEach((key) => {
        if (typeof key === 'string' && key.length <= 160) {
          this.harvestedCaveOreKeys.add(key);
        }
      });
    }

    if (Array.isArray(state.harvestedLandmarkMaterialKeys)) {
      const limit = Math.min(state.harvestedLandmarkMaterialKeys.length, MAX_HARVESTED_LANDMARK_MATERIAL_KEYS);
      for (let index = 0; index < limit; index += 1) {
        const key = state.harvestedLandmarkMaterialKeys[index];
        if (isLandmarkMaterialKey(key)) {
          this.harvestedLandmarkMaterialKeys.add(key);
        }
      }
    }

    if (Array.isArray(state.landmarkMaterialRegrowth)) {
      const limit = Math.min(state.landmarkMaterialRegrowth.length, MAX_HARVESTED_LANDMARK_MATERIAL_KEYS);
      for (let index = 0; index < limit; index += 1) {
        const regrowth = state.landmarkMaterialRegrowth[index] as Partial<LandmarkMaterialRegrowthState> | undefined;
        if (!regrowth || !isLandmarkMaterialKey(regrowth.materialId)
          || !this.harvestedLandmarkMaterialKeys.has(regrowth.materialId)
          || typeof regrowth.regrowsAtWorldAgeMs !== 'number'
          || !Number.isFinite(regrowth.regrowsAtWorldAgeMs)) {
          continue;
        }
        if (regrowth.regrowsAtWorldAgeMs <= this.savedWorldAgeMs) {
          this.harvestedLandmarkMaterialKeys.delete(regrowth.materialId);
          continue;
        }
        this.landmarkMaterialRegrowth.set(regrowth.materialId, regrowth.regrowsAtWorldAgeMs);
        this.nextLandmarkMaterialRegrowthAtMs = Math.min(
          this.nextLandmarkMaterialRegrowthAtMs,
          regrowth.regrowsAtWorldAgeMs
        );
      }
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

  get placedObjectCount(): number {
    return this.placedObjects.size;
  }

  get harvestedCaveOreCount(): number {
    return this.harvestedCaveOreKeys.size;
  }

  get harvestedLandmarkMaterialCount(): number {
    return this.harvestedLandmarkMaterialKeys.size;
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

  private clonePlacedObject(object: PlacedObject): PlacedObject {
    return {
      ...object,
      storage: object.storage?.map((slot) => slot ? { ...slot } : null),
      brewing: object.brewing ? this.cloneBrewingState(object.brewing) : undefined,
      furnace: object.furnace ? this.cloneFurnaceState(object.furnace) : undefined
    };
  }

  private cloneBrewingState(state: BrewingStationState): BrewingStationState {
    return {
      ingredients: [
        state.ingredients[0] ? { ...state.ingredients[0] } : null,
        state.ingredients[1] ? { ...state.ingredients[1] } : null
      ],
      job: state.job ? { ...state.job } : undefined
    };
  }

  private cloneFurnaceState(state: FurnaceState): FurnaceState {
    return {
      fuel: state.fuel ? { ...state.fuel } : null,
      ore: state.ore ? { ...state.ore } : null,
      output: state.output ? { ...state.output } : null,
      job: state.job ? { ...state.job } : undefined
    };
  }
}

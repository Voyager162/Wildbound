import type { InventorySlot } from '../player/Inventory';
import type { SessionWorldStateData } from '../world/SessionWorldState';
import { HOTBAR_SLOT_COUNT } from '../player/Inventory';
import { isToolId, type ToolId } from '../crafting/toolConfig';
import { isPotionEffect, type PotionEffect } from '../crafting/potionConfig';
import { LandmarkType } from '../world/landmarkConfig';
import { isWorldMode, type WorldMode } from './WorldLibrary';

export interface ActiveCaveSaveData {
  entranceTileX: number;
  entranceTileY: number;
  returnWorldX: number;
  returnWorldY: number;
}

export const SAVEABLE_LANDMARK_TYPES = [
  LandmarkType.GiantAncientTree,
  LandmarkType.Waterfall,
  LandmarkType.Watchtower
] as const;

export type SaveableLandmarkType = (typeof SAVEABLE_LANDMARK_TYPES)[number];

export interface ActiveLandmarkInteriorSaveData {
  landmarkId: string;
  landmarkType: SaveableLandmarkType;
  centerTileX: number;
  centerTileY: number;
  returnWorldX: number;
  returnWorldY: number;
  // Optional for backward compatibility with single-floor landmark-interior saves.
  floorNumber?: 1 | 2 | 3;
}

export interface ActivePotionSaveData {
  effect: PotionEffect;
  expiresAtMs: number;
}

export interface SaveGameData {
  version: 1;
  seed: string;
  // The library index is the primary source of mode. This mirror keeps copied or migrated saves
  // self-describing without invalidating older survival saves that do not have the field.
  mode?: WorldMode;
  player: {
    x: number;
    y: number;
  };
  inventory: Array<InventorySlot | null>;
  equipment?: {
    equippedTool: ToolId | null;
    activeHotbarSlot?: number;
  };
  effects?: {
    activePotions: ActivePotionSaveData[];
  };
  world: SessionWorldStateData;
  activeCave?: ActiveCaveSaveData;
  activeLandmarkInterior?: ActiveLandmarkInteriorSaveData;
}

const isSaveableLandmarkType = (value: unknown): value is SaveableLandmarkType =>
  SAVEABLE_LANDMARK_TYPES.includes(value as SaveableLandmarkType);

const isActiveLandmarkInteriorSaveData = (value: unknown): value is ActiveLandmarkInteriorSaveData => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const interior = value as Partial<ActiveLandmarkInteriorSaveData>;
  return typeof interior.landmarkId === 'string'
    && interior.landmarkId.length > 0
    && interior.landmarkId.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(interior.landmarkId)
    && isSaveableLandmarkType(interior.landmarkType)
    && Number.isSafeInteger(interior.centerTileX)
    && Number.isSafeInteger(interior.centerTileY)
    && Number.isFinite(interior.returnWorldX)
    && Number.isFinite(interior.returnWorldY)
    && (interior.floorNumber === undefined
      || (interior.landmarkType === LandmarkType.Watchtower
        && (interior.floorNumber === 1 || interior.floorNumber === 2 || interior.floorNumber === 3)));
};

export const isSaveGameData = (value: unknown): value is SaveGameData => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const save = value as Partial<SaveGameData>;
  return save.version === 1
    && typeof save.seed === 'string'
    && (save.mode === undefined || isWorldMode(save.mode))
    && Boolean(save.player)
    && Number.isFinite(save.player?.x)
    && Number.isFinite(save.player?.y)
    && Array.isArray(save.inventory)
    && (!save.equipment || (
      (save.equipment.equippedTool === null || isToolId(save.equipment.equippedTool))
      && (save.equipment.activeHotbarSlot === undefined
        || (Number.isInteger(save.equipment.activeHotbarSlot)
          && save.equipment.activeHotbarSlot >= 0
          && save.equipment.activeHotbarSlot < HOTBAR_SLOT_COUNT))
    ))
    && (!save.effects || (Array.isArray(save.effects.activePotions)
      && save.effects.activePotions.every((effect) => isPotionEffect(effect?.effect)
        && typeof effect.expiresAtMs === 'number' && Number.isFinite(effect.expiresAtMs))))
    && Boolean(save.world)
    && !(save.activeCave && save.activeLandmarkInterior)
    && (!save.activeCave || (
      Number.isInteger(save.activeCave.entranceTileX)
      && Number.isInteger(save.activeCave.entranceTileY)
      && Number.isFinite(save.activeCave.returnWorldX)
      && Number.isFinite(save.activeCave.returnWorldY)
    ))
    && (save.activeLandmarkInterior === undefined
      || isActiveLandmarkInteriorSaveData(save.activeLandmarkInterior));
};

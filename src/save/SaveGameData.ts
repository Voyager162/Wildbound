import type { InventorySlot } from '../player/Inventory';
import type { SessionWorldStateData } from '../world/SessionWorldState';
import { HOTBAR_SLOT_COUNT } from '../player/Inventory';
import { isToolId, type ToolId } from '../crafting/toolConfig';

export interface ActiveCaveSaveData {
  entranceTileX: number;
  entranceTileY: number;
  returnWorldX: number;
  returnWorldY: number;
}

export interface SaveGameData {
  version: 1;
  seed: string;
  player: {
    x: number;
    y: number;
  };
  inventory: Array<InventorySlot | null>;
  equipment?: {
    equippedTool: ToolId | null;
    activeHotbarSlot?: number;
  };
  world: SessionWorldStateData;
  activeCave?: ActiveCaveSaveData;
}

export const isSaveGameData = (value: unknown): value is SaveGameData => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const save = value as Partial<SaveGameData>;
  return save.version === 1
    && typeof save.seed === 'string'
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
    && Boolean(save.world)
    && (!save.activeCave || (
      Number.isInteger(save.activeCave.entranceTileX)
      && Number.isInteger(save.activeCave.entranceTileY)
      && Number.isFinite(save.activeCave.returnWorldX)
      && Number.isFinite(save.activeCave.returnWorldY)
    ));
};

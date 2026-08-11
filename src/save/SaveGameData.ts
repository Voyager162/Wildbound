import type { InventorySlot } from '../player/Inventory';
import type { SessionWorldStateData } from '../world/SessionWorldState';

export interface SaveGameData {
  version: 1;
  seed: string;
  player: {
    x: number;
    y: number;
  };
  inventory: Array<InventorySlot | null>;
  world: SessionWorldStateData;
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
    && Boolean(save.world);
};

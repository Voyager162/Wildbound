import { featureAtTile, TerrainFeatureType } from '../world/generation/featureGenerator';

export enum FacingDirection {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right'
}

export interface InteractionTarget {
  tileX: number;
  tileY: number;
  feature: TerrainFeatureType;
}

const facingOffsets: Record<FacingDirection, { x: number; y: number }> = {
  [FacingDirection.Up]: { x: 0, y: -1 },
  [FacingDirection.Down]: { x: 0, y: 1 },
  [FacingDirection.Left]: { x: -1, y: 0 },
  [FacingDirection.Right]: { x: 1, y: 0 }
};

// This returns world data only; the scene decides how prompts and feedback are rendered.
export const getInteractionTarget = (
  seed: string,
  playerTileX: number,
  playerTileY: number,
  facing: FacingDirection
): InteractionTarget | null => {
  const offset = facingOffsets[facing];
  const tileX = playerTileX + offset.x;
  const tileY = playerTileY + offset.y;
  const feature = featureAtTile(seed, tileX, tileY);

  return feature ? { tileX, tileY, feature } : null;
};

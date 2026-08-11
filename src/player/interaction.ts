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

// A three-tile-deep, three-tile-wide directional interaction area is forgiving at the current camera scale.
const INTERACTION_REACH_TILES = 3;
const INTERACTION_HALF_WIDTH_TILES = 1;

const facingOffsets: Record<FacingDirection, { x: number; y: number }> = {
  [FacingDirection.Up]: { x: 0, y: -1 },
  [FacingDirection.Down]: { x: 0, y: 1 },
  [FacingDirection.Left]: { x: -1, y: 0 },
  [FacingDirection.Right]: { x: 1, y: 0 }
};

const perpendicularOffsets: Record<FacingDirection, { x: number; y: number }> = {
  [FacingDirection.Up]: { x: 1, y: 0 },
  [FacingDirection.Down]: { x: 1, y: 0 },
  [FacingDirection.Left]: { x: 0, y: 1 },
  [FacingDirection.Right]: { x: 0, y: 1 }
};

const lateralOffsets = [0, -1, 1];

// This returns world data only; the scene decides how prompts and feedback are rendered.
export const getInteractionTarget = (
  seed: string,
  playerTileX: number,
  playerTileY: number,
  facing: FacingDirection
): InteractionTarget | null => {
  const forward = facingOffsets[facing];
  const perpendicular = perpendicularOffsets[facing];

  for (let distance = 1; distance <= INTERACTION_REACH_TILES; distance += 1) {
    for (const lateral of lateralOffsets) {
      if (Math.abs(lateral) > INTERACTION_HALF_WIDTH_TILES) {
        continue;
      }

      const tileX = playerTileX + forward.x * distance + perpendicular.x * lateral;
      const tileY = playerTileY + forward.y * distance + perpendicular.y * lateral;
      const feature = featureAtTile(seed, tileX, tileY);

      if (feature) {
        return { tileX, tileY, feature };
      }
    }
  }

  return null;
};
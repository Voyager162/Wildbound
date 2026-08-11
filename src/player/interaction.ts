import { featureAtTile, TerrainFeatureType } from '../world/generation/featureGenerator';
import { WORLD_TILE_SIZE } from '../world/worldConfig';

export enum FacingDirection {
  Up = 'up',
  UpRight = 'up-right',
  Right = 'right',
  DownRight = 'down-right',
  Down = 'down',
  DownLeft = 'down-left',
  Left = 'left',
  UpLeft = 'up-left'
}

export interface InteractionTarget {
  tileX: number;
  tileY: number;
  feature: TerrainFeatureType;
}

// Every feature uses the same circular interaction range, measured from its tile center.
export const INTERACTION_RADIUS_PIXELS = 96;
const INTERACTION_RADIUS_SQUARED = INTERACTION_RADIUS_PIXELS * INTERACTION_RADIUS_PIXELS;
const CANDIDATE_TILE_RADIUS = Math.ceil(INTERACTION_RADIUS_PIXELS / WORLD_TILE_SIZE) + 1;

type FeatureAvailability = (tileX: number, tileY: number) => boolean;
const featureIsAvailable: FeatureAvailability = () => true;

// This returns world data only; the scene decides how highlights and feedback are rendered.
export const getInteractionTarget = (
  seed: string,
  playerWorldX: number,
  playerWorldY: number,
  isAvailable: FeatureAvailability = featureIsAvailable
): InteractionTarget | null => {
  const playerTileX = Math.floor(playerWorldX / WORLD_TILE_SIZE);
  const playerTileY = Math.floor(playerWorldY / WORLD_TILE_SIZE);
  let closestTarget: InteractionTarget | null = null;
  let closestDistanceSquared = Infinity;

  for (let tileY = playerTileY - CANDIDATE_TILE_RADIUS; tileY <= playerTileY + CANDIDATE_TILE_RADIUS; tileY += 1) {
    for (let tileX = playerTileX - CANDIDATE_TILE_RADIUS; tileX <= playerTileX + CANDIDATE_TILE_RADIUS; tileX += 1) {
      const feature = featureAtTile(seed, tileX, tileY);

      if (!feature || !isAvailable(tileX, tileY)) {
        continue;
      }

      const featureWorldX = (tileX + 0.5) * WORLD_TILE_SIZE;
      const featureWorldY = (tileY + 0.5) * WORLD_TILE_SIZE;
      const distanceX = featureWorldX - playerWorldX;
      const distanceY = featureWorldY - playerWorldY;
      const distanceSquared = distanceX * distanceX + distanceY * distanceY;

      if (distanceSquared <= INTERACTION_RADIUS_SQUARED && distanceSquared < closestDistanceSquared) {
        closestDistanceSquared = distanceSquared;
        closestTarget = { tileX, tileY, feature };
      }
    }
  }

  return closestTarget;
};

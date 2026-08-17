import { Biome } from './generation/biomeGenerator';

// This is the primary density control for the decorative, non-harvestable grass layer. Values
// are chance multipliers from 0 (none) to 1 (a patch on every eligible tile). Placement obeys
// the final gameplay biome, so a zero here guarantees that no ground-grass patch is generated
// in that biome. Adjust these values to tune each biome independently.
export const GROUND_GRASS_DENSITY_BY_BIOME: Readonly<Record<Biome, number>> = {
  [Biome.Ocean]: 0,
  [Biome.Beach]: 0,
  [Biome.Plains]: 0.38,
  [Biome.Forest]: 0.27,
  [Biome.Desert]: 0,
  [Biome.Swamp]: .1,
  [Biome.Hills]: 0.1,
  [Biome.Mountains]: 0,
  [Biome.Snow]: 0
};

// Ground grass uses a full render-sized window and is prepared an extra chunk beyond it. The
// preload window makes patches exist before a player can reach the camera edge, eliminating
// visible pop-in without keeping the layer drawing outside the screen-sized render window.
export const GROUND_GRASS_RENDER_RADIUS_X = 3;
export const GROUND_GRASS_RENDER_RADIUS_Y = 2;
export const GROUND_GRASS_PRELOAD_RADIUS_X = 4;
export const GROUND_GRASS_PRELOAD_RADIUS_Y = 3;

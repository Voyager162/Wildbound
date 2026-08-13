// Object-level wind is used for harvestable foliage so leaves and blades pivot naturally around
// their roots rather than having the underlying texture warped by a shader.
export const FEATURE_FOLIAGE_SWAY_SPEED = 1.18;
export const TREE_CANOPY_SWAY_RADIANS = 0.068;
export const REED_SWAY_RADIANS = 0.09;
export const HARVESTABLE_GRASS_SWAY_RADIANS = 0.11;

// Ground grass is rendered as small shared animation atlases. Each patch contains independently
// bending blades, but the whole field still updates in a single bounded frame-selection pass.
export const GROUND_GRASS_ANIMATION_FRAME_MS = 24;
export const GROUND_GRASS_ANIMATION_FRAME_COUNT = 24;
export const GROUND_GRASS_PATTERN_VARIANTS = 6;

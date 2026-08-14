// Each living feature has an independent wind-rate control. Lower values make a calmer wind and
// higher values make a livelier one.
export const TREE_CANOPY_SWAY_SPEED = 0.78;
export const TREE_LOOSE_LEAF_SWAY_SPEED = 0.9;
export const REED_SWAY_SPEED = 1.04;
export const HARVESTABLE_GRASS_SWAY_SPEED = 1.32;

export const TREE_CANOPY_SWAY_RADIANS = 0.068;
export const REED_SWAY_RADIANS = 0.09;
export const HARVESTABLE_GRASS_SWAY_RADIANS = 0.18;
export const HARVESTABLE_GRASS_SCALE_MULTIPLIER = 1.18;
export const HARVESTABLE_GRASS_BLADE_COUNT = 11;

// Ground grass is rendered as small shared animation atlases. Each patch contains independently
// bending blades, but the whole field still updates in a single bounded frame-selection pass.
// Increase WIND_CYCLE_DURATION_MS to slow the layer down; FRAME_COUNT controls smoothness without
// changing its speed. The update interval only controls how often a new pre-rendered frame is set.
export const GROUND_GRASS_WIND_CYCLE_DURATION_MS = 2200;
export const GROUND_GRASS_ANIMATION_UPDATE_INTERVAL_MS = 16;
export const GROUND_GRASS_ANIMATION_FRAME_COUNT = 64;
export const GROUND_GRASS_PATTERN_VARIANTS = 6;

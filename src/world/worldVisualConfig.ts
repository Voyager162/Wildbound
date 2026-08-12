// Low grass is decorative ground cover, distinct from the taller harvestable grass feature.
// These are intentionally simple tuning controls for rapid visual iteration.
export const GROUND_GRASS_SIZE_SCALE = 0.82;
export const GROUND_GRASS_FREQUENCY_SCALE = 1.45;

export const GROUND_GRASS_BASE_HEIGHT_PIXELS = 28;
export const GROUND_GRASS_HEIGHT_VARIATION_PIXELS = 8;
// Horizontal tip travel for the dynamic ground-cover overlay. This is kept separate from size so
// the field can read as a strong breeze without making every decorative clump taller.
export const GROUND_GRASS_WIND_STRENGTH_PIXELS = 15;
// Shoreline contour is visual-only: gameplay water continues to use the stable ocean threshold,
// while these seed-derived offsets give each coast an organic, gently irregular edge.
export const OCEAN_SHORELINE_WOBBLE_ELEVATION = 0.024;
export const OCEAN_SHORELINE_RIPPLE_ELEVATION = 0.006;
export const OCEAN_SURF_BLEND_ELEVATION = 0.052;

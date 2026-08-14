// Low grass is decorative ground cover, distinct from the taller harvestable grass feature.
// These are intentionally simple tuning controls for rapid visual iteration.
export const GROUND_GRASS_SIZE_SCALE = 0.82;
export const GROUND_GRASS_FREQUENCY_SCALE = 1.45;

export const GROUND_GRASS_BASE_HEIGHT_PIXELS = 28;
export const GROUND_GRASS_HEIGHT_VARIATION_PIXELS = 8;
// GPU foliage animation is expressed in texture UV space so every blade in the transparent
// ground-cover layer can sway at once. Increase either value for a stronger wind effect.
export const GROUND_GRASS_WIND_UV_AMPLITUDE = 0.005;
export const FEATURE_FOLIAGE_WIND_UV_AMPLITUDE = 0.01;
// Shoreline contour is visual-only: gameplay water continues to use the stable ocean threshold,
// while these seed-derived offsets give each coast an organic, gently irregular edge.
export const OCEAN_SHORELINE_WOBBLE_ELEVATION = 0.024;
export const OCEAN_SHORELINE_RIPPLE_ELEVATION = 0.006;
export const OCEAN_SURF_BLEND_ELEVATION = 0.052;

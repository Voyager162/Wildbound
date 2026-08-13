// Quality-preserving runtime budgets. Static terrain, feature art, and water texture motion stay
// unchanged; these only cap the vector details that are repainted while the player is moving.
export const AMBIENT_FOLIAGE_UPDATE_INTERVAL_MS = 50;
export const AMBIENT_PARTICLE_RENDER_INTERVAL_MS = 40;
export const WATER_RIPPLE_UPDATE_INTERVAL_MS = 60;
export const WATER_WAVES_PER_VISIBLE_CHUNK = 10;
export const AMBIENT_GRASS_TUFTS_PER_VISIBLE_CHUNK = 12;
// A forest can contain several detailed trees per chunk.  The static canopy texture still shows
// every tree; this only limits the expensive live silhouette used to sell the wind motion.
export const AMBIENT_SWAYING_FEATURES_PER_VISIBLE_CHUNK = 1;
// Ground cover remains dense in its baked layer.  A small, well-distributed moving sample keeps
// the field alive without redrawing hundreds of individual blades in every forest chunk.
export const AMBIENT_MOVING_GRASS_TUFTS_PER_VISIBLE_CHUNK = 4;
// The stable particle pool can be larger than the render budget so effects do not pop when the
// camera moves.  Rendering a bounded foreground subset protects dense forests on integrated GPUs.
export const AMBIENT_PARTICLE_RENDER_MAX_COUNT = 72;
// Soft light intentionally benefits from downsampling. At half resolution it keeps the same
// blurred atmosphere while cutting the per-frame light canvas fill area by 75%.
export const NIGHT_AMBIENT_LIGHT_RENDER_SCALE = 0.5;

// Quality-preserving runtime budgets. Static terrain, feature art, and water texture motion stay
// unchanged; these only cap the vector details that are repainted while the player is moving.
export const AMBIENT_FOLIAGE_UPDATE_INTERVAL_MS = 50;
export const AMBIENT_PARTICLE_RENDER_INTERVAL_MS = 40;
export const WATER_RIPPLE_UPDATE_INTERVAL_MS = 60;
export const WATER_WAVES_PER_VISIBLE_CHUNK = 10;
export const AMBIENT_GRASS_TUFTS_PER_VISIBLE_CHUNK = 12;
// Soft light intentionally benefits from downsampling. At half resolution it keeps the same
// blurred atmosphere while cutting the per-frame light canvas fill area by 75%.
export const NIGHT_AMBIENT_LIGHT_RENDER_SCALE = 0.5;

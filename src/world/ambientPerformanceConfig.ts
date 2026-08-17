// Quality-preserving runtime budgets. Static terrain, feature art, and GPU foliage motion stay
// unchanged; these cap only the effects that are still repainted while the player is moving.
export const AMBIENT_PARTICLE_RENDER_INTERVAL_MS = 40;
export const WATER_SURFACE_UPDATE_INTERVAL_MS = 33;
export const WATER_RIPPLE_UPDATE_INTERVAL_MS = 80;
export const WATER_WAVES_PER_VISIBLE_CHUNK = 10;
// The stable particle pool can be larger than the render budget so effects do not pop when the
// camera moves.  Rendering a bounded foreground subset protects dense forests on integrated GPUs.
export const AMBIENT_PARTICLE_RENDER_MAX_COUNT = 72;
// Per-biome density can raise the live budget above the normal 72 particles, but never beyond
// these ceilings. They make density tuning visibly effective without letting a value such as 100
// turn a foreground Graphics pass into an unbounded frame-time cost.
export const AMBIENT_PARTICLE_DENSE_RENDER_HARD_CAP = 180;
export const AMBIENT_PARTICLE_DENSE_POOL_HARD_CAP = 240;
// Soft light intentionally benefits from downsampling. At half resolution it keeps the same
// blurred atmosphere while cutting the per-frame light canvas fill area by 75%.
export const NIGHT_AMBIENT_LIGHT_RENDER_SCALE = 0.5;

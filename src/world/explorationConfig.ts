// Exploration progression is stored in coarse regions rather than individual tiles so a long-lived
// world remains compact enough for the desktop save file.
// Fine cells preserve the curved reveal boundary of the player's map rather than turning
// exploration into visibly large squares. Older 16-tile saves are expanded on load.
export const EXPLORATION_REGION_SIZE_TILES = 4;
export const EXPLORATION_REVEAL_RADIUS_REGIONS = 6;
export const EXPLORATION_SAVE_REGION_SIZE_TILES = EXPLORATION_REGION_SIZE_TILES;

// World time advances continuously in real time. Twelve minutes gives each lighting phase room to
// breathe while still making a complete cycle easy to experience in one play session.
export const DAY_NIGHT_CYCLE_DURATION_MS = 12 * 60 * 1000;
export const DAY_NIGHT_INITIAL_TIME_MS = DAY_NIGHT_CYCLE_DURATION_MS * (8 / 24);
export const WORLD_TIME_SAVE_INTERVAL_MS = 900;
export const DAY_NIGHT_OVERLAY_UPDATE_INTERVAL_MS = 40;

// Animated environmental details are deliberately throttled. Chunks retain their baked terrain and
// feature textures; these values govern only lightweight Graphics overlays.
export const AMBIENT_SWAY_UPDATE_INTERVAL_MS = 60;
export const AMBIENT_PARTICLE_UPDATE_INTERVAL_MS = 55;
export const AMBIENT_PARTICLE_CELL_SIZE_PIXELS = 96;
// The visible camera view is 2560 x 1440 world pixels, so these radii cover it with a small
// buffer while still selecting a bounded number of particles to render.
export const AMBIENT_PARTICLE_RADIUS_CELLS_X = 15;
export const AMBIENT_PARTICLE_RADIUS_CELLS_Y = 10;
export const AMBIENT_PARTICLE_MAX_COUNT = 180;
// Five chunks across and five high cover the camera with a little motion buffer. Keeping
// dynamic foliage inside this window lets the close world feel richly animated without
// paying to redraw every cached chunk behind the camera.
export const AMBIENT_CHUNK_RADIUS_X = 2;
export const AMBIENT_CHUNK_RADIUS_Y = 2;
export const WATER_ANIMATION_UPDATE_INTERVAL_MS = 45;
export const WATER_WAVES_PER_CHUNK = 54;

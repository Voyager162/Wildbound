// Exploration progression is stored in coarse regions rather than individual tiles so a long-lived
// world remains compact enough for the desktop save file.
// Fine cells preserve the curved reveal boundary of the player's map rather than turning
// exploration into visibly large squares. Older 16-tile saves are expanded on load.
export const EXPLORATION_REGION_SIZE_TILES = 4;
export const EXPLORATION_REVEAL_RADIUS_REGIONS = 6;
export const EXPLORATION_SAVE_REGION_SIZE_TILES = EXPLORATION_REGION_SIZE_TILES;
// Permanent cartography records the player-visible minimap as overlapping circular stamps.
export const EXPLORATION_REVEAL_STAMP_RADIUS_TILES = 360;
export const EXPLORATION_REVEAL_STAMP_SPACING_TILES = 96;

// World time advances continuously in real time. Twelve minutes gives each lighting phase room to
// breathe while still making a complete cycle easy to experience in one play session.
export const DAY_NIGHT_CYCLE_DURATION_MS = 12 * 60 * 1000;
export const DAY_NIGHT_INITIAL_TIME_MS = DAY_NIGHT_CYCLE_DURATION_MS * (8 / 24);
export const WORLD_TIME_SAVE_INTERVAL_MS = 900;
export const DAY_NIGHT_OVERLAY_UPDATE_INTERVAL_MS = 40;

// Animated environmental details are deliberately throttled. Chunks retain their baked terrain and
// feature textures; these values govern only lightweight Graphics overlays.
// Particles and foliage are perceptually sensitive to cadence, so these run at smooth motion
// rates. Their per-frame work is bounded separately below.
export const AMBIENT_SWAY_UPDATE_INTERVAL_MS = 33;
// 40 Hz keeps the motion visually fluid while leaving enough frame time for the game itself.
export const AMBIENT_PARTICLE_UPDATE_INTERVAL_MS = 25;
export const AMBIENT_PARTICLE_CELL_SIZE_PIXELS = 96;
// The visible camera view is 2560 x 1440 world pixels, so these radii cover it with a small
// buffer while still selecting a bounded number of particles to render.
export const AMBIENT_PARTICLE_RADIUS_CELLS_X = 15;
export const AMBIENT_PARTICLE_RADIUS_CELLS_Y = 10;
export const AMBIENT_PARTICLE_MAX_COUNT = 140;
// These are the camera-adjacent chunks only. New chunks are primed with their current wind pose
// at creation, so rendering a much larger hidden animation buffer is unnecessary.
export const AMBIENT_CHUNK_RADIUS_X = 2;
export const AMBIENT_CHUNK_RADIUS_Y = 1;
// Water is redrawn at a smooth cadence, but only for the small camera-adjacent chunk buffer.
export const WATER_ANIMATION_UPDATE_INTERVAL_MS = 33;
// A mix of broad travelling bands and small ripple sources makes the current legible from a
// distance without turning every visual terrain cell into a live object.
export const WATER_WAVES_PER_CHUNK = 30;
// Water-surface texture motion is GPU-friendly TileSprite scrolling. Keep swamp water slower and
// quieter; only ocean shores receive the stronger in-and-out surf pulse.
export const OCEAN_WATER_CURRENT_PIXELS_PER_SECOND = 25;
export const SWAMP_WATER_CURRENT_PIXELS_PER_SECOND = 8;
export const OCEAN_SURF_TRAVEL_PIXELS = 8.5;
// The continuous terrain layer supplies field density; this smaller cap reserves animation work
// for the most noticeable nearby tufts.
export const AMBIENT_GRASS_TUFTS_PER_CHUNK = 32;
// Stream one full baked chunk per frame after the initial area. Chunk rendering is deterministic,
// but distributing it prevents regular stalls when the player crosses a chunk boundary.
export const CHUNK_BUILDS_PER_FRAME = 1;
export const CHUNK_BUILD_INTERVAL_MS = 80;

// Chunk streaming is kept in its own config because these values trade generation headroom for
// a larger ready-to-render world around a fast-moving player.
// A full terrain chunk is an intentionally detailed canvas bake. Predictive streaming stays
// several chunks ahead of normal travel, so spacing builds out prevents a new bake from landing
// in nearly every movement-frame budget while preserving the complete rendered terrain.
// Terrain sampling is worker-backed, so the balanced path can keep several deterministic bakes
// in flight without taking time away from movement or rendering on the main thread.
export const CHUNK_STREAM_BUILD_INTERVAL_MS = 90;
export const CHUNK_STREAM_BUILDS_PER_TICK = 2;
export const CHUNK_STREAM_MAX_CONCURRENT_BUILDS = 3;
// Initial terrain is prepared one chunk per animation frame while controls are disabled. This
// keeps expensive canvas bakes out of the first idle/movement frames without changing terrain.
export const CHUNK_STREAM_INITIAL_BUILD_COUNT = 1;
// The fixed camera can expose just under three chunks horizontally and two vertically from its
// centre. Keep one complete presentation window ready rather than relying on a half-visible
// border chunk to finish during movement.
export const CHUNK_STREAM_VISIBLE_RADIUS_X = 3;
export const CHUNK_STREAM_VISIBLE_RADIUS_Y = 2;
// Queue terrain farther along the current direction before it is visible, giving the spaced
// build cadence ample headroom without changing the loaded world or its appearance.
export const CHUNK_STREAM_LOOKAHEAD_MS = 2800;
export const CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS = 3;

// Grass patches are created off-screen in short, deterministic batches. At this rate a full
// chunk is prepared well inside the one-chunk grass preload margin, while a batch only creates
// a handful of visible patch sprites on average.
export const GROUND_GRASS_BUILD_INTERVAL_MS = 16;
export const GROUND_GRASS_BUILD_TILES_PER_TICK = 12;
export const GROUND_GRASS_INITIAL_BUILD_TILES_PER_TICK = 64;

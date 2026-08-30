// Chunk streaming is kept in its own config because these values trade generation headroom for
// a larger ready-to-render world around a fast-moving player.
// A full terrain chunk is an intentionally detailed canvas bake. Predictive streaming stays
// several chunks ahead of normal travel, so spacing builds out prevents a new bake from landing
// in nearly every movement-frame budget while preserving the complete rendered terrain.
// Terrain sampling is worker-backed, so the balanced path can keep several deterministic bakes
// in flight without taking time away from movement or rendering on the main thread.
export const CHUNK_STREAM_BUILD_INTERVAL_MS = 32;
export const CHUNK_STREAM_BUILDS_PER_TICK = 2;
export const CHUNK_STREAM_MAX_CONCURRENT_BUILDS = 4;
// Initial terrain fills every available worker slot while controls are disabled. Renderer commits
// happen synchronously for this bounded first presentation, avoiding idle-callback latency without
// changing deterministic terrain output.
export const CHUNK_STREAM_INITIAL_BUILD_COUNT = 4;
// The fixed camera can expose just under three chunks horizontally and two vertically from its
// centre. Keep one complete presentation window ready rather than relying on a half-visible
// border chunk to finish during movement.
export const CHUNK_STREAM_VISIBLE_RADIUS_X = 3;
export const CHUNK_STREAM_VISIBLE_RADIUS_Y = 2;
// Queue terrain farther along the current direction before it is visible, giving the spaced
// build cadence ample headroom without changing the loaded world or its appearance.
export const CHUNK_STREAM_LOOKAHEAD_MS = 3600;
export const CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS = 4;

// Grass candidate calculation runs with the other procedural data in a worker. The renderer only
// turns those compact descriptors into lightweight Bobs, and remains bounded by both patch count
// and wall time so faster grass coverage does not steal an open-ended portion of a frame.
export const GROUND_GRASS_BUILD_INTERVAL_MS = 16;
export const GROUND_GRASS_BUILD_PATCHES_PER_TICK = 48;
export const GROUND_GRASS_BUILD_TIME_BUDGET_MS = 1.25;
export const GROUND_GRASS_INITIAL_BUILD_PATCHES_PER_TICK = 256;
export const GROUND_GRASS_INITIAL_CHUNKS_PER_TICK = 4;

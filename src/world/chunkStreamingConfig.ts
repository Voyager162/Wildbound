// Chunk streaming is kept in its own config because these values trade generation headroom for
// a larger ready-to-render world around a fast-moving player.
// A full terrain chunk is an intentionally detailed canvas bake. Predictive streaming stays
// several chunks ahead of normal travel, so spacing builds out prevents a new bake from landing
// in nearly every movement-frame budget while preserving the complete rendered terrain.
export const CHUNK_STREAM_BUILD_INTERVAL_MS = 200;
export const CHUNK_STREAM_BUILDS_PER_TICK = 1;
// Initial terrain is prepared one chunk per animation frame while controls are disabled. This
// keeps expensive canvas bakes out of the first idle/movement frames without changing terrain.
export const CHUNK_STREAM_INITIAL_BUILD_COUNT = 1;
export const CHUNK_STREAM_VISIBLE_RADIUS_X = 2;
export const CHUNK_STREAM_VISIBLE_RADIUS_Y = 1;
// Queue terrain farther along the current direction before it is visible, giving the spaced
// build cadence ample headroom without changing the loaded world or its appearance.
export const CHUNK_STREAM_LOOKAHEAD_MS = 1500;
export const CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS = 2;

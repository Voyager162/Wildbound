// Chunk streaming is kept in its own config because these values trade generation headroom for
// a larger ready-to-render world around a fast-moving player.
export const CHUNK_STREAM_BUILD_INTERVAL_MS = 32;
export const CHUNK_STREAM_BUILDS_PER_TICK = 1;
// Prime the 5 x 3 camera area before player movement is enabled, avoiding the black tiles seen
// during the first few seconds of a fresh world.
export const CHUNK_STREAM_INITIAL_BUILD_COUNT = 15;
export const CHUNK_STREAM_VISIBLE_RADIUS_X = 2;
export const CHUNK_STREAM_VISIBLE_RADIUS_Y = 1;
// Predict travel just under a second ahead, but never retain a large second world cache.
export const CHUNK_STREAM_LOOKAHEAD_MS = 900;
export const CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS = 2;

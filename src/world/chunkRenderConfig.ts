// Loaded chunks are retained ahead of travel to prevent black terrain, but they do not all need
// to submit draw calls.  This render window covers the full camera footprint plus one chunk of
// visual padding on every edge for tall feature textures and smooth incoming scenery.
export const CHUNK_RENDER_RADIUS_X = 4;
export const CHUNK_RENDER_RADIUS_Y = 3;

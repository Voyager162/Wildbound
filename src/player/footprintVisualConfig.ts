// Designer-facing footprint controls. Prints remain fully visible for the linger period, then
// ease away during the fade period. They are transient visual effects and are never saved.
export const FOOTPRINT_LINGER_MS = 7_000;
export const FOOTPRINT_FADE_MS = 3_500;
export const FOOTPRINT_SPACING_PIXELS = 56;

// The hard cap and reduced redraw cadence keep long, speed-boosted runs bounded on the renderer.
export const FOOTPRINT_MAX_VISIBLE = 96;
export const FOOTPRINT_REDRAW_INTERVAL_MS = 50;

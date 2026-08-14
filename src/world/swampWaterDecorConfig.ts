// Deterministic swamp-water decoration tuning. These values control scenery only; they do not
// change terrain, collision, harvesting, or save data.
export const SWAMP_REED_SHORE_DENSITY = 0.018;
export const SWAMP_REED_WATER_DENSITY = 0.0075;
export const SWAMP_REED_SHORE_SEARCH_RADIUS_TILES = 2.25;
// Water reeds are emergent plants: keep them in the shallow swim band, not in the pond center.
export const SWAMP_REED_WATER_MIN_VISUAL_AMOUNT = 0.345;
export const SWAMP_REED_WATER_MAX_VISUAL_AMOUNT = 0.68;

// These control the amount of still water in a climate-qualified swamp. Lowering the starts
// makes additional small pools while leaving the continuous shoreline and water threshold intact.
export const SWAMP_POOL_NOISE_START = 0.6;
export const SWAMP_POOL_NOISE_END = 0.82;
export const SWAMP_POOL_CLIMATE_START = 0.06;
export const SWAMP_POOL_CLIMATE_END = 0.38;

// Lily pads are sparse enough to leave swim lanes through a pond while still making water feel
// alive. They are generated from world coordinates and recreated identically after streaming.
export const LILYPAD_DENSITY = 0.01;
export const LILYPAD_MIN_WATER_VISUAL_AMOUNT = 0.42;
export const LILYPAD_RENDER_RADIUS_X = 3;
export const LILYPAD_RENDER_RADIUS_Y = 2;
export const LILYPAD_RETAIN_RADIUS_X = 4;
export const LILYPAD_RETAIN_RADIUS_Y = 3;
export const LILYPAD_MAX_VISIBLE_COUNT = 72;

// Physics are deliberately soft: a swimmer parts a pad, it carries momentum briefly, and then
// gentle current plus a home-water spring return it without ever becoming an obstacle.
export const LILYPAD_PLAYER_COLLISION_RADIUS_PIXELS = 27;
export const LILYPAD_PAD_RADIUS_PIXELS = 15;
export const LILYPAD_PLAYER_BUMP_STRENGTH = 0.52;
export const LILYPAD_PLAYER_SEPARATION_STRENGTH = 5.5;
export const LILYPAD_CURRENT_STRENGTH = 8;
export const LILYPAD_RETURN_STRENGTH = 0.0;
export const LILYPAD_LINEAR_DRAG = 3.2;
export const LILYPAD_MAX_SPEED_PIXELS_PER_SECOND = 96;
export const LILYPAD_FLOAT_BOB_PIXELS = 1.25;

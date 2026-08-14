import { Biome } from './generation/biomeGenerator';

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
// New worlds begin at this hour. To inspect a saved world at a fixed hour, temporarily set the
// override (for example 22 for night); leave it null for normal save/load behavior.
export const DAY_NIGHT_INITIAL_HOUR = 8;
export const DAY_NIGHT_START_HOUR_OVERRIDE: number | null = 8;
export const DAY_NIGHT_INITIAL_TIME_MS = DAY_NIGHT_CYCLE_DURATION_MS * (DAY_NIGHT_INITIAL_HOUR / 24);
export const WORLD_TIME_SAVE_INTERVAL_MS = 900;
export const DAY_NIGHT_OVERLAY_UPDATE_INTERVAL_MS = 40;
// Night uses a deep tint, then this bounded glow budget lets biome-specific particles become
// small local sources of color instead of simply disappearing under the darkness.
export const DAY_NIGHT_MAX_DARKNESS_ALPHA = 0.74;
// The glow layer follows the camera every rendered frame. These knobs control its visual budget
// rather than a timer, keeping moving lights locked to their world particles.
export const NIGHT_AMBIENT_LIGHT_MAX_COUNT = 36;
export const NIGHT_AMBIENT_LIGHT_RADIUS_MULTIPLIER = 1.9;
export const NIGHT_AMBIENT_LIGHT_INTENSITY_MULTIPLIER = 2.35;
// Glow is intentionally rendered at CSS resolution: it is a soft field, and this avoids a
// high-DPI full-screen canvas becoming the expensive part of night exploration.
export const NIGHT_AMBIENT_LIGHT_RENDER_SCALE = 1;

// Per-biome ambience controls. `particleSpawnChance` governs visible ambient particles per
// deterministic cell; `lightSpawnChance` governs what share become nighttime light sources.
// The glow multipliers are applied on top of the two global master multipliers above, so each
// biome can have its own atmosphere without losing one convenient whole-game brightness control.
export interface AmbientBiomeTuning {
  particleSpawnChance: number;
  lightSpawnChance: number;
  glowIntensityMultiplier: number;
  glowRadiusMultiplier: number;
}

export const AMBIENT_BIOME_TUNING: Readonly<Record<Biome, AmbientBiomeTuning>> = {
  [Biome.Ocean]: { particleSpawnChance: 0.72, lightSpawnChance: 0.48, glowIntensityMultiplier: 0.8, glowRadiusMultiplier: 0.9 },
  [Biome.Beach]: { particleSpawnChance: 0.7, lightSpawnChance: 0.5, glowIntensityMultiplier: 0.86, glowRadiusMultiplier: 0.94 },
  [Biome.Plains]: { particleSpawnChance: 0.8, lightSpawnChance: 0.84, glowIntensityMultiplier: 2, glowRadiusMultiplier: 1.4 },
  [Biome.Forest]: { particleSpawnChance: .9, lightSpawnChance: 0.94, glowIntensityMultiplier: 1.0, glowRadiusMultiplier: 0.5 },
  [Biome.Desert]: { particleSpawnChance: 0.74, lightSpawnChance: 0.68, glowIntensityMultiplier: 1.25, glowRadiusMultiplier: 1.1 },
  [Biome.Swamp]: { particleSpawnChance: 0.05, lightSpawnChance: 0.96, glowIntensityMultiplier: 1.12, glowRadiusMultiplier: .5 },
  [Biome.Hills]: { particleSpawnChance: 0.75, lightSpawnChance: 0.58, glowIntensityMultiplier: 0.94, glowRadiusMultiplier: 0.96 },
  [Biome.Mountains]: { particleSpawnChance: 0.86, lightSpawnChance: 0.82, glowIntensityMultiplier: 1.14, glowRadiusMultiplier: 1.14 },
  [Biome.Snow]: { particleSpawnChance: 0.88, lightSpawnChance: 0.84, glowIntensityMultiplier: 1.12, glowRadiusMultiplier: 1.12 }
};
// Light sources are retained beyond the visible particle window before being replaced. This is
// intentionally larger than the camera view so a moving player never sees a light pop out.
export const NIGHT_AMBIENT_LIGHT_RETENTION_CELLS = 3;

// Animated environmental details are deliberately throttled. Chunks retain their baked terrain and
// feature textures; these values govern only lightweight Graphics overlays.
// Particles and foliage are perceptually sensitive to cadence, so these run at smooth motion
// rates. Their per-frame work is bounded separately below.
export const AMBIENT_SWAY_UPDATE_INTERVAL_MS = 33;
// 40 Hz keeps the motion visually fluid while leaving enough frame time for the game itself.
export const AMBIENT_PARTICLE_UPDATE_INTERVAL_MS = 33;
export const AMBIENT_PARTICLE_CELL_SIZE_PIXELS = 128;
// The visible camera view is 2560 x 1440 world pixels, so these radii cover it with a small
// buffer while still selecting a bounded number of particles to render.
export const AMBIENT_PARTICLE_RADIUS_CELLS_X = 11;
export const AMBIENT_PARTICLE_RADIUS_CELLS_Y = 7;
export const AMBIENT_PARTICLE_MAX_COUNT = 104;
// These are the camera-adjacent chunks only. New chunks are primed with their current wind pose
// at creation, so rendering a much larger hidden animation buffer is unnecessary.
export const AMBIENT_CHUNK_RADIUS_X = 2;
export const AMBIENT_CHUNK_RADIUS_Y = 1;
// Water is redrawn at a smooth cadence, but only for the small camera-adjacent chunk buffer.
export const WATER_ANIMATION_UPDATE_INTERVAL_MS = 40;
// A mix of broad travelling bands and small ripple sources makes the current legible from a
// distance without turning every visual terrain cell into a live object.
export const WATER_WAVES_PER_CHUNK = 18;
// Water-surface texture motion is GPU-friendly TileSprite scrolling. Keep swamp water slower and
// quieter; only ocean shores receive the stronger in-and-out surf pulse.
export const OCEAN_WATER_CURRENT_PIXELS_PER_SECOND = 25;
export const SWAMP_WATER_CURRENT_PIXELS_PER_SECOND = 8;
export const OCEAN_SURF_TRAVEL_PIXELS = 8.5;
// The continuous terrain layer supplies field density; this smaller cap reserves animation work
// for the most noticeable nearby tufts.
export const AMBIENT_GRASS_TUFTS_PER_CHUNK = 24;
// Stream one full baked chunk per frame after the initial area. Chunk rendering is deterministic,
// but distributing it prevents regular stalls when the player crosses a chunk boundary.
export const CHUNK_BUILDS_PER_FRAME = 1;
export const CHUNK_BUILD_INTERVAL_MS = 80;

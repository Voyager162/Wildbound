// Designer-facing trim for the supplied plains walking recording. 1 preserves the processed
// source level, .5 halves it, and 0 disables just this plains-footstep layer.
export const PLAINS_FOOTSTEP_VOLUME = 0.01;

// This stays a bundled local asset, so movement sounds work offline in both development and a
// packaged build.
export const PLAINS_FOOTSTEP_RECORDING_URL = new URL(
  '../../assets/audio/footsteps/plains-walking-source.mp3',
  import.meta.url
).toString();

// Independent trim for the supplied wet-ground recording used only in swamp biomes.
export const SWAMP_FOOTSTEP_VOLUME = 0.16;

export const SWAMP_FOOTSTEP_RECORDING_URL = new URL(
  '../../assets/audio/footsteps/swamp-walking-source.mp3',
  import.meta.url
).toString();

// Cave stone is kept independent from hills and mountains so its supplied recording can be
// shaped for enclosed rock without changing any surface-biome footsteps.
export const CAVE_FOOTSTEP_VOLUME = 0.08;

export const CAVE_FOOTSTEP_RECORDING_URL = new URL(
  '../../assets/audio/footsteps/cave-stone-walking-source.mp3',
  import.meta.url
).toString();

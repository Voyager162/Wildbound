// These recordings are locally bundled with the game. Vite turns the URLs into packaged asset
// paths, so caves remain fully offline and do not depend on a remote audio service.
export const CAVE_SHALLOW_RECORDING_URL = new URL(
  '../../assets/audio/cave/cave-shallow-ambient.mp3',
  import.meta.url
).toString();

export const CAVE_DEEP_RECORDING_URL = new URL(
  '../../assets/audio/cave/mavopix-deep-cave-159876.mp3',
  import.meta.url
).toString();

// Depth remains a designer-facing 0–1000 meter scale. Blend around the requested 500 m boundary
// rather than switching a recording on one tile, which would be audible while walking.
export const CAVE_RECORDING_DEPTH_BOUNDARY_METERS = 500;
export const CAVE_RECORDING_DEPTH_BLEND_HALF_WIDTH_METERS = 70;

export const CAVE_SHALLOW_RECORDING_VOLUME = 0.12;
export const CAVE_DEEP_RECORDING_VOLUME = 0.14;

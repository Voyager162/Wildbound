// Audio uses a compact weighted neighbourhood rather than a single tile. This lets a shoreline,
// treeline, or highland slope enter the mix before the player reaches the gameplay biome edge.
// The world remains deterministic: the same seed and location always produce the same weighting.
export const AMBIENT_AUDIO_BIOME_SAMPLE_POINTS = [
  { x: 0, y: 0, weight: 7 },
  { x: -7, y: 0, weight: 3 },
  { x: 7, y: 0, weight: 3 },
  { x: 0, y: -7, weight: 3 },
  { x: 0, y: 7, weight: 3 },
  { x: -14, y: -10, weight: 1 },
  { x: 14, y: -10, weight: 1 },
  { x: -14, y: 10, weight: 1 },
  { x: 14, y: 10, weight: 1 }
] as const;

// Updating the target mix at this cadence is well below an audible control-rate threshold. Gain
// nodes do the smooth work between samples, which keeps the audio system out of the render loop.
export const AMBIENT_AUDIO_MIX_UPDATE_INTERVAL_MS = 140;
export const AMBIENT_AUDIO_GAIN_RAMP_SECONDS = 1.9;
export const AMBIENT_AUDIO_MASTER_RAMP_SECONDS = 0.32;
export const AMBIENT_AUDIO_PAUSE_ATTENUATION = 0.2;

// Long, seed-generated buffers keep any individual bird phrase or gust from repeating often,
// while the 24 kHz source rate remains a light one-time setup cost in an Electron renderer.
export const AMBIENT_AUDIO_SOURCE_SAMPLE_RATE = 24_000;
export const AMBIENT_AUDIO_TEXTURE_BUFFER_SECONDS = 16;
export const AMBIENT_AUDIO_CREATURE_BUFFER_SECONDS = 23;

// Every bird style rolls independently once per elapsed ambient second. Set a value between 0
// and 1: 0 disables that call, .02 means a 2% chance in each second, and 1 guarantees it. These
// rolls are evaluated inside the seed-generated audio timeline, so the same world stays fully
// deterministic while still avoiding a mechanical chirp schedule.
export const BIRD_CHIRP_CHANCE_PER_SECOND = {
  singleCall: 0.08,
  risingWarble: 0.08,
  answeringPair: 0.08
} as const;

export type BirdChirpType = keyof typeof BIRD_CHIRP_CHANCE_PER_SECOND;

// Independent output trim for each bird style. 1 keeps the authored level, .5 halves it, and 0
// silences that call without changing its per-second chance roll. Values above 1 are supported
// when a particular call needs deliberate emphasis.
export const BIRD_CHIRP_VOLUME: Readonly<Record<BirdChirpType, number>> = {
  singleCall: 5,
  risingWarble: 5,
  answeringPair: 5
};

// Forest owls use the same independent once-per-second roll model as birds. These defaults
// deliberately mirror the current bird settings so their density and loudness begin from the
// same familiar tuning point; each recording can then be adjusted without affecting the others.
export const OWL_HOOT_CHANCE_PER_SECOND = {
  greatHornedDistant3: 0.01,
  greatHornedDistant1: 0.01,
  videoOwlHoot3: 0.01
} as const;

export type OwlHootType = keyof typeof OWL_HOOT_CHANCE_PER_SECOND;

export const OWL_HOOT_VOLUME: Readonly<Record<OwlHootType, number>> = {
  greatHornedDistant3: 1,
  greatHornedDistant1: 1,
  videoOwlHoot3: 1
};

export const OWL_HOOT_RECORDING_URLS: Readonly<Record<OwlHootType, string>> = {
  greatHornedDistant3: new URL('../../assets/audio/owls/great-horned-distant-3.mp3', import.meta.url).toString(),
  greatHornedDistant1: new URL('../../assets/audio/owls/great-horned-distant-1.mp3', import.meta.url).toString(),
  videoOwlHoot3: new URL('../../assets/audio/owls/owl-hoot-3.mp3', import.meta.url).toString()
};

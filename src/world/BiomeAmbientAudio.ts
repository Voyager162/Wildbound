import {
  AMBIENT_AUDIO_BIOME_SAMPLE_POINTS,
  AMBIENT_AUDIO_CREATURE_BUFFER_SECONDS,
  AMBIENT_AUDIO_GAIN_RAMP_SECONDS,
  AMBIENT_AUDIO_MASTER_RAMP_SECONDS,
  AMBIENT_AUDIO_MIX_UPDATE_INTERVAL_MS,
  AMBIENT_AUDIO_PAUSE_ATTENUATION,
  AMBIENT_AUDIO_SOURCE_SAMPLE_RATE,
  AMBIENT_AUDIO_TEXTURE_BUFFER_SECONDS,
  BIRD_CHIRP_CHANCE_PER_SECOND,
  BIRD_CHIRP_VOLUME,
  OWL_HOOT_CHANCE_PER_SECOND,
  OWL_HOOT_RECORDING_URLS,
  OWL_HOOT_VOLUME,
  type BirdChirpType,
  type OwlHootType
} from './ambientAudioConfig';
import { LoopingAmbientTrack } from '../audio/LoopingAmbientTrack';
import {
  CAVE_DEEP_RECORDING_URL,
  CAVE_RECORDING_DEPTH_BLEND_HALF_WIDTH_METERS,
  CAVE_RECORDING_DEPTH_BOUNDARY_METERS,
  CAVE_DEEP_RECORDING_VOLUME,
  CAVE_SHALLOW_RECORDING_URL,
  CAVE_SHALLOW_RECORDING_VOLUME
} from './caveRecordedAudioConfig';
import {
  COASTAL_RECORDED_AMBIENT_URL,
  COASTAL_RECORDED_AMBIENT_VOLUME
} from './coastalAmbientAudioConfig';
import {
  DESERT_RECORDED_AMBIENT_URL,
  DESERT_RECORDED_AMBIENT_VOLUME
} from './desertAmbientAudioConfig';
import {
  CAVE_FOOTSTEP_RECORDING_URL,
  CAVE_FOOTSTEP_VOLUME,
  PLAINS_FOOTSTEP_RECORDING_URL,
  PLAINS_FOOTSTEP_VOLUME,
  SWAMP_FOOTSTEP_RECORDING_URL,
  SWAMP_FOOTSTEP_VOLUME
} from './footstepAudioConfig';
import {
  HILLS_RECORDED_AMBIENT_URL,
  HILLS_RECORDED_AMBIENT_VOLUME
} from './hillsAmbientAudioConfig';
import {
  MOUNTAIN_RECORDED_AMBIENT_URL,
  MOUNTAIN_RECORDED_AMBIENT_VOLUME
} from './mountainAmbientAudioConfig';
import {
  SNOW_RECORDED_AMBIENT_URL,
  SNOW_RECORDED_AMBIENT_VOLUME
} from './snowAmbientAudioConfig';
import {
  OPEN_WATER_SWIM_VOLUME,
  SWAMP_WATER_SWIM_VOLUME,
  SWIM_MINIMUM_TRAILING_SILENCE_SECONDS,
  SWIM_RECORDING_URL,
  SWIM_SILENCE_ABSOLUTE_FLOOR,
  SWIM_SILENCE_PEAK_RATIO,
  SWIM_SILENCE_WINDOW_SECONDS,
  SWIM_TAIL_PADDING_SECONDS
} from './swimmingAudioConfig';
import {
  GRASS_HARVEST_MAX_PLAYBACK_RATE,
  GRASS_HARVEST_RECORDING_URL,
  GRASS_HARVEST_RECORDING_VOLUME,
  ROCK_HARVEST_RECORDING_URL,
  ROCK_HARVEST_RECORDING_VOLUME,
  TREE_HARVEST_RECORDING_URL,
  TREE_HARVEST_RECORDING_VOLUME
} from './harvestAudioConfig';
import { TerrainFeatureType } from './generation/featureGenerator';
import type { CaveOreType } from './caves/caveOreGenerationConfig';
import { biomeAtTile, Biome } from './generation/biomeGenerator';
import { seedFromString } from './generation/noise';
import { WORLD_TILE_SIZE } from './worldConfig';

type AmbientLayer =
  | 'coastal-surf'
  | 'coastal-wind'
  | 'meadow-rustle'
  | 'forest-canopy'
  | 'birdsong'
  | 'night-insects'
  | 'wetland-life'
  | 'desert-wind'
  | 'ridge-wind'
  | 'snow-wind'
  | 'cave-depths'
  | 'cave-lava';

type BufferBuilder = (random: RandomSource, sampleRate: number, sampleCount: number) => Float32Array;

interface VoiceDefinition {
  readonly builder: BufferBuilder;
  readonly durationSeconds: number;
  readonly gain: number;
  readonly pan: number;
  readonly filterFrequency: number;
  readonly filterQ?: number;
}

interface AmbientVoice {
  readonly gain: GainNode;
  readonly source: AudioBufferSourceNode;
}

interface ActiveSwimStroke {
  readonly source: AudioBufferSourceNode;
  readonly highPass: BiquadFilterNode;
  readonly lowPass: BiquadFilterNode;
  readonly panner: StereoPannerNode;
  readonly gain: GainNode;
}

interface NoiseBands {
  readonly slow: number;
  readonly medium: number;
  readonly high: number;
  readonly brown: number;
}

interface MaterialBurstProfile {
  readonly durationSeconds: number;
  readonly amount: number;
  readonly highPassFrequency: number;
  readonly lowPassFrequency: number;
  readonly deepColor: number;
  readonly surfaceColor: number;
  readonly grainColor: number;
  readonly fragmentCount: number;
  readonly fragmentDelayRange: readonly [number, number];
  readonly fragmentDecayRange: readonly [number, number];
}

interface MaterialSoundProfiles {
  readonly contact: MaterialBurstProfile;
  readonly break: MaterialBurstProfile;
}

type FootstepSurface =
  | 'plains-grass'
  | 'forest-floor'
  | 'beach-sand'
  | 'desert-sand'
  | 'swamp-earth'
  | 'hill-rock'
  | 'mountain-rock'
  | 'snow';

interface AmbientAudioUpdate {
  readonly playerWorldX: number;
  readonly playerWorldY: number;
  readonly worldTimeMs: number;
  readonly daylightAmount: number;
  readonly isCave: boolean;
  readonly caveDepthMeters: number;
  readonly nearLava: boolean;
  readonly isPaused: boolean;
  readonly enabled: boolean;
  readonly volume: number;
}

type RandomSource = () => number;

const TAU = Math.PI * 2;
// Birds and grass need a much longer loop than the continuous environmental beds; otherwise an
// identical phrase or gust cadence becomes obvious during ordinary exploration.
const LONG_FORM_NATURE_BUFFER_SECONDS = 73;

// These are non-tonal, multi-fragment material sound textures synthesized from deterministic
// noise. The colour and decay of each fragment convey the material itself: dense wood keeps a
// dark body, rock sheds bright grit, and plant matter tears into short dry fibres.
const MATERIAL_SOUND_PROFILES: Readonly<Record<TerrainFeatureType, MaterialSoundProfiles>> = {
  [TerrainFeatureType.Tree]: {
    contact: { durationSeconds: 0.18, amount: 0.08, highPassFrequency: 42, lowPassFrequency: 3_700, deepColor: 0.72, surfaceColor: 0.46, grainColor: 0.15, fragmentCount: 2, fragmentDelayRange: [0.03, 0.055], fragmentDecayRange: [0.06, 0.1] },
    break: { durationSeconds: 0.5, amount: 0.16, highPassFrequency: 38, lowPassFrequency: 4_800, deepColor: 0.66, surfaceColor: 0.53, grainColor: 0.2, fragmentCount: 5, fragmentDelayRange: [0.025, 0.065], fragmentDecayRange: [0.075, 0.17] }
  },
  [TerrainFeatureType.Grass]: {
    contact: { durationSeconds: 0.12, amount: 0.032, highPassFrequency: 150, lowPassFrequency: 4_800, deepColor: 0.3, surfaceColor: 0.56, grainColor: 0.34, fragmentCount: 2, fragmentDelayRange: [0.015, 0.03], fragmentDecayRange: [0.025, 0.05] },
    break: { durationSeconds: 0.25, amount: 0.068, highPassFrequency: 145, lowPassFrequency: 5_800, deepColor: 0.28, surfaceColor: 0.6, grainColor: 0.38, fragmentCount: 4, fragmentDelayRange: [0.016, 0.042], fragmentDecayRange: [0.032, 0.085] }
  },
  [TerrainFeatureType.Reeds]: {
    contact: { durationSeconds: 0.14, amount: 0.044, highPassFrequency: 190, lowPassFrequency: 4_900, deepColor: 0.25, surfaceColor: 0.55, grainColor: 0.34, fragmentCount: 2, fragmentDelayRange: [0.018, 0.038], fragmentDecayRange: [0.035, 0.066] },
    break: { durationSeconds: 0.27, amount: 0.09, highPassFrequency: 180, lowPassFrequency: 5_800, deepColor: 0.24, surfaceColor: 0.6, grainColor: 0.38, fragmentCount: 5, fragmentDelayRange: [0.014, 0.048], fragmentDecayRange: [0.045, 0.1] }
  },
  [TerrainFeatureType.WaterReeds]: {
    contact: { durationSeconds: 0.14, amount: 0.04, highPassFrequency: 135, lowPassFrequency: 4_100, deepColor: 0.38, surfaceColor: 0.48, grainColor: 0.24, fragmentCount: 2, fragmentDelayRange: [0.02, 0.042], fragmentDecayRange: [0.04, 0.07] },
    break: { durationSeconds: 0.29, amount: 0.082, highPassFrequency: 125, lowPassFrequency: 4_800, deepColor: 0.4, surfaceColor: 0.5, grainColor: 0.28, fragmentCount: 5, fragmentDelayRange: [0.018, 0.052], fragmentDecayRange: [0.05, 0.11] }
  },
  [TerrainFeatureType.Rock]: {
    contact: { durationSeconds: 0.18, amount: 0.08, highPassFrequency: 85, lowPassFrequency: 5_800, deepColor: 0.28, surfaceColor: 0.47, grainColor: 0.45, fragmentCount: 3, fragmentDelayRange: [0.014, 0.035], fragmentDecayRange: [0.04, 0.085] },
    break: { durationSeconds: 0.48, amount: 0.16, highPassFrequency: 72, lowPassFrequency: 6_800, deepColor: 0.28, surfaceColor: 0.48, grainColor: 0.52, fragmentCount: 6, fragmentDelayRange: [0.013, 0.046], fragmentDecayRange: [0.055, 0.14] }
  },
  [TerrainFeatureType.SnowyRock]: {
    contact: { durationSeconds: 0.18, amount: 0.068, highPassFrequency: 90, lowPassFrequency: 5_000, deepColor: 0.32, surfaceColor: 0.48, grainColor: 0.36, fragmentCount: 3, fragmentDelayRange: [0.015, 0.04], fragmentDecayRange: [0.04, 0.08] },
    break: { durationSeconds: 0.43, amount: 0.13, highPassFrequency: 78, lowPassFrequency: 5_900, deepColor: 0.34, surfaceColor: 0.48, grainColor: 0.42, fragmentCount: 6, fragmentDelayRange: [0.014, 0.05], fragmentDecayRange: [0.055, 0.13] }
  },
  [TerrainFeatureType.Cactus]: {
    contact: { durationSeconds: 0.15, amount: 0.052, highPassFrequency: 155, lowPassFrequency: 4_200, deepColor: 0.4, surfaceColor: 0.5, grainColor: 0.28, fragmentCount: 2, fragmentDelayRange: [0.022, 0.043], fragmentDecayRange: [0.035, 0.07] },
    break: { durationSeconds: 0.31, amount: 0.105, highPassFrequency: 145, lowPassFrequency: 5_000, deepColor: 0.38, surfaceColor: 0.55, grainColor: 0.32, fragmentCount: 5, fragmentDelayRange: [0.018, 0.05], fragmentDecayRange: [0.045, 0.11] }
  }
};

// Footsteps use the same non-tonal, fragment-based material model as harvesting, but with a
// smaller initial weight and a short trailing texture. Each biome has a distinct profile rather
// than a shared beep shifted in pitch.
const FOOTSTEP_SOUND_PROFILES: Readonly<Record<FootstepSurface, MaterialBurstProfile>> = {
  // Grass is a compact soil compression followed by flexible blades and leaf litter—not a
  // blanket of low-frequency noise. The brighter tail retains a real dirt-and-grass texture.
  'plains-grass': { durationSeconds: 0.25, amount: 0.05, highPassFrequency: 48, lowPassFrequency: 4_300, deepColor: 0.68, surfaceColor: 0.47, grainColor: 0.25, fragmentCount: 3, fragmentDelayRange: [0.025, 0.06], fragmentDecayRange: [0.065, 0.15] },
  'forest-floor': { durationSeconds: 0.27, amount: 0.056, highPassFrequency: 58, lowPassFrequency: 4_800, deepColor: 0.56, surfaceColor: 0.53, grainColor: 0.3, fragmentCount: 4, fragmentDelayRange: [0.018, 0.05], fragmentDecayRange: [0.05, 0.13] },
  'beach-sand': { durationSeconds: 0.21, amount: 0.05, highPassFrequency: 88, lowPassFrequency: 2_450, deepColor: 0.5, surfaceColor: 0.52, grainColor: 0.14, fragmentCount: 4, fragmentDelayRange: [0.018, 0.046], fragmentDecayRange: [0.045, 0.11] },
  'desert-sand': { durationSeconds: 0.19, amount: 0.047, highPassFrequency: 115, lowPassFrequency: 2_950, deepColor: 0.38, surfaceColor: 0.56, grainColor: 0.2, fragmentCount: 4, fragmentDelayRange: [0.014, 0.04], fragmentDecayRange: [0.035, 0.09] },
  'swamp-earth': { durationSeconds: 0.26, amount: 0.046, highPassFrequency: 35, lowPassFrequency: 1_550, deepColor: 0.88, surfaceColor: 0.25, grainColor: 0.025, fragmentCount: 3, fragmentDelayRange: [0.03, 0.07], fragmentDecayRange: [0.075, 0.17] },
  'hill-rock': { durationSeconds: 0.16, amount: 0.052, highPassFrequency: 72, lowPassFrequency: 3_650, deepColor: 0.38, surfaceColor: 0.47, grainColor: 0.28, fragmentCount: 3, fragmentDelayRange: [0.014, 0.035], fragmentDecayRange: [0.03, 0.08] },
  'mountain-rock': { durationSeconds: 0.15, amount: 0.056, highPassFrequency: 85, lowPassFrequency: 4_050, deepColor: 0.3, surfaceColor: 0.48, grainColor: 0.34, fragmentCount: 3, fragmentDelayRange: [0.012, 0.032], fragmentDecayRange: [0.028, 0.075] },
  snow: { durationSeconds: 0.24, amount: 0.052, highPassFrequency: 160, lowPassFrequency: 3_350, deepColor: 0.36, surfaceColor: 0.54, grainColor: 0.2, fragmentCount: 5, fragmentDelayRange: [0.014, 0.04], fragmentDecayRange: [0.045, 0.12] }
};

const footstepSurfaceForBiome = (biome: Biome): FootstepSurface | null => {
  switch (biome) {
    case Biome.Ocean:
      return null;
    case Biome.Beach:
      return 'beach-sand';
    case Biome.Plains:
      return 'plains-grass';
    case Biome.Forest:
      return 'plains-grass';
    case Biome.Desert:
      return 'desert-sand';
    case Biome.Swamp:
      return 'swamp-earth';
    case Biome.Hills:
      return 'hill-rock';
    case Biome.Mountains:
      return 'mountain-rock';
    case Biome.Snow:
      return 'snow';
  }
};

// Pick the energetic portions of a longer field recording once, at decode time. This lets the
// game use the natural contact portion of a real footfall rather than occasionally starting in
// a silent gap between takes.
const recordedFootstepOffsetsFor = (buffer: AudioBuffer): readonly number[] => {
  const clipDurationSeconds = Math.min(0.52, buffer.duration);
  const maximumOffset = Math.max(0, buffer.duration - clipDurationSeconds);
  if (maximumOffset === 0) {
    return [0];
  }
  const samples = buffer.getChannelData(0);
  const windowSamples = Math.max(1, Math.round(buffer.sampleRate * 0.045));
  const windows: { offsetSeconds: number; level: number }[] = [];
  let peakLevel = 0;
  for (let start = 0; start + windowSamples <= samples.length; start += windowSamples) {
    let energy = 0;
    for (let index = start; index < start + windowSamples; index += 1) {
      energy += samples[index] * samples[index];
    }
    const level = Math.sqrt(energy / windowSamples);
    peakLevel = Math.max(peakLevel, level);
    windows.push({ offsetSeconds: start / buffer.sampleRate, level });
  }
  const offsets: number[] = [];
  windows.forEach((window, index) => {
    const previous = windows[index - 1]?.level ?? 0;
    const next = windows[index + 1]?.level ?? 0;
    if (window.level >= peakLevel * 0.46 && window.level >= previous && window.level >= next) {
      const offset = clamp(window.offsetSeconds - 0.025, 0, maximumOffset);
      if (offsets.every((candidate) => Math.abs(candidate - offset) > 0.16)) {
        offsets.push(offset);
      }
    }
  });
  return offsets.length > 0 ? offsets : [0];
};

const AMBIENT_LAYERS: readonly AmbientLayer[] = [
  'coastal-surf',
  'coastal-wind',
  'meadow-rustle',
  'forest-canopy',
  'birdsong',
  'night-insects',
  'wetland-life',
  'desert-wind',
  'ridge-wind',
  'snow-wind',
  'cave-depths',
  'cave-lava'
];

const clamp = (value: number, minimum = 0, maximum = 1): number => Math.max(minimum, Math.min(maximum, value));

// MP3 files commonly decode with encoder padding, and this recording also has a quiet tail. Find
// the final audible RMS window across every channel and copy only through a small natural tail.
// This happens once during loading; repeated strokes reuse the resulting compact AudioBuffer.
const withoutTrailingSilence = (context: AudioContext, buffer: AudioBuffer): AudioBuffer => {
  const windowSamples = Math.max(1, Math.round(buffer.sampleRate * SWIM_SILENCE_WINDOW_SECONDS));
  const windowCount = Math.ceil(buffer.length / windowSamples);
  const levels = new Float32Array(windowCount);
  let peakLevel = 0;

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
    const start = windowIndex * windowSamples;
    const end = Math.min(buffer.length, start + windowSamples);
    let energy = 0;
    let sampleCount = 0;
    for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
      const samples = buffer.getChannelData(channelIndex);
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        energy += samples[sampleIndex] * samples[sampleIndex];
        sampleCount += 1;
      }
    }
    const level = sampleCount > 0 ? Math.sqrt(energy / sampleCount) : 0;
    levels[windowIndex] = level;
    peakLevel = Math.max(peakLevel, level);
  }

  const silenceThreshold = Math.max(
    SWIM_SILENCE_ABSOLUTE_FLOOR,
    peakLevel * SWIM_SILENCE_PEAK_RATIO
  );
  let lastAudibleWindow = levels.length - 1;
  while (lastAudibleWindow >= 0 && levels[lastAudibleWindow] < silenceThreshold) {
    lastAudibleWindow -= 1;
  }
  if (lastAudibleWindow < 0) {
    return buffer;
  }

  const audibleEndSample = Math.min(buffer.length, (lastAudibleWindow + 1) * windowSamples);
  const trailingSilenceSeconds = (buffer.length - audibleEndSample) / buffer.sampleRate;
  if (trailingSilenceSeconds < SWIM_MINIMUM_TRAILING_SILENCE_SECONDS) {
    return buffer;
  }

  const paddingSamples = Math.round(buffer.sampleRate * SWIM_TAIL_PADDING_SECONDS);
  const trimmedLength = Math.min(buffer.length, audibleEndSample + paddingSamples);
  if (trimmedLength >= buffer.length) {
    return buffer;
  }

  const trimmed = context.createBuffer(buffer.numberOfChannels, trimmedLength, buffer.sampleRate);
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    trimmed.copyToChannel(buffer.getChannelData(channelIndex).subarray(0, trimmedLength), channelIndex);
  }
  return trimmed;
};

// A short cosine-shaped onset removes the click produced by instant noise bursts while retaining
// the weight of a foot or tool making contact with a surface.
const smoothRise = (progress: number): number => {
  const clamped = clamp(progress);
  return clamped * clamped * (3 - 2 * clamped);
};

const createRandom = (seed: number): RandomSource => {
  let state = seed >>> 0;
  return (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

// Running the filters through two complete input periods before recording the third gives the
// loop its periodic steady state. The end of every texture then joins its beginning cleanly
// instead of producing the faint click common to naively looped noise buffers.
const texturedNoise = (
  random: RandomSource,
  sampleRate: number,
  sampleCount: number,
  bands: NoiseBands,
  envelope: (timeSeconds: number) => number
): Float32Array => {
  const input = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    input[index] = random() * 2 - 1;
  }

  const output = new Float32Array(sampleCount);
  let slow = 0;
  let medium = 0;
  let brown = 0;
  for (let index = 0; index < sampleCount * 3; index += 1) {
    const source = input[index % sampleCount];
    slow += (source - slow) * 0.006;
    medium += (source - medium) * 0.085;
    brown = clamp(brown + source * 0.018, -1, 1);
    if (index < sampleCount * 2) {
      continue;
    }
    const localIndex = index - sampleCount * 2;
    const high = source - medium;
    output[localIndex] = clamp(
      (slow * bands.slow + medium * bands.medium + high * bands.high + brown * bands.brown)
        * envelope(localIndex / sampleRate),
      -0.96,
      0.96
    );
  }
  return output;
};

const addChirp = (
  output: Float32Array,
  sampleRate: number,
  startSeconds: number,
  durationSeconds: number,
  startFrequency: number,
  endFrequency: number,
  amount: number,
  harmonicAmount = 0.18
): void => {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const length = Math.min(Math.floor(durationSeconds * sampleRate), output.length - start);
  let phase = 0;
  for (let index = 0; index < length; index += 1) {
    const progress = index / Math.max(1, length - 1);
    const envelope = Math.pow(Math.sin(Math.PI * progress), 0.72);
    const frequency = startFrequency + (endFrequency - startFrequency) * progress
      + Math.sin(progress * Math.PI * 2) * startFrequency * 0.055;
    phase += TAU * frequency / sampleRate;
    output[start + index] += (Math.sin(phase) + Math.sin(phase * 2.01) * harmonicAmount) * envelope * amount;
  }
};

const createWindTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array => {
  let nextGustAt = 12 + random() * 18;
  let gustEndsAt = Number.NEGATIVE_INFINITY;
  let gustTarget = 0;
  let gustLevel = 0;
  return texturedNoise(random, sampleRate, sampleCount, { slow: 1.2, medium: 0.34, high: 0.035, brown: 0.14 }, (time) => {
    if (gustTarget > 0 && time >= gustEndsAt) {
      gustTarget = 0;
      nextGustAt = time + 24 + random() * 34;
    }
    if (gustTarget === 0 && time >= nextGustAt) {
      gustTarget = 0.01 + random() * 0.018;
      gustEndsAt = time + 6 + random() * 12;
    }
    // No oscillator drives this level: gusts arrive at uneven intervals and glide in and out.
    gustLevel += (gustTarget - gustLevel) * 0.000014;
    return 0.005 + gustLevel;
  });
};

const createSurfTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array =>
  texturedNoise(random, sampleRate, sampleCount, { slow: 0.56, medium: 0.32, high: 0.19, brown: 0.12 }, (time) => {
    const swell = (Math.sin(time * 1.17) + 1) * 0.5;
    // Shorelines should sit underneath play: a gentle rolling bed rather than a loud breaker
    // loop that competes with interaction and movement sounds.
    return 0.075 + Math.pow(swell, 1.7) * 0.24 + (Math.sin(time * 4.2) + 1) * 0.012;
  });

const createRustleTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array => {
  let nextGustAt = 13 + random() * 20;
  let gustEndsAt = Number.NEGATIVE_INFINITY;
  let gustTarget = 0;
  let gustLevel = 0;
  let gustActive = false;
  return texturedNoise(random, sampleRate, sampleCount, { slow: 0.08, medium: 0.2, high: 0.82, brown: 0 }, (time) => {
    if (gustActive && time >= gustEndsAt) {
      gustActive = false;
      gustTarget = 0;
      // Wide, variable gaps prevent a fixed gust rhythm while leaving the base nearly silent.
      nextGustAt = time + 26 + random() * 38;
    }
    if (!gustActive && time >= nextGustAt) {
      gustActive = true;
      gustTarget = 0.01 + random() * 0.012;
      gustEndsAt = time + 8 + random() * 16;
    }
    // Smoothly ease each sparse gust in and out; there is no periodic modulation underneath it.
    gustLevel += (gustTarget - gustLevel) * 0.000012;
    // A quiet, continuous bed keeps a plains biome alive from the moment the player arrives.
    // The slow, irregular target above only adds broad natural movement; it never gates the
    // ambience on and off or introduces a beat.
    return 0.014 + gustLevel;
  });
};

const createForestTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array => {
  let nextChangeAt = 2 + random() * 5;
  let canopyTarget = 0.018 + random() * 0.012;
  let canopyLevel = canopyTarget;
  return texturedNoise(random, sampleRate, sampleCount, { slow: 0.36, medium: 0.56, high: 0.25, brown: 0.08 }, (time) => {
    if (time >= nextChangeAt) {
      canopyTarget = 0.012 + random() * 0.034;
      nextChangeAt = time + 4.5 + random() * 13;
    }
    canopyLevel += (canopyTarget - canopyLevel) * 0.000045;
    return canopyLevel;
  });
};

const createDesertTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array =>
  texturedNoise(random, sampleRate, sampleCount, { slow: 0.75, medium: 0.36, high: 0.12, brown: 0.11 }, (time) =>
    0.045 + Math.pow((Math.sin(time * 0.27 + 0.8) + 1) * 0.5, 4.2) * 0.15
  );

const createSnowTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array =>
  texturedNoise(random, sampleRate, sampleCount, { slow: 0.94, medium: 0.2, high: 0.05, brown: 0.11 }, (time) =>
    0.04 + (Math.sin(time * 0.24) + 1) * 0.028 + Math.pow((Math.sin(time * 0.52 + 1.9) + 1) * 0.5, 6) * 0.075
  );

const createBirdsongTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array => {
  const output = new Float32Array(sampleCount);
  const duration = sampleCount / sampleRate;
  const addBirdChirp = (type: BirdChirpType, time: number): void => {
    const rootFrequency = 1_650 + random() * 1_650;
    const start = time + 0.06 + random() * 0.82;
    const volume = Math.max(0, BIRD_CHIRP_VOLUME[type]);
    switch (type) {
      case 'singleCall':
        addChirp(output, sampleRate, start, 0.09 + random() * 0.1, rootFrequency * 0.9, rootFrequency * 1.19, (0.14 + random() * 0.05) * volume, 0.13);
        break;
      case 'risingWarble':
        addChirp(output, sampleRate, start, 0.15 + random() * 0.12, rootFrequency * 0.72, rootFrequency * 1.32, (0.1 + random() * 0.04) * volume, 0.2);
        break;
      case 'answeringPair':
        addChirp(output, sampleRate, start, 0.075 + random() * 0.06, rootFrequency * 0.92, rootFrequency * 1.1, (0.09 + random() * 0.035) * volume, 0.1);
        addChirp(output, sampleRate, start + 0.19 + random() * 0.12, 0.065 + random() * 0.055, rootFrequency * 1.18, rootFrequency * 0.86, (0.08 + random() * 0.03) * volume, 0.11);
        break;
    }
  };
  // Every type makes an independent chance roll once per second. There is no timer cadence to
  // hear; the exposed probabilities above are the single point of tuning for call frequency.
  for (let second = 0; second < Math.floor(duration); second += 1) {
    (Object.keys(BIRD_CHIRP_CHANCE_PER_SECOND) as BirdChirpType[]).forEach((type) => {
      if (random() < BIRD_CHIRP_CHANCE_PER_SECOND[type]) {
        addBirdChirp(type, second);
      }
    });
  }
  return output;
};

const createInsectTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array => {
  const output = new Float32Array(sampleCount);
  const duration = sampleCount / sampleRate;
  // Keep these sparse and lower than birds so they cannot be mistaken for a continuous daytime
  // chirp layer in a plains biome.
  for (let time = 3 + random() * 7; time < duration - 0.35; time += 5 + random() * 10) {
    const rootFrequency = 3_700 + random() * 1_100;
    addChirp(output, sampleRate, time, 0.035 + random() * 0.04, rootFrequency, rootFrequency * 1.03, 0.02, 0.035);
  }
  return output;
};

const createWetlandTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array => {
  const output = texturedNoise(
    random,
    sampleRate,
    sampleCount,
    { slow: 0.45, medium: 0.28, high: 0.08, brown: 0.1 },
    (time) => 0.07 + (Math.sin(time * 0.76) + 1) * 0.045
  );
  const duration = sampleCount / sampleRate;
  for (let time = 0.7 + random(); time < duration - 0.45; time += 1.1 + random() * 2.4) {
    const frogFrequency = 165 + random() * 95;
    addChirp(output, sampleRate, time, 0.15 + random() * 0.16, frogFrequency, frogFrequency * 0.78, 0.22, 0.36);
    if (random() > 0.5) {
      addChirp(output, sampleRate, time + 0.23, 0.09, frogFrequency * 1.12, frogFrequency * 0.84, 0.12, 0.25);
    }
  }
  return output;
};

const createCaveTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array => {
  const output = texturedNoise(
    random,
    sampleRate,
    sampleCount,
    { slow: 1.25, medium: 0.08, high: 0, brown: 0.32 },
    (time) => 0.035 + (Math.sin(time * 0.14) + 1) * 0.024
  );
  const duration = sampleCount / sampleRate;
  // Slow, low modal swells give the cave an uneasy sense of scale without adding sharp or
  // repetitive events that compete with the supplied ambience recording.
  for (let time = 0.9 + random(); time < duration - 2.2; time += 3.8 + random() * 5.6) {
    const rootFrequency = 44 + random() * 38;
    addChirp(output, sampleRate, time, 1.45 + random() * 1.1, rootFrequency, rootFrequency * 0.78, 0.021 + random() * 0.014, 0.08);
  }
  return output;
};

const createLavaTexture = (random: RandomSource, sampleRate: number, sampleCount: number): Float32Array => {
  const output = texturedNoise(
    random,
    sampleRate,
    sampleCount,
    { slow: 0.95, medium: 0.22, high: 0, brown: 0.35 },
    (time) => 0.08 + Math.pow((Math.sin(time * 1.3) + 1) * 0.5, 2.8) * 0.12
  );
  const duration = sampleCount / sampleRate;
  for (let time = 0.8 + random(); time < duration - 0.35; time += 0.55 + random() * 1.5) {
    addChirp(output, sampleRate, time, 0.07 + random() * 0.08, 82 + random() * 65, 54 + random() * 48, 0.09, 0.18);
  }
  return output;
};

const VOICE_DEFINITIONS: Readonly<Record<AmbientLayer, VoiceDefinition>> = {
  'coastal-surf': { builder: createSurfTexture, durationSeconds: AMBIENT_AUDIO_TEXTURE_BUFFER_SECONDS, gain: 0.14, pan: -0.12, filterFrequency: 3_200 },
  'coastal-wind': { builder: createWindTexture, durationSeconds: AMBIENT_AUDIO_TEXTURE_BUFFER_SECONDS, gain: 0.05, pan: 0.2, filterFrequency: 2_300 },
  'meadow-rustle': { builder: createRustleTexture, durationSeconds: LONG_FORM_NATURE_BUFFER_SECONDS, gain: 0.035, pan: 0.13, filterFrequency: 5_300 },
  'forest-canopy': { builder: createForestTexture, durationSeconds: AMBIENT_AUDIO_TEXTURE_BUFFER_SECONDS, gain: 0.055, pan: -0.23, filterFrequency: 4_100 },
  'birdsong': { builder: createBirdsongTexture, durationSeconds: LONG_FORM_NATURE_BUFFER_SECONDS, gain: 0.052, pan: 0.28, filterFrequency: 7_000, filterQ: 0.7 },
  'night-insects': { builder: createInsectTexture, durationSeconds: AMBIENT_AUDIO_CREATURE_BUFFER_SECONDS, gain: 0.035, pan: -0.3, filterFrequency: 7_500 },
  'wetland-life': { builder: createWetlandTexture, durationSeconds: AMBIENT_AUDIO_CREATURE_BUFFER_SECONDS, gain: 0.105, pan: 0.18, filterFrequency: 2_900 },
  'desert-wind': { builder: createDesertTexture, durationSeconds: AMBIENT_AUDIO_TEXTURE_BUFFER_SECONDS, gain: 0.1, pan: -0.15, filterFrequency: 2_500 },
  'ridge-wind': { builder: createWindTexture, durationSeconds: AMBIENT_AUDIO_TEXTURE_BUFFER_SECONDS, gain: 0.09, pan: 0.16, filterFrequency: 2_100 },
  'snow-wind': { builder: createSnowTexture, durationSeconds: AMBIENT_AUDIO_TEXTURE_BUFFER_SECONDS, gain: 0.085, pan: -0.1, filterFrequency: 1_850 },
  'cave-depths': { builder: createCaveTexture, durationSeconds: AMBIENT_AUDIO_CREATURE_BUFFER_SECONDS, gain: 0.075, pan: -0.08, filterFrequency: 1_250 },
  'cave-lava': { builder: createLavaTexture, durationSeconds: AMBIENT_AUDIO_TEXTURE_BUFFER_SECONDS, gain: 0.095, pan: 0.12, filterFrequency: 1_100 }
};

// A low, restrained soundscape is deliberately kept separate from Phaser's effects sound
// manager. These are persistent world voices; they can be faded independently, survive chunk
// streaming, and do not create a scene object for every audible tile.
export class BiomeAmbientAudio {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private readonly voices = new Map<AmbientLayer, AmbientVoice>();
  private surfaceCaveRecording: LoopingAmbientTrack | null = null;
  private deepCaveRecording: LoopingAmbientTrack | null = null;
  private desertRecordedAmbient: LoopingAmbientTrack | null = null;
  private hillsRecordedAmbient: LoopingAmbientTrack | null = null;
  private mountainRecordedAmbient: LoopingAmbientTrack | null = null;
  private snowRecordedAmbient: LoopingAmbientTrack | null = null;
  private coastalRecordedAmbient: LoopingAmbientTrack | null = null;
  private swimRecordingBuffer: AudioBuffer | null = null;
  private swimRecordingLoading: Promise<void> | null = null;
  private readonly activeSwimStrokes = new Set<ActiveSwimStroke>();
  private plainsFootstepBuffer: AudioBuffer | null = null;
  private plainsFootstepOffsets: readonly number[] = [];
  private plainsFootstepLoading: Promise<void> | null = null;
  private swampFootstepBuffer: AudioBuffer | null = null;
  private swampFootstepOffsets: readonly number[] = [];
  private swampFootstepLoading: Promise<void> | null = null;
  private caveFootstepBuffer: AudioBuffer | null = null;
  private caveFootstepOffsets: readonly number[] = [];
  private caveFootstepLoading: Promise<void> | null = null;
  private grassHarvestBuffer: AudioBuffer | null = null;
  private grassHarvestLoading: Promise<void> | null = null;
  private treeHarvestBuffer: AudioBuffer | null = null;
  private treeHarvestLoading: Promise<void> | null = null;
  private rockHarvestBuffer: AudioBuffer | null = null;
  private rockHarvestLoading: Promise<void> | null = null;
  private readonly owlHootBuffers = new Map<OwlHootType, AudioBuffer>();
  private lastOwlEvaluationSecond = Number.NEGATIVE_INFINITY;
  private harvestImpactCount = 0;
  private swimStrokeCount = 0;
  private footstepCount = 0;
  private lastMixUpdateAt = Number.NEGATIVE_INFINITY;
  private lastInput: AmbientAudioUpdate | null = null;
  private destroyed = false;
  private caveState = false;
  private pauseState = false;
  private enabledState = true;
  private volumeState = Number.NaN;
  private swimmingState = false;
  private swimmingMovementState = false;
  private swimmingSwampState = false;
  private surfaceHillsWeight = 0;
  private surfaceMountainWeight = 0;
  private surfaceSnowWeight = 0;
  private surfaceCoastalWeight = 0;

  constructor(private readonly seed: string) {}

  // Build the deterministic buffers while the world loading overlay is still up. This keeps the
  // first movement input responsive; `activate` below is still the only method that resumes
  // audio playback and is therefore called from a player gesture.
  prepare(): void {
    if (!this.destroyed && !this.context) {
      this.createGraph();
    }
  }

  // Web Audio may only leave its suspended state from a player gesture. AdventureScene calls this
  // from its existing pointer/key handlers, so opening a world never needs a special audio prompt.
  activate(): void {
    if (this.destroyed) {
      return;
    }
    this.prepare();
    void this.context?.resume().catch(() => undefined);
  }

  update(input: AmbientAudioUpdate): void {
    if (this.destroyed) {
      return;
    }
    this.lastInput = input;
    const now = performance.now();
    const stateChanged = input.isCave !== this.caveState
      || input.isPaused !== this.pauseState
      || input.enabled !== this.enabledState
      || Math.abs(input.volume - this.volumeState) > 0.001;
    if (!stateChanged && now - this.lastMixUpdateAt < AMBIENT_AUDIO_MIX_UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastMixUpdateAt = now;
    this.caveState = input.isCave;
    this.pauseState = input.isPaused;
    this.enabledState = input.enabled;
    this.volumeState = input.volume;
    if (!this.context || !this.masterGain) {
      return;
    }

    const mix = input.isCave
      ? this.caveMix(input.nearLava)
      : this.surfaceMix(input.playerWorldX, input.playerWorldY, input.daylightAmount);
    const contextTime = this.context.currentTime;
    this.ramp(this.masterGain.gain, input.enabled
      ? clamp(input.volume) * (input.isPaused ? AMBIENT_AUDIO_PAUSE_ATTENUATION : 1)
      : 0, contextTime, AMBIENT_AUDIO_MASTER_RAMP_SECONDS);
    AMBIENT_LAYERS.forEach((layer) => {
      const voice = this.voices.get(layer);
      if (voice) {
        let fallbackAmount = 1;
        if (layer === 'desert-wind' && this.desertRecordedAmbient?.isReady) {
          fallbackAmount = 0.12;
        } else if (layer === 'coastal-surf' && this.coastalRecordedAmbient?.isReady) {
          fallbackAmount = 0.1;
        }
        this.ramp(voice.gain.gain, mix[layer] * VOICE_DEFINITIONS[layer].gain * fallbackAmount, contextTime, AMBIENT_AUDIO_GAIN_RAMP_SECONDS);
      }
    });
    this.updateCaveRecordingMix(input.isCave && input.enabled ? input.caveDepthMeters : null);
    this.updateDesertRecordingMix(input.isCave || !input.enabled ? 0 : mix['desert-wind']);
    this.updateHillsRecordingMix(input.isCave || !input.enabled ? 0 : this.surfaceHillsWeight);
    this.updateMountainRecordingMix(input.isCave || !input.enabled ? 0 : this.surfaceMountainWeight);
    this.updateSnowRecordingMix(input.isCave || !input.enabled ? 0 : this.surfaceSnowWeight);
    this.updateCoastalRecordingMix(input.isCave || !input.enabled ? 0 : this.surfaceCoastalWeight);
    this.updateForestOwls(input);
  }

  // Harvest effects deliberately use a separate gain path from ambience. Turning off the
  // environmental soundscape should not make a successfully cut tree or mined rock feel silent.
  // Their small seed- and tile-derived variations preserve the world's deterministic character
  // without allocating a growing cache of individual feature sounds.
  playHarvest(feature: TerrainFeatureType, tileX: number, tileY: number): void {
    if (this.destroyed) {
      return;
    }
    this.activate();
    const context = this.context;
    if (!context || !this.effectsGain) {
      return;
    }
    const random = createRandom(seedFromString(`${this.seed}:harvest:${feature}:${tileX}:${tileY}`));
    const now = context.currentTime + 0.008;
    if (feature === TerrainFeatureType.Grass
      || feature === TerrainFeatureType.Tree
      || feature === TerrainFeatureType.Cactus
      || feature === TerrainFeatureType.Rock
      || feature === TerrainFeatureType.SnowyRock) {
      // Recorded in-progress contacts are the entire harvesting phrase for these materials. Avoid
      // an unrelated synthesized final fracture becoming an audible extra hit.
      return;
    }
    this.playMaterialBurst(random, now, MATERIAL_SOUND_PROFILES[feature].break);
    if (feature === TerrainFeatureType.WaterReeds) {
      this.playWaterSlosh(random, now + 0.045, 0.2, 0.03, 100, 2_600);
    }
  }

  playCaveOreImpact(
    ore: CaveOreType,
    tileX: number,
    tileY: number,
    availableDurationSeconds?: number
  ): void {
    if (this.destroyed) {
      return;
    }
    this.activate();
    const context = this.context;
    if (!context || !this.effectsGain) {
      return;
    }
    const impactId = this.harvestImpactCount;
    this.harvestImpactCount += 1;
    const random = createRandom(seedFromString(`${this.seed}:cave-ore-impact:${ore}:${tileX}:${tileY}:${impactId}`));
    const now = context.currentTime + 0.006;
    if (this.playRecordedHarvestImpact(
      this.rockHarvestBuffer,
      ROCK_HARVEST_RECORDING_VOLUME,
      48,
      4_200,
      random,
      now,
      availableDurationSeconds
    )) {
      return;
    }
    // Preserve mining feedback if decoding has not completed or the platform rejects the WAV.
    this.playMaterialBurst(random, now, MATERIAL_SOUND_PROFILES[TerrainFeatureType.Rock].contact);
  }

  // These are the scheduled in-progress contacts. Recorded materials use them as the complete
  // phrase; the remaining synthesized materials still receive their larger final fracture above.
  playHarvestImpact(
    feature: TerrainFeatureType,
    tileX: number,
    tileY: number,
    availableDurationSeconds?: number
  ): void {
    if (this.destroyed) {
      return;
    }
    this.activate();
    const context = this.context;
    if (!context || !this.effectsGain) {
      return;
    }
    const impactId = this.harvestImpactCount;
    this.harvestImpactCount += 1;
    const random = createRandom(seedFromString(`${this.seed}:harvest-impact:${feature}:${tileX}:${tileY}:${impactId}`));
    const now = context.currentTime + 0.006;
    if (feature === TerrainFeatureType.Grass
      && this.playRecordedHarvestImpact(
        this.grassHarvestBuffer,
        GRASS_HARVEST_RECORDING_VOLUME,
        95,
        5_200,
        random,
        now,
        availableDurationSeconds
      )) {
      return;
    }
    if ((feature === TerrainFeatureType.Tree || feature === TerrainFeatureType.Cactus)
      && this.playRecordedHarvestImpact(
        this.treeHarvestBuffer,
        TREE_HARVEST_RECORDING_VOLUME,
        34,
        3_250,
        random,
        now,
        availableDurationSeconds
      )) {
      return;
    }
    if ((feature === TerrainFeatureType.Rock || feature === TerrainFeatureType.SnowyRock)
      && this.playRecordedHarvestImpact(
        this.rockHarvestBuffer,
        ROCK_HARVEST_RECORDING_VOLUME,
        48,
        4_200,
        random,
        now,
        availableDurationSeconds
      )) {
      return;
    }
    this.playMaterialBurst(random, now, MATERIAL_SOUND_PROFILES[feature].contact);
    if (feature === TerrainFeatureType.WaterReeds) {
      this.playWaterSlosh(random, now + 0.035, 0.14, 0.012, 130, 2_100);
    }
  }

  playFootstep(biome: Biome, tileX: number, tileY: number): void {
    if (this.destroyed) {
      return;
    }
    const surface = footstepSurfaceForBiome(biome);
    if (!surface) {
      return;
    }
    this.activate();
    const context = this.context;
    if (!context || !this.effectsGain) {
      return;
    }
    const stepId = this.footstepCount;
    this.footstepCount += 1;
    const random = createRandom(seedFromString(`${this.seed}:footstep:${surface}:${tileX}:${tileY}:${stepId}`));
    const startTime = context.currentTime + 0.004;
    if (surface === 'plains-grass' && this.playRecordedPlainsFootstep(random, startTime)) {
      return;
    }
    if (surface === 'swamp-earth' && this.playRecordedSwampFootstep(random, startTime)) {
      return;
    }
    this.playMaterialBurst(random, startTime, FOOTSTEP_SOUND_PROFILES[surface]);
  }

  playCaveFootstep(tileX: number, tileY: number): void {
    if (this.destroyed) {
      return;
    }
    this.activate();
    const context = this.context;
    if (!context || !this.effectsGain) {
      return;
    }
    const stepId = this.footstepCount;
    this.footstepCount += 1;
    const random = createRandom(seedFromString(`${this.seed}:cave-footstep:${tileX}:${tileY}:${stepId}`));
    const startTime = context.currentTime + 0.004;
    if (this.playRecordedCaveFootstep(random, startTime)) {
      return;
    }
    // Preserve movement feedback if the optional recording has not decoded yet.
    this.playMaterialBurst(random, startTime, FOOTSTEP_SOUND_PROFILES['mountain-rock']);
  }

  playWaterEntry(tileX: number, tileY: number, isSwampWater: boolean): void {
    if (this.destroyed) {
      return;
    }
    this.activate();
    const context = this.context;
    if (!context || !this.effectsGain) {
      return;
    }
    const random = createRandom(seedFromString(`${this.seed}:water-entry:${tileX}:${tileY}:${isSwampWater ? 'swamp' : 'open'}`));
    const now = context.currentTime + 0.008;
    if (isSwampWater) {
      // Swamp pools receive a low, soft disturbance instead of a bright ocean splash.
      this.playWaterSlosh(random, now, 0.48, 0.11, 32, 1_550);
      this.playWaterSlosh(random, now + 0.18, 0.3, 0.045, 42, 1_750);
      return;
    }
    this.playWaterSlosh(random, now, 0.58, 0.18, 28, 2_850);
    this.playWaterSlosh(random, now + 0.2, 0.38, 0.078, 38, 3_200);
  }

  playSwimStroke(tileX: number, tileY: number, isSwampWater: boolean): void {
    if (this.destroyed || !this.swimmingState || !this.swimmingMovementState) {
      return;
    }
    this.activate();
    const context = this.context;
    if (!context || !this.effectsGain) {
      return;
    }
    const strokeId = this.swimStrokeCount;
    this.swimStrokeCount += 1;
    const random = createRandom(seedFromString(`${this.seed}:swim-stroke:${tileX}:${tileY}:${strokeId}:${isSwampWater ? 'swamp' : 'open'}`));
    const now = context.currentTime + 0.006;
    this.playRecordedSwimStroke(random, now, isSwampWater);
  }

  // The recording is repeated by AdventureScene only during real movement. When movement ends,
  // fade any overlapping tail quickly so water never keeps sloshing under an idle player.
  setSwimming(isSwimming: boolean, isMoving: boolean, isSwampWater: boolean): void {
    if (this.destroyed) {
      return;
    }
    if (isSwimming === this.swimmingState
      && isMoving === this.swimmingMovementState
      && isSwampWater === this.swimmingSwampState) {
      return;
    }
    this.swimmingState = isSwimming;
    this.swimmingMovementState = isMoving;
    this.swimmingSwampState = isSwampWater;
    if ((!isSwimming || !isMoving) && this.context) {
      this.fadeActiveSwimStrokes(this.context.currentTime);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.voices.forEach((voice) => {
      try {
        voice.source.stop();
      } catch {
        // A source can already be stopped during Electron's renderer teardown.
      }
      voice.source.disconnect();
      voice.gain.disconnect();
    });
    this.voices.clear();
    this.stopActiveSwimStrokes();
    this.surfaceCaveRecording?.destroy();
    this.deepCaveRecording?.destroy();
    this.desertRecordedAmbient?.destroy();
    this.hillsRecordedAmbient?.destroy();
    this.mountainRecordedAmbient?.destroy();
    this.snowRecordedAmbient?.destroy();
    this.coastalRecordedAmbient?.destroy();
    this.surfaceCaveRecording = null;
    this.deepCaveRecording = null;
    this.desertRecordedAmbient = null;
    this.hillsRecordedAmbient = null;
    this.mountainRecordedAmbient = null;
    this.snowRecordedAmbient = null;
    this.coastalRecordedAmbient = null;
    this.swimRecordingBuffer = null;
    this.plainsFootstepBuffer = null;
    this.plainsFootstepOffsets = [];
    this.swampFootstepBuffer = null;
    this.swampFootstepOffsets = [];
    this.caveFootstepBuffer = null;
    this.caveFootstepOffsets = [];
    this.grassHarvestBuffer = null;
    this.treeHarvestBuffer = null;
    this.rockHarvestBuffer = null;
    this.owlHootBuffers.clear();
    this.masterGain?.disconnect();
    this.effectsGain?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.masterGain = null;
    this.effectsGain = null;
    this.context = null;
  }

  private preloadPlainsFootsteps(): void {
    const context = this.context;
    if (this.destroyed || !context || this.plainsFootstepBuffer || this.plainsFootstepLoading) {
      return;
    }
    this.plainsFootstepLoading = fetch(PLAINS_FOOTSTEP_RECORDING_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((encoded) => context.decodeAudioData(encoded))
      .then((decoded) => {
        if (this.destroyed || this.context !== context || decoded.duration < 0.06) {
          return;
        }
        this.plainsFootstepBuffer = decoded;
        this.plainsFootstepOffsets = recordedFootstepOffsetsFor(decoded);
      })
      .catch((error: unknown) => {
        // Keep the existing synthesized grass/soil step as a resilient offline fallback when a
        // locally bundled recording cannot be decoded on a particular system.
        console.warn('Wildbound could not load the plains footstep recording.', error);
      })
      .finally(() => {
        this.plainsFootstepLoading = null;
      });
  }

  private preloadSwimRecording(): void {
    const context = this.context;
    if (this.destroyed || !context || this.swimRecordingBuffer || this.swimRecordingLoading) {
      return;
    }
    this.swimRecordingLoading = fetch(SWIM_RECORDING_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((encoded) => context.decodeAudioData(encoded))
      .then((decoded) => {
        if (this.destroyed || this.context !== context || decoded.duration < 0.08) {
          return;
        }
        this.swimRecordingBuffer = withoutTrailingSilence(context, decoded);
      })
      .catch((error: unknown) => {
        console.warn('Wildbound could not load the swimming recording.', error);
      })
      .finally(() => {
        this.swimRecordingLoading = null;
      });
  }

  private playRecordedSwimStroke(
    random: RandomSource,
    startTime: number,
    isSwampWater: boolean
  ): boolean {
    const context = this.context;
    const effectsGain = this.effectsGain;
    const buffer = this.swimRecordingBuffer;
    const volume = isSwampWater ? SWAMP_WATER_SWIM_VOLUME : OPEN_WATER_SWIM_VOLUME;
    if (!context || !effectsGain || !buffer || volume <= 0) {
      return false;
    }

    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    const playbackRate = 0.985 + random() * 0.03;
    const renderedDuration = buffer.duration / playbackRate;
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    highPass.type = 'highpass';
    highPass.frequency.value = isSwampWater ? 24 : 28;
    highPass.Q.value = 0.38;
    lowPass.type = 'lowpass';
    lowPass.frequency.value = (isSwampWater ? 2_300 : 4_600) * (0.94 + random() * 0.12);
    lowPass.Q.value = 0.42;
    panner.pan.value = (random() - 0.5) * 0.16;
    const level = volume * (0.92 + random() * 0.12);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(level, startTime + 0.018);
    gain.gain.setValueAtTime(level, startTime + Math.max(0.02, renderedDuration - 0.16));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + renderedDuration);
    source.connect(highPass).connect(lowPass).connect(panner).connect(gain).connect(effectsGain);

    const stroke: ActiveSwimStroke = { source, highPass, lowPass, panner, gain };
    this.activeSwimStrokes.add(stroke);
    source.addEventListener('ended', () => this.releaseSwimStroke(stroke), { once: true });
    source.start(startTime);
    source.stop(startTime + renderedDuration + 0.01);
    return true;
  }

  private fadeActiveSwimStrokes(now: number): void {
    const stopAt = now + 0.12;
    this.activeSwimStrokes.forEach((stroke) => {
      // Preserve the gain actually being rendered at this instant. Reading AudioParam.value after
      // scheduling can return its intrinsic value rather than the in-flight envelope, which would
      // turn a requested fade into another hard cutoff.
      stroke.gain.gain.cancelAndHoldAtTime(now);
      stroke.gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      try {
        stroke.source.stop(stopAt + 0.01);
      } catch {
        // It can already have reached its natural tail on the same audio-render quantum.
      }
    });
  }

  private stopActiveSwimStrokes(): void {
    this.activeSwimStrokes.forEach((stroke) => {
      try {
        stroke.source.stop();
      } catch {
        // Renderer teardown may race an already completed recording.
      }
      this.releaseSwimStroke(stroke);
    });
    this.activeSwimStrokes.clear();
  }

  private releaseSwimStroke(stroke: ActiveSwimStroke): void {
    if (!this.activeSwimStrokes.delete(stroke)) {
      return;
    }
    stroke.source.disconnect();
    stroke.highPass.disconnect();
    stroke.lowPass.disconnect();
    stroke.panner.disconnect();
    stroke.gain.disconnect();
  }

  private preloadSwampFootsteps(): void {
    const context = this.context;
    if (this.destroyed || !context || this.swampFootstepBuffer || this.swampFootstepLoading) {
      return;
    }
    this.swampFootstepLoading = fetch(SWAMP_FOOTSTEP_RECORDING_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((encoded) => context.decodeAudioData(encoded))
      .then((decoded) => {
        if (this.destroyed || this.context !== context || decoded.duration < 0.06) {
          return;
        }
        this.swampFootstepBuffer = decoded;
        this.swampFootstepOffsets = recordedFootstepOffsetsFor(decoded);
      })
      .catch((error: unknown) => {
        // The previous soft-earth texture remains available if the optional recording cannot be
        // decoded, so an asset problem never removes swamp movement feedback.
        console.warn('Wildbound could not load the swamp footstep recording.', error);
      })
      .finally(() => {
        this.swampFootstepLoading = null;
      });
  }

  // The supplied walking capture is shaped into a short, soft soil contact at playback time.
  // Small deterministic variations select different recorded contacts without introducing a
  // perceptible repeating rhythm or allocating a permanent voice for every step.
  private playRecordedPlainsFootstep(random: RandomSource, startTime: number): boolean {
    return this.playRecordedFootstep(
      this.plainsFootstepBuffer,
      this.plainsFootstepOffsets,
      PLAINS_FOOTSTEP_VOLUME,
      0.52,
      36,
      3_650,
      0.965,
      0.07,
      random,
      startTime
    );
  }

  // Swamp steps retain more low-frequency soil pressure and trim bright grit, making the same
  // short contact treatment read as damp earth rather than dry grass.
  private playRecordedSwampFootstep(random: RandomSource, startTime: number): boolean {
    return this.playRecordedFootstep(
      this.swampFootstepBuffer,
      this.swampFootstepOffsets,
      SWAMP_FOOTSTEP_VOLUME,
      0.58,
      24,
      1_800,
      0.94,
      0.055,
      random,
      startTime
    );
  }

  private preloadCaveFootsteps(): void {
    const context = this.context;
    if (this.destroyed || !context || this.caveFootstepBuffer || this.caveFootstepLoading) {
      return;
    }
    this.caveFootstepLoading = fetch(CAVE_FOOTSTEP_RECORDING_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((encoded) => context.decodeAudioData(encoded))
      .then((decoded) => {
        if (this.destroyed || this.context !== context || decoded.duration < 0.06) {
          return;
        }
        this.caveFootstepBuffer = decoded;
        this.caveFootstepOffsets = recordedFootstepOffsetsFor(decoded);
      })
      .catch((error: unknown) => {
        console.warn('Wildbound could not load the cave stone footstep recording.', error);
      })
      .finally(() => {
        this.caveFootstepLoading = null;
      });
  }

  // The one-second source phrase contains several authentic stone contacts. Select one detected
  // contact per step, retain its short natural decay, and use restrained deterministic variation
  // so continuous walking never sounds like one identical sample retriggered on a metronome.
  private playRecordedCaveFootstep(random: RandomSource, startTime: number): boolean {
    return this.playRecordedFootstep(
      this.caveFootstepBuffer,
      this.caveFootstepOffsets,
      CAVE_FOOTSTEP_VOLUME,
      0.36,
      45,
      4_200,
      0.96,
      0.08,
      random,
      startTime
    );
  }

  private playRecordedFootstep(
    buffer: AudioBuffer | null,
    offsets: readonly number[],
    volume: number,
    maximumClipDuration: number,
    highPassFrequency: number,
    lowPassFrequency: number,
    playbackRateBase: number,
    playbackRateVariance: number,
    random: RandomSource,
    startTime: number
  ): boolean {
    const context = this.context;
    const effectsGain = this.effectsGain;
    if (!context || !effectsGain || !buffer || volume <= 0) {
      return false;
    }
    const clipDuration = Math.min(maximumClipDuration, buffer.duration);
    const offset = offsets[Math.floor(random() * offsets.length)] ?? 0;
    const duration = Math.min(clipDuration, buffer.duration - offset);
    if (duration < 0.055) {
      return false;
    }
    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = playbackRateBase + random() * playbackRateVariance;
    highPass.type = 'highpass';
    highPass.frequency.value = highPassFrequency;
    highPass.Q.value = 0.42;
    lowPass.type = 'lowpass';
    lowPass.frequency.value = lowPassFrequency + random() * Math.min(650, lowPassFrequency * 0.18);
    lowPass.Q.value = 0.48;
    panner.pan.value = (random() - 0.5) * 0.12;
    const level = Math.max(0, volume) * (0.88 + random() * 0.16);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(level, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.96);
    source.connect(highPass).connect(lowPass).connect(panner).connect(gain).connect(effectsGain);
    source.addEventListener('ended', () => {
      source.disconnect();
      highPass.disconnect();
      lowPass.disconnect();
      panner.disconnect();
      gain.disconnect();
    }, { once: true });
    source.start(startTime, offset, duration);
    source.stop(startTime + duration + 0.015);
    return true;
  }

  private preloadGrassHarvestRecording(): void {
    const context = this.context;
    if (this.destroyed || !context || this.grassHarvestBuffer || this.grassHarvestLoading) {
      return;
    }
    this.grassHarvestLoading = fetch(GRASS_HARVEST_RECORDING_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((encoded) => context.decodeAudioData(encoded))
      .then((decoded) => {
        if (this.destroyed || this.context !== context || decoded.duration < 0.03) {
          return;
        }
        this.grassHarvestBuffer = decoded;
      })
      .catch((error: unknown) => {
        // The contact synthesis remains available until the bundled clip is decoded, and on any
        // platform that cannot decode the source file.
        console.warn('Wildbound could not load the grass harvest recording.', error);
      })
      .finally(() => {
        this.grassHarvestLoading = null;
      });
  }

  private preloadTreeHarvestRecording(): void {
    const context = this.context;
    if (this.destroyed || !context || this.treeHarvestBuffer || this.treeHarvestLoading) {
      return;
    }
    this.treeHarvestLoading = fetch(TREE_HARVEST_RECORDING_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((encoded) => context.decodeAudioData(encoded))
      .then((decoded) => {
        if (this.destroyed || this.context !== context || decoded.duration < 0.03) {
          return;
        }
        this.treeHarvestBuffer = decoded;
      })
      .catch((error: unknown) => {
        console.warn('Wildbound could not load the tree harvest recording.', error);
      })
      .finally(() => {
        this.treeHarvestLoading = null;
      });
  }

  private preloadRockHarvestRecording(): void {
    const context = this.context;
    if (this.destroyed || !context || this.rockHarvestBuffer || this.rockHarvestLoading) {
      return;
    }
    this.rockHarvestLoading = fetch(ROCK_HARVEST_RECORDING_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((encoded) => context.decodeAudioData(encoded))
      .then((decoded) => {
        if (this.destroyed || this.context !== context || decoded.duration < 0.03) {
          return;
        }
        this.rockHarvestBuffer = decoded;
      })
      .catch((error: unknown) => {
        // Synthesized stone contacts remain a safe fallback while the optional recording loads.
        console.warn('Wildbound could not load the rock harvest recording.', error);
      })
      .finally(() => {
        this.rockHarvestLoading = null;
      });
  }

  // Recorded grass, wood, cactus, and rock phrases use fewer contacts for fast tools and never
  // exceed the configured playback cap, preserving their organic body instead of sharp clicks.
  private playRecordedHarvestImpact(
    buffer: AudioBuffer | null,
    volume: number,
    highPassFrequency: number,
    lowPassFrequency: number,
    random: RandomSource,
    startTime: number,
    availableDurationSeconds: number | undefined
  ): boolean {
    const context = this.context;
    const effectsGain = this.effectsGain;
    if (!context || !effectsGain || !buffer || volume <= 0) {
      return false;
    }
    const contactBudget = Math.max(0.025, availableDurationSeconds ?? buffer.duration);
    const targetDuration = Math.min(
      buffer.duration,
      Math.max(contactBudget * 0.9, buffer.duration / GRASS_HARVEST_MAX_PLAYBACK_RATE)
    );
    const playbackRate = Math.max(1, buffer.duration / targetDuration);
    const renderedDuration = buffer.duration / playbackRate;
    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    highPass.type = 'highpass';
    highPass.frequency.value = highPassFrequency;
    highPass.Q.value = 0.42;
    lowPass.type = 'lowpass';
    lowPass.frequency.value = lowPassFrequency;
    lowPass.Q.value = 0.48;
    panner.pan.value = (random() - 0.5) * 0.08;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(Math.max(0, volume), startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + renderedDuration * 0.96);
    source.connect(highPass).connect(lowPass).connect(panner).connect(gain).connect(effectsGain);
    source.addEventListener('ended', () => {
      source.disconnect();
      highPass.disconnect();
      lowPass.disconnect();
      panner.disconnect();
      gain.disconnect();
    }, { once: true });
    source.start(startTime);
    source.stop(startTime + renderedDuration + 0.01);
    return true;
  }

  private preloadForestOwls(): void {
    const context = this.context;
    if (!context || this.destroyed) {
      return;
    }
    (Object.keys(OWL_HOOT_RECORDING_URLS) as OwlHootType[]).forEach((type) => {
      void fetch(OWL_HOOT_RECORDING_URLS[type])
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.arrayBuffer();
        })
        .then((encoded) => context.decodeAudioData(encoded))
        .then((decoded) => {
          if (!this.destroyed && this.context === context && decoded.duration >= 0.08) {
            this.owlHootBuffers.set(type, decoded);
          }
        })
        .catch((error: unknown) => {
          // An unavailable optional owl voice must not affect the rest of the forest soundscape.
          console.warn(`Wildbound could not load the ${type} owl recording.`, error);
        });
    });
  }

  // Owls are one-shot, real recordings rather than a looping bed. Every type independently
  // rolls once per world second from a seed-derived value, preserving the requested tunability
  // without a timer rhythm or per-frame allocation.
  private updateForestOwls(input: AmbientAudioUpdate): void {
    const worldSecond = Math.floor(input.worldTimeMs / 1_000);
    const playerBiome = biomeAtTile(
      this.seed,
      input.playerWorldX / WORLD_TILE_SIZE,
      input.playerWorldY / WORLD_TILE_SIZE
    );
    const active = !input.isCave
      && !input.isPaused
      && input.enabled
      && input.daylightAmount <= 0.2
      && playerBiome === Biome.Forest;
    if (!active) {
      this.lastOwlEvaluationSecond = worldSecond;
      return;
    }
    if (worldSecond === this.lastOwlEvaluationSecond) {
      return;
    }
    this.lastOwlEvaluationSecond = worldSecond;
    (Object.keys(OWL_HOOT_CHANCE_PER_SECOND) as OwlHootType[]).forEach((type) => {
      const random = createRandom(seedFromString(`${this.seed}:forest-owl:${worldSecond}:${type}`));
      if (random() < OWL_HOOT_CHANCE_PER_SECOND[type]) {
        this.playRecordedForestOwlHoot(type, random);
      }
    });
  }

  private playRecordedForestOwlHoot(type: OwlHootType, random: RandomSource): void {
    const context = this.context;
    const masterGain = this.masterGain;
    const buffer = this.owlHootBuffers.get(type);
    if (!context || !masterGain || !buffer || OWL_HOOT_VOLUME[type] <= 0) {
      return;
    }
    const startTime = context.currentTime + 0.02;
    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 0.985 + random() * 0.03;
    highPass.type = 'highpass';
    highPass.frequency.value = 75;
    highPass.Q.value = 0.45;
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 2_650;
    lowPass.Q.value = 0.48;
    panner.pan.value = (random() - 0.5) * 0.72;
    const level = Math.max(0, OWL_HOOT_VOLUME[type]) * 0.05;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(level, startTime + 0.035);
    gain.gain.setValueAtTime(level, startTime + Math.max(0.04, buffer.duration * 0.78));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + buffer.duration * 0.98);
    source.connect(highPass).connect(lowPass).connect(panner).connect(gain).connect(masterGain);
    source.addEventListener('ended', () => {
      source.disconnect();
      highPass.disconnect();
      lowPass.disconnect();
      panner.disconnect();
      gain.disconnect();
    }, { once: true });
    source.start(startTime);
  }

  private createGraph(): void {
    const context = new AudioContext({ latencyHint: 'interactive' });
    const masterGain = context.createGain();
    const effectsGain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    masterGain.gain.value = 0;
    effectsGain.gain.value = 0.62;
    compressor.threshold.value = -25;
    compressor.knee.value = 16;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.03;
    compressor.release.value = 0.55;
    masterGain.connect(compressor);
    effectsGain.connect(compressor);
    compressor.connect(context.destination);
    this.context = context;
    this.masterGain = masterGain;
    this.effectsGain = effectsGain;

    // The supplied recordings are filtered and looped in the Web Audio graph rather than using
    // an MP3 element's hard loop point. This preserves a continuous ambient bed at every cycle.
    this.surfaceCaveRecording = new LoopingAmbientTrack(context, masterGain, {
      url: CAVE_SHALLOW_RECORDING_URL,
      label: 'shallow cave',
      highPassFrequency: 28,
      lowPassFrequency: 4_200,
      pan: -0.06,
      playbackRate: 0.999,
      loopCrossfadeSeconds: 4.2
    });
    this.deepCaveRecording = new LoopingAmbientTrack(context, masterGain, {
      url: CAVE_DEEP_RECORDING_URL,
      label: 'deep cave',
      highPassFrequency: 34,
      lowPassFrequency: 3_250,
      pan: 0.1,
      playbackRate: 1.004,
      loopCrossfadeSeconds: 4.2
    });
    this.desertRecordedAmbient = new LoopingAmbientTrack(context, masterGain, {
      url: DESERT_RECORDED_AMBIENT_URL,
      label: 'desert wind',
      highPassFrequency: 28,
      lowPassFrequency: 2_150,
      pan: -0.08,
      playbackRate: 0.998,
      loopCrossfadeSeconds: 3.8
    });
    this.hillsRecordedAmbient = new LoopingAmbientTrack(context, masterGain, {
      url: HILLS_RECORDED_AMBIENT_URL,
      label: 'hills open air',
      highPassFrequency: 32,
      lowPassFrequency: 4_200,
      pan: 0.06,
      playbackRate: 0.999,
      loopCrossfadeSeconds: 4.2
    });
    this.mountainRecordedAmbient = new LoopingAmbientTrack(context, masterGain, {
      url: MOUNTAIN_RECORDED_AMBIENT_URL,
      label: 'mountain high altitude',
      highPassFrequency: 28,
      lowPassFrequency: 4_000,
      pan: -0.05,
      playbackRate: 1.001,
      loopCrossfadeSeconds: 4.2
    });
    this.snowRecordedAmbient = new LoopingAmbientTrack(context, masterGain, {
      url: SNOW_RECORDED_AMBIENT_URL,
      label: 'snow cold wind',
      highPassFrequency: 28,
      lowPassFrequency: 4_400,
      pan: 0.04,
      playbackRate: 0.999,
      loopCrossfadeSeconds: 4.5
    });
    this.coastalRecordedAmbient = new LoopingAmbientTrack(context, masterGain, {
      url: COASTAL_RECORDED_AMBIENT_URL,
      label: 'peaceful coast',
      highPassFrequency: 28,
      lowPassFrequency: 5_200,
      pan: 0,
      playbackRate: 1,
      loopCrossfadeSeconds: 4.8
    });
    this.surfaceCaveRecording.preload();
    this.deepCaveRecording.preload();
    this.desertRecordedAmbient.preload();
    this.hillsRecordedAmbient.preload();
    this.mountainRecordedAmbient.preload();
    this.snowRecordedAmbient.preload();
    this.coastalRecordedAmbient.preload();
    this.preloadSwimRecording();
    this.preloadPlainsFootsteps();
    this.preloadSwampFootsteps();
    this.preloadCaveFootsteps();
    this.preloadGrassHarvestRecording();
    this.preloadTreeHarvestRecording();
    this.preloadRockHarvestRecording();
    this.preloadForestOwls();

    AMBIENT_LAYERS.forEach((layer, layerIndex) => {
      const definition = VOICE_DEFINITIONS[layer];
      const random = createRandom(seedFromString(`${this.seed}:ambient:${layer}`));
      const sampleCount = Math.round(definition.durationSeconds * AMBIENT_AUDIO_SOURCE_SAMPLE_RATE);
      const buffer = context.createBuffer(1, sampleCount, AMBIENT_AUDIO_SOURCE_SAMPLE_RATE);
      const samples = definition.builder(random, AMBIENT_AUDIO_SOURCE_SAMPLE_RATE, sampleCount);
      const channel = buffer.getChannelData(0);
      for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
        channel[sampleIndex] = samples[sampleIndex];
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const panner = context.createStereoPanner();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopEnd = buffer.duration;
      source.playbackRate.value = 0.996 + random() * 0.008;
      filter.type = 'lowpass';
      filter.frequency.value = definition.filterFrequency;
      filter.Q.value = definition.filterQ ?? 0.45;
      panner.pan.value = definition.pan + (random() - 0.5) * 0.08;
      gain.gain.value = 0;
      source.connect(filter).connect(panner).connect(gain).connect(masterGain);
      // Align loop phases to saved world time. Two sessions in the same world therefore hear the
      // same long-form phrase position after the same amount of in-world time has elapsed.
      const worldSeconds = this.lastInput?.worldTimeMs ?? 0;
      const offset = (worldSeconds / 1_000 + random() * buffer.duration + layerIndex * 0.37) % buffer.duration;
      source.start(context.currentTime + 0.015, offset);
      this.voices.set(layer, { gain, source });
    });

  }

  private ramp(parameter: AudioParam, target: number, now: number, duration: number): void {
    parameter.cancelScheduledValues(now);
    parameter.setTargetAtTime(clamp(target, 0, 1), now, Math.max(0.01, duration));
  }

  private playMaterialBurst(
    random: RandomSource,
    startTime: number,
    profile: MaterialBurstProfile
  ): void {
    const context = this.context;
    const effectsGain = this.effectsGain;
    if (!context || !effectsGain) {
      return;
    }
    const length = Math.max(1, Math.ceil(context.sampleRate * profile.durationSeconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    const fragments: { startSeconds: number; level: number; decaySeconds: number }[] = [];
    let nextFragmentAt = 0;
    for (let index = 0; index < profile.fragmentCount; index += 1) {
      if (index > 0) {
        nextFragmentAt += profile.fragmentDelayRange[0]
          + random() * (profile.fragmentDelayRange[1] - profile.fragmentDelayRange[0]);
      }
      if (nextFragmentAt >= profile.durationSeconds * 0.82) {
        break;
      }
      fragments.push({
        startSeconds: nextFragmentAt,
        level: (index === 0 ? 1 : 0.42 + random() * 0.48) * (1 - index * 0.045),
        decaySeconds: profile.fragmentDecayRange[0]
          + random() * (profile.fragmentDecayRange[1] - profile.fragmentDecayRange[0])
      });
    }
    let deepMaterial = 0;
    let surfaceMaterial = 0;
    let fineMaterial = 0;
    let impactMaterial = 0;
    for (let index = 0; index < length; index += 1) {
      const white = random() * 2 - 1;
      // Correlated bands feel like compressed earth, fibres, and loose fragments. Avoiding raw
      // white noise here is important: unfiltered single-sample changes are what made steps and
      // feature breaks read as sharp digital clicks instead of physical material.
      deepMaterial += (white - deepMaterial) * 0.009;
      surfaceMaterial += (white - surfaceMaterial) * 0.055;
      fineMaterial += (white - fineMaterial) * 0.22;
      impactMaterial += (white - impactMaterial) * 0.34;
      const seconds = index / context.sampleRate;
      let fractureEnvelope = 0;
      let freshImpactEnvelope = 0;
      fragments.forEach((fragment) => {
        const elapsed = seconds - fragment.startSeconds;
        if (elapsed >= 0) {
          const attackSeconds = 0.006 + (1 - profile.grainColor) * 0.008;
          const attack = smoothRise(elapsed / attackSeconds);
          fractureEnvelope += fragment.level * attack * Math.exp(-elapsed / fragment.decaySeconds);
          // A brief, smoothed wide-band contact gives fibres, soil, wood, and stone their
          // physical edge without resorting to an unfiltered digital click.
          freshImpactEnvelope += fragment.level * attack * Math.exp(-elapsed / (0.012 + profile.grainColor * 0.026));
        }
      });
      channel[index] = clamp(
        (deepMaterial * profile.deepColor
          + surfaceMaterial * profile.surfaceColor
          + (fineMaterial - surfaceMaterial) * profile.grainColor)
          * fractureEnvelope
          + impactMaterial * freshImpactEnvelope * (0.045 + profile.grainColor * 0.18),
        -0.96,
        0.96
      );
    }
    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    highPass.type = 'highpass';
    highPass.frequency.value = profile.highPassFrequency;
    highPass.Q.value = 0.45;
    lowPass.type = 'lowpass';
    // A foot or tool first compresses the material, then reveals its surface texture. Opening
    // the filter gently makes that transition smooth and keeps the attack free of brittle grit.
    lowPass.frequency.setValueAtTime(Math.max(650, profile.lowPassFrequency * 0.82), startTime);
    lowPass.frequency.exponentialRampToValueAtTime(
      profile.lowPassFrequency,
      startTime + Math.min(0.03, profile.durationSeconds * 0.28)
    );
    lowPass.Q.value = 0.5;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(profile.amount, startTime + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + profile.durationSeconds);
    source.connect(highPass).connect(lowPass).connect(gain).connect(effectsGain);
    source.addEventListener('ended', () => {
      source.disconnect();
      highPass.disconnect();
      lowPass.disconnect();
      gain.disconnect();
    }, { once: true });
    source.start(startTime);
    source.stop(startTime + profile.durationSeconds + 0.015);
  }

  private updateCaveRecordingMix(caveDepthMeters: number | null): void {
    if (caveDepthMeters === null) {
      this.surfaceCaveRecording?.setLevel(0);
      this.deepCaveRecording?.setLevel(0);
      return;
    }
    const blendStart = CAVE_RECORDING_DEPTH_BOUNDARY_METERS - CAVE_RECORDING_DEPTH_BLEND_HALF_WIDTH_METERS;
    const blendWidth = CAVE_RECORDING_DEPTH_BLEND_HALF_WIDTH_METERS * 2;
    const deepWeight = smoothRise((caveDepthMeters - blendStart) / blendWidth);
    // The recordings already contain their authored distance and room character. Keep them below
    // the interactive effects, then use an equal-power depth blend to avoid a gain dip at 500 m.
    this.surfaceCaveRecording?.setLevel(
      Math.cos(deepWeight * Math.PI * 0.5) * CAVE_SHALLOW_RECORDING_VOLUME
    );
    this.deepCaveRecording?.setLevel(
      Math.sin(deepWeight * Math.PI * 0.5) * CAVE_DEEP_RECORDING_VOLUME
    );
  }

  private updateDesertRecordingMix(desertWeight: number): void {
    // Biome sampling already supplies a fractional weight at boundaries. The same smooth gain
    // path used by cave recordings turns that into a gradual desert approach/exit with no loop
    // restart or hard line at the terrain edge.
    this.desertRecordedAmbient?.setLevel(clamp(desertWeight) * DESERT_RECORDED_AMBIENT_VOLUME);
  }

  private updateHillsRecordingMix(hillsWeight: number): void {
    // The sampled biome weight changes gradually before and after the actual biome boundary. The
    // persistent native loop therefore never restarts as the player crosses between hills and a
    // neighbour; only this smoothly ramped level changes.
    this.hillsRecordedAmbient?.setLevel(clamp(hillsWeight) * HILLS_RECORDED_AMBIENT_VOLUME);
  }

  private updateMountainRecordingMix(mountainWeight: number): void {
    // Keep one persistent loop running through boundary blends. Only its smoothed sampled-biome
    // gain changes, avoiding restarts when a route alternates between hills and mountain tiles.
    this.mountainRecordedAmbient?.setLevel(clamp(mountainWeight) * MOUNTAIN_RECORDED_AMBIENT_VOLUME);
  }

  private updateSnowRecordingMix(snowWeight: number): void {
    // The sampled regional weight begins changing before the visible terrain boundary. The loop
    // stays alive through the crossing and only its gain moves, preventing a restart or hard cut.
    this.snowRecordedAmbient?.setLevel(clamp(snowWeight) * SNOW_RECORDED_AMBIENT_VOLUME);
  }

  private updateCoastalRecordingMix(coastalWeight: number): void {
    // Ocean and beach share one persistent recording. Sampled regional weights change its gain
    // continuously, so walking through the surf boundary never restarts or hard-switches the loop.
    this.coastalRecordedAmbient?.setLevel(clamp(coastalWeight) * COASTAL_RECORDED_AMBIENT_VOLUME);
  }

  private playWaterSlosh(
    random: RandomSource,
    startTime: number,
    durationSeconds: number,
    amount: number,
    highPassFrequency: number,
    lowPassFrequency: number
  ): void {
    const context = this.context;
    const effectsGain = this.effectsGain;
    if (!context || !effectsGain) {
      return;
    }
    const length = Math.max(1, Math.ceil(context.sampleRate * durationSeconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let rollingWater = 0;
    let turbulentWater = 0;
    let foamWater = 0;
    const firstPulse = 0.17 + random() * 0.16;
    const secondPulse = 0.56 + random() * 0.17;
    const pulseWidth = 0.13 + random() * 0.05;
    for (let index = 0; index < length; index += 1) {
      const white = random() * 2 - 1;
      rollingWater += (white - rollingWater) * 0.009;
      turbulentWater += (white - turbulentWater) * 0.058;
      foamWater += (white - foamWater) * 0.19;
      const progress = index / Math.max(1, length - 1);
      const firstWave = Math.exp(-Math.pow((progress - firstPulse) / pulseWidth, 2));
      const secondWave = Math.exp(-Math.pow((progress - secondPulse) / (pulseWidth * 1.35), 2));
      const motion = 0.28 + firstWave * 0.82 + secondWave * 0.56;
      const envelope = Math.pow(Math.sin(Math.PI * progress), 0.68);
      // Rolling low/mid turbulence carries the sound. A very small filtered foam component adds
      // surface detail without the dry high-frequency noise that made the old cue read as snow.
      channel[index] = (rollingWater * 0.82 + turbulentWater * 0.52 + (foamWater - turbulentWater) * 0.045)
        * motion * envelope;
    }
    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    highPass.type = 'highpass';
    highPass.frequency.value = highPassFrequency;
    highPass.Q.value = 0.45;
    lowPass.type = 'lowpass';
    lowPass.frequency.value = lowPassFrequency;
    lowPass.Q.value = 0.5;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(amount, startTime + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);
    source.connect(highPass).connect(lowPass).connect(gain).connect(effectsGain);
    source.addEventListener('ended', () => {
      source.disconnect();
      highPass.disconnect();
      lowPass.disconnect();
      gain.disconnect();
    }, { once: true });
    source.start(startTime);
    source.stop(startTime + durationSeconds + 0.015);
  }

  private surfaceMix(worldX: number, worldY: number, daylightAmount: number): Record<AmbientLayer, number> {
    const mix = this.emptyMix();
    const biomeWeights = new Map<Biome, number>();
    const centerBiome = biomeAtTile(this.seed, worldX / WORLD_TILE_SIZE, worldY / WORLD_TILE_SIZE);
    let totalWeight = 0;
    AMBIENT_AUDIO_BIOME_SAMPLE_POINTS.forEach((point) => {
      const biome = biomeAtTile(
        this.seed,
        worldX / WORLD_TILE_SIZE + point.x,
        worldY / WORLD_TILE_SIZE + point.y
      );
      biomeWeights.set(biome, (biomeWeights.get(biome) ?? 0) + point.weight);
      totalWeight += point.weight;
    });
    const day = clamp(daylightAmount);
    // Day birds fully leave the mix at night instead of remaining as a faint residual chirp.
    // The short dawn/dusk ramp keeps the transition natural as the day-night overlay changes.
    const daytimeBirdAmount = smoothRise((day - 0.2) / 0.22);
    const night = 1 - day;
    this.surfaceHillsWeight = (biomeWeights.get(Biome.Hills) ?? 0) / Math.max(1, totalWeight);
    this.surfaceMountainWeight = (biomeWeights.get(Biome.Mountains) ?? 0) / Math.max(1, totalWeight);
    this.surfaceSnowWeight = (biomeWeights.get(Biome.Snow) ?? 0) / Math.max(1, totalWeight);
    this.surfaceCoastalWeight = (
      (biomeWeights.get(Biome.Ocean) ?? 0)
      + (biomeWeights.get(Biome.Beach) ?? 0) * 0.82
    ) / Math.max(1, totalWeight);
    biomeWeights.forEach((weight, biome) => {
      const amount = weight / Math.max(1, totalWeight);
      switch (biome) {
        case Biome.Ocean:
          mix['coastal-surf'] += amount * 0.65;
          mix['coastal-wind'] += amount * 0.18;
          mix.birdsong += amount * daytimeBirdAmount * 0.28;
          break;
        case Biome.Beach:
          mix['coastal-surf'] += amount * 0.5;
          mix['coastal-wind'] += amount * 0.28;
          mix['meadow-rustle'] += amount * 0.02;
          mix.birdsong += amount * daytimeBirdAmount * 0.12;
          break;
        case Biome.Plains:
          mix['meadow-rustle'] += amount * 0.55;
          mix['coastal-wind'] += amount * 0.07;
          mix.birdsong += amount * daytimeBirdAmount * 0.06;
          mix['night-insects'] += amount * night * 0.06;
          break;
        case Biome.Forest:
          // Forest follows the same daytime bed as plains. Its distinct night identity comes
          // from the real owl calls scheduled above, not a second competing wind/leaf loop.
          mix['meadow-rustle'] += amount * 0.55;
          mix['coastal-wind'] += amount * 0.07;
          mix.birdsong += amount * daytimeBirdAmount * 0.06;
          mix['night-insects'] += amount * night * 0.06;
          break;
        case Biome.Desert:
          mix['desert-wind'] += amount * 0.92;
          mix['ridge-wind'] += amount * 0.08;
          break;
        case Biome.Swamp:
          mix['wetland-life'] += amount * 0.82;
          mix['forest-canopy'] += amount * 0.11;
          mix.birdsong += amount * daytimeBirdAmount * 0.1;
          mix['night-insects'] += amount * night * 0.45;
          break;
        case Biome.Hills:
          // Once the recording is decoded, retain only a restrained procedural ridge undertone.
          // It bridges naturally toward mountains without competing with the authored hills bed.
          mix['ridge-wind'] += amount * (this.hillsRecordedAmbient?.isReady ? 0.08 : 0.62);
          mix.birdsong += amount * daytimeBirdAmount * 0.12;
          break;
        case Biome.Mountains:
          // Preserve just enough procedural air to bridge into hills and snow after the authored
          // mountain recording is ready; the recording remains the biome's primary identity.
          mix['ridge-wind'] += amount * (this.mountainRecordedAmbient?.isReady ? 0.12 : 0.98);
          mix['snow-wind'] += amount * (this.mountainRecordedAmbient?.isReady ? 0.05 : 0.18);
          mix.birdsong += amount * daytimeBirdAmount * 0.035;
          break;
        case Biome.Snow:
          // Retain a quiet procedural fallback during decoding. Once ready, the supplied cold
          // wind recording becomes the biome identity while a faint synthetic bed masks any
          // residual tonal repetition and bridges gracefully back toward mountains.
          mix['snow-wind'] += amount * (this.snowRecordedAmbient?.isReady ? 0.08 : 0.98);
          mix['ridge-wind'] += amount * (this.snowRecordedAmbient?.isReady ? 0.05 : 0.18);
          break;
      }
    });
    // Hills use bare dirt and rock rather than grass or trees. The surrounding samples still
    // blend regional wind and distant wildlife, but vegetation textures must never leak through
    // from a nearby forest/plains boundary while the player is standing in a hills biome.
    if (centerBiome === Biome.Hills) {
      mix['meadow-rustle'] = 0;
      mix['forest-canopy'] = 0;
    }
    return mix;
  }

  private caveMix(nearLava: boolean): Record<AmbientLayer, number> {
    const mix = this.emptyMix();
    // Recorded cave beds carry the authored room character. Procedural audio stays as a
    // restrained, low geological undertone; no separate water-drop voice is generated.
    mix['cave-depths'] = 0.26;
    mix['cave-lava'] = nearLava ? 0.62 : 0.16;
    return mix;
  }

  private emptyMix(): Record<AmbientLayer, number> {
    return {
      'coastal-surf': 0,
      'coastal-wind': 0,
      'meadow-rustle': 0,
      'forest-canopy': 0,
      birdsong: 0,
      'night-insects': 0,
      'wetland-life': 0,
      'desert-wind': 0,
      'ridge-wind': 0,
      'snow-wind': 0,
      'cave-depths': 0,
      'cave-lava': 0
    };
  }
}

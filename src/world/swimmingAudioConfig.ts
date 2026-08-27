// Surface swimming uses a real water recording. The decoded waveform is trimmed in memory so
// MP3 encoder padding and the recording's silent tail never become part of the repeated cadence.
export const SWIM_RECORDING_URL = new URL(
  '../../assets/audio/swimming/water-swimming.mp3',
  import.meta.url
).toString();

// These values are intentionally independent of biome ambience. They are multiplied by the
// shared effects bus, so they can be tuned without making ocean or swamp ambience louder.
export const OPEN_WATER_SWIM_VOLUME = 0.17;
export const SWAMP_WATER_SWIM_VOLUME = 0.13;
// The analyzed audible body is about 875 ms. Starting the next contact at 720 ms overlaps only
// the soft release, producing continuous water motion without piling up full-volume strokes.
export const SWIM_RECORDING_REPEAT_INTERVAL_MS = 720;

// Tail analysis uses short RMS windows. A quiet tail must remain below the adaptive floor for a
// meaningful duration before it is removed, which avoids cutting a natural low-level splash.
export const SWIM_SILENCE_WINDOW_SECONDS = 0.02;
export const SWIM_SILENCE_ABSOLUTE_FLOOR = 0.0015;
export const SWIM_SILENCE_PEAK_RATIO = 0.035;
export const SWIM_MINIMUM_TRAILING_SILENCE_SECONDS = 0.1;
export const SWIM_TAIL_PADDING_SECONDS = 0.035;

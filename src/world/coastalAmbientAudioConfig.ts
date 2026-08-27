// Shared authored shoreline bed. Ocean receives the complete sampled weight while beach uses a
// slightly softer multiplier in BiomeAmbientAudio, keeping peaceful waves below gameplay effects.
export const COASTAL_RECORDED_AMBIENT_VOLUME = 0.075;

export const COASTAL_RECORDED_AMBIENT_URL = new URL(
  '../../assets/audio/ambient/coastal-peaceful-waves.mp3',
  import.meta.url
).toString();

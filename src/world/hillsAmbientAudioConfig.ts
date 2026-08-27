// The authored hills recording follows the same biome-weighted transition path as the other
// recorded ambience beds. Adjust this independently without changing mountains or global audio.
export const HILLS_RECORDED_AMBIENT_VOLUME = 0.11;

export const HILLS_RECORDED_AMBIENT_URL = new URL(
  '../../assets/audio/ambient/hills-open-air.mp3',
  import.meta.url
).toString();

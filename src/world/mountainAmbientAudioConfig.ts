// Dedicated high-altitude recording level. This is multiplied by the sampled mountain biome
// weight, so changing it does not affect hills, snow fields, caves, or the global ambience slider.
export const MOUNTAIN_RECORDED_AMBIENT_VOLUME = 0.11;

export const MOUNTAIN_RECORDED_AMBIENT_URL = new URL(
  '../../assets/audio/ambient/mountains-high-altitude.mp3',
  import.meta.url
).toString();

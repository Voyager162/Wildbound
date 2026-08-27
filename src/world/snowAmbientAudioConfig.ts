// Dedicated cold-wind recording level for snow fields. This is multiplied by the smoothed snow
// biome weight and the global ambience slider, so it fades naturally through mountain borders.
export const SNOW_RECORDED_AMBIENT_VOLUME = 0.1;

export const SNOW_RECORDED_AMBIENT_URL = new URL(
  '../../assets/audio/ambient/snow-cold-wind.mp3',
  import.meta.url
).toString();

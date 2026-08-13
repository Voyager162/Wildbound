// Night-light motion is independent from spawn density and glow strength. These two controls
// apply to every light-bearing ambient particle so the visible mote and its projected glow stay
// perfectly locked together.
export const NIGHT_AMBIENT_LIGHT_TRAVEL_DISTANCE_MULTIPLIER = 1;
export const NIGHT_AMBIENT_LIGHT_TRAVEL_SPEED_MULTIPLIER = 1;

// New sources and sources leaving the retained world window cross-fade instead of appearing or
// disappearing on a particle-cell boundary. The day/night schedule handles the longer sunset and
// sunrise fade separately.
export const NIGHT_AMBIENT_LIGHT_SPAWN_FADE_MS = 1800;
export const NIGHT_AMBIENT_LIGHT_DESPAWN_FADE_MS = 2400;

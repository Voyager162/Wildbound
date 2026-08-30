// Designer-facing in-game music controls. The chance is rolled once per second while a playable
// world is open and no song is active. Set it to 0 to keep the library silent without removing it.
export const GAME_MUSIC_PLAY_CHANCE_PERCENT_PER_SECOND = 1;

// Time measured from entering a world or from the end of the previous song. Runtime clamps this
// to at least 60 seconds, preserving the required one-minute quiet interval.
export const GAME_MUSIC_MINIMUM_SECONDS_BETWEEN_SONGS = 60;

export const GAME_MUSIC_VOLUME = 0.24;

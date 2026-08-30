# Wildbound music library

Place licensed `.mp3` tracks for the title screen in [`main menu`](./main%20menu/), and tracks
that should play occasionally during exploration in [`game`](./game/).

Wildbound reads that folder when the main menu opens, shuffles the available tracks without
immediate repeats, preloads the next track, and keeps playback alive while a selected world is
generating. Restart the game after adding or removing tracks if the main menu is already open.

The music stops only after the selected world has completed its loading sequence and becomes
playable.

In-game music is shuffled without immediate repeats. Its chance is evaluated once per second only
after the configured quiet interval has passed. Both controls are in `src/audio/gameMusicConfig.ts`.

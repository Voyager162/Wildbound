# Wildbound music library

Place licensed `.mp3` tracks for the title screen in [`main menu`](./main%20menu/).

Wildbound reads that folder when the main menu opens, shuffles the available tracks without
immediate repeats, preloads the next track, and keeps playback alive while a selected world is
generating. Restart the game after adding or removing tracks if the main menu is already open.

The music stops only after the selected world has completed its loading sequence and becomes
playable.

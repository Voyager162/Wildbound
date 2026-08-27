# Wildbound

Wildbound is a desktop-first 2D adventure game foundation built with TypeScript, Phaser, Electron, and Electron Forge. Windows is the current release target.

Current release: `1.8.0` - Rich biome audio, smoother cave transitions, material-specific interactions, and substantially faster terrain streaming.

## Windows installation

The Windows release asset is `Wildbound Setup.exe`.

1. Download and run `Wildbound Setup.exe`.
2. Let setup finish and close.
3. Launch Wildbound normally from the Start menu or desktop shortcut.

Setup, the installed executable, shortcuts, and the application window use the replaceable Wildbound icon at `assets/wildbound.ico`.

## Current state

- Phaser runs in a secure Electron renderer. Packaged builds load local files and need no web server or internet connection.
- The main menu keeps a local library of named worlds. New worlds can be named (or use the faded `New World` default), renamed later, or deleted; leaving the seed blank generates a new random seed.
- Put licensed MP3s in [`music/main menu`](music/main%20menu/). The menu shuffles that folder, preloads the next track, and keeps its music playing through world terrain generation until the selected world is ready.
- The code-generated player moves with WASD or the arrow keys by default, visually faces all eight movement directions, and has directional walking and swimming animation.
- Player movement is delta-time based. Swimming begins only when the player's feet cross into traversable ocean or swamp water, at 42% of walking speed.
- Entering water now has a compact splash; moving while swimming produces gentle, spaced stroke sounds. Swamp pools use a softer, muddier variation than open water.
- Holding the left mouse button for one real-time second harvests a highlighted nearby feature.
- A smooth-follow camera maintains a large 2560 x 1440 world view on 16:9 displays in both windowed and fullscreen modes.
- F3 toggles a crisp, screen-space debug panel with world/tile coordinates, climate values, world time, current landmark, movement mode, seed, chunk position, inventory usage, and FPS.
- A circular, top-right minimap samples stable world coordinates and keeps the player marker centered.
- Press `F` to open the world map. It permanently charts the same continuous terrain colors shown by the circular minimap; drag to pan and use the mouse wheel to zoom without changing map scale automatically.
- Rare seed-deterministic landmarks — ancient trees, waterfalls, crystal formations, lakes, craters, volcanoes, stone circles, giant skeletons, campsites, and watchtowers — stream as a separate visual layer from normal terrain and resources.
- A saved day/night clock adds gradual dawn, daylight, dusk, and night lighting. Trees, grasses, reeds, water glints, and biome-sensitive particles provide lightweight ambient motion. Original seed-linked biome ambience layers forest birds and foliage, plains grass, ridge winds, surf, wetlands, desert gusts, snow, and cave depth; they blend across nearby biomes instead of switching at a tile boundary.
- Caves have their own subdued, eerie resonant ambience and irregular water drops with fading echoes, kept separate from every surface biome layer.
- Elevation, moisture, and temperature noise deterministically classify ocean, beach, plains, forest, desert, swamp, hills, mountains, and snow biomes.
- Terrain uses smoothly blended coastline/elevation bands, detailed grass/vegetation/sand/mud/ice/rock marks, rolling hill contours, mountain formations, and subtle animated water glints. These details are baked once into chunk textures.
- Sparse code-generated trees, cacti, rocks, reeds, and snowy rocks highlight when interactable and shake during harvesting.
- Press `E` to open or close the inventory. It has six quick-access slots and a 5 × 5 storage grid. When a dropped item is in range, `E` picks it up instead; nearby cave entrances and exits also use the same default contextual binding.
- Press `Escape` to pause. The pause menu can return to the main menu or open Controls and Video Options. Controls may be rebound individually; video settings persist locally and apply frame caps, terrain range and streaming pace, effect update rates, particles, foliage, water, lava, ground grass, swamp details, and night-light quality live.
- Every DOM-backed menu button has a short, restrained haptic-style confirmation click, including the world library, pause/settings, inventory, crafting, and placed-object controls.
- Crafting lives beside the inventory. Recipes consume gathered resources and create wooden/stone axes and pickaxes; click a tool in the inventory to equip or unequip it.
- Resources stack to 10, can be dragged between slots, and can be dragged outside the inventory to drop them into the world. Tools are single-slot equipment items and stay safely in the inventory. Surface harvesting has quiet material contacts throughout the held break, followed by a distinct final sound for trees, grass, reeds, cacti, stone, and snowy stone.
- Axes speed up harvesting trees, shrubs, and cacti; pickaxes speed up rocks and stone features. The equipped tool is shown in the inventory and rendered in the player's hand.
- The game automatically persists the seed, player position, inventory, equipped tool, harvested features, and dropped world items. Procedural terrain itself is regenerated from the saved seed.

## Save location

On Windows, Wildbound saves to:

`%APPDATA%\Wildbound\wildbound-save.json`

This file stores only player/world changes over the deterministic generated world — including harvested features, drops, explored map regions, and world time — rather than every terrain tile.

## Tuning controls

- `src/world/worldConfig.ts`: `BIOME_SIZE_SCALE` is a 1-100 biome-size control; higher values create larger regions. Current value: `50`.
- `src/player/playerConfig.ts`: `PLAYER_SPEED_SCALE` is a 1-100 movement-speed control. Current value: `70`, which keeps 308 pixels per second on land.
- `src/ui/uiConfig.ts`: `MINIMAP_AREA_SCALE` is a 1-100 minimap-coverage control. Current value: `50`, which preserves the previous coverage.
- `src/world/generation/featureGenerator.ts`: `FEATURE_DENSITIES` controls deterministic feature density by biome.
- `src/world/groundGrassConfig.ts`: `GROUND_GRASS_DENSITY_BY_BIOME` controls decorative ground-grass density for every biome; `0` prevents the layer from spawning there.
- `src/world/worldVisualConfig.ts`: `BIOME_BLEND_WIDTH_SCALE` is a 1-100 visual transition-width control; `50` preserves the authored blend width.
- `src/world/explorationConfig.ts` controls fog reveal granularity, day/night duration, and ambient effect budgets.
- `src/world/landmarkConfig.ts` controls landmark rarity, placement spacing, footprints, and visibility range.
- `src/crafting/recipeConfig.ts` contains resource costs and outputs for craftable items.
- `src/crafting/toolConfig.ts` contains tool types and harvest-speed multipliers.
- `src/world/ambientPerformanceConfig.ts` and `src/world/foliageAnimationConfig.ts` contain bounded visual update cadences for water and foliage.
- `src/world/ambientAudioConfig.ts` contains the biome-audio blend and transition tuning. Audio options in the pause menu persist their own ambience toggle and volume.

## Procedural world configuration

- Logical tile size: 32 x 32 pixels.
- Chunks: 16 x 16 tiles (512 x 512 pixels).
- `WORLD_SEED` in `src/world/worldConfig.ts` is the single default seed. The current default is `waoefiu`.
- Chunks load within three chunk steps of the player and unload farther than four steps away. Unloaded terrain and features regenerate exactly from the seed and global coordinates; saved harvested features remain removed after restart.

## Development

Install dependencies once:

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
```

Launch the desktop game in development mode:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

Run the TypeScript check:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run typecheck
```

Create a packaged Windows application:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run package
```

Create the Windows installer:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run make:win
```

The installer is written to `out/make/squirrel.windows/x64/Wildbound Setup.exe`.

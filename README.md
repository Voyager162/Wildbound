# Wildbound

Wildbound is a desktop-first 2D adventure game foundation built with TypeScript, Phaser, Electron, and Electron Forge. Windows is the current release target.

Current release: `1.6.0` - Terrain streaming, cave exploration, tools, crafting, and interaction polish.

## Windows installation

The Windows release asset is `Wildbound Setup.exe`.

1. Download and run `Wildbound Setup.exe`.
2. Let setup finish and close.
3. Launch Wildbound normally from the Start menu or desktop shortcut.

Setup, the installed executable, shortcuts, and the application window use the replaceable Wildbound icon at `assets/wildbound.ico`.

## Current state

- Phaser runs in a secure Electron renderer. Packaged builds load local files and need no web server or internet connection.
- The code-generated player moves with WASD or the arrow keys, visually faces all eight movement directions, and has directional walking and swimming animation.
- Player movement is delta-time based. Swimming begins only when the player's feet cross into traversable ocean or swamp water, at 42% of walking speed.
- Holding the left mouse button for one real-time second harvests a highlighted nearby feature.
- A smooth-follow camera maintains a large 2560 x 1440 world view on 16:9 displays in both windowed and fullscreen modes.
- F3 toggles a crisp, screen-space debug panel with world/tile coordinates, climate values, world time, current landmark, movement mode, seed, chunk position, inventory usage, and FPS.
- A circular, top-right minimap samples stable world coordinates and keeps the player marker centered.
- Press `F` to open the world map. It permanently charts the same continuous terrain colors shown by the circular minimap; drag to pan and use the mouse wheel to zoom without changing map scale automatically.
- Rare seed-deterministic landmarks — ancient trees, waterfalls, crystal formations, lakes, craters, volcanoes, stone circles, giant skeletons, campsites, and watchtowers — stream as a separate visual layer from normal terrain and resources.
- A saved day/night clock adds gradual dawn, daylight, dusk, and night lighting. Trees, grasses, reeds, water glints, and biome-sensitive particles provide lightweight ambient motion.
- Elevation, moisture, and temperature noise deterministically classify ocean, beach, plains, forest, desert, swamp, hills, mountains, and snow biomes.
- Terrain uses smoothly blended coastline/elevation bands, detailed grass/vegetation/sand/mud/ice/rock marks, rolling hill contours, mountain formations, and subtle animated water glints. These details are baked once into chunk textures.
- Sparse code-generated trees, cacti, rocks, reeds, snowy rocks, and ice patches highlight when interactable and shake during harvesting.
- Press `E` to open or close the 16-slot inventory. When a dropped item is in range, `E` picks it up instead; the drop receives a subtle world-space highlight.
- Press `C` to open the crafting menu. Recipes consume gathered resources and create wooden/stone axes and pickaxes; click a tool in the inventory to equip or unequip it.
- Resources stack to 10, can be dragged between slots, and can be dragged outside the inventory to drop them into the world. Tools are single-slot equipment items and stay safely in the inventory.
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

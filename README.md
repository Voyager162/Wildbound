# Wildbound

Wildbound is a desktop-first 2D adventure game foundation built with TypeScript, Phaser, Electron, and Electron Forge. Windows is the current release target.

Current release: `1.4.0` - Performance, Inventory, Player, and Persistence Polish.

## Current state

- Phaser runs in a secure Electron renderer. Packaged builds load local files and need no web server or internet connection.
- The code-generated player moves with WASD or the arrow keys, visibly faces each direction, and has directional walking animation.
- Player movement is delta-time based at 220 pixels per second with the default speed setting. Holding the left mouse button for one real-time second harvests a highlighted nearby feature.
- A smooth-follow camera maintains a large 2560 x 1440 world view on 16:9 displays in both windowed and fullscreen modes.
- F3 toggles a crisp, screen-space debug panel with world/tile coordinates, climate values, feature/target details, seed, chunk position, inventory usage, and FPS.
- A circular, top-right minimap samples stable world coordinates and keeps the player marker centered.
- Elevation, moisture, and temperature noise deterministically classify ocean, beach, plains, forest, desert, swamp, hills, mountains, and snow biomes.
- Terrain renders through deterministic 8 x 8 pixel visual cells. Static terrain is baked into one texture per loaded chunk for efficient rendering.
- Sparse code-generated trees, cacti, rocks, reeds, snowy rocks, and ice patches highlight when interactable and shake during harvesting.
- Press `E` to open or close a 16-slot inventory. Resources stack to 10, can be dragged between slots, and can be dragged outside the inventory to drop them into the world. Nearby drops are collected automatically when there is capacity.
- The game automatically persists the seed, player position, inventory, harvested features, and dropped world items. Procedural terrain itself is regenerated from the saved seed.

## Save location

On Windows, Wildbound saves to:

`%APPDATA%\Wildbound\wildbound-save.json`

This file stores only player/world changes over the deterministic generated world; it does not store every terrain tile.

## Tuning controls

- `src/world/worldConfig.ts`: `BIOME_SIZE_SCALE` is a 1-100 biome-size control; higher values create larger regions. Current value: `20`.
- `src/player/playerConfig.ts`: `PLAYER_SPEED_SCALE` is a 1-100 movement-speed control. Current value: `50`, which keeps 220 pixels per second.
- `src/ui/uiConfig.ts`: `MINIMAP_AREA_SCALE` is a 1-100 minimap-coverage control. Current value: `50`, which preserves the previous coverage.
- `src/world/generation/featureGenerator.ts`: `FEATURE_DENSITIES` controls deterministic feature density by biome.

## Procedural world configuration

- Logical tile size: 32 x 32 pixels.
- Chunks: 16 x 16 tiles (512 x 512 pixels).
- `WORLD_SEED` in `src/world/worldConfig.ts` is the single default seed. The current default is `1234ddw`.
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

Create the Windows installer and release artifacts:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run make:win
```

The installer is written to `out/make/squirrel.windows/x64/`.

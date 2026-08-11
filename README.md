# Wildbound

Wildbound is a desktop-first 2D adventure game foundation built with TypeScript, Phaser, Electron, and Electron Forge. Windows is the current release target.

Current release: `1.3.0` — Harvest and Inventory Polish.

## Current state

- Phaser runs in a secure Electron renderer; packaged builds load local files and need no web server or internet connection.
- The placeholder player moves with WASD or the arrow keys.
- The smooth-follow camera maintains a large 2560 × 1440 world view on 16:9 displays in both windowed and fullscreen modes.
- F3 toggles a crisp DOM-based debug panel with world/tile coordinates, climate values, feature/target details, seed, chunk position, inventory usage, and FPS.
- A circular, top-right minimap samples stable world coordinates and keeps the player marker centered.
- Elevation, moisture, and temperature noise deterministically classify ocean, beach, plains, forest, desert, swamp, hills, mountains, and snow biomes.
- Terrain renders through deterministic 8 × 8 pixel visual cells, with sparse code-generated trees, cacti, rocks, reeds, snowy rocks, and ice patches.
- Hold the left mouse button on a nearby feature for one second to harvest it. A progress ring and feature-shake animation provide feedback, then the resource enters inventory directly.
- Press `E` to open or close a 16-slot inventory. Resources stack to 10 per slot.

## Tuning controls

- `src/world/worldConfig.ts`: `BIOME_SIZE_SCALE` is a 1–100 biome-size control; higher values create larger regions. Current value: `20`.
- `src/player/playerConfig.ts`: `PLAYER_SPEED_SCALE` is a 1–100 movement-speed control. Current value: `50`, which keeps 220 pixels per second.
- `src/ui/uiConfig.ts`: `MINIMAP_AREA_SCALE` is a 1–100 minimap-coverage control. Current value: `50`, which preserves the previous coverage.
- `src/world/generation/featureGenerator.ts`: `FEATURE_DENSITIES` controls deterministic feature density by biome.

## Procedural world configuration

- Logical tile size: 32 × 32 pixels.
- Chunks: 16 × 16 tiles (512 × 512 pixels).
- `WORLD_SEED` in `src/world/worldConfig.ts` is the single default seed. The current default is `1234ddw`.
- Chunks load within three chunk steps of the player and unload farther than four steps away. Unloaded terrain and features regenerate exactly from the seed and global coordinates; harvested features remain removed during the current session.

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
# Wildbound

Wildbound is a desktop-first 2D adventure game foundation built with TypeScript, Phaser, Electron, and Electron Forge. Windows is the current release target.

Current release: `1.2.0` — World Exploration Polish.

## Current state

- Phaser runs in a secure Electron renderer; packaged builds load local files and need no web server or internet connection.
- The placeholder player moves with WASD or the arrow keys.
- The smooth-follow camera maintains a large 2560 × 1440 world view on 16:9 displays in both windowed and fullscreen modes.
- F3 toggles a crisp, screen-space debug overlay showing world/tile coordinates, biome climate values, feature/target details, seed, chunk position, loaded chunks, and FPS.
- A circular, top-right minimap samples stable world coordinates and keeps the player marker centered.
- Elevation, moisture, and temperature noise deterministically classify ocean, beach, plains, forest, desert, swamp, hills, mountains, and snow biomes.
- Terrain renders through deterministic 8 × 8 pixel visual cells for finer biome transitions while the logical gameplay tile remains 32 × 32 pixels.
- Sparse deterministic trees, cacti, rocks, reeds, snowy rocks, and ice patches stream with chunks.
- Facing-based interaction highlights nearby features in a three-tile-deep, three-tile-wide area; press `E` for temporary feedback without changing world data.

## Procedural world configuration

- Logical tile size: 32 × 32 pixels.
- Chunks: 16 × 16 tiles (512 × 512 pixels).
- `WORLD_SEED` in `src/world/worldConfig.ts` is the single default seed. The current default is `123421214`.
- Chunks load within three chunk steps of the player and unload farther than four steps away. Unloaded terrain and features regenerate exactly from the seed and global coordinates.

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
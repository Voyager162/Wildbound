# Wildbound

Wildbound is a desktop-first 2D adventure game foundation built with TypeScript, Phaser, Electron, and Electron Forge. Windows is the current release target.

Current release: `1.1.0` - Procedural World Core.

## Current state

- Phaser runs in a secure Electron renderer.
- The initial Windows game window is resizable and preserves the intended 16:9 game rendering.
- A placeholder player moves with WASD or the arrow keys.
- Packaged builds load local game files and do not require a web server or internet connection.
- The camera follows the player at a 0.75 zoom level to show a wider exploration area.
- F3 shows world position, tile position, biome, elevation, moisture, temperature, current tile feature, seed, chunk position, loaded chunks, and FPS.
- Large-scale elevation, moisture, and temperature noise classify broad deterministic ocean, beach, plains, forest, desert, swamp, hills, mountains, and snow biomes.
- Sparse deterministic trees, cacti, rocks, reeds, snowy rocks, and ice patches stream with their biome terrain chunks.

## Procedural world core

- The logical tile size is 32 x 32 pixels.
- Chunks are 16 x 16 tiles (512 x 512 pixels), a compact unit for streaming and future chunk persistence.
- The game loads chunks within two chunk steps of the player and unloads chunks farther than three steps away.
- `WORLD_SEED` in `src/world/worldConfig.ts` is the single default seed. Terrain is recreated from the seed and global tile coordinates, so revisiting an unloaded chunk produces the same result.

## Development

Install dependencies once:

```powershell
npm install
```

Launch the desktop game in development mode:

```powershell
npm run dev
```

Run the TypeScript check:

```powershell
npm run typecheck
```

Create a packaged Windows application:

```powershell
npm run package
```

Create the Windows installer and release artifacts:

```powershell
npm run make:win
```

The installer is written to `out/make/squirrel.windows/x64/`.
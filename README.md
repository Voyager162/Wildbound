# Wildbound

Wildbound is a desktop-first 2D adventure game foundation built with TypeScript, Phaser, Electron, and Electron Forge. Windows is the current release target.

Current release: `1.0.0` — Desktop Foundation.

## Current state

- Phaser runs in a secure Electron renderer.
- The initial Windows game window is resizable and preserves the intended 16:9 game rendering.
- A placeholder player moves with WASD or the arrow keys.
- Packaged builds load local game files and do not require a web server or internet connection.

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

import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import squirrelStartup from 'electron-squirrel-startup';
import {
  DEFAULT_WORLD_NAME,
  MAX_WORLD_NAME_LENGTH,
  MAX_WORLD_SEED_LENGTH,
  isWorldMode,
  isWorldName,
  type WorldMode
} from '../save/WorldLibrary';
import { isGameSettings } from '../settings/GameSettings';

const SAVE_FILE_NAME = 'wildbound-save.json';
const WORLD_INDEX_FILE_NAME = 'wildbound-worlds.json';
const WORLD_SAVE_DIRECTORY_NAME = 'worlds';
const SETTINGS_FILE_NAME = 'wildbound-settings.json';
const MAX_SAVE_BYTES = 2 * 1024 * 1024;
const MAX_SETTINGS_BYTES = 32 * 1024;
const MAX_WORLD_COUNT = 100;
const launchedByInstaller = process.argv.includes('--squirrel-firstrun');

app.setName('Wildbound');
app.setAppUserModelId('com.wildbound.desktop');
// Chromium normally chooses the OS-preferred adapter. Request the discrete adapter before the
// app is ready so Windows/NVIDIA can route WebGL compositing and Phaser's texture work to it.
// This remains a preference rather than a software-rendering override, so it preserves Chromium's
// normal fallback behaviour on machines without a dedicated GPU.
app.commandLine.appendSwitch('force_high_performance_gpu');

const shouldExitForSquirrel = squirrelStartup || launchedByInstaller;
if (shouldExitForSquirrel) {
  app.quit();
}

const getSavePath = (): string => path.join(app.getPath('userData'), SAVE_FILE_NAME);

const getWorldIndexPath = (): string => path.join(app.getPath('userData'), WORLD_INDEX_FILE_NAME);

const getWorldSaveDirectoryPath = (): string => path.join(app.getPath('userData'), WORLD_SAVE_DIRECTORY_NAME);

const getWorldSavePath = (worldId: string): string => path.join(getWorldSaveDirectoryPath(), `${worldId}.json`);

const getSettingsPath = (): string => path.join(app.getPath('userData'), SETTINGS_FILE_NAME);

interface StoredWorldSummary {
  id: string;
  ordinal: number;
  name: string;
  seed: string;
  mode: WorldMode;
}

interface StoredWorldIndex {
  version: 1;
  worlds: StoredWorldSummary[];
}

interface StoredWorldSummaryFile {
  id: string;
  ordinal: number;
  name?: unknown;
  seed: string;
  mode?: unknown;
}

interface StoredWorldIndexFile {
  version: 1;
  worlds: StoredWorldSummaryFile[];
}

const isWorldId = (value: unknown): value is string =>
  typeof value === 'string' && /^world-[1-9]\d*$/.test(value);

const isWorldSeed = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_WORLD_SEED_LENGTH;

const legacyWorldName = (ordinal: number): string => `World ${String(ordinal).padStart(2, '0')}`;

const isStoredWorldSummary = (value: unknown): value is StoredWorldSummaryFile => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const world = value as Partial<StoredWorldSummaryFile>;
  return isWorldId(world.id)
    && typeof world.ordinal === 'number'
    && Number.isInteger(world.ordinal)
    && world.ordinal > 0
    && (world.name === undefined || isWorldName(world.name))
    && isWorldSeed(world.seed)
    // World-library v1 data predates modes. Treat those saves as survival instead of rejecting
    // a player's existing local library during the upgrade.
    && (world.mode === undefined || isWorldMode(world.mode));
};

const isStoredWorldIndex = (value: unknown): value is StoredWorldIndexFile => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const index = value as Partial<StoredWorldIndexFile>;
  return index.version === 1
    && Array.isArray(index.worlds)
    && index.worlds.length <= MAX_WORLD_COUNT
    && index.worlds.every(isStoredWorldSummary)
    && index.worlds.every((world) => world.id === `world-${world.ordinal}`)
    && new Set(index.worlds.map((world) => world.id)).size === index.worlds.length
    && new Set(index.worlds.map((world) => world.ordinal)).size === index.worlds.length;
};

const normalizeWorldSummary = (world: StoredWorldSummaryFile): StoredWorldSummary => ({
  id: world.id,
  ordinal: world.ordinal,
  name: isWorldName(world.name) ? world.name.trim() : legacyWorldName(world.ordinal),
  seed: world.seed,
  mode: isWorldMode(world.mode) ? world.mode : 'survival'
});

const getApplicationIconPath = (): string => app.isPackaged
  ? path.join(process.resourcesPath, 'wildbound.ico')
  : path.join(app.getAppPath(), 'assets', 'wildbound.ico');

const isSerializableSave = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  try {
    return JSON.stringify(value).length <= MAX_SAVE_BYTES;
  } catch {
    return false;
  }
};

const writeJsonAtomically = async (targetPath: string, value: unknown): Promise<void> => {
  const temporaryPath = `${targetPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value), 'utf8');
  await rename(temporaryPath, targetPath);
};

const readWorldIndex = async (): Promise<StoredWorldIndex | 'missing' | 'invalid'> => {
  let contents: string;
  try {
    contents = await readFile(getWorldIndexPath(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'missing';
    }
    console.warn('Wildbound could not load its world index.', error);
    throw error;
  }

  try {
    const parsed = JSON.parse(contents) as unknown;
  if (isStoredWorldIndex(parsed)) {
    return {
      version: 1,
      worlds: parsed.worlds.map(normalizeWorldSummary)
    };
    }
  } catch {
    // The shared message below is intentionally enough detail for a local file that users can
    // recover themselves; avoid replacing an unreadable index with a new, empty one.
  }

  console.warn('Wildbound found an invalid world index and will leave it unchanged.');
  return 'invalid';
};

// Version 1.6 stored one world directly at wildbound-save.json. Keep that file untouched and
// copy it into the new per-world store the first time the menu is opened.
const ensureWorldIndex = async (): Promise<StoredWorldIndex> => {
  const existingIndex = await readWorldIndex();
  if (existingIndex === 'invalid') {
    throw new Error('Wildbound cannot safely open its invalid world index.');
  }
  if (existingIndex !== 'missing') {
    return existingIndex;
  }

  const emptyIndex: StoredWorldIndex = { version: 1, worlds: [] };
  try {
    const legacyContents = await readFile(getSavePath(), 'utf8');
    const legacySave = JSON.parse(legacyContents) as { seed?: unknown };
    if (!isWorldSeed(legacySave.seed)) {
      await writeJsonAtomically(getWorldIndexPath(), emptyIndex);
      return emptyIndex;
    }

    const legacyWorld: StoredWorldSummary = {
      id: 'world-1',
      ordinal: 1,
      name: legacyWorldName(1),
      seed: legacySave.seed,
      mode: 'survival'
    };
    await mkdir(getWorldSaveDirectoryPath(), { recursive: true });
    await writeJsonAtomically(getWorldSavePath(legacyWorld.id), legacySave);
    const migratedIndex: StoredWorldIndex = { version: 1, worlds: [legacyWorld] };
    await writeJsonAtomically(getWorldIndexPath(), migratedIndex);
    return migratedIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await writeJsonAtomically(getWorldIndexPath(), emptyIndex);
      return emptyIndex;
    }
    console.warn('Wildbound could not migrate its previous save.', error);
    throw error;
  }
};

const registerWorldHandlers = (): void => {
  ipcMain.handle('wildbound:list-worlds', async (): Promise<StoredWorldSummary[]> => {
    const index = await ensureWorldIndex();
    return index.worlds;
  });

  ipcMain.handle('wildbound:create-world', async (_event, seed: unknown, name: unknown, mode: unknown): Promise<StoredWorldSummary> => {
    if (!isWorldSeed(seed)) {
      throw new Error('Wildbound rejected an invalid world seed.');
    }

    const normalizedName = typeof name === 'string' && name.trim() ? name.trim() : DEFAULT_WORLD_NAME;
    if (!isWorldName(normalizedName)) {
      throw new Error(`Wildbound rejected a world name longer than ${MAX_WORLD_NAME_LENGTH} characters.`);
    }
    if (!isWorldMode(mode)) {
      throw new Error('Wildbound rejected an invalid world mode.');
    }

    const index = await ensureWorldIndex();
    if (index.worlds.length >= MAX_WORLD_COUNT) {
      throw new Error('Wildbound has reached its world limit.');
    }

    const ordinal = Math.max(0, ...index.worlds.map((world) => world.ordinal)) + 1;
    const world: StoredWorldSummary = { id: `world-${ordinal}`, ordinal, name: normalizedName, seed, mode };
    index.worlds.push(world);
    await writeJsonAtomically(getWorldIndexPath(), index);
    return world;
  });

  ipcMain.handle('wildbound:rename-world', async (_event, worldId: unknown, name: unknown): Promise<StoredWorldSummary> => {
    if (!isWorldId(worldId)) {
      throw new Error('Wildbound rejected an invalid world rename request.');
    }

    const normalizedName = typeof name === 'string' && name.trim() ? name.trim() : DEFAULT_WORLD_NAME;
    if (!isWorldName(normalizedName)) {
      throw new Error(`Wildbound rejected a world name longer than ${MAX_WORLD_NAME_LENGTH} characters.`);
    }

    const index = await ensureWorldIndex();
    const existing = index.worlds.find((world) => world.id === worldId);
    if (!existing) {
      throw new Error('Wildbound rejected renaming an unknown world.');
    }

    const renamed: StoredWorldSummary = { ...existing, name: normalizedName };
    const nextIndex: StoredWorldIndex = {
      version: 1,
      worlds: index.worlds.map((world) => world.id === worldId ? renamed : world)
    };
    await writeJsonAtomically(getWorldIndexPath(), nextIndex);
    return renamed;
  });

  ipcMain.handle('wildbound:load-world', async (_event, worldId: unknown): Promise<unknown | null> => {
    if (!isWorldId(worldId)) {
      return null;
    }

    const index = await ensureWorldIndex();
    if (!index.worlds.some((world) => world.id === worldId)) {
      return null;
    }

    try {
      const contents = await readFile(getWorldSavePath(worldId), 'utf8');
      return JSON.parse(contents) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }

      console.warn('Wildbound could not load a world save.', error);
      return null;
    }
  });

  ipcMain.handle('wildbound:save-world', async (_event, worldId: unknown, saveData: unknown): Promise<void> => {
    if (!isWorldId(worldId) || !isSerializableSave(saveData)) {
      throw new Error('Wildbound rejected an invalid save payload.');
    }

    const index = await ensureWorldIndex();
    if (!index.worlds.some((world) => world.id === worldId)) {
      throw new Error('Wildbound rejected a save for an unknown world.');
    }

    await mkdir(getWorldSaveDirectoryPath(), { recursive: true });
    await writeJsonAtomically(getWorldSavePath(worldId), saveData);
  });

  ipcMain.handle('wildbound:delete-world', async (_event, worldId: unknown): Promise<void> => {
    if (!isWorldId(worldId)) {
      throw new Error('Wildbound rejected an invalid world deletion request.');
    }

    const index = await ensureWorldIndex();
    if (!index.worlds.some((world) => world.id === worldId)) {
      throw new Error('Wildbound rejected deletion of an unknown world.');
    }

    const savePath = getWorldSavePath(worldId);
    const stagedPath = path.join(
      getWorldSaveDirectoryPath(),
      `.${worldId}.${Date.now()}.delete-pending`
    );
    let stagedSave = false;
    try {
      // Move first so an index-write failure can restore the exact save rather than leaving a
      // menu entry that silently starts as a blank world.
      await rename(savePath, stagedPath);
      stagedSave = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const nextIndex: StoredWorldIndex = {
      version: 1,
      worlds: index.worlds.filter((world) => world.id !== worldId)
    };
    try {
      await writeJsonAtomically(getWorldIndexPath(), nextIndex);
    } catch (error) {
      if (stagedSave) {
        try {
          await rename(stagedPath, savePath);
        } catch (restoreError) {
          console.error('Wildbound could not restore a world save after deletion failed.', restoreError);
        }
      }
      throw error;
    }

    if (stagedSave) {
      try {
        await unlink(stagedPath);
      } catch (error) {
        // The index has already committed. Leave only an inaccessible recovery file if a virus
        // scanner or another process briefly holds it, rather than restoring a deleted world.
        console.warn('Wildbound could not remove a staged world save.', error);
      }
    }
  });

  ipcMain.handle('wildbound:load-settings', async (): Promise<unknown | null> => {
    try {
      const contents = await readFile(getSettingsPath(), 'utf8');
      const settings = JSON.parse(contents) as unknown;
      if (isGameSettings(settings)) {
        return settings;
      }
      console.warn('Wildbound found invalid settings and will use defaults without replacing the file.');
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      console.warn('Wildbound could not load local settings.', error);
      return null;
    }
  });

  ipcMain.handle('wildbound:save-settings', async (_event, settings: unknown): Promise<void> => {
    if (!isGameSettings(settings) || JSON.stringify(settings).length > MAX_SETTINGS_BYTES) {
      throw new Error('Wildbound rejected invalid settings.');
    }
    await writeJsonAtomically(getSettingsPath(), settings);
  });
};

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    title: 'Wildbound',
    icon: getApplicationIconPath(),
    width: 960,
    height: 540,
    minWidth: 640,
    minHeight: 360,
    useContentSize: true,
    backgroundColor: '#101820',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL && !app.isPackaged) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

if (!shouldExitForSquirrel) {
  app.whenReady().then(() => {
    registerWorldHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

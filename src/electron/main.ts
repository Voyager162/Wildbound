import { app, BrowserWindow, ipcMain } from 'electron';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import squirrelStartup from 'electron-squirrel-startup';

const SAVE_FILE_NAME = 'wildbound-save.json';
const MAX_SAVE_BYTES = 2 * 1024 * 1024;
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

const registerSaveHandlers = (): void => {
  ipcMain.handle('wildbound:load-save', async (): Promise<unknown | null> => {
    try {
      const contents = await readFile(getSavePath(), 'utf8');
      return JSON.parse(contents) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }

      console.warn('Wildbound could not load its save file.', error);
      return null;
    }
  });

  ipcMain.handle('wildbound:save', async (_event, saveData: unknown): Promise<void> => {
    if (!isSerializableSave(saveData)) {
      throw new Error('Wildbound rejected an invalid save payload.');
    }

    const savePath = getSavePath();
    const temporaryPath = `${savePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(saveData), 'utf8');
    await rename(temporaryPath, savePath);
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
    registerSaveHandlers();
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

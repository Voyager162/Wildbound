import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('wildboundWorlds', {
  list: (): Promise<unknown> => ipcRenderer.invoke('wildbound:list-worlds'),
  create: (seed: string, name: string, mode: 'survival' | 'creative'): Promise<unknown> =>
    ipcRenderer.invoke('wildbound:create-world', seed, name, mode),
  rename: (worldId: string, name: string): Promise<unknown> => ipcRenderer.invoke('wildbound:rename-world', worldId, name),
  load: (worldId: string): Promise<unknown | null> => ipcRenderer.invoke('wildbound:load-world', worldId),
  save: (worldId: string, saveData: unknown): Promise<void> => ipcRenderer.invoke('wildbound:save-world', worldId, saveData),
  delete: (worldId: string): Promise<void> => ipcRenderer.invoke('wildbound:delete-world', worldId)
});

contextBridge.exposeInMainWorld('wildboundSettings', {
  load: (): Promise<unknown | null> => ipcRenderer.invoke('wildbound:load-settings'),
  save: (settings: unknown): Promise<void> => ipcRenderer.invoke('wildbound:save-settings', settings)
});

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('wildboundSave', {
  load: (): Promise<unknown | null> => ipcRenderer.invoke('wildbound:load-save'),
  save: (saveData: unknown): Promise<void> => ipcRenderer.invoke('wildbound:save', saveData)
});

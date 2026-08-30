export {};

declare global {
  interface Window {
    wildboundWorlds?: {
      list: () => Promise<unknown>;
      create: (seed: string, name: string, mode: import('../save/WorldLibrary').WorldMode) => Promise<unknown>;
      rename: (worldId: string, name: string) => Promise<unknown>;
      load: (worldId: string) => Promise<unknown | null>;
      save: (worldId: string, saveData: import('../save/SaveGameData').SaveGameData) => Promise<void>;
      delete: (worldId: string) => Promise<void>;
    };
    wildboundSettings?: {
      load: () => Promise<unknown | null>;
      save: (settings: import('../settings/GameSettings').GameSettings) => Promise<void>;
    };
    wildboundMusic?: {
      listMainMenuTracks: () => Promise<unknown>;
      listGameTracks: () => Promise<unknown>;
    };
  }
}

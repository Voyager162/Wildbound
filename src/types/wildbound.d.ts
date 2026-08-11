export {};

declare global {
  interface Window {
    wildboundSave?: {
      load: () => Promise<unknown | null>;
      save: (saveData: unknown) => Promise<void>;
    };
  }
}

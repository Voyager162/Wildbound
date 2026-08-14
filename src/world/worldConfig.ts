export const WORLD_TILE_SIZE = 32;

// Keep the default seed in one place until world selection and save data exist.
export const WORLD_SEED = '164df2';

// 1-100 biome wavelength control: higher values create larger biome regions; 50 preserves the base medium scale.
export const BIOME_SIZE_SCALE = 50;

// 16 x 16 tiles keeps each streamed chunk to a compact 512 x 512 pixel area.
export const CHUNK_SIZE_TILES = 16;
export const CHUNK_SIZE_PIXELS = CHUNK_SIZE_TILES * WORLD_TILE_SIZE;

// Chunks load in a 7 x 7 area around the player and remain cached one step farther out.
export const CHUNK_LOAD_RADIUS = 3;
export const CHUNK_UNLOAD_RADIUS = 4;

export const worldToTile = (worldCoordinate: number): number => Math.floor(worldCoordinate / WORLD_TILE_SIZE);

export const worldToChunk = (worldCoordinate: number): number => Math.floor(worldCoordinate / CHUNK_SIZE_PIXELS);

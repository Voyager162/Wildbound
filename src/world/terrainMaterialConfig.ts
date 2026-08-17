export const TERRAIN_MATERIAL_TEXTURE_KEYS = {
  plains: 'terrain-material:plains:v1',
  desert: 'terrain-material:desert:v1',
  beach: 'terrain-material:beach:v1',
  rocky: 'terrain-material:rocky:v1',
  snow: 'terrain-material:snow:v1'
} as const;

// Vite fingerprints these imported files for both development and packaged Electron builds.
// WorldChunk reads their pixels once into a shared cache, then blends them into its deterministic
// canvas bake without adding runtime sprites or texture draw calls per terrain cell.
export const TERRAIN_MATERIAL_ASSETS = [
  {
    key: TERRAIN_MATERIAL_TEXTURE_KEYS.plains,
    url: new URL('../../assets/terrain/plains-ground-v1.png', import.meta.url).toString()
  },
  {
    key: TERRAIN_MATERIAL_TEXTURE_KEYS.desert,
    url: new URL('../../assets/terrain/desert-ground-v1.png', import.meta.url).toString()
  },
  {
    key: TERRAIN_MATERIAL_TEXTURE_KEYS.beach,
    url: new URL('../../assets/terrain/beach-ground-v1.png', import.meta.url).toString()
  },
  {
    key: TERRAIN_MATERIAL_TEXTURE_KEYS.rocky,
    url: new URL('../../assets/terrain/rocky-ground-v1.png', import.meta.url).toString()
  },
  {
    key: TERRAIN_MATERIAL_TEXTURE_KEYS.snow,
    url: new URL('../../assets/terrain/snow-ground-v1.png', import.meta.url).toString()
  }
] as const;

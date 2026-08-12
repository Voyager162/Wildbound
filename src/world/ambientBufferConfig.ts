// Camera-buffered ambience is separate from the biome art settings: these values decide how far
// outside the viewport effects are prepared before a moving player can see them.
export const AMBIENT_PARTICLE_PRELOAD_CELLS_X = 3;
export const AMBIENT_PARTICLE_PRELOAD_CELLS_Y = 2;
// Keep a particle one cell beyond its normal render window before recycling its slot. This gives
// incoming cells priority while still ensuring outgoing effects leave only after they are unseen.
export const AMBIENT_PARTICLE_RETENTION_CELLS = 1;

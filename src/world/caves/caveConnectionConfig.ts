// Each successful surface connection rolls the next one at this fraction of the previous
// chance. Keep this strictly between 0 and 1: lower values make extra mouths much rarer.
// There is deliberately no connection-count cap; the deterministic chain ends only when one
// of its increasingly unlikely rolls fails.
export const CAVE_ADDITIONAL_CONNECTION_RARITY_FALLOFF = 0.5;

// Later connections spread into wider rings around the source entrance, preventing several
// rare mouths from piling into the same local piece of terrain.
export const CAVE_CONNECTION_DISTANCE_RING_GROWTH = 0.6;

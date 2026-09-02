// Change this one value to control the exact number of luminous fruit generated on every ancient
// tree. Their positions, colors, and subtle size variation remain deterministic from the world
// seed and landmark ID.
export const ANCIENT_TREE_FRUIT_COUNT = 24;

// Change this value to control ancient-tree canopy density. The multiplier scales both axes of
// the deterministic leaf field, so 0.5 gives roughly half as many leaves, 1 keeps the standard
// density, and 2 gives roughly twice as many. Runtime use is clamped from 0 (no leaves) through 3
// to protect frame rate if this tuning value is accidentally set extremely high.
export const ANCIENT_TREE_LEAF_DENSITY_MULTIPLIER = 2;

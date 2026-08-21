// Controls the visual weight of cave walls without affecting cave collision or layout.
// 0.6 creates leaner, sharper walls; 1 is the current default; 1.35 makes walls fuller
// and rounder. Values outside the supported 0.25–2 range are safely clamped at runtime.
export const CAVE_WALL_PUFFINESS_SCALE = .6;

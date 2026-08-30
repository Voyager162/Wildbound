import {
  BEACH_ELEVATION_MAX,
  Biome,
  DESERT_MOISTURE_MAX,
  DESERT_TEMPERATURE_MIN,
  HIGH_SNOW_ELEVATION_MIN,
  HIGH_SNOW_TEMPERATURE_MAX,
  MOUNTAIN_ELEVATION_MIN,
  SNOW_TEMPERATURE_MAX
} from './biomeGenerator';
import { randomAtTile } from './noise';
import { surfaceAtTile, type TerrainSurface } from './terrainGenerator';
import {
  GROUND_GRASS_DENSITY_BY_BIOME,
  GROUND_GRASS_EDGE_FADE_POWER,
  GROUND_GRASS_ZERO_BIOME_FADE_LEAD_SCALE
} from '../groundGrassConfig';
import { GROUND_GRASS_PATTERN_VARIANTS } from '../foliageAnimationConfig';
import {
  BIOME_BLEND_WIDTH_SCALE,
  GROUND_GRASS_BASE_HEIGHT_PIXELS,
  GROUND_GRASS_FREQUENCY_SCALE,
  GROUND_GRASS_HEIGHT_VARIATION_PIXELS,
  GROUND_GRASS_SIZE_SCALE
} from '../worldVisualConfig';
import { CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from '../worldConfig';

export interface GroundGrassCandidate {
  readonly localTileX: number;
  readonly localTileY: number;
  readonly localX: number;
  readonly localY: number;
  readonly scale: number;
  readonly tint: number;
  readonly pattern: number;
  readonly framePhase: number;
  readonly alpha: number;
}

const colorChannels = (color: number): readonly [number, number, number] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff
];

const composeColor = (red: number, green: number, blue: number): number =>
  (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue);

const mixColor = (first: number, second: number, amount: number): number => {
  const [firstRed, firstGreen, firstBlue] = colorChannels(first);
  const [secondRed, secondGreen, secondBlue] = colorChannels(second);
  return composeColor(
    firstRed + (secondRed - firstRed) * amount,
    firstGreen + (secondGreen - firstGreen) * amount,
    firstBlue + (secondBlue - firstBlue) * amount
  );
};

const shadeColor = (color: number, amount: number): number => {
  const [red, green, blue] = colorChannels(color);
  const factor = 1 + amount;
  return composeColor(
    Math.max(0, Math.min(255, red * factor)),
    Math.max(0, Math.min(255, green * factor)),
    Math.max(0, Math.min(255, blue * factor))
  );
};

const tintToTargetColor = (sourceColor: number, targetColor: number): number => {
  const tintChannel = (shift: number): number => {
    const source = (sourceColor >> shift) & 0xff;
    const target = (targetColor >> shift) & 0xff;
    return Math.round(Math.min(1, target / Math.max(1, source)) * 255);
  };
  return (tintChannel(16) << 16) | (tintChannel(8) << 8) | tintChannel(0);
};

const visualBiomeBlend = (start: number, end: number, value: number): number => {
  const midpoint = (start + end) * 0.5;
  const halfRange = (end - start) * 0.5 * Math.max(0.01, BIOME_BLEND_WIDTH_SCALE / 50);
  const normalized = Math.max(0, Math.min(1, (value - (midpoint - halfRange)) / (halfRange * 2)));
  return normalized * normalized * (3 - 2 * normalized);
};

const smoothRange = (start: number, end: number, value: number): number => {
  const normalized = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return normalized * normalized * (3 - 2 * normalized);
};

const edgePressure = (
  value: number,
  boundary: number,
  leadIn: number,
  increasesTowardZeroDensity: boolean
): number => {
  const scaledLeadIn = leadIn
    * GROUND_GRASS_ZERO_BIOME_FADE_LEAD_SCALE
    * Math.max(0.1, BIOME_BLEND_WIDTH_SCALE / 50);
  return increasesTowardZeroDensity
    ? smoothRange(boundary - scaledLeadIn, boundary, value)
    : 1 - smoothRange(boundary, boundary + scaledLeadIn, value);
};

const groundGrassEdgeFade = (surface: TerrainSurface): number => {
  const beachPressure = edgePressure(surface.elevation, BEACH_ELEVATION_MAX, 0.12, false);
  const desertPressure = edgePressure(surface.temperature, DESERT_TEMPERATURE_MIN, 0.14, true)
    * edgePressure(surface.moisture, DESERT_MOISTURE_MAX, 0.14, false);
  const coldSnowPressure = edgePressure(surface.temperature, SNOW_TEMPERATURE_MAX, 0.12, false);
  const highSnowPressure = edgePressure(surface.elevation, HIGH_SNOW_ELEVATION_MIN, 0.1, true)
    * edgePressure(surface.temperature, HIGH_SNOW_TEMPERATURE_MAX, 0.14, false);
  const mountainPressure = edgePressure(surface.elevation, MOUNTAIN_ELEVATION_MIN, 0.13, true);
  return (1 - Math.max(
    beachPressure,
    desertPressure,
    coldSnowPressure,
    highSnowPressure,
    mountainPressure
  )) ** GROUND_GRASS_EDGE_FADE_POWER;
};

const groundGrassDensity = (surface: TerrainSurface, edgeFade: number): number => {
  if (surface.waterVisualAmount > 0.24 || GROUND_GRASS_DENSITY_BY_BIOME[surface.biome] === 0) {
    return 0;
  }
  const forestAmount = visualBiomeBlend(0.39, 0.57, surface.moisture);
  const hillAmount = visualBiomeBlend(0.44, 0.62, surface.elevation);
  const swampAmount = visualBiomeBlend(0.58, 0.76, surface.moisture)
    * visualBiomeBlend(0.24, 0.42, surface.temperature)
    * (1 - hillAmount);
  const blend = (from: number, to: number, amount: number): number => from + (to - from) * amount;
  let density = GROUND_GRASS_DENSITY_BY_BIOME[Biome.Plains];
  density = blend(density, GROUND_GRASS_DENSITY_BY_BIOME[Biome.Forest], forestAmount);
  density = blend(density, GROUND_GRASS_DENSITY_BY_BIOME[Biome.Swamp], swampAmount);
  density = blend(density, GROUND_GRASS_DENSITY_BY_BIOME[Biome.Hills], hillAmount);
  return Math.min(0.96, density * edgeFade * GROUND_GRASS_FREQUENCY_SCALE);
};

const groundGrassTint = (surface: TerrainSurface): number => {
  const brightGrassSource = 0xa3d377;
  const target = mixColor(brightGrassSource, shadeColor(surface.color, 0.22), 0.52);
  return tintToTargetColor(brightGrassSource, target);
};

export const generateChunkGroundGrassCandidates = (
  seed: string,
  chunkX: number,
  chunkY: number
): GroundGrassCandidate[] => {
  const candidates: GroundGrassCandidate[] = [];
  for (let localTileY = 0; localTileY < CHUNK_SIZE_TILES; localTileY += 1) {
    for (let localTileX = 0; localTileX < CHUNK_SIZE_TILES; localTileX += 1) {
      const worldTileX = chunkX * CHUNK_SIZE_TILES + localTileX;
      const worldTileY = chunkY * CHUNK_SIZE_TILES + localTileY;
      const surface = surfaceAtTile(seed, worldTileX + 0.5, worldTileY + 0.5);
      const edgeFade = groundGrassEdgeFade(surface);
      const density = groundGrassDensity(surface, edgeFade);
      const placement = randomAtTile(seed, worldTileX, worldTileY, 0x6d42aeb9);
      if (density === 0 || placement > density) {
        continue;
      }
      const height = (GROUND_GRASS_BASE_HEIGHT_PIXELS
        + randomAtTile(seed, worldTileX, worldTileY, 0x4b5edc37) * GROUND_GRASS_HEIGHT_VARIATION_PIXELS)
        * GROUND_GRASS_SIZE_SCALE * (0.58 + edgeFade * 0.42);
      candidates.push({
        localTileX,
        localTileY,
        localX: localTileX * WORLD_TILE_SIZE + 5 + randomAtTile(seed, worldTileX, worldTileY, 0x11a5d1f7) * 22,
        localY: localTileY * WORLD_TILE_SIZE + 29,
        scale: height / 34,
        tint: groundGrassTint(surface),
        pattern: Math.floor(randomAtTile(seed, worldTileX, worldTileY, 0x7959e2d1) * GROUND_GRASS_PATTERN_VARIANTS),
        framePhase: randomAtTile(seed, worldTileX, worldTileY, 0x53da69c7),
        alpha: 0.22 + edgeFade * 0.78
      });
    }
  }
  return candidates;
};

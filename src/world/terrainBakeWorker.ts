import { coherentNoise } from './generation/noise';
import { Biome } from './generation/biomeGenerator';
import { snowVisualAmountForClimate, surfaceAtTile } from './generation/terrainGenerator';
import {
  accumulateTerrainMaterial,
  type TerrainMaterialPixels
} from './terrainMaterialBlend';
import { CHUNK_SIZE_PIXELS, CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from './worldConfig';

const VISUAL_TERRAIN_CELL_SIZE = 8;
const VISUAL_CELLS_PER_TILE = WORLD_TILE_SIZE / VISUAL_TERRAIN_CELL_SIZE;
const TERRAIN_TEXTURE_PADDING = 2;
const TERRAIN_TEXTURE_SIZE = CHUNK_SIZE_PIXELS + TERRAIN_TEXTURE_PADDING * 2;
const TERRAIN_VERTEX_MARGIN_CELLS = Math.ceil(TERRAIN_TEXTURE_PADDING / VISUAL_TERRAIN_CELL_SIZE);

type TerrainMaterialName = 'plains' | 'desert' | 'beach' | 'rocky' | 'snow';

type TerrainMaterialSet = Readonly<Record<TerrainMaterialName, TerrainMaterialPixels | null>>;

interface TerrainVisualVertex {
  readonly color: number;
  readonly elevation: number;
  readonly moisture: number;
  readonly temperature: number;
  readonly waterVisualAmount: number;
  readonly materialNoise: number;
  readonly landformNoise: number;
}

interface InitializeMessage {
  readonly type: 'initialize';
  readonly materials: TerrainMaterialSet;
}

interface BakeMessage {
  readonly type: 'bake';
  readonly id: number;
  readonly seed: string;
  readonly chunkX: number;
  readonly chunkY: number;
}

type IncomingMessage = InitializeMessage | BakeMessage;

interface TerrainWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<IncomingMessage>) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

let materials: TerrainMaterialSet | null = null;
const workerScope = self as unknown as TerrainWorkerScope;

const createTerrainVertexColors = (
  seed: string,
  chunkX: number,
  chunkY: number
): TerrainVisualVertex[][] => {
  const vertices: TerrainVisualVertex[][] = [];
  const firstTileX = chunkX * CHUNK_SIZE_TILES;
  const firstTileY = chunkY * CHUNK_SIZE_TILES;
  const cellsPerChunk = CHUNK_SIZE_PIXELS / VISUAL_TERRAIN_CELL_SIZE;

  for (let sampleY = -TERRAIN_VERTEX_MARGIN_CELLS; sampleY <= cellsPerChunk + TERRAIN_VERTEX_MARGIN_CELLS; sampleY += 1) {
    const row: TerrainVisualVertex[] = [];
    for (let sampleX = -TERRAIN_VERTEX_MARGIN_CELLS; sampleX <= cellsPerChunk + TERRAIN_VERTEX_MARGIN_CELLS; sampleX += 1) {
      const worldPixelX = firstTileX * WORLD_TILE_SIZE + sampleX * VISUAL_TERRAIN_CELL_SIZE;
      const worldPixelY = firstTileY * WORLD_TILE_SIZE + sampleY * VISUAL_TERRAIN_CELL_SIZE;
      const surface = surfaceAtTile(
        seed,
        firstTileX + sampleX / VISUAL_CELLS_PER_TILE,
        firstTileY + sampleY / VISUAL_CELLS_PER_TILE
      );
      row.push({
        color: surface.color,
        elevation: surface.elevation,
        moisture: surface.moisture,
        temperature: surface.temperature,
        waterVisualAmount: surface.waterVisualAmount,
        materialNoise: coherentNoise(seed, worldPixelX, worldPixelY, 74, 0x5a3d19c7),
        landformNoise: coherentNoise(seed, worldPixelX, worldPixelY, 268, 0x32c47ab1)
      });
    }
    vertices.push(row);
  }
  return vertices;
};

const bakeTerrain = (seed: string, chunkX: number, chunkY: number, materialSet: TerrainMaterialSet): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(TERRAIN_TEXTURE_SIZE * TERRAIN_TEXTURE_SIZE * 4);
  const vertices = createTerrainVertexColors(seed, chunkX, chunkY);
  const cellsPerChunk = CHUNK_SIZE_PIXELS / VISUAL_TERRAIN_CELL_SIZE;
  const chunkWorldX = chunkX * CHUNK_SIZE_PIXELS;
  const chunkWorldY = chunkY * CHUNK_SIZE_PIXELS;
  const channel = (color: number, shift: number): number => (color >> shift) & 0xff;
  const clampChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
  const smooth = (start: number, end: number, value: number): number => {
    const normalized = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return normalized * normalized * (3 - 2 * normalized);
  };
  const sample = (
    topLeft: number,
    topRight: number,
    bottomLeft: number,
    bottomRight: number,
    horizontalAmount: number,
    verticalAmount: number
  ): number => {
    const top = topLeft + (topRight - topLeft) * horizontalAmount;
    const bottom = bottomLeft + (bottomRight - bottomLeft) * horizontalAmount;
    return top + (bottom - top) * verticalAmount;
  };
  const materialAccumulator = new Float64Array(4);

  for (let cellY = -TERRAIN_VERTEX_MARGIN_CELLS; cellY < cellsPerChunk + TERRAIN_VERTEX_MARGIN_CELLS; cellY += 1) {
    const top = vertices[cellY + TERRAIN_VERTEX_MARGIN_CELLS];
    const bottom = vertices[cellY + TERRAIN_VERTEX_MARGIN_CELLS + 1];
    for (let offsetY = 0; offsetY < VISUAL_TERRAIN_CELL_SIZE; offsetY += 1) {
      const textureY = cellY * VISUAL_TERRAIN_CELL_SIZE + offsetY + TERRAIN_TEXTURE_PADDING;
      if (textureY < 0 || textureY >= TERRAIN_TEXTURE_SIZE) {
        continue;
      }
      const verticalAmount = (offsetY + 0.5) / VISUAL_TERRAIN_CELL_SIZE;
      for (let cellX = -TERRAIN_VERTEX_MARGIN_CELLS; cellX < cellsPerChunk + TERRAIN_VERTEX_MARGIN_CELLS; cellX += 1) {
        const textureX = cellX * VISUAL_TERRAIN_CELL_SIZE + TERRAIN_TEXTURE_PADDING;
        const topLeft = top[cellX + TERRAIN_VERTEX_MARGIN_CELLS];
        const topRight = top[cellX + TERRAIN_VERTEX_MARGIN_CELLS + 1];
        const bottomLeft = bottom[cellX + TERRAIN_VERTEX_MARGIN_CELLS];
        const bottomRight = bottom[cellX + TERRAIN_VERTEX_MARGIN_CELLS + 1];

        for (let offsetX = 0; offsetX < VISUAL_TERRAIN_CELL_SIZE; offsetX += 1) {
          const pixelX = textureX + offsetX;
          if (pixelX < 0 || pixelX >= TERRAIN_TEXTURE_SIZE) {
            continue;
          }

          const horizontalAmount = (offsetX + 0.5) / VISUAL_TERRAIN_CELL_SIZE;
          let red = sample(
            channel(topLeft.color, 16), channel(topRight.color, 16),
            channel(bottomLeft.color, 16), channel(bottomRight.color, 16), horizontalAmount, verticalAmount
          );
          let green = sample(
            channel(topLeft.color, 8), channel(topRight.color, 8),
            channel(bottomLeft.color, 8), channel(bottomRight.color, 8), horizontalAmount, verticalAmount
          );
          let blue = sample(
            channel(topLeft.color, 0), channel(topRight.color, 0),
            channel(bottomLeft.color, 0), channel(bottomRight.color, 0), horizontalAmount, verticalAmount
          );
          const elevation = sample(
            topLeft.elevation, topRight.elevation, bottomLeft.elevation, bottomRight.elevation, horizontalAmount, verticalAmount
          );
          const moisture = sample(
            topLeft.moisture, topRight.moisture, bottomLeft.moisture, bottomRight.moisture, horizontalAmount, verticalAmount
          );
          const temperature = sample(
            topLeft.temperature, topRight.temperature, bottomLeft.temperature, bottomRight.temperature, horizontalAmount, verticalAmount
          );
          const waterAmount = sample(
            topLeft.waterVisualAmount, topRight.waterVisualAmount,
            bottomLeft.waterVisualAmount, bottomRight.waterVisualAmount, horizontalAmount, verticalAmount
          );
          const materialNoise = sample(
            topLeft.materialNoise, topRight.materialNoise,
            bottomLeft.materialNoise, bottomRight.materialNoise, horizontalAmount, verticalAmount
          );
          const landformNoise = sample(
            topLeft.landformNoise, topRight.landformNoise,
            bottomLeft.landformNoise, bottomRight.landformNoise, horizontalAmount, verticalAmount
          );

          const landAmount = 1 - waterAmount;
          const relief = (landformNoise - 0.5) * 0.15 * landAmount;
          red *= 1 + relief;
          green *= 1 + relief;
          blue *= 1 + relief;

          const beach = (1 - smooth(0.28, 0.43, elevation)) * landAmount;
          const desert = smooth(0.56, 0.78, temperature) * (1 - smooth(0.27, 0.47, moisture));
          const snow = snowVisualAmountForClimate(elevation, temperature) * landAmount;
          const rocky = smooth(0.61, 0.9, elevation) * (1 - snow * 0.35);
          const forest = smooth(0.46, 0.68, moisture) * (1 - desert) * (1 - snow) * (1 - rocky);
          const swamp = smooth(0.7, 0.86, moisture)
            * smooth(0.34, 0.56, temperature) * (1 - rocky);
          const hills = smooth(0.58, 0.79, elevation) * (1 - rocky) * (1 - snow);
          const temperateGround = landAmount
            * (1 - beach) * (1 - desert) * (1 - snow) * (1 - rocky);
          const broadMound = smooth(0.47, 0.72, landformNoise);
          const materialVariation = materialNoise - 0.5;

          const sandAmount = beach * (0.06 + materialVariation * 0.06);
          red += (229 - red) * sandAmount;
          green += (196 - green) * sandAmount;
          blue += (124 - blue) * sandAmount;

          const desertAmount = desert * (0.045 + materialVariation * 0.06);
          red += (205 - red) * desertAmount;
          green += (151 - green) * desertAmount;
          blue += (74 - blue) * desertAmount;

          const soilAmount = temperateGround * (0.055 + materialVariation * 0.085);
          red += (117 - red) * soilAmount;
          green += (88 - green) * soilAmount;
          blue += (57 - blue) * soilAmount;

          const rockAmount = rocky * (0.075 + materialVariation * 0.12);
          red += (80 - red) * rockAmount;
          green += (91 - green) * rockAmount;
          blue += (94 - blue) * rockAmount;

          const snowMoundAmount = snow * broadMound * 0.19;
          red += (246 - red) * snowMoundAmount;
          green += (252 - green) * snowMoundAmount;
          blue += (255 - blue) * snowMoundAmount;

          const worldPixelX = chunkWorldX + cellX * VISUAL_TERRAIN_CELL_SIZE + offsetX;
          const worldPixelY = chunkWorldY + cellY * VISUAL_TERRAIN_CELL_SIZE + offsetY;
          const plainsWeight = Math.max(temperateGround, forest * 0.9, swamp * 0.62);
          const beachWeight = beach;
          const desertWeight = desert;
          const rockyWeight = Math.max(rocky, hills * 0.72);
          const snowWeight = snow;
          materialAccumulator[0] = 0;
          materialAccumulator[1] = 0;
          materialAccumulator[2] = 0;
          materialAccumulator[3] = 0;
          accumulateTerrainMaterial(materialAccumulator, materialSet.plains, plainsWeight, worldPixelX, worldPixelY);
          accumulateTerrainMaterial(materialAccumulator, materialSet.beach, beachWeight, worldPixelX, worldPixelY);
          accumulateTerrainMaterial(materialAccumulator, materialSet.desert, desertWeight, worldPixelX, worldPixelY);
          accumulateTerrainMaterial(materialAccumulator, materialSet.rocky, rockyWeight, worldPixelX, worldPixelY);
          accumulateTerrainMaterial(materialAccumulator, materialSet.snow, snowWeight, worldPixelX, worldPixelY);
          const totalMaterialWeight = materialAccumulator[3];
          if (totalMaterialWeight > 0.01) {
            const materialRed = materialAccumulator[0] / totalMaterialWeight;
            const materialGreen = materialAccumulator[1] / totalMaterialWeight;
            const materialBlue = materialAccumulator[2] / totalMaterialWeight;
            const dominantWeight = Math.max(plainsWeight, beachWeight, desertWeight, rockyWeight, snowWeight);
            const materialBlend = 0.08 + dominantWeight * 0.2;
            red += (materialRed - red) * materialBlend;
            green += (materialGreen - green) * materialBlend;
            blue += (materialBlue - blue) * materialBlend;
          }

          const pixel = (textureY * TERRAIN_TEXTURE_SIZE + pixelX) * 4;
          pixels[pixel] = clampChannel(red);
          pixels[pixel + 1] = clampChannel(green);
          pixels[pixel + 2] = clampChannel(blue);
          pixels[pixel + 3] = 255;
        }
      }
    }
  }
  return pixels;
};

// Water classification used to be sampled again on the renderer immediately after a worker bake.
// Keeping it beside the terrain pixels avoids another 4,096 seeded surface evaluations when a
// streamed chunk commits, while preserving the exact per-cell water decisions.
const bakeWaterKinds = (seed: string, chunkX: number, chunkY: number): Uint8Array => {
  const cellsPerChunk = CHUNK_SIZE_PIXELS / VISUAL_TERRAIN_CELL_SIZE;
  const waterKinds = new Uint8Array(cellsPerChunk * cellsPerChunk);
  const firstTileX = chunkX * CHUNK_SIZE_TILES;
  const firstTileY = chunkY * CHUNK_SIZE_TILES;
  for (let cellY = 0; cellY < cellsPerChunk; cellY += 1) {
    for (let cellX = 0; cellX < cellsPerChunk; cellX += 1) {
      const surface = surfaceAtTile(
        seed,
        firstTileX + (cellX + 0.5) / VISUAL_CELLS_PER_TILE,
        firstTileY + (cellY + 0.5) / VISUAL_CELLS_PER_TILE
      );
      const isSwamp = surface.isSwampWater && surface.waterVisualAmount > 0.16;
      const isOcean = !surface.isSwampWater && (
        surface.isWater || (surface.biome === Biome.Beach && surface.waterVisualAmount > 0.2)
      );
      waterKinds[cellY * cellsPerChunk + cellX] = isSwamp ? 2 : isOcean ? 1 : 0;
    }
  }
  return waterKinds;
};

workerScope.addEventListener('message', async (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (message.type === 'initialize') {
    materials = message.materials;
    return;
  }

  try {
    if (!materials) {
      throw new Error('Terrain worker received a bake before material initialization.');
    }
    const pixels = bakeTerrain(message.seed, message.chunkX, message.chunkY, materials);
    const waterKinds = bakeWaterKinds(message.seed, message.chunkX, message.chunkY);
    const imageBitmap = typeof createImageBitmap === 'function'
      ? await createImageBitmap(new ImageData(
        new Uint8ClampedArray(pixels.buffer as ArrayBuffer),
        TERRAIN_TEXTURE_SIZE,
        TERRAIN_TEXTURE_SIZE
      ))
      : null;
    const transfers: Transferable[] = [pixels.buffer as ArrayBuffer, waterKinds.buffer as ArrayBuffer];
    if (imageBitmap) transfers.push(imageBitmap);
    workerScope.postMessage(
      { type: 'complete', id: message.id, pixels: pixels.buffer, waterKinds: waterKinds.buffer, imageBitmap },
      transfers
    );
  } catch (error) {
    workerScope.postMessage({
      type: 'failed',
      id: message.id,
      message: error instanceof Error ? error.message : 'Terrain worker failed.'
    });
  }
});

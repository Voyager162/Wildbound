import Phaser from 'phaser';
import { generateChunkFeatures, TerrainFeatureType } from './generation/featureGenerator';
import { randomAtTile } from './generation/noise';
import { generateChunkTerrain, TERRAIN_COLORS } from './generation/terrainGenerator';
import { CHUNK_SIZE_PIXELS, CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from './worldConfig';

const VISUAL_TERRAIN_CELL_SIZE = 16;
const VISUAL_CELLS_PER_TILE = WORLD_TILE_SIZE / VISUAL_TERRAIN_CELL_SIZE;

export class WorldChunk {
  readonly key: string;
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, seed: string, readonly x: number, readonly y: number) {
    this.key = `${x},${y}`;
    this.graphics = scene.add.graphics();

    const terrain = generateChunkTerrain(seed, x, y);
    const features = generateChunkFeatures(seed, x, y);
    const worldX = x * CHUNK_SIZE_PIXELS;
    const worldY = y * CHUNK_SIZE_PIXELS;

    for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
      for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
        const tileIndex = localY * CHUNK_SIZE_TILES + localX;
        const baseColor = TERRAIN_COLORS[terrain[tileIndex]];
        const worldTileX = x * CHUNK_SIZE_TILES + localX;
        const worldTileY = y * CHUNK_SIZE_TILES + localY;

        for (let visualY = 0; visualY < VISUAL_CELLS_PER_TILE; visualY += 1) {
          for (let visualX = 0; visualX < VISUAL_CELLS_PER_TILE; visualX += 1) {
            const variation = randomAtTile(
              seed,
              worldTileX * VISUAL_CELLS_PER_TILE + visualX,
              worldTileY * VISUAL_CELLS_PER_TILE + visualY,
              0x1f4a7c15
            );
            this.graphics.fillStyle(this.shadeColor(baseColor, (variation - 0.5) * 0.14), 1);
            this.graphics.fillRect(
              worldX + localX * WORLD_TILE_SIZE + visualX * VISUAL_TERRAIN_CELL_SIZE,
              worldY + localY * WORLD_TILE_SIZE + visualY * VISUAL_TERRAIN_CELL_SIZE,
              VISUAL_TERRAIN_CELL_SIZE,
              VISUAL_TERRAIN_CELL_SIZE
            );
          }
        }
      }
    }

    features.forEach((feature) => {
      this.drawFeature(
        feature.type,
        worldX + feature.localTileX * WORLD_TILE_SIZE,
        worldY + feature.localTileY * WORLD_TILE_SIZE
      );
    });

    this.graphics.lineStyle(1, 0x182c23, 0.1);
    this.graphics.strokeRect(worldX, worldY, CHUNK_SIZE_PIXELS, CHUNK_SIZE_PIXELS);
  }

  destroy(): void {
    this.graphics.destroy();
  }

  private shadeColor(color: number, amount: number): number {
    const adjust = (channel: number): number => Phaser.Math.Clamp(Math.round(channel * (1 + amount)), 0, 255);
    const red = adjust((color >> 16) & 0xff);
    const green = adjust((color >> 8) & 0xff);
    const blue = adjust(color & 0xff);

    return (red << 16) | (green << 8) | blue;
  }

  private drawFeature(type: TerrainFeatureType, tileX: number, tileY: number): void {
    const centerX = tileX + WORLD_TILE_SIZE / 2;
    const centerY = tileY + WORLD_TILE_SIZE / 2;

    switch (type) {
      case TerrainFeatureType.Tree:
        this.graphics.fillStyle(0x654126, 1);
        this.graphics.fillRect(centerX - 3, centerY + 4, 6, 10);
        this.graphics.fillStyle(0x1d5536, 1);
        this.graphics.fillCircle(centerX, centerY - 1, 10);
        break;
      case TerrainFeatureType.Cactus:
        this.graphics.fillStyle(0x3f7a46, 1);
        this.graphics.fillRect(centerX - 3, centerY - 10, 6, 20);
        this.graphics.fillRect(centerX + 3, centerY - 2, 6, 4);
        break;
      case TerrainFeatureType.Rock:
        this.graphics.fillStyle(0x535960, 1);
        this.graphics.fillCircle(centerX, centerY + 2, 8);
        break;
      case TerrainFeatureType.Reeds:
        this.graphics.lineStyle(2, 0x325d3e, 1);
        this.graphics.lineBetween(centerX - 5, centerY + 9, centerX - 4, centerY - 7);
        this.graphics.lineBetween(centerX, centerY + 9, centerX + 1, centerY - 9);
        this.graphics.lineBetween(centerX + 5, centerY + 9, centerX + 4, centerY - 5);
        break;
      case TerrainFeatureType.SnowyRock:
        this.graphics.fillStyle(0x69717a, 1);
        this.graphics.fillCircle(centerX, centerY + 2, 8);
        this.graphics.fillStyle(0xf2f7f8, 1);
        this.graphics.fillCircle(centerX - 2, centerY - 2, 5);
        break;
      case TerrainFeatureType.IcePatch:
        this.graphics.fillStyle(0xb8e1ef, 0.8);
        this.graphics.fillCircle(centerX, centerY, 8);
        break;
    }
  }
}

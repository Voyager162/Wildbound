import Phaser from 'phaser';
import { generateChunkFeatures, TerrainFeatureType } from './generation/featureGenerator';
import { randomAtTile } from './generation/noise';
import { terrainAtTile, TERRAIN_COLORS } from './generation/terrainGenerator';
import { SessionWorldState } from './SessionWorldState';
import { CHUNK_SIZE_PIXELS, CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from './worldConfig';

// Rendering uses 8px cells, while movement, chunks, and features keep the 32px logical tile grid.
const VISUAL_TERRAIN_CELL_SIZE = 8;
const VISUAL_CELLS_PER_TILE = WORLD_TILE_SIZE / VISUAL_TERRAIN_CELL_SIZE;

export class WorldChunk {
  readonly key: string;
  private readonly terrainGraphics: Phaser.GameObjects.Graphics;
  private readonly featureGraphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly seed: string,
    private readonly sessionState: SessionWorldState,
    readonly x: number,
    readonly y: number
  ) {
    this.key = `${x},${y}`;
    this.terrainGraphics = scene.add.graphics();
    this.featureGraphics = scene.add.graphics().setDepth(1);

    this.drawTerrain();
    this.refreshFeatures();
  }

  refreshFeatures(): void {
    const worldX = this.x * CHUNK_SIZE_PIXELS;
    const worldY = this.y * CHUNK_SIZE_PIXELS;
    const features = generateChunkFeatures(this.seed, this.x, this.y);

    this.featureGraphics.clear();
    features.forEach((feature) => {
      const worldTileX = this.x * CHUNK_SIZE_TILES + feature.localTileX;
      const worldTileY = this.y * CHUNK_SIZE_TILES + feature.localTileY;

      if (!this.sessionState.isFeatureHarvested(worldTileX, worldTileY)) {
        this.drawFeature(
          feature.type,
          worldX + feature.localTileX * WORLD_TILE_SIZE,
          worldY + feature.localTileY * WORLD_TILE_SIZE
        );
      }
    });
  }

  destroy(): void {
    this.terrainGraphics.destroy();
    this.featureGraphics.destroy();
  }

  private drawTerrain(): void {
    const worldX = this.x * CHUNK_SIZE_PIXELS;
    const worldY = this.y * CHUNK_SIZE_PIXELS;

    for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
      for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
        const worldTileX = this.x * CHUNK_SIZE_TILES + localX;
        const worldTileY = this.y * CHUNK_SIZE_TILES + localY;

        for (let visualY = 0; visualY < VISUAL_CELLS_PER_TILE; visualY += 1) {
          for (let visualX = 0; visualX < VISUAL_CELLS_PER_TILE; visualX += 1) {
            // Sample each cell at its world-space center for 8px biome boundaries and deterministic detail.
            const sampleTileX = worldTileX + (visualX + 0.5) / VISUAL_CELLS_PER_TILE;
            const sampleTileY = worldTileY + (visualY + 0.5) / VISUAL_CELLS_PER_TILE;
            const terrain = terrainAtTile(this.seed, sampleTileX, sampleTileY);
            const variation = randomAtTile(
              this.seed,
              worldTileX * VISUAL_CELLS_PER_TILE + visualX,
              worldTileY * VISUAL_CELLS_PER_TILE + visualY,
              0x1f4a7c15
            );
            this.terrainGraphics.fillStyle(this.shadeColor(TERRAIN_COLORS[terrain], (variation - 0.5) * 0.06), 1);
            this.terrainGraphics.fillRect(
              worldX + localX * WORLD_TILE_SIZE + visualX * VISUAL_TERRAIN_CELL_SIZE,
              worldY + localY * WORLD_TILE_SIZE + visualY * VISUAL_TERRAIN_CELL_SIZE,
              VISUAL_TERRAIN_CELL_SIZE,
              VISUAL_TERRAIN_CELL_SIZE
            );
          }
        }
      }
    }

    this.terrainGraphics.lineStyle(1, 0x182c23, 0.1);
    this.terrainGraphics.strokeRect(worldX, worldY, CHUNK_SIZE_PIXELS, CHUNK_SIZE_PIXELS);
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
        this.featureGraphics.fillStyle(0x654126, 1);
        this.featureGraphics.fillRect(centerX - 3, centerY + 4, 6, 10);
        this.featureGraphics.fillStyle(0x1d5536, 1);
        this.featureGraphics.fillCircle(centerX, centerY - 1, 10);
        break;
      case TerrainFeatureType.Cactus:
        this.featureGraphics.fillStyle(0x3f7a46, 1);
        this.featureGraphics.fillRect(centerX - 3, centerY - 10, 6, 20);
        this.featureGraphics.fillRect(centerX + 3, centerY - 2, 6, 4);
        break;
      case TerrainFeatureType.Rock:
        this.featureGraphics.fillStyle(0x535960, 1);
        this.featureGraphics.fillCircle(centerX, centerY + 2, 8);
        break;
      case TerrainFeatureType.Reeds:
        this.featureGraphics.lineStyle(2, 0x325d3e, 1);
        this.featureGraphics.lineBetween(centerX - 5, centerY + 9, centerX - 4, centerY - 7);
        this.featureGraphics.lineBetween(centerX, centerY + 9, centerX + 1, centerY - 9);
        this.featureGraphics.lineBetween(centerX + 5, centerY + 9, centerX + 4, centerY - 5);
        break;
      case TerrainFeatureType.SnowyRock:
        this.featureGraphics.fillStyle(0x69717a, 1);
        this.featureGraphics.fillCircle(centerX, centerY + 2, 8);
        this.featureGraphics.fillStyle(0xf2f7f8, 1);
        this.featureGraphics.fillCircle(centerX - 2, centerY - 2, 5);
        break;
      case TerrainFeatureType.IcePatch:
        this.featureGraphics.fillStyle(0xb8e1ef, 0.8);
        this.featureGraphics.fillCircle(centerX, centerY, 8);
        break;
    }
  }
}
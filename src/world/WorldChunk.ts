import Phaser from 'phaser';
import { generateChunkFeatures, type TerrainFeature, TerrainFeatureType } from './generation/featureGenerator';
import { randomAtTile } from './generation/noise';
import { terrainAtTile, TERRAIN_COLORS } from './generation/terrainGenerator';
import { SessionWorldState } from './SessionWorldState';
import { CHUNK_SIZE_PIXELS, CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from './worldConfig';

// Terrain is baked into one texture per chunk. The 8px visual cells retain the detailed look
// while keeping the renderer to a single terrain draw call for the whole chunk.
const VISUAL_TERRAIN_CELL_SIZE = 8;
const VISUAL_CELLS_PER_TILE = WORLD_TILE_SIZE / VISUAL_TERRAIN_CELL_SIZE;

export class WorldChunk {
  readonly key: string;
  private readonly textureKey: string;
  private readonly terrainImage: Phaser.GameObjects.Image;
  private readonly featureGraphics: Phaser.GameObjects.Graphics;
  private readonly features: TerrainFeature[];
  private harvestingTileKey: string | null = null;
  private harvestOffset = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly seed: string,
    private readonly sessionState: SessionWorldState,
    readonly x: number,
    readonly y: number
  ) {
    this.key = `${x},${y}`;
    this.textureKey = `terrain:${seed}:${x}:${y}`;
    const terrainTexture = scene.textures.createCanvas(this.textureKey, CHUNK_SIZE_PIXELS, CHUNK_SIZE_PIXELS);
    if (!terrainTexture) {
      throw new Error('Wildbound could not create a terrain texture.');
    }
    this.terrainImage = scene.add.image(x * CHUNK_SIZE_PIXELS, y * CHUNK_SIZE_PIXELS, this.textureKey).setOrigin(0);
    this.featureGraphics = scene.add.graphics().setDepth(1);
    this.features = generateChunkFeatures(seed, x, y);

    this.drawTerrain(terrainTexture);
    this.refreshFeatures();
  }

  setHarvestAnimation(tileX: number, tileY: number, progress: number): void {
    const tileKey = this.tileKey(tileX, tileY);
    const offset = Math.sin(progress * Math.PI * 10) * 6;

    if (this.harvestingTileKey === tileKey && Math.abs(offset - this.harvestOffset) < 0.8) {
      return;
    }

    this.harvestingTileKey = tileKey;
    this.harvestOffset = offset;
    this.refreshFeatures();
  }

  clearHarvestAnimation(): void {
    if (!this.harvestingTileKey) {
      return;
    }

    this.harvestingTileKey = null;
    this.harvestOffset = 0;
    this.refreshFeatures();
  }

  refreshFeatures(): void {
    const worldX = this.x * CHUNK_SIZE_PIXELS;
    const worldY = this.y * CHUNK_SIZE_PIXELS;

    this.featureGraphics.clear();
    this.features.forEach((feature) => {
      const worldTileX = this.x * CHUNK_SIZE_TILES + feature.localTileX;
      const worldTileY = this.y * CHUNK_SIZE_TILES + feature.localTileY;

      if (!this.sessionState.isFeatureHarvested(worldTileX, worldTileY)) {
        const offset = this.harvestingTileKey === this.tileKey(worldTileX, worldTileY) ? this.harvestOffset : 0;
        this.drawFeature(
          feature.type,
          worldX + feature.localTileX * WORLD_TILE_SIZE,
          worldY + feature.localTileY * WORLD_TILE_SIZE,
          offset
        );
      }
    });
  }

  destroy(): void {
    this.terrainImage.destroy();
    this.featureGraphics.destroy();
    this.scene.textures.remove(this.textureKey);
  }

  private drawTerrain(texture: Phaser.Textures.CanvasTexture): void {
    const context = texture.getContext();

    for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
      for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
        const worldTileX = this.x * CHUNK_SIZE_TILES + localX;
        const worldTileY = this.y * CHUNK_SIZE_TILES + localY;

        for (let visualY = 0; visualY < VISUAL_CELLS_PER_TILE; visualY += 1) {
          for (let visualX = 0; visualX < VISUAL_CELLS_PER_TILE; visualX += 1) {
            const sampleTileX = worldTileX + (visualX + 0.5) / VISUAL_CELLS_PER_TILE;
            const sampleTileY = worldTileY + (visualY + 0.5) / VISUAL_CELLS_PER_TILE;
            const terrain = terrainAtTile(this.seed, sampleTileX, sampleTileY);
            const variation = randomAtTile(
              this.seed,
              worldTileX * VISUAL_CELLS_PER_TILE + visualX,
              worldTileY * VISUAL_CELLS_PER_TILE + visualY,
              0x1f4a7c15
            );

            context.fillStyle = this.colorToCss(this.shadeColor(TERRAIN_COLORS[terrain], (variation - 0.5) * 0.06));
            context.fillRect(
              localX * WORLD_TILE_SIZE + visualX * VISUAL_TERRAIN_CELL_SIZE,
              localY * WORLD_TILE_SIZE + visualY * VISUAL_TERRAIN_CELL_SIZE,
              VISUAL_TERRAIN_CELL_SIZE,
              VISUAL_TERRAIN_CELL_SIZE
            );
          }
        }
      }
    }

    context.strokeStyle = 'rgba(24, 44, 35, 0.18)';
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, CHUNK_SIZE_PIXELS - 1, CHUNK_SIZE_PIXELS - 1);
    texture.refresh();
  }

  private colorToCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
  }

  private shadeColor(color: number, amount: number): number {
    const adjust = (channel: number): number => Phaser.Math.Clamp(Math.round(channel * (1 + amount)), 0, 255);
    const red = adjust((color >> 16) & 0xff);
    const green = adjust((color >> 8) & 0xff);
    const blue = adjust(color & 0xff);

    return (red << 16) | (green << 8) | blue;
  }

  private drawFeature(type: TerrainFeatureType, tileX: number, tileY: number, animationOffset: number): void {
    const centerX = tileX + WORLD_TILE_SIZE / 2 + animationOffset;
    const centerY = tileY + WORLD_TILE_SIZE / 2;

    switch (type) {
      case TerrainFeatureType.Tree:
        this.featureGraphics.fillStyle(0x3f2819, 0.42);
        this.featureGraphics.fillEllipse(centerX, centerY + 28, 42, 13);
        this.featureGraphics.fillStyle(0x5d3823, 1);
        this.featureGraphics.fillRect(centerX - 7, centerY + 4, 14, 34);
        this.featureGraphics.fillStyle(0x95613b, 1);
        this.featureGraphics.fillRect(centerX - 3, centerY + 4, 5, 34);
        this.featureGraphics.lineStyle(2, 0x402618, 0.8);
        this.featureGraphics.lineBetween(centerX + 2, centerY + 10, centerX + 2, centerY + 33);
        this.featureGraphics.fillStyle(0x123d29, 1);
        this.featureGraphics.fillCircle(centerX, centerY - 13, 29);
        this.featureGraphics.fillCircle(centerX - 20, centerY - 8, 20);
        this.featureGraphics.fillCircle(centerX + 20, centerY - 8, 20);
        this.featureGraphics.fillCircle(centerX - 10, centerY - 30, 19);
        this.featureGraphics.fillCircle(centerX + 13, centerY - 28, 18);
        this.featureGraphics.fillStyle(0x2e7942, 1);
        this.featureGraphics.fillCircle(centerX - 8, centerY - 23, 20);
        this.featureGraphics.fillCircle(centerX + 15, centerY - 19, 17);
        this.featureGraphics.fillCircle(centerX - 25, centerY - 8, 12);
        break;
      case TerrainFeatureType.Cactus:
        this.featureGraphics.fillStyle(0x2d6337, 0.42);
        this.featureGraphics.fillEllipse(centerX, centerY + 25, 34, 11);
        this.featureGraphics.fillStyle(0x397d45, 1);
        this.featureGraphics.fillRoundedRect(centerX - 7, centerY - 28, 14, 56, 5);
        this.featureGraphics.fillRoundedRect(centerX - 27, centerY - 8, 20, 11, 4);
        this.featureGraphics.fillRoundedRect(centerX - 27, centerY - 22, 9, 25, 4);
        this.featureGraphics.fillRoundedRect(centerX + 7, centerY + 2, 20, 11, 4);
        this.featureGraphics.fillRoundedRect(centerX + 18, centerY - 13, 9, 26, 4);
        this.featureGraphics.lineStyle(2, 0xa7d36d, 0.78);
        this.featureGraphics.lineBetween(centerX, centerY - 24, centerX, centerY + 24);
        this.featureGraphics.lineBetween(centerX - 22, centerY - 18, centerX - 22, centerY - 2);
        this.featureGraphics.lineBetween(centerX + 22, centerY - 9, centerX + 22, centerY + 8);
        break;
      case TerrainFeatureType.Rock:
        this.featureGraphics.fillStyle(0x30383f, 0.42);
        this.featureGraphics.fillEllipse(centerX, centerY + 24, 52, 15);
        this.featureGraphics.fillStyle(0x515b65, 1);
        this.featureGraphics.fillTriangle(centerX - 26, centerY + 20, centerX - 11, centerY - 25, centerX + 28, centerY + 19);
        this.featureGraphics.fillStyle(0x73808a, 1);
        this.featureGraphics.fillTriangle(centerX - 11, centerY + 16, centerX + 3, centerY - 20, centerX + 19, centerY + 16);
        this.featureGraphics.fillStyle(0x8e9aa3, 0.75);
        this.featureGraphics.fillTriangle(centerX + 3, centerY - 20, centerX + 10, centerY - 4, centerX + 19, centerY + 16);
        this.featureGraphics.lineStyle(3, 0x3e464e, 0.85);
        this.featureGraphics.lineBetween(centerX + 2, centerY - 16, centerX - 3, centerY + 15);
        break;
      case TerrainFeatureType.Reeds:
        this.featureGraphics.fillStyle(0x263f2e, 0.35);
        this.featureGraphics.fillEllipse(centerX, centerY + 25, 48, 13);
        this.featureGraphics.lineStyle(4, 0x2c5c35, 1);
        this.featureGraphics.lineBetween(centerX - 20, centerY + 25, centerX - 22, centerY - 27);
        this.featureGraphics.lineBetween(centerX - 10, centerY + 25, centerX - 7, centerY - 36);
        this.featureGraphics.lineBetween(centerX, centerY + 25, centerX + 2, centerY - 41);
        this.featureGraphics.lineBetween(centerX + 12, centerY + 25, centerX + 15, centerY - 32);
        this.featureGraphics.lineBetween(centerX + 22, centerY + 25, centerX + 25, centerY - 24);
        this.featureGraphics.fillStyle(0x8da855, 1);
        this.featureGraphics.fillCircle(centerX - 7, centerY - 36, 3);
        this.featureGraphics.fillCircle(centerX + 2, centerY - 41, 3);
        this.featureGraphics.fillCircle(centerX + 15, centerY - 32, 3);
        break;
      case TerrainFeatureType.SnowyRock:
        this.featureGraphics.fillStyle(0x4b555d, 0.42);
        this.featureGraphics.fillEllipse(centerX, centerY + 24, 52, 15);
        this.featureGraphics.fillStyle(0x626c75, 1);
        this.featureGraphics.fillCircle(centerX - 13, centerY + 7, 20);
        this.featureGraphics.fillCircle(centerX + 13, centerY + 9, 21);
        this.featureGraphics.fillStyle(0xf2f7f8, 1);
        this.featureGraphics.fillCircle(centerX - 15, centerY - 1, 14);
        this.featureGraphics.fillCircle(centerX + 8, centerY - 2, 14);
        this.featureGraphics.fillStyle(0xcddce2, 1);
        this.featureGraphics.fillCircle(centerX + 21, centerY + 6, 8);
        break;
      case TerrainFeatureType.IcePatch:
        this.featureGraphics.fillStyle(0x5d91aa, 0.35);
        this.featureGraphics.fillEllipse(centerX, centerY + 6, 60, 38);
        this.featureGraphics.fillStyle(0xaee7f5, 0.9);
        this.featureGraphics.fillEllipse(centerX, centerY, 54, 32);
        this.featureGraphics.lineStyle(3, 0xe7fbff, 0.88);
        this.featureGraphics.lineBetween(centerX - 18, centerY - 6, centerX + 4, centerY + 4);
        this.featureGraphics.lineBetween(centerX + 4, centerY + 4, centerX + 19, centerY - 11);
        this.featureGraphics.lineBetween(centerX + 4, centerY + 4, centerX + 10, centerY + 15);
        this.featureGraphics.lineBetween(centerX - 8, centerY + 12, centerX + 4, centerY + 4);
        break;
    }
  }

  private tileKey(tileX: number, tileY: number): string {
    return `${tileX},${tileY}`;
  }
}

import Phaser from 'phaser';
import { generateChunkTerrain, TERRAIN_COLORS } from './generation/terrainGenerator';
import { CHUNK_SIZE_PIXELS, CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from './worldConfig';

export class WorldChunk {
  readonly key: string;
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, seed: string, readonly x: number, readonly y: number) {
    this.key = `${x},${y}`;
    this.graphics = scene.add.graphics();

    const terrain = generateChunkTerrain(seed, x, y);
    const worldX = x * CHUNK_SIZE_PIXELS;
    const worldY = y * CHUNK_SIZE_PIXELS;

    for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
      for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
        const tileIndex = localY * CHUNK_SIZE_TILES + localX;
        this.graphics.fillStyle(TERRAIN_COLORS[terrain[tileIndex]], 1);
        this.graphics.fillRect(
          worldX + localX * WORLD_TILE_SIZE,
          worldY + localY * WORLD_TILE_SIZE,
          WORLD_TILE_SIZE,
          WORLD_TILE_SIZE
        );
      }
    }

    this.graphics.lineStyle(1, 0x182c23, 0.1);
    this.graphics.strokeRect(worldX, worldY, CHUNK_SIZE_PIXELS, CHUNK_SIZE_PIXELS);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}

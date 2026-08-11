import Phaser from 'phaser';
import { SessionWorldState } from './SessionWorldState';
import { WorldChunk } from './WorldChunk';
import {
  CHUNK_LOAD_RADIUS,
  CHUNK_SIZE_TILES,
  CHUNK_UNLOAD_RADIUS,
  worldToChunk
} from './worldConfig';

export class ChunkManager {
  private readonly chunks = new Map<string, WorldChunk>();
  private activeChunkX = Number.NaN;
  private activeChunkY = Number.NaN;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly seed: string,
    private readonly sessionState: SessionWorldState
  ) {}

  get currentChunkX(): number {
    return this.activeChunkX;
  }

  get currentChunkY(): number {
    return this.activeChunkY;
  }

  get loadedChunkCount(): number {
    return this.chunks.size;
  }

  update(playerWorldX: number, playerWorldY: number): void {
    const nextChunkX = worldToChunk(playerWorldX);
    const nextChunkY = worldToChunk(playerWorldY);

    if (nextChunkX === this.activeChunkX && nextChunkY === this.activeChunkY) {
      return;
    }

    this.activeChunkX = nextChunkX;
    this.activeChunkY = nextChunkY;
    this.loadNearbyChunks();
    this.unloadDistantChunks();
  }

  setHarvestAnimation(tileX: number, tileY: number, progress: number): void {
    const chunkX = Math.floor(tileX / CHUNK_SIZE_TILES);
    const chunkY = Math.floor(tileY / CHUNK_SIZE_TILES);
    this.chunks.get(`${chunkX},${chunkY}`)?.setHarvestAnimation(tileX, tileY, progress);
  }

  clearHarvestAnimation(tileX: number, tileY: number): void {
    const chunkX = Math.floor(tileX / CHUNK_SIZE_TILES);
    const chunkY = Math.floor(tileY / CHUNK_SIZE_TILES);
    this.chunks.get(`${chunkX},${chunkY}`)?.clearHarvestAnimation();
  }

  harvestFeature(tileX: number, tileY: number): boolean {
    if (!this.sessionState.harvestFeature(tileX, tileY)) {
      return false;
    }

    const chunkX = Math.floor(tileX / CHUNK_SIZE_TILES);
    const chunkY = Math.floor(tileY / CHUNK_SIZE_TILES);
    this.chunks.get(`${chunkX},${chunkY}`)?.refreshFeatures();
    return true;
  }

  destroy(): void {
    this.chunks.forEach((chunk) => chunk.destroy());
    this.chunks.clear();
  }

  private loadNearbyChunks(): void {
    for (let y = this.activeChunkY - CHUNK_LOAD_RADIUS; y <= this.activeChunkY + CHUNK_LOAD_RADIUS; y += 1) {
      for (let x = this.activeChunkX - CHUNK_LOAD_RADIUS; x <= this.activeChunkX + CHUNK_LOAD_RADIUS; x += 1) {
        const key = `${x},${y}`;

        if (!this.chunks.has(key)) {
          this.chunks.set(key, new WorldChunk(this.scene, this.seed, this.sessionState, x, y));
        }
      }
    }
  }

  private unloadDistantChunks(): void {
    this.chunks.forEach((chunk, key) => {
      const distance = Math.max(
        Math.abs(chunk.x - this.activeChunkX), Math.abs(chunk.y - this.activeChunkY)
      );

      if (distance > CHUNK_UNLOAD_RADIUS) {
        chunk.destroy();
        this.chunks.delete(key);
      }
    });
  }
}
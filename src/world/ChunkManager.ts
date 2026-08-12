import Phaser from 'phaser';
import { AmbientParticleManager } from './AmbientParticleManager';
import {
  AMBIENT_CHUNK_RADIUS_X,
  AMBIENT_CHUNK_RADIUS_Y,
  AMBIENT_PARTICLE_UPDATE_INTERVAL_MS,
  AMBIENT_SWAY_UPDATE_INTERVAL_MS,
  CHUNK_BUILDS_PER_FRAME,
  WATER_ANIMATION_UPDATE_INTERVAL_MS
} from './explorationConfig';
import { LandmarkManager } from './LandmarkManager';
import { sampleTopography, type TopographySample } from './generation/topographyGenerator';
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
  private readonly pendingChunkCoordinates: Array<{ x: number; y: number }> = [];
  private readonly pendingChunkKeys = new Set<string>();
  private activeChunkX = Number.NaN;
  private activeChunkY = Number.NaN;
  private lastWaterAnimationTime = Number.NEGATIVE_INFINITY;
  private lastAmbientSwayTime = Number.NEGATIVE_INFINITY;
  private lastAmbientParticleTime = Number.NEGATIVE_INFINITY;
  private readonly ambientParticleManager: AmbientParticleManager;
  private readonly landmarkManager: LandmarkManager;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly seed: string,
    private readonly sessionState: SessionWorldState
  ) {
    this.ambientParticleManager = new AmbientParticleManager(scene, seed);
    this.landmarkManager = new LandmarkManager(scene, seed);
  }

  get currentChunkX(): number {
    return this.activeChunkX;
  }

  get currentChunkY(): number {
    return this.activeChunkY;
  }

  get loadedChunkCount(): number {
    return this.chunks.size;
  }

  get loadedLandmarkCount(): number {
    return this.landmarkManager.loadedLandmarkCount;
  }

  update(playerWorldX: number, playerWorldY: number): void {
    const nextChunkX = worldToChunk(playerWorldX);
    const nextChunkY = worldToChunk(playerWorldY);

    if (nextChunkX === this.activeChunkX && nextChunkY === this.activeChunkY) {
      this.processPendingChunks();
      return;
    }

    this.activeChunkX = nextChunkX;
    this.activeChunkY = nextChunkY;
    this.queueNearbyChunks();
    this.unloadDistantChunks();
    this.landmarkManager.update(this.activeChunkX, this.activeChunkY);
    this.processPendingChunks();
  }

  updateWaterAnimation(time: number): void {
    if (time - this.lastWaterAnimationTime < WATER_ANIMATION_UPDATE_INTERVAL_MS) {
      return;
    }

    this.lastWaterAnimationTime = time;
    this.chunks.forEach((chunk) => {
      if (
        Math.abs(chunk.x - this.activeChunkX) <= AMBIENT_CHUNK_RADIUS_X
        && Math.abs(chunk.y - this.activeChunkY) <= AMBIENT_CHUNK_RADIUS_Y
      ) {
        chunk.updateWaterAnimation(time);
      }
    });
  }

  updateAmbient(time: number, playerWorldX: number, playerWorldY: number): void {
    if (time - this.lastAmbientSwayTime >= AMBIENT_SWAY_UPDATE_INTERVAL_MS) {
      this.lastAmbientSwayTime = time;
      this.chunks.forEach((chunk) => {
        if (
          Math.abs(chunk.x - this.activeChunkX) <= AMBIENT_CHUNK_RADIUS_X
          && Math.abs(chunk.y - this.activeChunkY) <= AMBIENT_CHUNK_RADIUS_Y
        ) {
          chunk.updateAmbient(time);
        }
      });
    }

    if (time - this.lastAmbientParticleTime >= AMBIENT_PARTICLE_UPDATE_INTERVAL_MS) {
      this.lastAmbientParticleTime = time;
      this.ambientParticleManager.update(time, playerWorldX, playerWorldY);
    }
  }

  getTopographyAt(worldX: number, worldY: number): TopographySample {
    return sampleTopography(this.seed, worldX, worldY);
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
    this.pendingChunkCoordinates.length = 0;
    this.pendingChunkKeys.clear();
    this.ambientParticleManager.destroy();
    this.landmarkManager.destroy();
  }

  private queueNearbyChunks(): void {
    const candidates: Array<{ x: number; y: number; distance: number }> = [];
    for (let y = this.activeChunkY - CHUNK_LOAD_RADIUS; y <= this.activeChunkY + CHUNK_LOAD_RADIUS; y += 1) {
      for (let x = this.activeChunkX - CHUNK_LOAD_RADIUS; x <= this.activeChunkX + CHUNK_LOAD_RADIUS; x += 1) {
        const key = `${x},${y}`;

        if (!this.chunks.has(key) && !this.pendingChunkKeys.has(key)) {
          candidates.push({ x, y, distance: Math.abs(x - this.activeChunkX) + Math.abs(y - this.activeChunkY) });
        }
      }
    }

    candidates
      .sort((first, second) => first.distance - second.distance)
      .forEach(({ x, y }) => {
        this.pendingChunkCoordinates.push({ x, y });
        this.pendingChunkKeys.add(`${x},${y}`);
      });
    this.pendingChunkCoordinates.sort((first, second) => (
      Math.abs(first.x - this.activeChunkX) + Math.abs(first.y - this.activeChunkY)
      - Math.abs(second.x - this.activeChunkX) - Math.abs(second.y - this.activeChunkY)
    ));
  }

  private processPendingChunks(): void {
    let built = 0;
    while (built < CHUNK_BUILDS_PER_FRAME && this.pendingChunkCoordinates.length > 0) {
      const coordinate = this.pendingChunkCoordinates.shift();
      if (!coordinate) {
        return;
      }

      const key = `${coordinate.x},${coordinate.y}`;
      this.pendingChunkKeys.delete(key);
      const distance = Math.max(
        Math.abs(coordinate.x - this.activeChunkX),
        Math.abs(coordinate.y - this.activeChunkY)
      );
      if (distance > CHUNK_UNLOAD_RADIUS || this.chunks.has(key)) {
        continue;
      }

      this.chunks.set(key, new WorldChunk(this.scene, this.seed, this.sessionState, coordinate.x, coordinate.y));
      built += 1;
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

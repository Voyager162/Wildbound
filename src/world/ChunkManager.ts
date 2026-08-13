import Phaser from 'phaser';
import { AmbientParticleManager, type NightAmbientLight } from './AmbientParticleManager';
import {
  AMBIENT_CHUNK_RADIUS_X,
  AMBIENT_CHUNK_RADIUS_Y,
} from './explorationConfig';
import {
  AMBIENT_PARTICLE_RENDER_INTERVAL_MS,
  WATER_RIPPLE_UPDATE_INTERVAL_MS
} from './ambientPerformanceConfig';
import {
  CHUNK_STREAM_BUILD_INTERVAL_MS,
  CHUNK_STREAM_BUILDS_PER_TICK,
  CHUNK_STREAM_INITIAL_BUILD_COUNT,
  CHUNK_STREAM_LOOKAHEAD_MS,
  CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS,
  CHUNK_STREAM_VISIBLE_RADIUS_X,
  CHUNK_STREAM_VISIBLE_RADIUS_Y
} from './chunkStreamingConfig';
import {
  CHUNK_RENDER_RADIUS_X,
  CHUNK_RENDER_RADIUS_Y
} from './chunkRenderConfig';
import { LandmarkManager } from './LandmarkManager';
import { sampleTopography, type TopographySample } from './generation/topographyGenerator';
import { SessionWorldState } from './SessionWorldState';
import { WorldChunk } from './WorldChunk';
import {
  CHUNK_LOAD_RADIUS,
  CHUNK_SIZE_PIXELS,
  CHUNK_SIZE_TILES,
  CHUNK_UNLOAD_RADIUS,
  worldToChunk
} from './worldConfig';

interface PendingChunk {
  x: number;
  y: number;
  priority: number;
}

export class ChunkManager {
  private readonly chunks = new Map<string, WorldChunk>();
  private readonly pendingChunkCoordinates: PendingChunk[] = [];
  private readonly pendingChunks = new Map<string, PendingChunk>();
  private activeChunkX = Number.NaN;
  private activeChunkY = Number.NaN;
  private streamFocusChunkX = Number.NaN;
  private streamFocusChunkY = Number.NaN;
  private lastPlayerWorldX = Number.NaN;
  private lastPlayerWorldY = Number.NaN;
  private lastPlayerSampleTime = Number.NaN;
  private lastPrefetchSignature = '';
  private lastWaterAnimationTime = Number.NEGATIVE_INFINITY;
  private lastAmbientParticleTime = Number.NEGATIVE_INFINITY;
  private lastChunkBuildTime = Number.NEGATIVE_INFINITY;
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

  // Build the immediate camera rectangle before the scene accepts movement. This one-time cost
  // removes the conspicuous black chunks at a newly loaded spawn point.
  prime(playerWorldX: number, playerWorldY: number): void {
    const time = performance.now();
    this.activeChunkX = worldToChunk(playerWorldX);
    this.activeChunkY = worldToChunk(playerWorldY);
    this.updateStreamFocus(playerWorldX, playerWorldY, time);
    this.queueVisibleChunks();
    this.queueNearbyChunks();
    this.queuePrefetchChunks(playerWorldX, playerWorldY);
    this.landmarkManager.update(this.activeChunkX, this.activeChunkY);
    this.processPendingChunks(time, CHUNK_STREAM_INITIAL_BUILD_COUNT, true);
    this.updateChunkRenderVisibility();
  }

  update(playerWorldX: number, playerWorldY: number, time = performance.now()): void {
    this.updateStreamFocus(playerWorldX, playerWorldY, time);
    const nextChunkX = worldToChunk(playerWorldX);
    const nextChunkY = worldToChunk(playerWorldY);

    if (nextChunkX === this.activeChunkX && nextChunkY === this.activeChunkY) {
      this.queuePrefetchChunks(playerWorldX, playerWorldY);
      this.processPendingChunks(time);
      return;
    }

    this.activeChunkX = nextChunkX;
    this.activeChunkY = nextChunkY;
    this.queueNearbyChunks();
    this.queuePrefetchChunks(playerWorldX, playerWorldY);
    this.unloadDistantChunks();
    this.landmarkManager.update(this.activeChunkX, this.activeChunkY);
    this.processPendingChunks(time);
    this.updateChunkRenderVisibility();
  }

  updateWaterAnimation(time: number): void {
    this.chunks.forEach((chunk) => {
      if (
        Math.abs(chunk.x - this.activeChunkX) <= AMBIENT_CHUNK_RADIUS_X
        && Math.abs(chunk.y - this.activeChunkY) <= AMBIENT_CHUNK_RADIUS_Y
      ) {
        chunk.updateWaterSurfaceMotion(time);
      }
    });

    if (time - this.lastWaterAnimationTime < WATER_RIPPLE_UPDATE_INTERVAL_MS) {
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

  updateAmbient(time: number, playerWorldX: number, playerWorldY: number, nightAmount: number): void {
    if (time - this.lastAmbientParticleTime >= AMBIENT_PARTICLE_RENDER_INTERVAL_MS) {
      this.lastAmbientParticleTime = time;
      this.ambientParticleManager.update(time, playerWorldX, playerWorldY, nightAmount);
    }
  }

  getNightAmbientLights(time: number): readonly NightAmbientLight[] {
    return this.ambientParticleManager.getNightLights(time);
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
    this.pendingChunks.clear();
    this.ambientParticleManager.destroy();
    this.landmarkManager.destroy();
  }

  private queueNearbyChunks(): void {
    this.queueChunkNeighborhood(this.activeChunkX, this.activeChunkY);
    this.sortPendingChunks();
  }

  private queuePrefetchChunks(playerWorldX: number, playerWorldY: number): void {
    const localX = playerWorldX - this.activeChunkX * CHUNK_SIZE_PIXELS;
    const localY = playerWorldY - this.activeChunkY * CHUNK_SIZE_PIXELS;
    const prefetchThreshold = CHUNK_SIZE_PIXELS * 0.64;
    const horizontalDirection = localX >= prefetchThreshold ? 1 : localX <= CHUNK_SIZE_PIXELS - prefetchThreshold ? -1 : 0;
    const verticalDirection = localY >= prefetchThreshold ? 1 : localY <= CHUNK_SIZE_PIXELS - prefetchThreshold ? -1 : 0;
    const signature = `${this.activeChunkX},${this.activeChunkY}|${this.streamFocusChunkX},${this.streamFocusChunkY}|${horizontalDirection},${verticalDirection}`;
    if (signature === this.lastPrefetchSignature) {
      return;
    }

    this.lastPrefetchSignature = signature;
    const centersX = [this.activeChunkX, this.streamFocusChunkX];
    const centersY = [this.activeChunkY, this.streamFocusChunkY];

    if (horizontalDirection > 0) {
      centersX.push(this.activeChunkX + 1);
    } else if (horizontalDirection < 0) {
      centersX.push(this.activeChunkX - 1);
    }
    if (verticalDirection > 0) {
      centersY.push(this.activeChunkY + 1);
    } else if (verticalDirection < 0) {
      centersY.push(this.activeChunkY - 1);
    }

    Array.from(new Set(centersX)).forEach((centerX) => Array.from(new Set(centersY)).forEach((centerY) => {
      this.queueChunkNeighborhood(centerX, centerY);
    }));
    this.sortPendingChunks();
  }

  private queueChunkNeighborhood(centerChunkX: number, centerChunkY: number): void {
    for (let y = centerChunkY - CHUNK_LOAD_RADIUS; y <= centerChunkY + CHUNK_LOAD_RADIUS; y += 1) {
      for (let x = centerChunkX - CHUNK_LOAD_RADIUS; x <= centerChunkX + CHUNK_LOAD_RADIUS; x += 1) {
        this.queueChunk(x, y, this.chunkPriority(x, y));
      }
    }

  }

  private queueVisibleChunks(): void {
    for (let y = this.activeChunkY - CHUNK_STREAM_VISIBLE_RADIUS_Y; y <= this.activeChunkY + CHUNK_STREAM_VISIBLE_RADIUS_Y; y += 1) {
      for (let x = this.activeChunkX - CHUNK_STREAM_VISIBLE_RADIUS_X; x <= this.activeChunkX + CHUNK_STREAM_VISIBLE_RADIUS_X; x += 1) {
        const distance = Math.abs(x - this.activeChunkX) + Math.abs(y - this.activeChunkY);
        this.queueChunk(x, y, -100 + distance);
      }
    }

    this.sortPendingChunks();
  }

  private queueChunk(x: number, y: number, priority: number): void {
    const key = `${x},${y}`;
    if (this.chunks.has(key)) {
      return;
    }

    const existing = this.pendingChunks.get(key);
    if (existing) {
      existing.priority = Math.min(existing.priority, priority);
      return;
    }

    const candidate = { x, y, priority };
    this.pendingChunkCoordinates.push(candidate);
    this.pendingChunks.set(key, candidate);
  }

  private chunkPriority(x: number, y: number): number {
    const activeDistance = Math.abs(x - this.activeChunkX) + Math.abs(y - this.activeChunkY);
    const focusDistance = Math.abs(x - this.streamFocusChunkX) + Math.abs(y - this.streamFocusChunkY);
    return Math.min(activeDistance, focusDistance * 0.7 + 0.15);
  }

  private sortPendingChunks(): void {
    this.pendingChunkCoordinates.sort((first, second) => first.priority - second.priority);
  }

  private updateStreamFocus(playerWorldX: number, playerWorldY: number, time: number): void {
    const currentChunkX = worldToChunk(playerWorldX);
    const currentChunkY = worldToChunk(playerWorldY);
    if (Number.isFinite(this.lastPlayerSampleTime)) {
      const elapsed = Math.max(1, time - this.lastPlayerSampleTime);
      const maximumLead = CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS * CHUNK_SIZE_PIXELS;
      const leadX = Phaser.Math.Clamp(
        ((playerWorldX - this.lastPlayerWorldX) / elapsed) * CHUNK_STREAM_LOOKAHEAD_MS,
        -maximumLead,
        maximumLead
      );
      const leadY = Phaser.Math.Clamp(
        ((playerWorldY - this.lastPlayerWorldY) / elapsed) * CHUNK_STREAM_LOOKAHEAD_MS,
        -maximumLead,
        maximumLead
      );
      this.streamFocusChunkX = worldToChunk(playerWorldX + leadX);
      this.streamFocusChunkY = worldToChunk(playerWorldY + leadY);
    } else {
      this.streamFocusChunkX = currentChunkX;
      this.streamFocusChunkY = currentChunkY;
    }

    this.lastPlayerWorldX = playerWorldX;
    this.lastPlayerWorldY = playerWorldY;
    this.lastPlayerSampleTime = time;
  }

  private processPendingChunks(
    time: number,
    buildBudget = CHUNK_STREAM_BUILDS_PER_TICK,
    force = false
  ): void {
    if (!force && time - this.lastChunkBuildTime < CHUNK_STREAM_BUILD_INTERVAL_MS) {
      return;
    }

    this.lastChunkBuildTime = time;
    let built = 0;
    while (built < buildBudget && this.pendingChunkCoordinates.length > 0) {
      const coordinate = this.pendingChunkCoordinates.shift();
      if (!coordinate) {
        return;
      }

      const key = `${coordinate.x},${coordinate.y}`;
      this.pendingChunks.delete(key);
      const distance = Math.max(
        Math.abs(coordinate.x - this.activeChunkX),
        Math.abs(coordinate.y - this.activeChunkY)
      );
      const focusDistance = Math.max(
        Math.abs(coordinate.x - this.streamFocusChunkX),
        Math.abs(coordinate.y - this.streamFocusChunkY)
      );
      if ((distance > CHUNK_UNLOAD_RADIUS && focusDistance > CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS) || this.chunks.has(key)) {
        continue;
      }

      const chunk = new WorldChunk(this.scene, this.seed, this.sessionState, coordinate.x, coordinate.y);
      chunk.setRenderVisible(this.isWithinRenderWindow(coordinate.x, coordinate.y));
      this.chunks.set(key, chunk);
      built += 1;
    }
  }

  private updateChunkRenderVisibility(): void {
    this.chunks.forEach((chunk) => chunk.setRenderVisible(this.isWithinRenderWindow(chunk.x, chunk.y)));
  }

  private isWithinRenderWindow(chunkX: number, chunkY: number): boolean {
    return Math.abs(chunkX - this.activeChunkX) <= CHUNK_RENDER_RADIUS_X
      && Math.abs(chunkY - this.activeChunkY) <= CHUNK_RENDER_RADIUS_Y;
  }

  private unloadDistantChunks(): void {
    this.chunks.forEach((chunk, key) => {
      const distance = Math.max(
        Math.abs(chunk.x - this.activeChunkX), Math.abs(chunk.y - this.activeChunkY)
      );

      const focusDistance = Math.max(
        Math.abs(chunk.x - this.streamFocusChunkX),
        Math.abs(chunk.y - this.streamFocusChunkY)
      );
      if (distance > CHUNK_UNLOAD_RADIUS && focusDistance > CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS) {
        chunk.destroy();
        this.chunks.delete(key);
      }
    });
  }
}

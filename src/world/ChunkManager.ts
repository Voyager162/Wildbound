import Phaser from 'phaser';
import { AmbientParticleManager, type NightAmbientLight } from './AmbientParticleManager';
import {
  AMBIENT_CHUNK_RADIUS_X,
  AMBIENT_CHUNK_RADIUS_Y,
} from './explorationConfig';
import {
  AMBIENT_PARTICLE_RENDER_INTERVAL_MS,
  WATER_SURFACE_UPDATE_INTERVAL_MS,
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
import {
  GROUND_GRASS_PRELOAD_RADIUS_X,
  GROUND_GRASS_PRELOAD_RADIUS_Y,
  GROUND_GRASS_RENDER_RADIUS_X,
  GROUND_GRASS_RENDER_RADIUS_Y
} from './groundGrassConfig';
import { LandmarkManager } from './LandmarkManager';
import { SwampWaterDecorationManager } from './SwampWaterDecorationManager';
import { caveMouthCenter, type CaveEntrance } from './caves/caveGenerator';
import { type TerrainFeature, type TerrainFeatureType } from './generation/featureGenerator';
import { sampleTopography, type TopographySample } from './generation/topographyGenerator';
import { SessionWorldState } from './SessionWorldState';
import { WorldChunk } from './WorldChunk';
import {
  CHUNK_LOAD_RADIUS,
  CHUNK_SIZE_PIXELS,
  CHUNK_SIZE_TILES,
  WORLD_TILE_SIZE,
  CHUNK_UNLOAD_RADIUS,
  worldToChunk
} from './worldConfig';

interface PendingChunk {
  x: number;
  y: number;
  priority: number;
}

export interface ChunkPrimeProgress {
  readonly completed: number;
  readonly total: number;
}

export interface NearbyTerrainFeature {
  readonly tileX: number;
  readonly tileY: number;
  readonly feature: TerrainFeatureType;
}

export class ChunkManager {
  private readonly chunks = new Map<string, WorldChunk>();
  private readonly pendingChunkCoordinates: PendingChunk[] = [];
  private readonly pendingChunks = new Map<string, PendingChunk>();
  private readonly pendingChunkBuilds = new Map<string, Promise<void>>();
  private destroyed = false;
  private activeChunkX = Number.NaN;
  private activeChunkY = Number.NaN;
  private streamFocusChunkX = Number.NaN;
  private streamFocusChunkY = Number.NaN;
  private lastPlayerWorldX = Number.NaN;
  private lastPlayerWorldY = Number.NaN;
  private lastPlayerSampleTime = Number.NaN;
  private lastPrefetchSignature = '';
  private lastWaterAnimationTime = Number.NEGATIVE_INFINITY;
  private lastWaterSurfaceTime = Number.NEGATIVE_INFINITY;
  private lastAmbientParticleTime = Number.NEGATIVE_INFINITY;
  private lastFoliageUpdateTime = Number.NEGATIVE_INFINITY;
  private lastChunkBuildTime = Number.NEGATIVE_INFINITY;
  private readonly ambientParticleManager: AmbientParticleManager;
  private readonly landmarkManager: LandmarkManager;
  private readonly swampWaterDecorationManager: SwampWaterDecorationManager;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly seed: string,
    private readonly sessionState: SessionWorldState
  ) {
    this.ambientParticleManager = new AmbientParticleManager(scene, seed);
    this.landmarkManager = new LandmarkManager(scene, seed);
    this.swampWaterDecorationManager = new SwampWaterDecorationManager(scene, seed);
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

  // Prepare the first terrain window before the scene accepts input. A complete chunk is a
  // detailed canvas bake, so yielding between chunks avoids a visible train of regular stalls
  // immediately after loading while keeping exactly the same deterministic terrain output.
  async prime(
    playerWorldX: number,
    playerWorldY: number,
    onProgress?: (progress: ChunkPrimeProgress) => void
  ): Promise<void> {
    const time = performance.now();
    this.activeChunkX = worldToChunk(playerWorldX);
    this.activeChunkY = worldToChunk(playerWorldY);
    this.updateStreamFocus(playerWorldX, playerWorldY, time);
    this.queueVisibleChunks();
    this.queueNearbyChunks();
    this.queueGroundGrassPreloadChunks();
    this.queuePrefetchChunks(playerWorldX, playerWorldY);
    this.landmarkManager.update(this.activeChunkX, this.activeChunkY);
    this.swampWaterDecorationManager.prime(this.activeChunkX, this.activeChunkY);
    // The initial queue is fixed while the player is still locked in place, which gives the
    // loading screen a truthful, deterministic total rather than a cosmetic timer.
    const initialChunkCount = this.pendingChunkCoordinates.length + this.pendingChunkBuilds.size;
    const reportProgress = (): void => {
      const remaining = this.pendingChunkCoordinates.length + this.pendingChunkBuilds.size;
      onProgress?.({
        completed: Math.max(0, initialChunkCount - remaining),
        total: Math.max(1, initialChunkCount)
      });
    };
    reportProgress();
    while (this.pendingChunkCoordinates.length > 0 || this.pendingChunkBuilds.size > 0) {
      this.processPendingChunks(performance.now(), CHUNK_STREAM_INITIAL_BUILD_COUNT, true);
      reportProgress();
      if (this.pendingChunkCoordinates.length > 0 || this.pendingChunkBuilds.size > 0) {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }
    reportProgress();
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
    this.queueGroundGrassPreloadChunks();
    this.queuePrefetchChunks(playerWorldX, playerWorldY);
    this.unloadDistantChunks();
    this.landmarkManager.update(this.activeChunkX, this.activeChunkY);
    this.processPendingChunks(time);
    this.updateChunkRenderVisibility();
  }

  updateWaterAnimation(time: number): void {
    if (time - this.lastWaterSurfaceTime >= WATER_SURFACE_UPDATE_INTERVAL_MS) {
      this.lastWaterSurfaceTime = time;
      this.forEachNearbyChunk(AMBIENT_CHUNK_RADIUS_X, AMBIENT_CHUNK_RADIUS_Y, (chunk) => {
        chunk.updateWaterSurfaceMotion(time);
      });
    }

    if (time - this.lastWaterAnimationTime < WATER_RIPPLE_UPDATE_INTERVAL_MS) {
      return;
    }

    this.lastWaterAnimationTime = time;
    this.forEachNearbyChunk(AMBIENT_CHUNK_RADIUS_X, AMBIENT_CHUNK_RADIUS_Y, (chunk) => {
      chunk.updateWaterAnimation(time);
    });
  }

  updateAmbient(time: number, playerWorldX: number, playerWorldY: number, nightAmount: number): void {
    if (time - this.lastAmbientParticleTime >= AMBIENT_PARTICLE_RENDER_INTERVAL_MS) {
      this.lastAmbientParticleTime = time;
      this.ambientParticleManager.update(time, playerWorldX, playerWorldY, nightAmount);
    }
  }

  updateFoliage(time: number): void {
    // Each chunk also uses this cadence to select its current animation frame. Calling every
    // rendered frame only repeats frame-boundary checks across all loaded chunks.
    if (time - this.lastFoliageUpdateTime < 16) {
      return;
    }
    this.lastFoliageUpdateTime = time;
    this.forEachNearbyChunk(CHUNK_RENDER_RADIUS_X, CHUNK_RENDER_RADIUS_Y, (chunk) => {
      chunk.updateFoliage(time);
    });
  }

  updateSwampWaterDecorations(
    time: number,
    deltaMs: number,
    playerWorldX: number,
    playerWorldY: number,
    playerVelocityX: number,
    playerVelocityY: number,
    playerIsSwimming: boolean
  ): void {
    this.swampWaterDecorationManager.update(
      time,
      deltaMs,
      this.activeChunkX,
      this.activeChunkY,
      playerWorldX,
      playerWorldY,
      playerVelocityX,
      playerVelocityY,
      playerIsSwimming
    );
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

  // Surface features are generated independently from caves, so ask the loaded terrain chunk
  // whether its cave formation occupies this tile before offering a harvest interaction.
  isCaveFormationAtTile(tileX: number, tileY: number): boolean {
    const chunkX = Math.floor(tileX / CHUNK_SIZE_TILES);
    const chunkY = Math.floor(tileY / CHUNK_SIZE_TILES);
    return this.chunks.get(`${chunkX},${chunkY}`)?.coversCaveFormationAtTile(tileX, tileY) ?? false;
  }

  findNearbyCaveEntrance(worldX: number, worldY: number, radiusPixels: number): CaveEntrance | null {
    let nearest: CaveEntrance | null = null;
    let nearestDistanceSquared = radiusPixels * radiusPixels;
    const firstChunkX = Math.floor((worldX - radiusPixels) / CHUNK_SIZE_PIXELS);
    const lastChunkX = Math.floor((worldX + radiusPixels) / CHUNK_SIZE_PIXELS);
    const firstChunkY = Math.floor((worldY - radiusPixels) / CHUNK_SIZE_PIXELS);
    const lastChunkY = Math.floor((worldY + radiusPixels) / CHUNK_SIZE_PIXELS);
    for (let chunkY = firstChunkY; chunkY <= lastChunkY; chunkY += 1) {
      for (let chunkX = firstChunkX; chunkX <= lastChunkX; chunkX += 1) {
        const chunk = this.chunks.get(`${chunkX},${chunkY}`);
        if (!chunk) {
          continue;
        }
        chunk.getCaveEntrances().forEach((entrance) => {
          const mouth = caveMouthCenter(entrance);
          const distanceSquared = Phaser.Math.Distance.Squared(worldX, worldY, mouth.x, mouth.y);
          if (distanceSquared < nearestDistanceSquared) {
            nearest = entrance;
            nearestDistanceSquared = distanceSquared;
          }
        });
      }
    }
    return nearest;
  }

  findNearbyFeature(
    worldX: number,
    worldY: number,
    radiusPixels: number,
    isAvailable: (tileX: number, tileY: number) => boolean
  ): NearbyTerrainFeature | null {
    const firstChunkX = Math.floor((worldX - radiusPixels) / CHUNK_SIZE_PIXELS);
    const lastChunkX = Math.floor((worldX + radiusPixels) / CHUNK_SIZE_PIXELS);
    const firstChunkY = Math.floor((worldY - radiusPixels) / CHUNK_SIZE_PIXELS);
    const lastChunkY = Math.floor((worldY + radiusPixels) / CHUNK_SIZE_PIXELS);
    const radiusSquared = radiusPixels * radiusPixels;
    let nearest: NearbyTerrainFeature | null = null;
    let nearestDistanceSquared = Infinity;
    for (let chunkY = firstChunkY; chunkY <= lastChunkY; chunkY += 1) {
      for (let chunkX = firstChunkX; chunkX <= lastChunkX; chunkX += 1) {
        const chunk = this.chunks.get(`${chunkX},${chunkY}`);
        if (!chunk) {
          continue;
        }
        chunk.getFeatures().forEach((feature: TerrainFeature) => {
          const tileX = chunkX * CHUNK_SIZE_TILES + feature.localTileX;
          const tileY = chunkY * CHUNK_SIZE_TILES + feature.localTileY;
          if (!isAvailable(tileX, tileY)) {
            return;
          }
          const featureWorldX = (tileX + 0.5) * WORLD_TILE_SIZE;
          const featureWorldY = (tileY + 0.5) * WORLD_TILE_SIZE;
          const distanceSquared = Phaser.Math.Distance.Squared(worldX, worldY, featureWorldX, featureWorldY);
          if (distanceSquared <= radiusSquared && distanceSquared < nearestDistanceSquared) {
            nearest = { tileX, tileY, feature: feature.type };
            nearestDistanceSquared = distanceSquared;
          }
        });
      }
    }
    return nearest;
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
    this.destroyed = true;
    this.chunks.forEach((chunk) => chunk.destroy());
    this.chunks.clear();
    this.pendingChunkCoordinates.length = 0;
    this.pendingChunks.clear();
    this.pendingChunkBuilds.clear();
    this.ambientParticleManager.destroy();
    this.landmarkManager.destroy();
    this.swampWaterDecorationManager.destroy();
  }

  private queueNearbyChunks(): void {
    this.queueChunkNeighborhood(this.activeChunkX, this.activeChunkY);
    this.sortPendingChunks();
  }

  private forEachNearbyChunk(
    radiusX: number,
    radiusY: number,
    visitor: (chunk: WorldChunk) => void
  ): void {
    for (let y = this.activeChunkY - radiusY; y <= this.activeChunkY + radiusY; y += 1) {
      for (let x = this.activeChunkX - radiusX; x <= this.activeChunkX + radiusX; x += 1) {
        const chunk = this.chunks.get(`${x},${y}`);
        if (chunk) {
          visitor(chunk);
        }
      }
    }
  }

  private queueGroundGrassPreloadChunks(): void {
    for (let y = this.activeChunkY - GROUND_GRASS_PRELOAD_RADIUS_Y; y <= this.activeChunkY + GROUND_GRASS_PRELOAD_RADIUS_Y; y += 1) {
      for (let x = this.activeChunkX - GROUND_GRASS_PRELOAD_RADIUS_X; x <= this.activeChunkX + GROUND_GRASS_PRELOAD_RADIUS_X; x += 1) {
        const distance = Math.abs(x - this.activeChunkX) + Math.abs(y - this.activeChunkY);
        // These are generated just after the immediate terrain window. They are still well ahead
        // of a normal player's arrival, but never compete with a missing visible terrain chunk.
        this.queueChunk(x, y, -48 + distance);
      }
    }
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
    if (this.chunks.has(key) || this.pendingChunkBuilds.has(key)) {
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
      if (
        (distance > CHUNK_UNLOAD_RADIUS && focusDistance > CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS)
        || this.chunks.has(key)
        || this.pendingChunkBuilds.has(key)
      ) {
        continue;
      }

      const build = WorldChunk.create(this.scene, this.seed, this.sessionState, coordinate.x, coordinate.y)
        .then((chunk) => {
          // A player can leave the request window while the worker is baking. Discard its
          // finished scene objects instead of allowing obsolete chunks to pop into memory.
          if (this.destroyed || this.chunks.has(key)) {
            chunk.destroy();
            return;
          }

          const completedDistance = Math.max(
            Math.abs(coordinate.x - this.activeChunkX),
            Math.abs(coordinate.y - this.activeChunkY)
          );
          const completedFocusDistance = Math.max(
            Math.abs(coordinate.x - this.streamFocusChunkX),
            Math.abs(coordinate.y - this.streamFocusChunkY)
          );
          if (
            completedDistance > CHUNK_UNLOAD_RADIUS
            && completedFocusDistance > CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS
          ) {
            chunk.destroy();
            return;
          }

          chunk.setRenderVisible(this.isWithinRenderWindow(coordinate.x, coordinate.y));
          chunk.setGroundGrassVisible(this.isWithinForegroundWindow(coordinate.x, coordinate.y));
          this.chunks.set(key, chunk);
        })
        .catch((error: unknown) => {
          console.error(`Wildbound could not build terrain chunk ${key}.`, error);
        })
        .finally(() => {
          this.pendingChunkBuilds.delete(key);
        });
      this.pendingChunkBuilds.set(key, build);
      built += 1;
    }
  }

  private updateChunkRenderVisibility(): void {
    this.chunks.forEach((chunk) => {
      chunk.setRenderVisible(this.isWithinRenderWindow(chunk.x, chunk.y));
      chunk.setGroundGrassVisible(this.isWithinForegroundWindow(chunk.x, chunk.y));
    });
  }

  private isWithinRenderWindow(chunkX: number, chunkY: number): boolean {
    return Math.abs(chunkX - this.activeChunkX) <= CHUNK_RENDER_RADIUS_X
      && Math.abs(chunkY - this.activeChunkY) <= CHUNK_RENDER_RADIUS_Y;
  }

  private isWithinForegroundWindow(chunkX: number, chunkY: number): boolean {
    return Math.abs(chunkX - this.activeChunkX) <= GROUND_GRASS_RENDER_RADIUS_X
      && Math.abs(chunkY - this.activeChunkY) <= GROUND_GRASS_RENDER_RADIUS_Y;
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

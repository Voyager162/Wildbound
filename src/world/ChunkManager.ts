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
  CHUNK_STREAM_MAX_CONCURRENT_BUILDS,
  CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS,
  CHUNK_STREAM_VISIBLE_RADIUS_X,
  CHUNK_STREAM_VISIBLE_RADIUS_Y,
  GROUND_GRASS_BUILD_INTERVAL_MS,
  GROUND_GRASS_BUILD_TILES_PER_TICK,
  GROUND_GRASS_INITIAL_BUILD_TILES_PER_TICK
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
import type { GameSettings } from '../settings/GameSettings';

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
  private readonly pendingChunkDisposals: WorldChunk[] = [];
  private destroyed = false;
  private chunkDisposalScheduled = false;
  private activeChunkX = Number.NaN;
  private activeChunkY = Number.NaN;
  private streamFocusChunkX = Number.NaN;
  private streamFocusChunkY = Number.NaN;
  private presentationFocusChunkX = Number.NaN;
  private presentationFocusChunkY = Number.NaN;
  private lastPlayerWorldX = Number.NaN;
  private lastPlayerWorldY = Number.NaN;
  private lastPlayerSampleTime = Number.NaN;
  private lastPrefetchSignature = '';
  private lastWaterAnimationTime = Number.NEGATIVE_INFINITY;
  private lastWaterSurfaceTime = Number.NEGATIVE_INFINITY;
  private lastAmbientParticleTime = Number.NEGATIVE_INFINITY;
  private lastFoliageUpdateTime = Number.NEGATIVE_INFINITY;
  private lastGroundGrassBuildTime = Number.NEGATIVE_INFINITY;
  private lastChunkBuildTime = Number.NEGATIVE_INFINITY;
  private lastGroundGrassPreloadSignature = '';
  private chunkGenerationRadius = CHUNK_LOAD_RADIUS;
  private chunkUnloadRadius = CHUNK_UNLOAD_RADIUS;
  private chunkBuildBudget = CHUNK_STREAM_BUILDS_PER_TICK;
  private chunkBuildIntervalMs = CHUNK_STREAM_BUILD_INTERVAL_MS;
  private foliageUpdateIntervalMs = 16;
  private ambientEffectUpdateIntervalMs = AMBIENT_PARTICLE_RENDER_INTERVAL_MS;
  private waterSurfaceUpdateIntervalMs = WATER_SURFACE_UPDATE_INTERVAL_MS;
  private waterRippleUpdateIntervalMs = WATER_RIPPLE_UPDATE_INTERVAL_MS;
  private foliageAnimationEnabled = true;
  private waterAnimationEnabled = true;
  private groundGrassEnabled = true;
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

  get pendingChunkCount(): number {
    return this.pendingChunkCoordinates.length + this.pendingChunkBuilds.size;
  }

  get pendingGroundGrassChunkCount(): number {
    return Array.from(this.chunks.values()).filter((chunk) => chunk.hasPendingGroundGrassBuild).length;
  }

  get loadedLandmarkCount(): number {
    return this.landmarkManager.loadedLandmarkCount;
  }

  applyVideoSettings(video: GameSettings['video']): void {
    const nextRadius = video.performance.chunkGenerationRadius;
    const rangeChanged = nextRadius !== this.chunkGenerationRadius;
    const grassEnabledChanged = video.quality.showGroundGrass !== this.groundGrassEnabled;
    this.chunkGenerationRadius = nextRadius;
    this.foliageAnimationEnabled = video.quality.animateFoliage;
    this.waterAnimationEnabled = video.quality.animateWater;
    this.groundGrassEnabled = video.quality.showGroundGrass;
    this.chunkUnloadRadius = Math.max(
      nextRadius + 1,
      this.groundGrassEnabled
        ? Math.max(this.groundGrassPreloadRadiusX(), this.groundGrassPreloadRadiusY())
        : Math.max(CHUNK_STREAM_VISIBLE_RADIUS_X, CHUNK_STREAM_VISIBLE_RADIUS_Y)
    );
    this.foliageUpdateIntervalMs = Math.max(1, Math.floor(1000 / video.performance.foliageUpdateRate));
    this.ambientEffectUpdateIntervalMs = Math.max(1, Math.round(1000 / video.performance.ambientEffectsUpdateRate));
    const waterRateScale = 30 / video.performance.waterAnimationUpdateRate;
    this.waterSurfaceUpdateIntervalMs = Math.max(1, Math.round(WATER_SURFACE_UPDATE_INTERVAL_MS * waterRateScale));
    this.waterRippleUpdateIntervalMs = Math.max(1, Math.round(WATER_RIPPLE_UPDATE_INTERVAL_MS * waterRateScale));
    switch (video.performance.chunkStreamingPace) {
      case 'gentle':
        this.chunkBuildBudget = 1;
        this.chunkBuildIntervalMs = 320;
        break;
      case 'rapid':
        this.chunkBuildBudget = 3;
        this.chunkBuildIntervalMs = 55;
        break;
      default:
        this.chunkBuildBudget = CHUNK_STREAM_BUILDS_PER_TICK;
        this.chunkBuildIntervalMs = CHUNK_STREAM_BUILD_INTERVAL_MS;
        break;
    }
    this.ambientParticleManager.setParticleStrength(video.quality.particleStrength);
    this.swampWaterDecorationManager.setEnabled(video.quality.showSwampDecorations);
    this.updateChunkRenderVisibility();

    if ((rangeChanged || grassEnabledChanged) && Number.isFinite(this.activeChunkX) && Number.isFinite(this.activeChunkY)) {
      this.queueNearbyChunks();
      if (this.groundGrassEnabled) {
        this.queueGroundGrassPreloadChunks();
      }
      if (Number.isFinite(this.lastPlayerWorldX) && Number.isFinite(this.lastPlayerWorldY)) {
        this.queuePrefetchChunks(this.lastPlayerWorldX, this.lastPlayerWorldY);
      }
      this.unloadDistantChunks();
    }
  }

  /** Re-evaluate grass coverage when the viewport changes without touching deterministic world data. */
  handleViewportChanged(): void {
    if (!Number.isFinite(this.activeChunkX) || !Number.isFinite(this.activeChunkY)) {
      return;
    }
    this.chunkUnloadRadius = Math.max(
      this.chunkGenerationRadius + 1,
      this.groundGrassEnabled
        ? Math.max(this.groundGrassPreloadRadiusX(), this.groundGrassPreloadRadiusY())
        : Math.max(CHUNK_STREAM_VISIBLE_RADIUS_X, CHUNK_STREAM_VISIBLE_RADIUS_Y)
    );
    this.lastGroundGrassPreloadSignature = '';
    this.queueGroundGrassPreloadChunks();
    if (Number.isFinite(this.lastPlayerWorldX) && Number.isFinite(this.lastPlayerWorldY)) {
      this.queuePrefetchChunks(this.lastPlayerWorldX, this.lastPlayerWorldY);
    }
    this.updateChunkRenderVisibility();
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
    // Keep the loading overlay up until the complete camera-sized grass presentation window is
    // assembled. That removes the first visible grass grow-in after controls are enabled.
    while (this.groundGrassEnabled && !this.isPresentationReadyAt(playerWorldX, playerWorldY)) {
      this.processGroundGrassBuilds(performance.now(), GROUND_GRASS_INITIAL_BUILD_TILES_PER_TICK, true);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
    this.updateChunkRenderVisibility();
  }

  update(playerWorldX: number, playerWorldY: number, time = performance.now()): void {
    this.updateStreamFocus(playerWorldX, playerWorldY, time);
    const nextChunkX = worldToChunk(playerWorldX);
    const nextChunkY = worldToChunk(playerWorldY);

    if (nextChunkX === this.activeChunkX && nextChunkY === this.activeChunkY) {
      this.queueGroundGrassPreloadChunks();
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

  // Promote the next camera window before a movement step crosses into it. Terrain requests
  // still bake asynchronously. Movement only waits for the immediate destination chunk, rather
  // than the entire future camera window: the latter can include distant grass work and caused
  // held input to feel like it had stalled at otherwise-ready chunk borders.
  canEnterPosition(worldX: number, worldY: number, time = performance.now()): boolean {
    const chunkX = worldToChunk(worldX);
    const chunkY = worldToChunk(worldY);
    if (chunkX === this.activeChunkX && chunkY === this.activeChunkY) {
      return true;
    }

    const focusChanged = chunkX !== this.presentationFocusChunkX || chunkY !== this.presentationFocusChunkY;
    this.presentationFocusChunkX = chunkX;
    this.presentationFocusChunkY = chunkY;
    if (focusChanged) {
      // Existing cached chunks may not have needed grass while they were outside the previous
      // preload window. Mark the requested window before checking readiness.
      this.updateChunkRenderVisibility();
    }
    this.queuePresentationWindow(chunkX, chunkY);
    this.queueGroundGrassPreloadChunks();
    this.sortPendingChunks();
    this.processPendingChunks(time);
    const ready = this.isEntryChunkReady(chunkX, chunkY);
    if (ready) {
      this.presentationFocusChunkX = Number.NaN;
      this.presentationFocusChunkY = Number.NaN;
    }
    return ready;
  }

  updateWaterAnimation(time: number): void {
    if (!this.waterAnimationEnabled) {
      return;
    }
    if (time - this.lastWaterSurfaceTime >= this.waterSurfaceUpdateIntervalMs) {
      this.lastWaterSurfaceTime = time;
      this.forEachNearbyChunk(AMBIENT_CHUNK_RADIUS_X, AMBIENT_CHUNK_RADIUS_Y, (chunk) => {
        chunk.updateWaterSurfaceMotion(time);
      });
    }

    if (time - this.lastWaterAnimationTime < this.waterRippleUpdateIntervalMs) {
      return;
    }

    this.lastWaterAnimationTime = time;
    this.forEachNearbyChunk(AMBIENT_CHUNK_RADIUS_X, AMBIENT_CHUNK_RADIUS_Y, (chunk) => {
      chunk.updateWaterAnimation(time);
    });
  }

  updateAmbient(time: number, playerWorldX: number, playerWorldY: number, nightAmount: number): void {
    if (time - this.lastAmbientParticleTime >= this.ambientEffectUpdateIntervalMs) {
      this.lastAmbientParticleTime = time;
      this.ambientParticleManager.update(time, playerWorldX, playerWorldY, nightAmount);
    }
  }

  updateFoliage(time: number): void {
    this.processGroundGrassBuilds(time);
    if (!this.foliageAnimationEnabled) {
      return;
    }
    // Each chunk also uses this cadence to select its current animation frame. Calling every
    // rendered frame only repeats frame-boundary checks across all loaded chunks.
    if (time - this.lastFoliageUpdateTime < this.foliageUpdateIntervalMs) {
      return;
    }
    this.lastFoliageUpdateTime = time;
    // Keep frame swaps to the actual camera presentation window. Distant chunks retain their
    // complete baked feature art, so omitting their off-screen foliage updates is purely a
    // performance win and does not alter what is visible.
    this.forEachNearbyChunk(this.groundGrassRenderRadiusX(), this.groundGrassRenderRadiusY(), (chunk) => {
      chunk.updateFoliage(time, this.foliageAnimationEnabled);
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
    this.pendingChunkDisposals.forEach((chunk) => chunk.destroy());
    this.pendingChunkDisposals.length = 0;
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
    if (!this.groundGrassEnabled) {
      return;
    }
    const radiusX = this.groundGrassPreloadRadiusX();
    const radiusY = this.groundGrassPreloadRadiusY();
    const centers: Array<readonly [number, number, number]> = [[this.activeChunkX, this.activeChunkY, -48]];
    if (Number.isFinite(this.streamFocusChunkX) && Number.isFinite(this.streamFocusChunkY)) {
      centers.push([this.streamFocusChunkX, this.streamFocusChunkY, -52]);
    }
    if (Number.isFinite(this.presentationFocusChunkX) && Number.isFinite(this.presentationFocusChunkY)) {
      centers.push([this.presentationFocusChunkX, this.presentationFocusChunkY, -120]);
    }
    const signature = `${radiusX},${radiusY}|${centers.map(([x, y]) => `${x},${y}`).join('|')}`;
    if (signature === this.lastGroundGrassPreloadSignature) {
      return;
    }
    this.lastGroundGrassPreloadSignature = signature;

    centers.forEach(([centerX, centerY, basePriority]) => {
      for (let y = centerY - radiusY; y <= centerY + radiusY; y += 1) {
        for (let x = centerX - radiusX; x <= centerX + radiusX; x += 1) {
          const distance = Math.abs(x - centerX) + Math.abs(y - centerY);
          // The presentation window remains first; directional preload work is deliberately
          // lower priority so it can never delay terrain that is already on screen.
          this.queueChunk(x, y, basePriority + distance);
        }
      }
    });
    // A chunk can have been baked before it entered this predictive window. Opt it into grass
    // preparation now rather than waiting until the player reaches that terrain.
    this.updateChunkRenderVisibility();
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
    for (let y = centerChunkY - this.chunkGenerationRadius; y <= centerChunkY + this.chunkGenerationRadius; y += 1) {
      for (let x = centerChunkX - this.chunkGenerationRadius; x <= centerChunkX + this.chunkGenerationRadius; x += 1) {
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

  private queuePresentationWindow(centerChunkX: number, centerChunkY: number): void {
    const radiusX = this.groundGrassEnabled
      ? Math.max(CHUNK_STREAM_VISIBLE_RADIUS_X, this.groundGrassRenderRadiusX())
      : CHUNK_STREAM_VISIBLE_RADIUS_X;
    const radiusY = this.groundGrassEnabled
      ? Math.max(CHUNK_STREAM_VISIBLE_RADIUS_Y, this.groundGrassRenderRadiusY())
      : CHUNK_STREAM_VISIBLE_RADIUS_Y;
    for (let y = centerChunkY - radiusY; y <= centerChunkY + radiusY; y += 1) {
      for (let x = centerChunkX - radiusX; x <= centerChunkX + radiusX; x += 1) {
        const distance = Math.max(Math.abs(x - centerChunkX), Math.abs(y - centerChunkY));
        this.queueChunk(x, y, -240 + distance);
      }
    }
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
    buildBudget = this.chunkBuildBudget,
    force = false
  ): void {
    if (!force && time - this.lastChunkBuildTime < this.chunkBuildIntervalMs) {
      return;
    }

    const availableBuilds = Math.max(0, CHUNK_STREAM_MAX_CONCURRENT_BUILDS - this.pendingChunkBuilds.size);
    if (availableBuilds === 0) {
      return;
    }

    this.lastChunkBuildTime = time;
    let built = 0;
    const allowedBuilds = Math.min(buildBudget, availableBuilds);
    while (built < allowedBuilds && this.pendingChunkCoordinates.length > 0) {
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
      const presentationDistance = this.presentationFocusDistance(coordinate.x, coordinate.y);
      if (
        (distance > this.chunkUnloadRadius
          && focusDistance > CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS
          && presentationDistance > Math.max(CHUNK_STREAM_VISIBLE_RADIUS_X, CHUNK_STREAM_VISIBLE_RADIUS_Y))
        || this.chunks.has(key)
        || this.pendingChunkBuilds.has(key)
      ) {
        continue;
      }

      const build = WorldChunk.create(this.scene, this.seed, this.sessionState, coordinate.x, coordinate.y, !force)
        .then((chunk) => {
          // A player can leave the request window while the worker is baking. Discard its
          // finished scene objects instead of allowing obsolete chunks to pop into memory.
          if (this.destroyed || this.chunks.has(key)) {
            this.deferChunkDisposal(chunk);
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
          const completedPresentationDistance = this.presentationFocusDistance(coordinate.x, coordinate.y);
          if (
            completedDistance > this.chunkUnloadRadius
            && completedFocusDistance > CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS
            && completedPresentationDistance > Math.max(CHUNK_STREAM_VISIBLE_RADIUS_X, CHUNK_STREAM_VISIBLE_RADIUS_Y)
          ) {
            this.deferChunkDisposal(chunk);
            return;
          }

          this.chunks.set(key, chunk);
          this.configureChunkPresentation(chunk);
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
      this.configureChunkPresentation(chunk);
    });
  }

  private configureChunkPresentation(chunk: WorldChunk): void {
    const shouldPreloadGroundGrass = this.groundGrassEnabled && this.isWithinGroundGrassPreloadWindow(chunk.x, chunk.y);
    chunk.setGroundGrassPreloadEnabled(shouldPreloadGroundGrass);
    chunk.setRenderVisible(this.isWithinRenderWindow(chunk.x, chunk.y));
    chunk.setGroundGrassVisible(
      this.groundGrassEnabled
      && this.isWithinForegroundWindow(chunk.x, chunk.y)
      && chunk.isGroundGrassReady
    );
  }

  // Grass uses individual animated sprites, so it is prepared in compact deterministic batches
  // while still outside the foreground. We finish one predicted chunk at a time; that makes the
  // next camera window complete well before the player can reach it.
  private processGroundGrassBuilds(
    time: number,
    tileBudget = GROUND_GRASS_BUILD_TILES_PER_TICK,
    force = false
  ): boolean {
    if (!this.groundGrassEnabled || (!force && time - this.lastGroundGrassBuildTime < GROUND_GRASS_BUILD_INTERVAL_MS)) {
      return false;
    }

    const candidates = new Map<string, WorldChunk>();
    const preloadRadiusX = this.groundGrassPreloadRadiusX();
    const preloadRadiusY = this.groundGrassPreloadRadiusY();
    const centers = new Map<string, readonly [number, number]>();
    const addCenter = (x: number, y: number): void => {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        centers.set(`${x},${y}`, [x, y]);
      }
    };
    addCenter(this.presentationFocusChunkX, this.presentationFocusChunkY);
    addCenter(this.activeChunkX, this.activeChunkY);
    addCenter(this.streamFocusChunkX, this.streamFocusChunkY);
    centers.forEach(([centerX, centerY]) => {
      for (let y = centerY - preloadRadiusY; y <= centerY + preloadRadiusY; y += 1) {
        for (let x = centerX - preloadRadiusX; x <= centerX + preloadRadiusX; x += 1) {
          const chunk = this.chunks.get(`${x},${y}`);
          if (chunk?.hasPendingGroundGrassBuild) {
            candidates.set(chunk.key, chunk);
          }
        }
      }
    });
    const orderedCandidates = Array.from(candidates.values())
      .sort((first, second) => this.groundGrassPriority(first) - this.groundGrassPriority(second));
    const chunk = orderedCandidates[0];
    if (!chunk) {
      return false;
    }

    this.lastGroundGrassBuildTime = time;
    chunk.buildGroundGrassBatch(time, tileBudget);
    if (!chunk.hasPendingGroundGrassBuild) {
      this.configureChunkPresentation(chunk);
    }
    return true;
  }

  // The fixed world-view target covers the common 16:9 display, but an ultrawide monitor can
  // expose more terrain at the same zoom. Derive the real camera footprint so grass coverage
  // always reaches the viewport edge instead of relying on a resolution-specific constant.
  private groundGrassRenderRadiusX(): number {
    const camera = this.scene.cameras.main;
    const worldWidth = camera.width / Math.max(0.001, camera.zoom);
    return Math.max(GROUND_GRASS_RENDER_RADIUS_X, Math.ceil(worldWidth / (CHUNK_SIZE_PIXELS * 2)));
  }

  private groundGrassRenderRadiusY(): number {
    const camera = this.scene.cameras.main;
    const worldHeight = camera.height / Math.max(0.001, camera.zoom);
    return Math.max(GROUND_GRASS_RENDER_RADIUS_Y, Math.ceil(worldHeight / (CHUNK_SIZE_PIXELS * 2)));
  }

  private groundGrassPreloadRadiusX(): number {
    return Math.max(GROUND_GRASS_PRELOAD_RADIUS_X, this.groundGrassRenderRadiusX() + 2);
  }

  private groundGrassPreloadRadiusY(): number {
    return Math.max(GROUND_GRASS_PRELOAD_RADIUS_Y, this.groundGrassRenderRadiusY() + 2);
  }

  private isWithinRenderWindow(chunkX: number, chunkY: number): boolean {
    return Math.abs(chunkX - this.activeChunkX) <= CHUNK_RENDER_RADIUS_X
      && Math.abs(chunkY - this.activeChunkY) <= CHUNK_RENDER_RADIUS_Y;
  }

  private isWithinForegroundWindow(chunkX: number, chunkY: number): boolean {
    return Math.abs(chunkX - this.activeChunkX) <= this.groundGrassRenderRadiusX()
      && Math.abs(chunkY - this.activeChunkY) <= this.groundGrassRenderRadiusY();
  }

  private isWithinGroundGrassPreloadWindow(chunkX: number, chunkY: number): boolean {
    const radiusX = this.groundGrassPreloadRadiusX();
    const radiusY = this.groundGrassPreloadRadiusY();
    const insideActiveWindow = Math.abs(chunkX - this.activeChunkX) <= radiusX
      && Math.abs(chunkY - this.activeChunkY) <= radiusY;
    const insideFocusWindow = Number.isFinite(this.streamFocusChunkX)
      && Math.abs(chunkX - this.streamFocusChunkX) <= radiusX
      && Math.abs(chunkY - this.streamFocusChunkY) <= radiusY;
    const insidePresentationWindow = Number.isFinite(this.presentationFocusChunkX)
      && Math.abs(chunkX - this.presentationFocusChunkX) <= radiusX
      && Math.abs(chunkY - this.presentationFocusChunkY) <= radiusY;
    return insideActiveWindow || insideFocusWindow || insidePresentationWindow;
  }

  private isPresentationReadyAt(worldX: number, worldY: number): boolean {
    const centerChunkX = worldToChunk(worldX);
    const centerChunkY = worldToChunk(worldY);
    const radiusX = this.groundGrassEnabled
      ? Math.max(CHUNK_STREAM_VISIBLE_RADIUS_X, this.groundGrassRenderRadiusX())
      : CHUNK_STREAM_VISIBLE_RADIUS_X;
    const radiusY = this.groundGrassEnabled
      ? Math.max(CHUNK_STREAM_VISIBLE_RADIUS_Y, this.groundGrassRenderRadiusY())
      : CHUNK_STREAM_VISIBLE_RADIUS_Y;
    for (let y = centerChunkY - radiusY; y <= centerChunkY + radiusY; y += 1) {
      for (let x = centerChunkX - radiusX; x <= centerChunkX + radiusX; x += 1) {
        const chunk = this.chunks.get(`${x},${y}`);
        if (!chunk || (this.groundGrassEnabled && !chunk.isGroundGrassReady)) {
          return false;
        }
      }
    }
    return true;
  }

  private isEntryChunkReady(chunkX: number, chunkY: number): boolean {
    const chunk = this.chunks.get(`${chunkX},${chunkY}`);
    return chunk !== undefined && (!this.groundGrassEnabled || chunk.isGroundGrassReady);
  }

  private groundGrassPriority(chunk: WorldChunk): number {
    const focusDistance = Math.max(
      Math.abs(chunk.x - this.streamFocusChunkX),
      Math.abs(chunk.y - this.streamFocusChunkY)
    );
    const activeDistance = Math.max(
      Math.abs(chunk.x - this.activeChunkX),
      Math.abs(chunk.y - this.activeChunkY)
    );
    const presentationDistance = this.presentationFocusDistance(chunk.x, chunk.y);
    // Finish the actual camera field first, then move through the velocity-derived focus. This
    // guarantees visible terrain never waits behind an off-screen grass batch.
    if (this.isWithinForegroundWindow(chunk.x, chunk.y)) {
      return -200 + activeDistance;
    }
    if (presentationDistance <= Math.max(this.groundGrassRenderRadiusX(), this.groundGrassRenderRadiusY())) {
      return -160 + presentationDistance;
    }
    return -80 + focusDistance * 0.7 + activeDistance * 0.3;
  }

  private presentationFocusDistance(chunkX: number, chunkY: number): number {
    if (!Number.isFinite(this.presentationFocusChunkX) || !Number.isFinite(this.presentationFocusChunkY)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(
      Math.abs(chunkX - this.presentationFocusChunkX),
      Math.abs(chunkY - this.presentationFocusChunkY)
    );
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
      const presentationDistance = this.presentationFocusDistance(chunk.x, chunk.y);
      if (distance > this.chunkUnloadRadius
        && focusDistance > CHUNK_STREAM_MAX_LOOKAHEAD_CHUNKS
        && presentationDistance > Math.max(CHUNK_STREAM_VISIBLE_RADIUS_X, CHUNK_STREAM_VISIBLE_RADIUS_Y)) {
        this.chunks.delete(key);
        this.deferChunkDisposal(chunk);
      }
    });
  }

  // Texture and sprite destruction can also take several milliseconds for a detailed chunk.
  // Removing the chunk from gameplay state is immediate; disposing of its Phaser objects waits
  // for idle time and is deliberately limited to one chunk per turn.
  private deferChunkDisposal(chunk: WorldChunk): void {
    if (this.destroyed) {
      chunk.destroy();
      return;
    }
    this.pendingChunkDisposals.push(chunk);
    this.deferChunkDisposalQueue();
  }

  private deferChunkDisposalQueue(): void {
    if (this.chunkDisposalScheduled || this.destroyed || this.pendingChunkDisposals.length === 0) {
      return;
    }
    this.chunkDisposalScheduled = true;
    window.requestAnimationFrame(() => {
      const disposeNext = (): void => {
        this.chunkDisposalScheduled = false;
        if (this.destroyed) {
          return;
        }
        this.pendingChunkDisposals.shift()?.destroy();
        if (this.pendingChunkDisposals.length > 0) {
          this.deferChunkDisposalQueue();
        }
      };
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(disposeNext, { timeout: 500 });
      } else {
        globalThis.setTimeout(disposeNext, 32);
      }
    });
  }
}

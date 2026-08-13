import Phaser from 'phaser';
import { Biome } from './generation/biomeGenerator';
import { generateChunkFeatures, type TerrainFeature, TerrainFeatureType } from './generation/featureGenerator';
import { TOPOGRAPHY_GENERATION_VERSION } from './generation/topographyGenerator';
import { randomAtTile } from './generation/noise';
import { surfaceAtTile, type TerrainSurface } from './generation/terrainGenerator';
import { SessionWorldState } from './SessionWorldState';
import {
  OCEAN_SURF_TRAVEL_PIXELS,
  OCEAN_WATER_CURRENT_PIXELS_PER_SECOND,
  SWAMP_WATER_CURRENT_PIXELS_PER_SECOND
} from './explorationConfig';
import { WATER_WAVES_PER_VISIBLE_CHUNK } from './ambientPerformanceConfig';
import {
  createAnimatedGroundGrassPatch,
  type AnimatedGroundGrassPatch,
  type GroundGrassPalette,
  updateAnimatedGroundGrassPatch
} from './GroundGrassAnimation';
import {
  createAnimatedFoliageSprite,
  destroyAnimatedFoliageSprite,
  isAnimatedFoliage,
  setAnimatedFoliageSpriteTransform,
  setAnimatedFoliageSpriteVisible,
  type AnimatedFoliageSprite,
  updateAnimatedFoliageSprite
} from './FoliageSpriteLibrary';
import {
  GROUND_GRASS_ANIMATION_FRAME_COUNT,
  GROUND_GRASS_ANIMATION_FRAME_MS,
  GROUND_GRASS_PATTERN_VARIANTS
} from './foliageAnimationConfig';
import {
  GROUND_GRASS_BASE_HEIGHT_PIXELS,
  GROUND_GRASS_FREQUENCY_SCALE,
  GROUND_GRASS_HEIGHT_VARIATION_PIXELS,
  GROUND_GRASS_SIZE_SCALE
} from './worldVisualConfig';
import { CHUNK_SIZE_PIXELS, CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from './worldConfig';

// Terrain is baked into one texture per chunk. The 8px visual cells retain detail while
// keeping the renderer to a single terrain draw call for each static chunk.
const VISUAL_TERRAIN_CELL_SIZE = 8;
const VISUAL_CELLS_PER_TILE = WORLD_TILE_SIZE / VISUAL_TERRAIN_CELL_SIZE;
const FEATURE_TEXTURE_PADDING = 128;
const FEATURE_TEXTURE_SIZE = CHUNK_SIZE_PIXELS + FEATURE_TEXTURE_PADDING * 2;
const WATER_MOTION_TEXTURE_SIZE = 192;

interface WaterWave {
  worldX: number;
  worldY: number;
  width: number;
  phase: number;
  speed: number;
  alpha: number;
  amplitude: number;
  shoreAmount: number;
  shoreNormalX: number;
  shoreNormalY: number;
}

interface AnimatedFeatureFoliage {
  sprite: AnimatedFoliageSprite;
}

export class WorldChunk {
  readonly key: string;
  private readonly textureKey: string;
  private readonly terrainImage: Phaser.GameObjects.Image;
  private readonly waterGraphics: Phaser.GameObjects.Graphics;
  private oceanWaterSurface: Phaser.GameObjects.TileSprite | null = null;
  private oceanWaterHighlights: Phaser.GameObjects.TileSprite | null = null;
  private swampWaterSurface: Phaser.GameObjects.TileSprite | null = null;
  private swampWaterHighlights: Phaser.GameObjects.TileSprite | null = null;
  private oceanWaterMaskImage: Phaser.GameObjects.Image | null = null;
  private swampWaterMaskImage: Phaser.GameObjects.Image | null = null;
  private readonly waterBitmapMasks: Phaser.Display.Masks.BitmapMask[] = [];
  private oceanWaterMaskTextureKey: string | null = null;
  private swampWaterMaskTextureKey: string | null = null;
  // Complex feature vectors are baked into one texture per chunk, avoiding per-frame Graphics triangulation.
  private readonly featureTextureKey: string;
  private readonly featureImage: Phaser.GameObjects.Image;
  private readonly featureGraphics: Phaser.GameObjects.Graphics;
  private readonly features: TerrainFeature[];
  private readonly animatedGroundGrass: AnimatedGroundGrassPatch[] = [];
  private readonly animatedFeatureFoliage = new Map<string, AnimatedFeatureFoliage>();
  private readonly waterWaves: WaterWave[] = [];
  private hasWater = false;
  private renderVisible = true;
  private groundGrassVisible = true;
  private lastGroundGrassFrame = Number.NEGATIVE_INFINITY;
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
    this.textureKey = `terrain:v${TOPOGRAPHY_GENERATION_VERSION}:${seed}:${x}:${y}`;
    const terrainTexture = scene.textures.createCanvas(this.textureKey, CHUNK_SIZE_PIXELS, CHUNK_SIZE_PIXELS);
    if (!terrainTexture) {
      throw new Error('Wildbound could not create a terrain texture.');
    }

    this.featureTextureKey = `features:v${TOPOGRAPHY_GENERATION_VERSION}:${seed}:${x}:${y}`;
    const featureTexture = scene.textures.createCanvas(this.featureTextureKey, FEATURE_TEXTURE_SIZE, FEATURE_TEXTURE_SIZE);
    if (!featureTexture) {
      throw new Error('Wildbound could not create a feature texture.');
    }
    this.terrainImage = scene.add.image(x * CHUNK_SIZE_PIXELS, y * CHUNK_SIZE_PIXELS, this.textureKey).setOrigin(0);
    this.waterGraphics = scene.add.graphics().setDepth(0.25);
    this.featureImage = scene.add
      .image(x * CHUNK_SIZE_PIXELS - FEATURE_TEXTURE_PADDING, y * CHUNK_SIZE_PIXELS - FEATURE_TEXTURE_PADDING, this.featureTextureKey)
      .setOrigin(0)
      .setDepth(1);
    // This is an off-screen scratch pad only. It is immediately baked into featureImage's texture.
    this.featureGraphics = scene.add.graphics().setVisible(false);
    this.features = generateChunkFeatures(seed, x, y);

    this.drawTerrain(terrainTexture);
    this.createAnimatedGroundGrass();
    this.refreshFeatures();
    this.updateFoliage(performance.now());
  }

  setRenderVisible(visible: boolean): void {
    if (this.renderVisible === visible) {
      return;
    }

    this.renderVisible = visible;
    this.terrainImage.setVisible(visible);
    this.waterGraphics.setVisible(visible);
    this.oceanWaterSurface?.setVisible(visible);
    this.oceanWaterHighlights?.setVisible(visible);
    this.swampWaterSurface?.setVisible(visible);
    this.swampWaterHighlights?.setVisible(visible);
    this.oceanWaterMaskImage?.setVisible(visible);
    this.swampWaterMaskImage?.setVisible(visible);
    this.animatedGroundGrass.forEach((patch) => patch.image.setVisible(visible && this.groundGrassVisible));
    this.featureImage.setVisible(visible);
    this.animatedFeatureFoliage.forEach(({ sprite }) => setAnimatedFoliageSpriteVisible(sprite, visible));
  }

  // Low grass does not need the same one-chunk-long distance buffer as tall trees and landmarks.
  // Keeping it to the true camera window dramatically limits animated sprites in dense plains.
  setGroundGrassVisible(visible: boolean): void {
    if (this.groundGrassVisible === visible) {
      return;
    }

    this.groundGrassVisible = visible;
    this.animatedGroundGrass.forEach((patch) => patch.image.setVisible(this.renderVisible && visible));
  }

  updateFoliage(time: number): void {
    if (!this.renderVisible) {
      return;
    }

    const grassFrame = Math.floor(time / GROUND_GRASS_ANIMATION_FRAME_MS);
    if (this.groundGrassVisible && grassFrame !== this.lastGroundGrassFrame) {
      this.lastGroundGrassFrame = grassFrame;
      this.animatedGroundGrass.forEach((patch) => updateAnimatedGroundGrassPatch(patch, time));
    }
    this.animatedFeatureFoliage.forEach(({ sprite }) => updateAnimatedFoliageSprite(sprite, time));
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

  updateWaterAnimation(time: number): void {
    if (!this.hasWater || !this.renderVisible) {
      return;
    }

    const seconds = time / 1000;
    const graphics = this.waterGraphics;
    graphics.clear();

    // The wave field is deterministic, but every crest travels at a slightly different speed.
    // Redrawing only nearby chunks gives water a visible directional current without touching
    // the baked terrain texture or allocating sprites per tile. Swamp samples never enter this
    // list, keeping their pools calm while oceans have broad flow bands, ripples, and foam.
    this.waterWaves.forEach((wave) => {
      const cycle = seconds * wave.speed + wave.phase;
      let currentX = Math.sin(cycle) * wave.amplitude + Math.cos(cycle * 0.42) * wave.amplitude * 0.62;
      let currentY = Math.cos(cycle * 1.37) * 2.45 + Math.sin(cycle * 0.62) * 1.45;
      const swell = (Math.sin(cycle * 1.8) + 1) * 0.5;
      const crestAlpha = wave.alpha * (0.5 + swell * 0.46);
      // At an ocean shore, the local water-depth gradient points toward the sea. Oscillating in
      // the opposite direction sends each bright surf line onto the beach and draws it back out.
      const shorePulse = Math.sin(cycle * 1.18) * (2 + wave.shoreAmount * OCEAN_SURF_TRAVEL_PIXELS);
      currentX -= wave.shoreNormalX * shorePulse;
      currentY -= wave.shoreNormalY * shorePulse;
      const hasShoreOrientation = wave.shoreAmount > 0.08 && (Math.abs(wave.shoreNormalX) + Math.abs(wave.shoreNormalY)) > 0.01;
      const tangentX = hasShoreOrientation ? -wave.shoreNormalY : 1;
      const tangentY = hasShoreOrientation ? wave.shoreNormalX : 0;
      const crestLength = wave.width * (0.62 + swell * 0.14);
      const ribbonColor = wave.shoreAmount > 0.42 ? 0x8cdbda : 0x3b9fbd;
      // A soft, wide band makes the whole water surface visibly drift before the fine crest
      // lines become noticeable. The offset is intentionally stronger than the crest itself.
      graphics.fillStyle(ribbonColor, crestAlpha * (0.42 + wave.shoreAmount * 0.2));
      graphics.fillEllipse(
        wave.worldX + wave.width * 0.5 + currentX,
        wave.worldY + currentY + 0.7,
        wave.width * (0.86 + swell * 0.2),
        3.6 + swell * 2.8
      );
      graphics.fillStyle(0x1f7fad, crestAlpha * 0.22);
      graphics.fillEllipse(
        wave.worldX + wave.width * 0.48 + currentX * 1.25,
        wave.worldY + currentY + 3.5,
        wave.width * (0.75 + swell * 0.12),
        2.1 + swell * 1.4
      );
      graphics.lineStyle(1.75, wave.shoreAmount > 0.34 ? 0xd5fbef : 0x9de9e7, crestAlpha);
      graphics.lineBetween(
        wave.worldX + currentX,
        wave.worldY + currentY,
        wave.worldX + crestLength * tangentX + currentX,
        wave.worldY + crestLength * tangentY + currentY - 0.8
      );
      graphics.lineStyle(1, 0x78cfde, crestAlpha * 0.88);
      graphics.lineBetween(
        wave.worldX + wave.width * 0.59 * tangentX + currentX,
        wave.worldY + wave.width * 0.59 * tangentY + currentY + 1.65,
        wave.worldX + wave.width * tangentX + currentX,
        wave.worldY + wave.width * tangentY + currentY + 0.8
      );

      // Expanding elliptical rings make small, overlapping surface ripples obvious without a
      // physics simulation. Each source has its own deterministic phase and speed.
      const rippleCycle = (seconds * (0.42 + wave.speed * 0.16) + wave.phase * 0.19) % 1;
      const rippleAlpha = wave.alpha * (1 - rippleCycle) * (0.36 + swell * 0.22);
      graphics.lineStyle(0.85, wave.shoreAmount > 0.35 ? 0xdfffee : 0x92e4e8, rippleAlpha);
      graphics.strokeEllipse(
        wave.worldX + wave.width * 0.48 + currentX * 0.7,
        wave.worldY + currentY - 0.4,
        4 + rippleCycle * (9 + wave.shoreAmount * 6),
        2.1 + rippleCycle * 5.2
      );

      if (wave.shoreAmount > 0.24) {
        const foamAlpha = crestAlpha * (0.45 + wave.shoreAmount * 0.64);
        graphics.lineStyle(1.45, 0xf2fff4, foamAlpha);
        graphics.lineBetween(
          wave.worldX + wave.width * 0.12 * tangentX + currentX,
          wave.worldY + wave.width * 0.12 * tangentY + currentY - 2.2,
          wave.worldX + wave.width * 0.73 * tangentX + currentX,
          wave.worldY + wave.width * 0.73 * tangentY + currentY - 2.75
        );
      }

      if (swell > 0.9) {
        graphics.fillStyle(0xecffff, crestAlpha * 0.88);
        graphics.fillCircle(wave.worldX + wave.width * 0.44 + currentX, wave.worldY + currentY - 1.5, 1.25);
      }
    });
  }

  // The broad water texture is just a few GPU tile-offset writes, so it stays smooth even while
  // the more expensive vector ripples below run at a lower, budget-friendly cadence.
  updateWaterSurfaceMotion(time: number): void {
    if (this.hasWater && this.renderVisible) {
      this.updateWaterSurfaceLayers(time / 1000);
    }
  }

  private updateWaterSurfaceLayers(seconds: number): void {
    const chunkPhaseX = this.x * 43.7 + this.y * 17.3;
    const chunkPhaseY = this.y * 31.1 - this.x * 11.9;

    // These are masked TileSprites, not repainted terrain canvases. The broad colored water
    // marks therefore move continuously across every visible water cell at effectively constant
    // cost, including quiet swamp pools.
    if (this.oceanWaterSurface) {
      this.oceanWaterSurface.tilePositionX = chunkPhaseX + seconds * OCEAN_WATER_CURRENT_PIXELS_PER_SECOND;
      this.oceanWaterSurface.tilePositionY = chunkPhaseY - seconds * 9;
    }
    if (this.oceanWaterHighlights) {
      this.oceanWaterHighlights.tilePositionX = chunkPhaseX * 0.62 - seconds * OCEAN_WATER_CURRENT_PIXELS_PER_SECOND * 0.56;
      this.oceanWaterHighlights.tilePositionY = chunkPhaseY * 0.78 + seconds * 6;
    }
    if (this.swampWaterSurface) {
      this.swampWaterSurface.tilePositionX = chunkPhaseX * 0.44 + seconds * SWAMP_WATER_CURRENT_PIXELS_PER_SECOND;
      this.swampWaterSurface.tilePositionY = chunkPhaseY * 0.58 + seconds * 3.5;
    }
    if (this.swampWaterHighlights) {
      this.swampWaterHighlights.tilePositionX = chunkPhaseX * 0.34 - seconds * SWAMP_WATER_CURRENT_PIXELS_PER_SECOND * 0.56;
      this.swampWaterHighlights.tilePositionY = chunkPhaseY * 0.42 + seconds * 2.25;
    }
  }

  refreshFeatures(): void {
    const texture = this.scene.textures.get(this.featureTextureKey) as Phaser.Textures.CanvasTexture;
    const canvas = texture.getSourceImage() as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Wildbound could not update a feature texture.');
    }
    context.clearRect(0, 0, FEATURE_TEXTURE_SIZE, FEATURE_TEXTURE_SIZE);
    this.featureGraphics.clear();
    this.features.forEach((feature) => {
      const worldTileX = this.x * CHUNK_SIZE_TILES + feature.localTileX;
      const worldTileY = this.y * CHUNK_SIZE_TILES + feature.localTileY;

      if (!this.sessionState.isFeatureHarvested(worldTileX, worldTileY)) {
        const offset = this.harvestingTileKey === this.tileKey(worldTileX, worldTileY) ? this.harvestOffset : 0;
        this.drawFeature(
          feature.type,
          feature.localTileX * WORLD_TILE_SIZE + FEATURE_TEXTURE_PADDING,
          feature.localTileY * WORLD_TILE_SIZE + FEATURE_TEXTURE_PADDING,
          offset,
          worldTileX,
          worldTileY
        );
      }
    });

    this.featureGraphics.generateTexture(this.featureTextureKey, FEATURE_TEXTURE_SIZE, FEATURE_TEXTURE_SIZE);
    this.featureGraphics.clear();
    this.syncAnimatedFeatureFoliage();
  }

  destroy(): void {
    this.terrainImage.destroy();
    this.waterGraphics.destroy();
    this.oceanWaterSurface?.destroy();
    this.oceanWaterHighlights?.destroy();
    this.swampWaterSurface?.destroy();
    this.swampWaterHighlights?.destroy();
    this.waterBitmapMasks.forEach((mask) => mask.destroy());
    this.oceanWaterMaskImage?.destroy();
    this.swampWaterMaskImage?.destroy();
    this.animatedGroundGrass.forEach((patch) => patch.image.destroy());
    this.animatedGroundGrass.length = 0;
    this.featureImage.destroy();
    this.featureGraphics.destroy();
    this.animatedFeatureFoliage.forEach(({ sprite }) => destroyAnimatedFoliageSprite(sprite));
    this.animatedFeatureFoliage.clear();
    this.scene.textures.remove(this.textureKey);
    this.scene.textures.remove(this.featureTextureKey);
    if (this.oceanWaterMaskTextureKey) {
      this.scene.textures.remove(this.oceanWaterMaskTextureKey);
    }
    if (this.swampWaterMaskTextureKey) {
      this.scene.textures.remove(this.swampWaterMaskTextureKey);
    }
  }

  private drawTerrain(texture: Phaser.Textures.CanvasTexture): void {
    const context = texture.getContext();
    const worldX = this.x * CHUNK_SIZE_PIXELS;
    const worldY = this.y * CHUNK_SIZE_PIXELS;
    const waveCandidates: Array<WaterWave & { priority: number }> = [];
    // Compact alpha masks are built once while the baked terrain is sampled. The two TileSprites
    // above them can then flow across all water pixels without rebuilding a chunk canvas each tick.
    const waterMaskSize = CHUNK_SIZE_PIXELS / VISUAL_TERRAIN_CELL_SIZE;
    const oceanWaterMaskKey = `ocean-water-mask:v1:${this.seed}:${this.x}:${this.y}`;
    const swampWaterMaskKey = `swamp-water-mask:v1:${this.seed}:${this.x}:${this.y}`;
    const oceanWaterMaskTexture = this.scene.textures.createCanvas(oceanWaterMaskKey, waterMaskSize, waterMaskSize);
    const swampWaterMaskTexture = this.scene.textures.createCanvas(swampWaterMaskKey, waterMaskSize, waterMaskSize);
    if (!oceanWaterMaskTexture || !swampWaterMaskTexture) {
      throw new Error('Wildbound could not create a water surface mask.');
    }
    const oceanWaterMaskContext = oceanWaterMaskTexture.getContext();
    const swampWaterMaskContext = swampWaterMaskTexture.getContext();
    oceanWaterMaskContext.clearRect(0, 0, waterMaskSize, waterMaskSize);
    swampWaterMaskContext.clearRect(0, 0, waterMaskSize, waterMaskSize);
    oceanWaterMaskContext.fillStyle = '#ffffff';
    swampWaterMaskContext.fillStyle = '#ffffff';
    let hasOceanWaterSurface = false;
    let hasSwampWaterSurface = false;

    for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
      for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
        const worldTileX = this.x * CHUNK_SIZE_TILES + localX;
        const worldTileY = this.y * CHUNK_SIZE_TILES + localY;

        for (let visualY = 0; visualY < VISUAL_CELLS_PER_TILE; visualY += 1) {
          for (let visualX = 0; visualX < VISUAL_CELLS_PER_TILE; visualX += 1) {
            const sampleTileX = worldTileX + (visualX + 0.5) / VISUAL_CELLS_PER_TILE;
            const sampleTileY = worldTileY + (visualY + 0.5) / VISUAL_CELLS_PER_TILE;
            const surface = surfaceAtTile(this.seed, sampleTileX, sampleTileY);
            const variation = randomAtTile(
              this.seed,
              worldTileX * VISUAL_CELLS_PER_TILE + visualX,
              worldTileY * VISUAL_CELLS_PER_TILE + visualY,
              0x1f4a7c15
            );
            const cellX = localX * WORLD_TILE_SIZE + visualX * VISUAL_TERRAIN_CELL_SIZE;
            const cellY = localY * WORLD_TILE_SIZE + visualY * VISUAL_TERRAIN_CELL_SIZE;

            // A restrained deterministic tint restores the subtle pixel-color variation without changing world data.
            context.fillStyle = this.colorToCss(this.terrainCellColor(surface.color, variation));
            context.fillRect(cellX, cellY, VISUAL_TERRAIN_CELL_SIZE, VISUAL_TERRAIN_CELL_SIZE);
            this.drawTerrainDetail(context, surface, variation, cellX, cellY);

            // Full water motion is confined to actual ocean water. A narrow high-water strip on
            // the beach remains eligible so ocean surf can roll onto wet sand and retreat, but
            // the rest of the Beach biome stays visibly sandy.
            const hasSwampSurface = surface.isSwampWater && surface.waterVisualAmount > 0.16;
            const hasOceanSurface = !surface.isSwampWater && (
              surface.isWater
              || (surface.biome === Biome.Beach && surface.waterVisualAmount > 0.2)
            );
            if (hasSwampSurface || hasOceanSurface) {
              this.hasWater = true;
              const maskX = localX * VISUAL_CELLS_PER_TILE + visualX;
              const maskY = localY * VISUAL_CELLS_PER_TILE + visualY;

              if (hasSwampSurface) {
                hasSwampWaterSurface = true;
                swampWaterMaskContext.fillRect(maskX, maskY, 1, 1);
                continue;
              }

              hasOceanWaterSurface = true;
              oceanWaterMaskContext.fillRect(maskX, maskY, 1, 1);
              if (variation > 0.942 + surface.waterVisualAmount * 0.014) {
                const shoreAmount = 1 - surface.waterVisualAmount;
                const shoreNormal = this.oceanShoreNormal(sampleTileX, sampleTileY);
                waveCandidates.push({
                  worldX: worldX + cellX + 1,
                  worldY: worldY + cellY + 4,
                  width: 12 + Math.floor(randomAtTile(this.seed, worldTileX, worldTileY, 0x443aec01) * 24),
                  phase: randomAtTile(this.seed, worldTileX * VISUAL_CELLS_PER_TILE + visualX, worldTileY * VISUAL_CELLS_PER_TILE + visualY, 0xc353c5f9) * Math.PI * 2,
                  speed: 0.92 + randomAtTile(this.seed, worldTileX, worldTileY, 0x1e3e7655) * 1.38,
                  alpha: (0.3 + randomAtTile(this.seed, worldTileX, worldTileY, 0x6f1620d3) * 0.38)
                    * (0.5 + surface.waterVisualAmount * 0.5),
                  amplitude: 4.2 + randomAtTile(this.seed, worldTileX, worldTileY, 0x9a0372c7) * 7.2,
                  shoreAmount,
                  shoreNormalX: shoreNormal.x,
                  shoreNormalY: shoreNormal.y,
                  // Retain broad ocean currents, but reserve enough candidates for visibly
                  // animated foam along a coast.
                  priority: randomAtTile(this.seed, worldTileX * VISUAL_CELLS_PER_TILE + visualX, worldTileY * VISUAL_CELLS_PER_TILE + visualY, 0xf5e91d3b)
                    + shoreAmount * 0.42
                });
              }
            }
          }
        }
      }
    }

    texture.refresh();
    this.createWaterSurfaceLayers(
      oceanWaterMaskTexture,
      swampWaterMaskTexture,
      oceanWaterMaskKey,
      swampWaterMaskKey,
      hasOceanWaterSurface,
      hasSwampWaterSurface
    );

    waveCandidates
      .sort((first, second) => second.priority - first.priority)
      .slice(0, WATER_WAVES_PER_VISIBLE_CHUNK)
      .forEach(({ priority: _priority, ...wave }) => this.waterWaves.push(wave));
    this.updateWaterAnimation(0);
  }

  private oceanShoreNormal(tileX: number, tileY: number): { x: number; y: number } {
    const offset = 0.6 / VISUAL_CELLS_PER_TILE;
    const oceanAmountAt = (sampleX: number, sampleY: number): number => {
      const surface = surfaceAtTile(this.seed, sampleX, sampleY);
      return surface.isSwampWater ? 0 : surface.waterVisualAmount;
    };
    const gradientX = oceanAmountAt(tileX + offset, tileY) - oceanAmountAt(tileX - offset, tileY);
    const gradientY = oceanAmountAt(tileX, tileY + offset) - oceanAmountAt(tileX, tileY - offset);
    const length = Math.hypot(gradientX, gradientY);
    return length > 0.001 ? { x: gradientX / length, y: gradientY / length } : { x: 0, y: 0 };
  }

  private createWaterSurfaceLayers(
    oceanMaskTexture: Phaser.Textures.CanvasTexture,
    swampMaskTexture: Phaser.Textures.CanvasTexture,
    oceanMaskKey: string,
    swampMaskKey: string,
    hasOceanWaterSurface: boolean,
    hasSwampWaterSurface: boolean
  ): void {
    if (!hasOceanWaterSurface && !hasSwampWaterSurface) {
      this.scene.textures.remove(oceanMaskKey);
      this.scene.textures.remove(swampMaskKey);
      return;
    }

    const textureKey = this.ensureWaterMotionTexture();
    const worldX = this.x * CHUNK_SIZE_PIXELS;
    const worldY = this.y * CHUNK_SIZE_PIXELS;
    const createMaskImage = (maskKey: string): Phaser.GameObjects.Image => this.scene.add
      .image(worldX, worldY, maskKey)
      .setOrigin(0)
      .setScale(VISUAL_TERRAIN_CELL_SIZE)
      // The source stays behind the opaque terrain image, but still provides a hardware-friendly
      // alpha mask for the moving TileSprites above it.
      .setDepth(-1);
    const createLayer = (maskImage: Phaser.GameObjects.Image, tint: number, alpha: number, depth: number): Phaser.GameObjects.TileSprite => {
      const mask = new Phaser.Display.Masks.BitmapMask(this.scene, maskImage);
      this.waterBitmapMasks.push(mask);
      return this.scene.add
        .tileSprite(worldX, worldY, CHUNK_SIZE_PIXELS, CHUNK_SIZE_PIXELS, textureKey)
        .setOrigin(0)
        .setDepth(depth)
        .setTint(tint)
        .setAlpha(alpha)
        .setMask(mask);
    };

    if (hasOceanWaterSurface) {
      oceanMaskTexture.refresh();
      this.oceanWaterMaskTextureKey = oceanMaskKey;
      this.oceanWaterMaskImage = createMaskImage(oceanMaskKey);
      this.oceanWaterSurface = createLayer(this.oceanWaterMaskImage, 0x4eb8ca, 0.86, 0.12);
      this.oceanWaterHighlights = createLayer(this.oceanWaterMaskImage, 0xc5fcf2, 0.48, 0.14);
    } else {
      this.scene.textures.remove(oceanMaskKey);
    }

    if (hasSwampWaterSurface) {
      swampMaskTexture.refresh();
      this.swampWaterMaskTextureKey = swampMaskKey;
      this.swampWaterMaskImage = createMaskImage(swampMaskKey);
      this.swampWaterSurface = createLayer(this.swampWaterMaskImage, 0x5ca68c, 0.7, 0.12);
      this.swampWaterHighlights = createLayer(this.swampWaterMaskImage, 0xb8dbc0, 0.32, 0.14);
    } else {
      this.scene.textures.remove(swampMaskKey);
    }
  }

  private ensureWaterMotionTexture(): string {
    const textureKey = `water-motion:v2:${this.seed}`;
    if (this.scene.textures.exists(textureKey)) {
      return textureKey;
    }

    const texture = this.scene.textures.createCanvas(textureKey, WATER_MOTION_TEXTURE_SIZE, WATER_MOTION_TEXTURE_SIZE);
    if (!texture) {
      throw new Error('Wildbound could not create a water motion texture.');
    }

    const context = texture.getContext();
    context.clearRect(0, 0, WATER_MOTION_TEXTURE_SIZE, WATER_MOTION_TEXTURE_SIZE);
    context.lineCap = 'round';

    // Large translucent color bands give the water body an unmistakable slow current. Fine
    // crests and little rings on top make that current read as ripples rather than a flat scroll.
    for (let ribbon = 0; ribbon < 13; ribbon += 1) {
      const phase = randomAtTile(this.seed, ribbon, 0, 0x2d1f7a83) * Math.PI * 2;
      const y = 6 + ribbon * 15;
      context.strokeStyle = `rgba(255, 255, 255, ${(0.13 + randomAtTile(this.seed, ribbon, 0, 0x33f47d11) * 0.11).toFixed(3)})`;
      context.lineWidth = 7 + randomAtTile(this.seed, ribbon, 0, 0x406b8a59) * 7;
      context.beginPath();
      for (let x = -18; x <= WATER_MOTION_TEXTURE_SIZE + 18; x += 12) {
        const waveY = y
          + Math.sin(x * 0.056 + phase) * 3.4
          + Math.sin(x * 0.114 + phase * 1.9) * 1.8;
        if (x === -18) {
          context.moveTo(x, waveY);
        } else {
          context.lineTo(x, waveY);
        }
      }
      context.stroke();

      context.strokeStyle = `rgba(255, 255, 255, ${(0.24 + randomAtTile(this.seed, ribbon, 0, 0x5382ce07) * 0.2).toFixed(3)})`;
      context.lineWidth = 1 + randomAtTile(this.seed, ribbon, 0, 0x5c8da319) * 1.25;
      context.stroke();
    }

    for (let ripple = 0; ripple < 20; ripple += 1) {
      const centerX = randomAtTile(this.seed, ripple, 0, 0x6f62a907) * WATER_MOTION_TEXTURE_SIZE;
      const centerY = randomAtTile(this.seed, ripple, 0, 0x7a15df41) * WATER_MOTION_TEXTURE_SIZE;
      const width = 5 + randomAtTile(this.seed, ripple, 0, 0x88d23a7b) * 14;
      context.strokeStyle = `rgba(255, 255, 255, ${(0.12 + randomAtTile(this.seed, ripple, 0, 0x9542cb3d) * 0.2).toFixed(3)})`;
      context.lineWidth = 0.8 + randomAtTile(this.seed, ripple, 0, 0xa6d34f1d) * 0.8;
      context.beginPath();
      context.ellipse(centerX, centerY, width, width * 0.38, 0, 0, Math.PI * 2);
      context.stroke();
    }

    texture.refresh();
    return textureKey;
  }

  private drawTerrainDetail(
    context: CanvasRenderingContext2D,
    surface: TerrainSurface,
    variation: number,
    cellX: number,
    cellY: number
  ): void {
    if (surface.waterVisualAmount > 0.05) {
      // Baked undertones blend through the visual shore. The dynamic layer above then carries
      // slow color ribbons, crests, and small foam lines right up to the walkable shallows.
      if (variation > 0.74) {
        const alpha = 0.1 + surface.waterVisualAmount * 0.25;
        context.fillStyle = surface.isShallowWater ? `rgba(203, 246, 232, ${alpha})` : `rgba(137, 214, 229, ${alpha})`;
        context.fillRect(cellX + 1, cellY + 3, 5, 1);
      } else if (variation < 0.15) {
        context.fillStyle = `rgba(13, 72, 116, ${(0.08 + surface.waterVisualAmount * 0.18).toFixed(3)})`;
        context.fillRect(cellX, cellY + 6, 7, 1);
      }
      if (surface.waterVisualAmount > 0.24) {
        return;
      }
    }


    const smooth = (start: number, end: number, value: number): number => {
      const normalized = Math.max(0, Math.min(1, (value - start) / (end - start)));
      return normalized * normalized * (3 - 2 * normalized);
    };

    // Detail density follows continuous climate weights, so flecks and plants fade through a
    // border instead of suddenly switching when a discrete biome label changes.
    const snow = Math.max(
      1 - smooth(0.14, 0.34, surface.temperature),
      smooth(0.72, 0.92, surface.elevation) * (1 - smooth(0.5, 0.68, surface.temperature))
    );
    const rock = smooth(0.6, 0.9, surface.elevation) * (1 - snow * 0.4);
    const dry = smooth(0.6, 0.76, surface.temperature) * (1 - smooth(0.28, 0.46, surface.moisture));
    const vegetation = smooth(0.38, 0.72, surface.moisture)
      * (1 - dry * 0.85)
      * (1 - rock * 0.62)
      * (1 - snow);

    if (surface.elevation < 0.39) {
      if (variation > 0.91) {
        context.fillStyle = variation > 0.97 ? '#a9864f' : '#eed692';
        context.fillRect(cellX + 2, cellY + 4, 3, 1);
      }
      return;
    }

    if (snow > 0.2 && variation > 0.985 - snow * 0.11) {
      context.fillStyle = this.colorToCss(this.shadeColor(surface.color, 0.32));
      context.fillRect(cellX + 1, cellY + 2, 5, 1);
      context.fillRect(cellX + 3, cellY + 1, 1, 4);
      return;
    }

    if (rock > 0.18 && variation > 0.985 - rock * 0.12) {
      context.fillStyle = this.colorToCss(this.shadeColor(surface.color, -0.32));
      context.beginPath();
      context.moveTo(cellX + 1, cellY + 7);
      context.lineTo(cellX + 4, cellY + 2);
      context.lineTo(cellX + 7, cellY + 7);
      context.fill();
      return;
    }

    if (dry > 0.2 && variation > 0.985 - dry * 0.1) {
      context.fillStyle = this.colorToCss(this.shadeColor(surface.color, dry > 0.65 ? -0.22 : 0.2));
      context.fillRect(cellX + 1, cellY + 4, 6, 1);
      return;
    }

    if (vegetation > 0.16 && variation > 0.99 - vegetation * 0.08) {
      context.fillStyle = this.colorToCss(this.shadeColor(surface.color, vegetation > 0.58 ? -0.3 : 0.26));
      context.fillRect(cellX + 1, cellY + 4, 1, 3);
      context.fillRect(cellX + 2, cellY + 2, 1, 5);
      context.fillRect(cellX + 4, cellY, 1, 7);
      context.fillRect(cellX + 6, cellY + 3, 1, 4);
      context.fillStyle = this.colorToCss(this.shadeColor(surface.color, 0.24));
      context.fillRect(cellX + 3, cellY + 2, 1, 3);
      context.fillRect(cellX + 5, cellY + 4, 1, 2);
    }
  }
  private colorToCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
  }

  private terrainCellColor(color: number, variation: number): number {
    // Tints come from the continuously blended local color, never a discrete terrain label.
    const base = this.shadeColor(color, (variation - 0.5) * 0.09);

    if (variation < 0.18) {
      return this.mixColor(base, this.shadeColor(base, -0.34), 0.18);
    }

    if (variation > 0.82) {
      return this.mixColor(base, this.shadeColor(base, 0.34), 0.18);
    }

    return base;
  }
  private mixColor(first: number, second: number, amount: number): number {
    const mixChannel = (shift: number): number => {
      const start = (first >> shift) & 0xff;
      const end = (second >> shift) & 0xff;
      return Math.round(start + (end - start) * amount);
    };

    return (mixChannel(16) << 16) | (mixChannel(8) << 8) | mixChannel(0);
  }

  private shadeColor(color: number, amount: number): number {
    const multiplier = 1 + amount;
    const red = Math.round(Math.min(255, Math.max(0, ((color >> 16) & 0xff) * multiplier)));
    const green = Math.round(Math.min(255, Math.max(0, ((color >> 8) & 0xff) * multiplier)));
    const blue = Math.round(Math.min(255, Math.max(0, (color & 0xff) * multiplier)));
    return (red << 16) | (green << 8) | blue;
  }

  private groundGrassDensity(surface: TerrainSurface): number {
    // This calculation deliberately uses the continuous climate samples, not `surface.biome`.
    // As a result grass tapers naturally through forest, plains, hills, desert, snow, and swamp
    // boundaries even though each location still has one discrete biome for gameplay purposes.
    if (surface.waterVisualAmount > 0.24) {
      return 0;
    }

    const smooth = (start: number, end: number, value: number): number => {
      const normalized = Math.max(0, Math.min(1, (value - start) / (end - start)));
      return normalized * normalized * (3 - 2 * normalized);
    };
    const temperateMoisture = smooth(0.26, 0.5, surface.moisture);
    const heatFade = 1 - smooth(0.56, 0.76, surface.temperature);
    const coldFade = smooth(0.18, 0.32, surface.temperature);
    const highlandFade = 1 - smooth(0.57, 0.82, surface.elevation);
    // Very wet, low, warm terrain becomes swamp rather than a grass field. Its continuous
    // subtraction prevents the old sharp edge where the Swamp biome label began.
    const swampFade = smooth(0.7, 0.86, surface.moisture)
      * smooth(0.34, 0.56, surface.temperature)
      * (1 - smooth(0.56, 0.74, surface.elevation));
    const climateCoverage = temperateMoisture * heatFade * coldFade * highlandFade * (1 - swampFade);
    const shoreFade = 1 - smooth(0.02, 0.24, surface.waterVisualAmount);
    return Math.min(0.96, climateCoverage * shoreFade * GROUND_GRASS_FREQUENCY_SCALE);
  }

  private createAnimatedGroundGrass(): void {
    const now = performance.now();
    for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
      for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
        const worldTileX = this.x * CHUNK_SIZE_TILES + localX;
        const worldTileY = this.y * CHUNK_SIZE_TILES + localY;
        const surface = surfaceAtTile(this.seed, worldTileX + 0.5, worldTileY + 0.5);
        const density = this.groundGrassDensity(surface);
        const placement = randomAtTile(this.seed, worldTileX, worldTileY, 0x6d42aeb9);
        if (density === 0 || placement > density) {
          continue;
        }

        // One patch already contains thirteen individually animated blades. Its slight overlap
        // into neighboring tiles makes a thick field without creating per-blade game objects.
        const height = (GROUND_GRASS_BASE_HEIGHT_PIXELS
          + randomAtTile(this.seed, worldTileX, worldTileY, 0x4b5edc37) * GROUND_GRASS_HEIGHT_VARIATION_PIXELS)
          * GROUND_GRASS_SIZE_SCALE;
        const palette: GroundGrassPalette = surface.biome === Biome.Forest
          ? 'grove'
          : surface.biome === Biome.Hills
            ? 'highland'
            : 'meadow';
        const patch = createAnimatedGroundGrassPatch(
          this.scene,
          worldTileX * WORLD_TILE_SIZE + 5 + randomAtTile(this.seed, worldTileX, worldTileY, 0x11a5d1f7) * 22,
          worldTileY * WORLD_TILE_SIZE + 29,
          height / 34,
          palette,
          Math.floor(randomAtTile(this.seed, worldTileX, worldTileY, 0x7959e2d1) * GROUND_GRASS_PATTERN_VARIANTS),
          randomAtTile(this.seed, worldTileX, worldTileY, 0x53da69c7) * GROUND_GRASS_ANIMATION_FRAME_COUNT,
          now
        );
        patch.image.setVisible(this.renderVisible && this.groundGrassVisible);
        this.animatedGroundGrass.push(patch);
      }
    }
  }

  private syncAnimatedFeatureFoliage(): void {
    const activeKeys = new Set<string>();

    this.features.forEach((feature) => {
      if (!isAnimatedFoliage(feature.type)) {
        return;
      }

      const worldTileX = this.x * CHUNK_SIZE_TILES + feature.localTileX;
      const worldTileY = this.y * CHUNK_SIZE_TILES + feature.localTileY;
      const key = this.tileKey(worldTileX, worldTileY);
      if (this.sessionState.isFeatureHarvested(worldTileX, worldTileY)) {
        return;
      }

      activeKeys.add(key);
      const variation = randomAtTile(this.seed, worldTileX, worldTileY, 0x6ac4d9e3);
      const scale = 0.92 + variation * 0.16;
      const mirror = variation > 0.5 ? 1 : -1;
      const harvestOffset = this.harvestingTileKey === key ? this.harvestOffset : 0;
      const rootX = (worldTileX + 0.5) * WORLD_TILE_SIZE + harvestOffset;
      const rootY = (worldTileY + 0.5) * WORLD_TILE_SIZE + (feature.type === TerrainFeatureType.Tree
        ? 0
        : feature.type === TerrainFeatureType.Reeds
          ? 20
          : 12);
      const existing = this.animatedFeatureFoliage.get(key);
      if (existing) {
        setAnimatedFoliageSpriteTransform(existing.sprite, rootX, rootY, scale, mirror);
        setAnimatedFoliageSpriteVisible(existing.sprite, this.renderVisible);
        return;
      }

      const sprite = createAnimatedFoliageSprite(
        this.scene,
        feature.type,
        rootX,
        rootY,
        scale,
        mirror,
        randomAtTile(this.seed, worldTileX, worldTileY, 0x55f0b2a1) * Math.PI * 2
      );
      if (sprite) {
        setAnimatedFoliageSpriteVisible(sprite, this.renderVisible);
        this.animatedFeatureFoliage.set(key, { sprite });
      }
    });

    this.animatedFeatureFoliage.forEach((foliage, key) => {
      if (!activeKeys.has(key)) {
        destroyAnimatedFoliageSprite(foliage.sprite);
        this.animatedFeatureFoliage.delete(key);
      }
    });
  }

  private drawFeature(
    type: TerrainFeatureType,
    tileX: number,
    tileY: number,
    animationOffset: number,
    worldTileX = Math.floor(tileX / WORLD_TILE_SIZE),
    worldTileY = Math.floor(tileY / WORLD_TILE_SIZE)
  ): void {
    const centerX = tileX + WORLD_TILE_SIZE / 2 + animationOffset;
    const centerY = tileY + WORLD_TILE_SIZE / 2;
    const variation = randomAtTile(this.seed, worldTileX, worldTileY, 0x6ac4d9e3);
    const scale = 0.92 + variation * 0.16;
    const mirror = variation > 0.5 ? 1 : -1;
    const graphics = this.featureGraphics;

    const groundPatch = (width: number, depth: number, color: number, alpha = 0.32): void => {
      graphics.fillStyle(0x17271c, alpha);
      graphics.fillEllipse(centerX + 4, centerY + depth * 0.3, width, depth);
      graphics.fillStyle(color, 0.46);
      graphics.fillEllipse(centerX, centerY + depth * 0.14, width * 0.82, depth * 0.58);
    };

    switch (type) {
      case TerrainFeatureType.Tree: {
        groundPatch(104 * scale, 30 * scale, 0x40592c, 0.34);
        graphics.fillStyle(0x2f4925, 0.92);
        graphics.fillEllipse(centerX - 20 * mirror, centerY + 28, 64 * scale, 13 * scale);
        graphics.fillStyle(0x4b2f1d, 1);
        graphics.fillRoundedRect(centerX - 9 * scale, centerY - 4, 18 * scale, 49 * scale, 5 * scale);
        graphics.fillStyle(0x8c5932, 1);
        graphics.fillRoundedRect(centerX - 3 * scale, centerY - 3, 6 * scale, 45 * scale, 3 * scale);
        graphics.lineStyle(1.35 * scale, 0xc28a4d, 0.5);
        [-4, 3, 10, 18, 27].forEach((offset) => graphics.lineBetween(
          centerX - 5 * scale, centerY + offset * scale,
          centerX + 5 * scale, centerY + (offset - 2) * scale
        ));
        graphics.lineStyle(3 * scale, 0x3a2418, 0.9);
        graphics.lineBetween(centerX - 2 * scale, centerY + 16, centerX - 23 * scale * mirror, centerY + 36 * scale);
        graphics.lineBetween(centerX + 3 * scale, centerY + 20, centerX + 24 * scale * mirror, centerY + 37 * scale);
        graphics.lineBetween(centerX, centerY + 8, centerX + 18 * scale * mirror, centerY - 10 * scale);
        break;
      }
      case TerrainFeatureType.Cactus: {
        groundPatch(74 * scale, 23 * scale, 0x806f39, 0.3);
        graphics.fillStyle(0x1f4d32, 0.9);
        graphics.fillEllipse(centerX, centerY + 24 * scale, 42 * scale, 12 * scale);
        graphics.fillStyle(0x327740, 1);
        graphics.fillRoundedRect(centerX - 9 * scale, centerY - 42 * scale, 18 * scale, 69 * scale, 8 * scale);
        graphics.fillRoundedRect(centerX - 34 * scale * mirror, centerY - 17 * scale, 27 * scale, 13 * scale, 5 * scale);
        graphics.fillRoundedRect(centerX - 34 * scale * mirror, centerY - 34 * scale, 11 * scale, 30 * scale, 5 * scale);
        graphics.fillRoundedRect(centerX + 8 * scale * mirror, centerY + 1 * scale, 28 * scale, 13 * scale, 5 * scale);
        graphics.fillRoundedRect(centerX + 24 * scale * mirror, centerY - 20 * scale, 12 * scale, 34 * scale, 5 * scale);
        graphics.lineStyle(2 * scale, 0x93bd62, 0.86);
        [-5, 0, 5].forEach((offset) => graphics.lineBetween(centerX + offset * scale, centerY - 36 * scale, centerX + offset * scale, centerY + 20 * scale));
        graphics.lineStyle(0.75 * scale, 0xe6d69a, 0.74);
        [-7, -2, 3, 8].forEach((offset) => {
          graphics.lineBetween(centerX + offset * scale, centerY - 26 * scale, centerX + (offset + 1.4 * mirror) * scale, centerY - 23 * scale);
          graphics.lineBetween(centerX + offset * scale, centerY - 4 * scale, centerX + (offset - 1.2 * mirror) * scale, centerY - 1 * scale);
        });
        graphics.fillStyle(0xf0bd5f, 0.96);
        graphics.fillCircle(centerX, centerY - 44 * scale, 4 * scale);
        graphics.fillCircle(centerX - 29 * scale * mirror, centerY - 37 * scale, 3 * scale);
        break;
      }
      case TerrainFeatureType.Rock: {
        groundPatch(100 * scale, 28 * scale, 0x4d4c3e, 0.3);
        graphics.fillStyle(0x303b42, 1);
        graphics.fillTriangle(centerX - 44 * scale, centerY + 20 * scale, centerX - 19 * scale, centerY - 38 * scale, centerX + 47 * scale, centerY + 19 * scale);
        graphics.fillStyle(0x586671, 1);
        graphics.fillTriangle(centerX - 19 * scale, centerY - 38 * scale, centerX + 7 * scale, centerY - 26 * scale, centerX + 19 * scale, centerY + 18 * scale);
        graphics.fillStyle(0x7b8990, 0.96);
        graphics.fillTriangle(centerX + 7 * scale, centerY - 26 * scale, centerX + 33 * scale, centerY - 6 * scale, centerX + 19 * scale, centerY + 18 * scale);
        graphics.fillStyle(0xa3adad, 0.62);
        graphics.fillTriangle(centerX - 10 * scale, centerY - 28 * scale, centerX + 7 * scale, centerY - 26 * scale, centerX - 2 * scale, centerY - 6 * scale);
        graphics.lineStyle(3 * scale, 0x263138, 0.84);
        graphics.lineBetween(centerX + 3 * scale, centerY - 20 * scale, centerX - 5 * scale, centerY + 17 * scale);
        graphics.lineBetween(centerX + 20 * scale, centerY - 1 * scale, centerX + 31 * scale, centerY + 16 * scale);
        graphics.fillStyle(0x6f8d59, 0.72);
        graphics.fillEllipse(centerX - 27 * scale, centerY + 10 * scale, 14 * scale, 6 * scale);
        graphics.fillStyle(0xb5c088, 0.42);
        graphics.fillTriangle(centerX - 27 * scale, centerY - 14 * scale, centerX - 18 * scale, centerY - 24 * scale, centerX - 14 * scale, centerY - 11 * scale);
        graphics.lineStyle(1.2 * scale, 0x9fac91, 0.45);
        graphics.lineBetween(centerX - 31 * scale, centerY + 6 * scale, centerX - 18 * scale, centerY + 9 * scale);
        break;
      }
      case TerrainFeatureType.Reeds: {
        groundPatch(108 * scale, 25 * scale, 0x496b47, 0.3);
        graphics.fillStyle(0x3a6441, 0.8);
        graphics.fillEllipse(centerX, centerY + 18 * scale, 68 * scale, 15 * scale);
        break;
      }
      case TerrainFeatureType.SnowyRock: {
        groundPatch(102 * scale, 28 * scale, 0x9bb8c0, 0.32);
        graphics.fillStyle(0x4c5964, 1);
        graphics.fillTriangle(centerX - 43 * scale, centerY + 20 * scale, centerX - 12 * scale, centerY - 37 * scale, centerX + 45 * scale, centerY + 19 * scale);
        graphics.fillStyle(0x74828b, 1);
        graphics.fillTriangle(centerX - 12 * scale, centerY - 37 * scale, centerX + 22 * scale, centerY - 17 * scale, centerX + 16 * scale, centerY + 18 * scale);
        graphics.fillStyle(0xe5f0f1, 1);
        graphics.fillTriangle(centerX - 24 * scale, centerY - 16 * scale, centerX - 12 * scale, centerY - 37 * scale, centerX + 15 * scale, centerY - 18 * scale);
        graphics.fillTriangle(centerX + 6 * scale, centerY - 16 * scale, centerX + 22 * scale, centerY - 17 * scale, centerX + 36 * scale, centerY + 1 * scale);
        graphics.lineStyle(2 * scale, 0x3f4a53, 0.86);
        graphics.lineBetween(centerX + 2 * scale, centerY - 18 * scale, centerX - 7 * scale, centerY + 17 * scale);
        graphics.fillStyle(0xb7d9df, 0.62);
        graphics.fillCircle(centerX - 25 * scale, centerY - 4 * scale, 3 * scale);
        graphics.fillCircle(centerX + 24 * scale, centerY + 4 * scale, 2.5 * scale);
        break;
      }
      case TerrainFeatureType.Grass: {
        groundPatch(66 * scale, 18 * scale, 0x496d33, 0.25);
        break;
      }
      case TerrainFeatureType.IcePatch: {
        groundPatch(118 * scale, 50 * scale, 0x6c9eab, 0.34);
        graphics.fillStyle(0x527e9b, 0.92);
        graphics.fillEllipse(centerX, centerY + 2 * scale, 108 * scale, 60 * scale);
        graphics.fillStyle(0x9fdae8, 0.96);
        graphics.fillEllipse(centerX - 3 * scale, centerY - 2 * scale, 96 * scale, 49 * scale);
        graphics.fillStyle(0xd8f8fb, 0.72);
        graphics.fillEllipse(centerX - 14 * scale, centerY - 9 * scale, 44 * scale, 15 * scale);
        graphics.lineStyle(3 * scale, 0xe8fdff, 0.92);
        graphics.lineBetween(centerX - 32 * scale, centerY - 8 * scale, centerX - 2 * scale, centerY + 5 * scale);
        graphics.lineBetween(centerX - 2 * scale, centerY + 5 * scale, centerX + 27 * scale, centerY - 16 * scale);
        graphics.lineBetween(centerX - 2 * scale, centerY + 5 * scale, centerX + 15 * scale, centerY + 22 * scale);
        graphics.lineBetween(centerX - 16 * scale, centerY + 19 * scale, centerX - 2 * scale, centerY + 5 * scale);
        graphics.lineStyle(1.1 * scale, 0xbceff4, 0.72);
        graphics.lineBetween(centerX - 41 * scale, centerY + 6 * scale, centerX - 15 * scale, centerY + 12 * scale);
        graphics.lineBetween(centerX + 11 * scale, centerY - 18 * scale, centerX + 37 * scale, centerY - 3 * scale);
        break;
      }
    }
  }

  private tileKey(tileX: number, tileY: number): string {
    return `${tileX},${tileY}`;
  }

}

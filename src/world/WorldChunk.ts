import Phaser from 'phaser';
import { Biome } from './generation/biomeGenerator';
import { generateChunkFeatures, type TerrainFeature, TerrainFeatureType } from './generation/featureGenerator';
import { TOPOGRAPHY_GENERATION_VERSION } from './generation/topographyGenerator';
import { randomAtTile } from './generation/noise';
import { surfaceAtTile, type TerrainSurface } from './generation/terrainGenerator';
import { SessionWorldState } from './SessionWorldState';
import { WATER_WAVES_PER_CHUNK } from './explorationConfig';
import { CHUNK_SIZE_PIXELS, CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from './worldConfig';

// Terrain is baked into one texture per chunk. The 8px visual cells retain detail while
// keeping the renderer to a single terrain draw call for each static chunk.
const VISUAL_TERRAIN_CELL_SIZE = 8;
const VISUAL_CELLS_PER_TILE = WORLD_TILE_SIZE / VISUAL_TERRAIN_CELL_SIZE;
const FEATURE_TEXTURE_PADDING = 128;
const FEATURE_TEXTURE_SIZE = CHUNK_SIZE_PIXELS + FEATURE_TEXTURE_PADDING * 2;

interface WaterWave {
  worldX: number;
  worldY: number;
  width: number;
  phase: number;
  speed: number;
  alpha: number;
  amplitude: number;
}

interface AmbientGrassTuft {
  worldX: number;
  worldY: number;
  phase: number;
  height: number;
  color: number;
}

export class WorldChunk {
  readonly key: string;
  private readonly textureKey: string;
  private readonly terrainImage: Phaser.GameObjects.Image;
  private readonly waterGraphics: Phaser.GameObjects.Graphics;
  private readonly ambientGraphics: Phaser.GameObjects.Graphics;
  // Complex feature vectors are baked into one texture per chunk, avoiding per-frame Graphics triangulation.
  private readonly featureTextureKey: string;
  private readonly featureImage: Phaser.GameObjects.Image;
  private readonly featureGraphics: Phaser.GameObjects.Graphics;
  private readonly features: TerrainFeature[];
  private readonly ambientGrassTufts: AmbientGrassTuft[];
  private readonly waterWaves: WaterWave[] = [];
  private hasWater = false;
  private hasAmbientMotion = false;
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
    this.ambientGraphics = scene.add.graphics().setDepth(1.15);
    this.featureImage = scene.add
      .image(x * CHUNK_SIZE_PIXELS - FEATURE_TEXTURE_PADDING, y * CHUNK_SIZE_PIXELS - FEATURE_TEXTURE_PADDING, this.featureTextureKey)
      .setOrigin(0)
      .setDepth(1);
    // This is an off-screen scratch pad only. It is immediately baked into featureImage's texture.
    this.featureGraphics = scene.add.graphics().setVisible(false);
    this.features = generateChunkFeatures(seed, x, y);
    this.ambientGrassTufts = this.createAmbientGrassTufts();

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

  updateWaterAnimation(time: number): void {
    if (!this.hasWater) {
      return;
    }

    const seconds = time / 1000;
    const graphics = this.waterGraphics;
    graphics.clear();

    // The wave field is deterministic, but every crest travels at a slightly different speed.
    // Redrawing only nearby chunks gives water a visible directional current without touching
    // the baked terrain texture or allocating sprites per tile.
    this.waterWaves.forEach((wave) => {
      const cycle = seconds * wave.speed + wave.phase;
      const offsetX = Math.sin(cycle) * wave.amplitude;
      const offsetY = Math.cos(cycle * 1.37) * 1.6;
      const crestAlpha = wave.alpha * (0.52 + (Math.sin(cycle * 1.8) + 1) * 0.27);
      graphics.lineStyle(1.45, 0xc6f5f4, crestAlpha);
      graphics.lineBetween(
        wave.worldX + offsetX,
        wave.worldY + offsetY,
        wave.worldX + wave.width * 0.58 + offsetX,
        wave.worldY + offsetY - 0.45
      );
      graphics.lineStyle(0.8, 0x78cfde, crestAlpha * 0.72);
      graphics.lineBetween(
        wave.worldX + wave.width * 0.68 + offsetX,
        wave.worldY + offsetY + 1.2,
        wave.worldX + wave.width + offsetX,
        wave.worldY + offsetY + 0.7
      );

      if (Math.sin(cycle * 1.8) > 0.78) {
        graphics.fillStyle(0xecffff, crestAlpha * 0.9);
        graphics.fillCircle(wave.worldX + wave.width * 0.44 + offsetX, wave.worldY + offsetY - 1.5, 1.05);
      }
    });
  }

  updateAmbient(time: number): void {
    if (!this.hasAmbientMotion) {
      return;
    }

    const graphics = this.ambientGraphics;
    const timeSeconds = time / 1000;
    graphics.clear();

    this.ambientGrassTufts.forEach((tuft) => {
      const wind = Math.sin(timeSeconds * 1.35 + tuft.phase) * 3.9 + Math.sin(timeSeconds * 2.1 + tuft.phase * 0.47) * 1.1;
      graphics.lineStyle(1.25, this.shadeColor(tuft.color, -0.3), 0.58);
      graphics.lineBetween(tuft.worldX - 4, tuft.worldY + 4, tuft.worldX - 4 + wind * 0.38, tuft.worldY - tuft.height * 0.62);
      graphics.lineBetween(tuft.worldX - 1.4, tuft.worldY + 4, tuft.worldX - 1.4 + wind * 0.62, tuft.worldY - tuft.height);
      graphics.lineStyle(1.1, tuft.color, 0.68);
      graphics.lineBetween(tuft.worldX + 1.3, tuft.worldY + 4, tuft.worldX + 1.3 + wind * 0.85, tuft.worldY - tuft.height * 1.12);
      graphics.lineStyle(0.85, 0xd9efa0, 0.48);
      graphics.lineBetween(tuft.worldX + 4, tuft.worldY + 4, tuft.worldX + 4 + wind, tuft.worldY - tuft.height * 0.68);
    });

    this.features.forEach((feature) => {
      const worldTileX = this.x * CHUNK_SIZE_TILES + feature.localTileX;
      const worldTileY = this.y * CHUNK_SIZE_TILES + feature.localTileY;
      if (this.sessionState.isFeatureHarvested(worldTileX, worldTileY)) {
        return;
      }

      const centerX = (worldTileX + 0.5) * WORLD_TILE_SIZE;
      const centerY = (worldTileY + 0.5) * WORLD_TILE_SIZE;
      const phase = randomAtTile(this.seed, worldTileX, worldTileY, 0x55f0b2a1) * Math.PI * 2;
      const wind = Math.sin(timeSeconds * 1.12 + phase);

      if (feature.type === TerrainFeatureType.Tree) {
        const shimmerX = wind * 6.4;
        graphics.fillStyle(0x9dd464, 0.16);
        graphics.fillCircle(centerX + 29 + shimmerX, centerY - 34, 11);
        graphics.fillCircle(centerX - 8 + shimmerX * 0.63, centerY - 56, 8);
        graphics.fillStyle(0xe4f09a, 0.12);
        graphics.fillCircle(centerX - 23 + shimmerX * 0.72, centerY - 43, 8);
        graphics.lineStyle(1.45, 0x7fb456, 0.4);
        graphics.lineBetween(centerX + 11, centerY - 7, centerX + 20 + shimmerX, centerY - 24);
        graphics.lineBetween(centerX - 6, centerY - 3, centerX - 13 + shimmerX * 0.62, centerY - 31);
      } else if (feature.type === TerrainFeatureType.Reeds || feature.type === TerrainFeatureType.Grass) {
        const height = feature.type === TerrainFeatureType.Reeds ? 43 : 29;
        const color = feature.type === TerrainFeatureType.Reeds ? 0xa6bd67 : 0xb9de73;
        graphics.lineStyle(1.5, color, 0.42);
        [-12, -6, -1, 5, 10].forEach((offset, index) => {
          const bend = wind * (3 + index) + index * 1.4;
          graphics.lineBetween(centerX + offset, centerY + 13, centerX + offset + bend, centerY + 13 - height + index * 3);
        });
      }
    });
  }

  refreshFeatures(): void {
    const texture = this.scene.textures.get(this.featureTextureKey);
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
  }

  destroy(): void {
    this.terrainImage.destroy();
    this.waterGraphics.destroy();
    this.ambientGraphics.destroy();
    this.featureImage.destroy();
    this.featureGraphics.destroy();
    this.scene.textures.remove(this.textureKey);
    this.scene.textures.remove(this.featureTextureKey);
  }

  private drawTerrain(texture: Phaser.Textures.CanvasTexture): void {
    const context = texture.getContext();
    const worldX = this.x * CHUNK_SIZE_PIXELS;
    const worldY = this.y * CHUNK_SIZE_PIXELS;
    const waveCandidates: Array<WaterWave & { priority: number }> = [];

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

            if (surface.isWater) {
              this.hasWater = true;
              if (variation > 0.968) {
                waveCandidates.push({
                  worldX: worldX + cellX + 1,
                  worldY: worldY + cellY + 4,
                  width: 7 + Math.floor(randomAtTile(this.seed, worldTileX, worldTileY, 0x443aec01) * 13),
                  phase: randomAtTile(this.seed, worldTileX * VISUAL_CELLS_PER_TILE + visualX, worldTileY * VISUAL_CELLS_PER_TILE + visualY, 0xc353c5f9) * Math.PI * 2,
                  speed: 0.85 + randomAtTile(this.seed, worldTileX, worldTileY, 0x1e3e7655) * 1.25,
                  alpha: 0.26 + randomAtTile(this.seed, worldTileX, worldTileY, 0x6f1620d3) * 0.32,
                  amplitude: 2.4 + randomAtTile(this.seed, worldTileX, worldTileY, 0x9a0372c7) * 4.6,
                  priority: randomAtTile(this.seed, worldTileX * VISUAL_CELLS_PER_TILE + visualX, worldTileY * VISUAL_CELLS_PER_TILE + visualY, 0xf5e91d3b)
                });
              }
            }
          }
        }
      }
    }

    texture.refresh();

    waveCandidates
      .sort((first, second) => second.priority - first.priority)
      .slice(0, WATER_WAVES_PER_CHUNK)
      .forEach(({ priority: _priority, ...wave }) => this.waterWaves.push(wave));
    this.updateWaterAnimation(0);
  }

  private drawTerrainDetail(
    context: CanvasRenderingContext2D,
    surface: TerrainSurface,
    variation: number,
    cellX: number,
    cellY: number
  ): void {
    if (surface.isWater) {
      // Baked undertones give deep water volume; the separate wave layer above supplies motion.
      if (variation > 0.78) {
        context.fillStyle = surface.isShallowWater ? 'rgba(203, 246, 232, 0.32)' : 'rgba(137, 214, 229, 0.28)';
        context.fillRect(cellX + 1, cellY + 3, 5, 1);
      } else if (variation < 0.12) {
        context.fillStyle = 'rgba(13, 72, 116, 0.24)';
        context.fillRect(cellX, cellY + 6, 7, 1);
      }
      return;
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
      context.fillRect(cellX + 2, cellY + 3, 1, 4);
      context.fillRect(cellX + 4, cellY + 1, 1, 6);
      context.fillRect(cellX + 6, cellY + 4, 1, 3);
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
        const canopy = 39 * scale;
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
        graphics.fillStyle(0x0e3927, 1);
        graphics.fillCircle(centerX - 26 * scale, centerY - 17 * scale, canopy * 0.7);
        graphics.fillCircle(centerX + 25 * scale, centerY - 19 * scale, canopy * 0.72);
        graphics.fillCircle(centerX - 7 * scale, centerY - 43 * scale, canopy * 0.76);
        graphics.fillCircle(centerX + 20 * scale, centerY - 50 * scale, canopy * 0.64);
        graphics.fillCircle(centerX - 31 * scale, centerY - 42 * scale, canopy * 0.52);
        graphics.fillStyle(0x1f6035, 1);
        graphics.fillCircle(centerX - 21 * scale, centerY - 25 * scale, canopy * 0.57);
        graphics.fillCircle(centerX + 19 * scale, centerY - 30 * scale, canopy * 0.62);
        graphics.fillCircle(centerX - 3 * scale, centerY - 54 * scale, canopy * 0.54);
        graphics.fillStyle(0x4b8c42, 0.88);
        graphics.fillCircle(centerX - 18 * scale, centerY - 39 * scale, canopy * 0.27);
        graphics.fillCircle(centerX + 15 * scale, centerY - 46 * scale, canopy * 0.22);
        graphics.fillCircle(centerX + 31 * scale, centerY - 16 * scale, canopy * 0.2);
        graphics.fillStyle(0xb7dc70, 0.62);
        graphics.fillCircle(centerX - 34 * scale, centerY - 30 * scale, canopy * 0.13);
        graphics.fillCircle(centerX + 5 * scale, centerY - 66 * scale, canopy * 0.14);
        graphics.fillStyle(0x27502d, 0.78);
        [-13, 0, 12].forEach((offset, index) => graphics.fillCircle(
          centerX + offset * scale,
          centerY + (26 + (index % 2) * 3) * scale,
          3.2 * scale
        ));
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
        const reedOffsets = [-37, -27, -16, -5, 7, 19, 31, 40];
        graphics.lineStyle(4 * scale, 0x2d6037, 1);
        reedOffsets.forEach((offset, index) => {
          const height = (54 + (index % 3) * 11) * scale;
          const lean = (index - 3.5) * 2.3 * mirror;
          graphics.lineBetween(centerX + offset * scale, centerY + 20 * scale, centerX + (offset + lean) * scale, centerY + 20 * scale - height);
        });
        graphics.lineStyle(2 * scale, 0x83a84e, 0.95);
        reedOffsets.filter((_, index) => index % 2 === 0).forEach((offset, index) => {
          graphics.lineBetween(centerX + offset * scale, centerY + 12 * scale, centerX + (offset - 8 * mirror) * scale, centerY - (17 + index * 5) * scale);
        });
        graphics.fillStyle(0x9f7e43, 1);
        [-27, -5, 19, 40].forEach((offset, index) => graphics.fillRoundedRect(centerX + offset * scale - 3, centerY - (43 + (index % 2) * 8) * scale, 6 * scale, 15 * scale, 3 * scale));
        graphics.lineStyle(1.15 * scale, 0xb8d377, 0.65);
        [-33, -18, -1, 17, 34].forEach((offset, index) => graphics.lineBetween(
          centerX + offset * scale, centerY + 17 * scale,
          centerX + (offset + (index - 2) * 4 * mirror) * scale, centerY - (24 + (index % 3) * 8) * scale
        ));
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
        const blades = [-23, -16, -9, -2, 6, 14, 22];
        graphics.lineStyle(3 * scale, 0x286c39, 1);
        blades.forEach((offset, index) => {
          const bend = (index - 3) * 3 * mirror;
          graphics.lineBetween(centerX + offset * scale, centerY + 12 * scale, centerX + (offset + bend) * scale, centerY - (25 + (index % 3) * 6) * scale);
        });
        graphics.lineStyle(1.4 * scale, 0xb6d66d, 0.9);
        [-14, 2, 17].forEach((offset, index) => graphics.lineBetween(centerX + offset * scale, centerY + 11 * scale, centerX + (offset + 4 * mirror) * scale, centerY - (28 + index * 4) * scale));
        graphics.fillStyle(0xe7d95f, 0.88);
        [-12, 6, 20].forEach((offset, index) => graphics.fillCircle(centerX + offset * scale, centerY - (20 + index * 5) * scale, 2.2 * scale));
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

  private createAmbientGrassTufts(): AmbientGrassTuft[] {
    const tufts: AmbientGrassTuft[] = [];

    for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
      for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
        const worldTileX = this.x * CHUNK_SIZE_TILES + localX;
        const worldTileY = this.y * CHUNK_SIZE_TILES + localY;
        const variation = randomAtTile(this.seed, worldTileX, worldTileY, 0x2b8316d9);
        const surface = surfaceAtTile(this.seed, worldTileX + 0.5, worldTileY + 0.5);
        const density = surface.biome === Biome.Plains ? 0.66 : surface.biome === Biome.Forest ? 0.76 : 0.84;
        if (variation < density) {
          continue;
        }
        if (surface.isWater || (surface.biome !== Biome.Plains && surface.biome !== Biome.Forest && surface.biome !== Biome.Swamp)) {
          continue;
        }

        tufts.push({
          worldX: (worldTileX + 0.22 + randomAtTile(this.seed, worldTileX, worldTileY, 0x1593bd27) * 0.55) * WORLD_TILE_SIZE,
          worldY: (worldTileY + 0.48 + randomAtTile(this.seed, worldTileX, worldTileY, 0x6cb6ad11) * 0.34) * WORLD_TILE_SIZE,
          phase: randomAtTile(this.seed, worldTileX, worldTileY, 0x4a1e79e5) * Math.PI * 2,
          height: 7 + Math.floor(variation * 7),
          color: surface.biome === Biome.Swamp ? 0x6e9c62 : surface.biome === Biome.Forest ? 0x65964d : 0x79af4f
        });
      }
    }

    this.hasAmbientMotion = tufts.length > 0 || this.features.some((feature) =>
      feature.type === TerrainFeatureType.Tree
      || feature.type === TerrainFeatureType.Reeds
      || feature.type === TerrainFeatureType.Grass
    );
    return tufts;
  }
}

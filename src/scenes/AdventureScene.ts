import Phaser from 'phaser';
import { BIOME_COLORS, biomeAtTile, climateAtTile } from '../world/generation/biomeGenerator';
import { featureAtTile } from '../world/generation/featureGenerator';
import { ChunkManager } from '../world/ChunkManager';
import { WORLD_SEED, WORLD_TILE_SIZE, worldToTile } from '../world/worldConfig';

const PLAYER_SPEED = 220;
const PLAYER_SIZE = 32;
const CAMERA_ZOOM = 0.75;
const HUD_MARGIN = 16;
const MINIMAP_RADIUS = 64;
const MINIMAP_CELL_SIZE = 4;
const MINIMAP_TILES_PER_CELL = 32;

type MovementKeys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

export class AdventureScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys!: MovementKeys;
  private chunkManager!: ChunkManager;
  private helpText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private isDebugVisible = false;
  private minimapTileX = Number.NaN;
  private minimapTileY = Number.NaN;

  constructor() {
    super('adventure');
  }

  create(): void {
    this.chunkManager = new ChunkManager(this, WORLD_SEED);
    this.player = this.add.rectangle(WORLD_TILE_SIZE / 2, WORLD_TILE_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 0x65d6ff);
    this.physics.add.existing(this.player);
    this.player.setDepth(10);
    this.chunkManager.update(this.player.x, this.player.y);

    this.configureCamera();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.movementKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    }) as MovementKeys;
    this.input.keyboard!.on('keydown-F3', this.toggleDebug, this);

    this.helpText = this.add
      .text(0, 0, 'Move with WASD or arrow keys - F3: Debug', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#e8f0f7'
      })
      .setDepth(110)
      .setScrollFactor(0);

    this.debugText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#cfe8d8',
        backgroundColor: '#102019cc',
        padding: { x: 8, y: 6 }
      })
      .setDepth(110)
      .setScrollFactor(0)
      .setVisible(false);

    this.minimapGraphics = this.add.graphics().setDepth(100).setScrollFactor(0);
    this.updateHudLayout();
    this.updateMinimap();
  }

  update(): void {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const horizontal = Number(this.isDown('right')) - Number(this.isDown('left'));
    const vertical = Number(this.isDown('down')) - Number(this.isDown('up'));

    const direction = new Phaser.Math.Vector2(horizontal, vertical).normalize().scale(PLAYER_SPEED);
    playerBody.setVelocity(direction.x, direction.y);
    this.chunkManager.update(this.player.x, this.player.y);
    this.updateMinimap();

    if (this.isDebugVisible) {
      this.updateDebugText();
    }
  }

  private isDown(direction: keyof MovementKeys): boolean {
    return Boolean(this.cursors[direction]?.isDown || this.movementKeys[direction].isDown);
  }

  private configureCamera(): void {
    const camera = this.cameras.main;
    camera.removeBounds();
    camera.setBackgroundColor('#16261f');
    camera.setZoom(CAMERA_ZOOM);
    camera.setRoundPixels(true);
    camera.startFollow(this.player, true, 0.1, 0.1);
  }

  private toggleDebug(): void {
    this.isDebugVisible = !this.isDebugVisible;
    this.helpText.setVisible(!this.isDebugVisible);
    this.debugText.setVisible(this.isDebugVisible);

    if (this.isDebugVisible) {
      this.updateDebugText();
    }
  }

  private updateHudLayout(): void {
    const topLeft = this.screenToHudPoint(HUD_MARGIN, HUD_MARGIN);
    this.helpText.setPosition(topLeft.x, topLeft.y);
    this.debugText.setPosition(topLeft.x, topLeft.y);
  }

  private updateMinimap(): void {
    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);

    if (tileX === this.minimapTileX && tileY === this.minimapTileY) {
      return;
    }

    this.minimapTileX = tileX;
    this.minimapTileY = tileY;
    this.drawMinimap(tileX, tileY);
  }

  private drawMinimap(centerTileX: number, centerTileY: number): void {
    const center = this.screenToHudPoint(
      this.cameras.main.width - HUD_MARGIN - MINIMAP_RADIUS,
      HUD_MARGIN + MINIMAP_RADIUS
    );
    const hudRadius = this.screenToHudLength(MINIMAP_RADIUS);
    const hudCellSize = this.screenToHudLength(MINIMAP_CELL_SIZE);
    const cellsPerRadius = Math.ceil(MINIMAP_RADIUS / MINIMAP_CELL_SIZE);

    this.minimapGraphics.clear();
    this.minimapGraphics.fillStyle(0xe8f0f7, 0.95);
    this.minimapGraphics.fillCircle(center.x, center.y, hudRadius + this.screenToHudLength(2));
    this.minimapGraphics.fillStyle(0x102019, 0.94);
    this.minimapGraphics.fillCircle(center.x, center.y, hudRadius);

    for (let cellY = -cellsPerRadius; cellY <= cellsPerRadius; cellY += 1) {
      for (let cellX = -cellsPerRadius; cellX <= cellsPerRadius; cellX += 1) {
        const screenOffsetX = cellX * MINIMAP_CELL_SIZE;
        const screenOffsetY = cellY * MINIMAP_CELL_SIZE;

        if (screenOffsetX * screenOffsetX + screenOffsetY * screenOffsetY > (MINIMAP_RADIUS - 2) * (MINIMAP_RADIUS - 2)) {
          continue;
        }

        const biome = biomeAtTile(
          WORLD_SEED,
          centerTileX + cellX * MINIMAP_TILES_PER_CELL,
          centerTileY + cellY * MINIMAP_TILES_PER_CELL
        );
        this.minimapGraphics.fillStyle(BIOME_COLORS[biome], 1);
        this.minimapGraphics.fillRect(
          center.x + cellX * hudCellSize - hudCellSize / 2,
          center.y + cellY * hudCellSize - hudCellSize / 2,
          hudCellSize,
          hudCellSize
        );
      }
    }


    this.minimapGraphics.fillStyle(0x65d6ff, 1);
    this.minimapGraphics.fillCircle(center.x, center.y, this.screenToHudLength(4));
    this.minimapGraphics.lineStyle(this.screenToHudLength(1), 0xffffff, 1);
    this.minimapGraphics.strokeCircle(center.x, center.y, this.screenToHudLength(4));
  }

  private screenToHudPoint(screenX: number, screenY: number): Phaser.Math.Vector2 {
    const camera = this.cameras.main;

    return new Phaser.Math.Vector2(
      (screenX - camera.width / 2) / camera.zoom + camera.width / 2,
      (screenY - camera.height / 2) / camera.zoom + camera.height / 2
    );
  }

  private screenToHudLength(screenLength: number): number {
    return screenLength / this.cameras.main.zoom;
  }

  private updateDebugText(): void {
    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);
    const climate = climateAtTile(WORLD_SEED, tileX, tileY);
    const feature = featureAtTile(WORLD_SEED, tileX, tileY);

    this.debugText.setText([
      `World: ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`,
      `Tile: ${tileX}, ${tileY} (${WORLD_TILE_SIZE}px)`,
      `Biome: ${biomeAtTile(WORLD_SEED, tileX, tileY)}`,
      `Elevation: ${climate.elevation.toFixed(2)}`,
      `Moisture: ${climate.moisture.toFixed(2)}`,
      `Temperature: ${climate.temperature.toFixed(2)}`,
      `Feature: ${feature ?? 'none'}`,
      `Seed: ${WORLD_SEED}`,
      `Chunk: ${this.chunkManager.currentChunkX}, ${this.chunkManager.currentChunkY}`,
      `Loaded chunks: ${this.chunkManager.loadedChunkCount}`,
      `FPS: ${this.game.loop.actualFps.toFixed(0)}`
    ]);
  }
}
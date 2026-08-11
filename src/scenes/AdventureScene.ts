import Phaser from 'phaser';
import { BIOME_COLORS, biomeAtTile, climateAtTile } from '../world/generation/biomeGenerator';
import { featureAtTile } from '../world/generation/featureGenerator';
import { FacingDirection, getInteractionTarget } from '../player/interaction';
import type { InteractionTarget } from '../player/interaction';
import { ChunkManager } from '../world/ChunkManager';
import { WORLD_SEED, WORLD_TILE_SIZE, worldToTile } from '../world/worldConfig';

const PLAYER_SPEED = 220;
const PLAYER_SIZE = 32;
const CAMERA_ZOOM = 0.75;
const HUD_MARGIN = 16;
const MINIMAP_RADIUS = 64;
const MINIMAP_CELL_SIZE = 2;
const MINIMAP_TILES_PER_CELL = 16;

type MovementKeys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

export class AdventureScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys!: MovementKeys;
  private chunkManager!: ChunkManager;
  private helpText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private interactionPrompt!: Phaser.GameObjects.Text;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private isDebugVisible = false;
  private facing = FacingDirection.Down;
  private interactionTarget: InteractionTarget | null = null;
  private minimapTileX = Number.NaN;
  private minimapTileY = Number.NaN;
  private interactionTileX = Number.NaN;
  private interactionTileY = Number.NaN;
  private interactionFacing: FacingDirection | null = null;

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
    this.input.keyboard!.on('keydown-E', this.tryInteract, this);

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

    this.interactionPrompt = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#102019dd',
        padding: { x: 10, y: 6 }
      })
      .setOrigin(0.5, 1)
      .setDepth(110)
      .setScrollFactor(0)
      .setVisible(false);

    this.minimapGraphics = this.add.graphics().setDepth(100).setScrollFactor(0);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.updateHudLayout();
    this.updateMinimap(true);
    this.updateInteractionTarget(true);
  }

  update(): void {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const horizontal = Number(this.isDown('right')) - Number(this.isDown('left'));
    const vertical = Number(this.isDown('down')) - Number(this.isDown('up'));

    this.updateFacing(horizontal, vertical);
    const direction = new Phaser.Math.Vector2(horizontal, vertical).normalize().scale(PLAYER_SPEED);
    playerBody.setVelocity(direction.x, direction.y);
    this.chunkManager.update(this.player.x, this.player.y);
    this.updateMinimap();
    this.updateInteractionTarget();

    if (this.isDebugVisible) {
      this.updateDebugText();
    }
  }

  private isDown(direction: keyof MovementKeys): boolean {
    return Boolean(this.cursors[direction]?.isDown || this.movementKeys[direction].isDown);
  }

  private updateFacing(horizontal: number, vertical: number): void {
    if (horizontal === 0 && vertical === 0) {
      return;
    }

    if (Math.abs(horizontal) >= Math.abs(vertical)) {
      this.facing = horizontal > 0 ? FacingDirection.Right : FacingDirection.Left;
      return;
    }

    this.facing = vertical > 0 ? FacingDirection.Down : FacingDirection.Up;
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

  private handleResize(): void {
    this.updateHudLayout();
    this.updateMinimap(true);
  }

  private handleShutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
  }

  private updateHudLayout(): void {
    const topLeft = this.screenToHudPoint(HUD_MARGIN, HUD_MARGIN);
    const promptPosition = this.screenToHudPoint(this.cameras.main.width / 2, this.cameras.main.height - HUD_MARGIN);
    this.helpText.setPosition(topLeft.x, topLeft.y);
    this.debugText.setPosition(topLeft.x, topLeft.y);
    this.interactionPrompt.setPosition(promptPosition.x, promptPosition.y);
  }

  private updateMinimap(force = false): void {
    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);

    if (!force && tileX === this.minimapTileX && tileY === this.minimapTileY) {
      return;
    }

    this.minimapTileX = tileX;
    this.minimapTileY = tileY;
    this.drawMinimap(this.player.x / WORLD_TILE_SIZE, this.player.y / WORLD_TILE_SIZE);
  }

  private drawMinimap(playerTileX: number, playerTileY: number): void {
    const center = this.screenToHudPoint(
      this.cameras.main.width - HUD_MARGIN - MINIMAP_RADIUS,
      HUD_MARGIN + MINIMAP_RADIUS
    );
    const hudRadius = this.screenToHudLength(MINIMAP_RADIUS);
    const hudCellSize = this.screenToHudLength(MINIMAP_CELL_SIZE);
    const cellsPerRadius = Math.ceil(MINIMAP_RADIUS / MINIMAP_CELL_SIZE) + 1;
    const anchorTileX = Math.floor(playerTileX / MINIMAP_TILES_PER_CELL) * MINIMAP_TILES_PER_CELL;
    const anchorTileY = Math.floor(playerTileY / MINIMAP_TILES_PER_CELL) * MINIMAP_TILES_PER_CELL;

    this.minimapGraphics.clear();
    this.minimapGraphics.fillStyle(0xe8f0f7, 0.95);
    this.minimapGraphics.fillCircle(center.x, center.y, hudRadius + this.screenToHudLength(2));
    this.minimapGraphics.fillStyle(0x102019, 0.94);
    this.minimapGraphics.fillCircle(center.x, center.y, hudRadius);

    for (let cellY = -cellsPerRadius; cellY <= cellsPerRadius; cellY += 1) {
      for (let cellX = -cellsPerRadius; cellX <= cellsPerRadius; cellX += 1) {
        const sampleTileX = anchorTileX + cellX * MINIMAP_TILES_PER_CELL;
        const sampleTileY = anchorTileY + cellY * MINIMAP_TILES_PER_CELL;
        const screenOffsetX = ((sampleTileX - playerTileX) / MINIMAP_TILES_PER_CELL) * MINIMAP_CELL_SIZE;
        const screenOffsetY = ((sampleTileY - playerTileY) / MINIMAP_TILES_PER_CELL) * MINIMAP_CELL_SIZE;

        if (screenOffsetX * screenOffsetX + screenOffsetY * screenOffsetY > (MINIMAP_RADIUS - 2) * (MINIMAP_RADIUS - 2)) {
          continue;
        }

        this.minimapGraphics.fillStyle(BIOME_COLORS[biomeAtTile(WORLD_SEED, sampleTileX, sampleTileY)], 1);
        this.minimapGraphics.fillRect(
          center.x + this.screenToHudLength(screenOffsetX) - hudCellSize / 2,
          center.y + this.screenToHudLength(screenOffsetY) - hudCellSize / 2,
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

  private updateInteractionTarget(force = false): void {
    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);

    if (!force && tileX === this.interactionTileX && tileY === this.interactionTileY && this.facing === this.interactionFacing) {
      return;
    }

    this.interactionTileX = tileX;
    this.interactionTileY = tileY;
    this.interactionFacing = this.facing;
    this.interactionTarget = getInteractionTarget(WORLD_SEED, tileX, tileY, this.facing);
    this.interactionPrompt.setVisible(Boolean(this.interactionTarget));

    if (this.interactionTarget) {
      this.interactionPrompt.setText(`Press E to inspect ${this.interactionTarget.feature}`);
    }
  }

  private tryInteract(): void {
    if (!this.interactionTarget) {
      return;
    }

    const worldX = (this.interactionTarget.tileX + 0.5) * WORLD_TILE_SIZE;
    const worldY = (this.interactionTarget.tileY + 0.5) * WORLD_TILE_SIZE;
    const feedback = this.add
      .text(worldX, worldY - 18, `Interacted with ${this.interactionTarget.feature}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#102019cc',
        padding: { x: 6, y: 4 }
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({
      targets: feedback,
      y: feedback.y - 24,
      alpha: 0,
      duration: 1000,
      ease: 'Sine.easeOut',
      onComplete: () => feedback.destroy()
    });
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
    const target = this.interactionTarget ? `${this.interactionTarget.feature} (${this.facing})` : 'none';

    this.debugText.setText([
      `World: ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`,
      `Tile: ${tileX}, ${tileY} (${WORLD_TILE_SIZE}px)`,
      `Biome: ${biomeAtTile(WORLD_SEED, tileX, tileY)}`,
      `Elevation: ${climate.elevation.toFixed(2)}`,
      `Moisture: ${climate.moisture.toFixed(2)}`,
      `Temperature: ${climate.temperature.toFixed(2)}`,
      `Feature: ${feature ?? 'none'}`,
      `Facing: ${this.facing}`,
      `Target: ${target}`,
      `Seed: ${WORLD_SEED}`,
      `Chunk: ${this.chunkManager.currentChunkX}, ${this.chunkManager.currentChunkY}`,
      `Loaded chunks: ${this.chunkManager.loadedChunkCount}`,
      `FPS: ${this.game.loop.actualFps.toFixed(0)}`
    ]);
  }
}

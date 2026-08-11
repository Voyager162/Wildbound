import Phaser from 'phaser';
import { Inventory, INVENTORY_SLOT_COUNT } from '../player/Inventory';
import { FacingDirection, getInteractionTarget } from '../player/interaction';
import { PLAYER_SPEED_SCALE } from '../player/playerConfig';
import type { InteractionTarget } from '../player/interaction';
import { ChunkManager } from '../world/ChunkManager';
import { BIOME_COLORS, biomeAtTile, climateAtTile } from '../world/generation/biomeGenerator';
import { featureAtTile } from '../world/generation/featureGenerator';
import { RESOURCE_COLORS, resourceForFeature, resourceLabel } from '../world/resources';
import { SessionWorldState } from '../world/SessionWorldState';
import { WORLD_SEED, WORLD_TILE_SIZE, worldToTile } from '../world/worldConfig';
import { MINIMAP_AREA_SCALE } from '../ui/uiConfig';

const BASE_PLAYER_SPEED = 220;
const PLAYER_SPEED = BASE_PLAYER_SPEED * (PLAYER_SPEED_SCALE / 50);
const PLAYER_SIZE = 32;
const HARVEST_DURATION_MS = 1000;
// This is the world view visible on a 16:9 display, regardless of window size.
const CAMERA_WORLD_VIEW_WIDTH = 2560;
const CAMERA_WORLD_VIEW_HEIGHT = 1440;
const HUD_MARGIN = 8;
const MINIMAP_RADIUS = 64;
const MINIMAP_CELL_SIZE = 2;
const MINIMAP_TILES_PER_CELL = Math.max(1, Math.round(16 * (MINIMAP_AREA_SCALE / 50)));
const UI_TEXT_RESOLUTION = Math.max(1, window.devicePixelRatio || 1);
const INVENTORY_COLUMNS = 4;
const INVENTORY_SLOT_SIZE = 62;
const INVENTORY_SLOT_GAP = 6;
const INVENTORY_PANEL_PADDING = 18;
const INVENTORY_TITLE_HEIGHT = 36;
const INVENTORY_ROWS = Math.ceil(INVENTORY_SLOT_COUNT / INVENTORY_COLUMNS);
const INVENTORY_PANEL_WIDTH = INVENTORY_PANEL_PADDING * 2 + INVENTORY_COLUMNS * INVENTORY_SLOT_SIZE + (INVENTORY_COLUMNS - 1) * INVENTORY_SLOT_GAP;
const INVENTORY_PANEL_HEIGHT = INVENTORY_PANEL_PADDING * 2 + INVENTORY_TITLE_HEIGHT + INVENTORY_ROWS * INVENTORY_SLOT_SIZE + (INVENTORY_ROWS - 1) * INVENTORY_SLOT_GAP;

type MovementKeys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

export class AdventureScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys!: MovementKeys;
  private chunkManager!: ChunkManager;
  private sessionWorldState!: SessionWorldState;
  private inventory!: Inventory;
  private debugElement!: HTMLPreElement;
  private inventoryTitleText!: Phaser.GameObjects.Text;
  private inventorySlotTexts: Phaser.GameObjects.Text[] = [];
  private inventoryPanelGraphics!: Phaser.GameObjects.Graphics;
  private interactionPrompt!: Phaser.GameObjects.Text;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private harvestProgressGraphics!: Phaser.GameObjects.Graphics;
  private isDebugVisible = false;
  private inventoryOpen = false;
  private facing = FacingDirection.Down;
  private interactionTarget: InteractionTarget | null = null;
  private harvestTarget: InteractionTarget | null = null;
  private harvestElapsedMs = 0;
  private harvestRequiresMouseRelease = false;
  private minimapTileX = Number.NaN;
  private minimapTileY = Number.NaN;

  constructor() {
    super('adventure');
  }

  create(): void {
    this.sessionWorldState = new SessionWorldState();
    this.inventory = new Inventory();
    this.chunkManager = new ChunkManager(this, WORLD_SEED, this.sessionWorldState);
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
    this.input.keyboard!.on('keydown-E', this.toggleInventory, this);

    this.createDebugElement();

    this.inventoryPanelGraphics = this.add.graphics().setDepth(120).setScrollFactor(0);
    this.inventoryTitleText = this.add
      .text(0, 0, 'Inventory - E to close', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#ffffff'
      })
      .setResolution(UI_TEXT_RESOLUTION)
      .setDepth(121)
      .setScrollFactor(0)
      .setVisible(false);

    for (let index = 0; index < INVENTORY_SLOT_COUNT; index += 1) {
      this.inventorySlotTexts.push(
        this.add
          .text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#ffffff',
            align: 'center'
          })
          .setOrigin(0.5)
          .setResolution(UI_TEXT_RESOLUTION)
          .setDepth(121)
          .setScrollFactor(0)
          .setVisible(false)
      );
    }

    this.interactionPrompt = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#102019dd',
        padding: { x: 10, y: 6 }
      })
      .setOrigin(0.5, 1)
      .setResolution(UI_TEXT_RESOLUTION)
      .setDepth(110)
      .setScrollFactor(0)
      .setVisible(false);

    this.minimapGraphics = this.add.graphics().setDepth(100).setScrollFactor(0);
    this.harvestProgressGraphics = this.add.graphics().setDepth(15);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.updateHudLayout();
    this.updateInventoryUi();
    this.updateMinimap(true);
    this.updateInteractionTarget();
  }

  update(_time: number, delta: number): void {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const horizontal = Number(this.isDown('right')) - Number(this.isDown('left'));
    const vertical = Number(this.isDown('down')) - Number(this.isDown('up'));

    this.updateFacing(horizontal, vertical);
    const direction = new Phaser.Math.Vector2(horizontal, vertical).normalize().scale(PLAYER_SPEED);
    playerBody.setVelocity(direction.x, direction.y);
    this.chunkManager.update(this.player.x, this.player.y);
    this.updateMinimap();
    this.updateInteractionTarget();
    this.updateHarvesting(delta);

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
    camera.setRoundPixels(true);
    this.updateCameraZoom();
    camera.startFollow(this.player, true, 0.1, 0.1);
  }

  private updateCameraZoom(): void {
    const camera = this.cameras.main;
    const zoom = Math.min(
      camera.width / CAMERA_WORLD_VIEW_WIDTH,
      camera.height / CAMERA_WORLD_VIEW_HEIGHT
    );

    camera.setZoom(Math.max(zoom, 0.1));
  }

  private createDebugElement(): void {
    const gameElement = document.getElementById('game');

    if (!gameElement) {
      throw new Error('Wildbound game container was not found.');
    }

    this.debugElement = document.createElement('pre');
    this.debugElement.className = 'debug-overlay';
    gameElement.append(this.debugElement);
  }

  private toggleDebug(): void {
    this.isDebugVisible = !this.isDebugVisible;
    this.debugElement.classList.toggle('is-visible', this.isDebugVisible);

    if (this.isDebugVisible) {
      this.updateDebugText();
    }
  }

  private toggleInventory(): void {
    this.inventoryOpen = !this.inventoryOpen;
    this.cancelHarvesting();
    this.updateInventoryUi();
  }

  private handleResize(): void {
    this.updateCameraZoom();
    this.updateHudLayout();
    this.updateMinimap(true);
  }

  private handleShutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.debugElement.remove();
  }

  private updateHudLayout(): void {
    const camera = this.cameras.main;
    const hudScale = 1 / camera.zoom;
    const promptPosition = this.screenToHudPoint(camera.width / 2, camera.height - HUD_MARGIN);

    this.interactionPrompt.setScale(hudScale).setPosition(promptPosition.x, promptPosition.y);
    this.drawInventoryPanel();
  }

  private updateInventoryUi(): void {
    this.drawInventoryPanel();
  }

  private drawInventoryPanel(): void {
    this.inventoryPanelGraphics.clear();

    if (!this.inventoryOpen) {
      this.inventoryTitleText.setVisible(false);
      this.inventorySlotTexts.forEach((slotText) => slotText.setVisible(false));
      return;
    }

    const camera = this.cameras.main;
    const hudScale = 1 / camera.zoom;
    const left = (camera.width - INVENTORY_PANEL_WIDTH) / 2;
    const top = (camera.height - INVENTORY_PANEL_HEIGHT) / 2;
    const panelTopLeft = this.screenToHudPoint(left, top);
    const hudPanelWidth = this.screenToHudLength(INVENTORY_PANEL_WIDTH);
    const hudPanelHeight = this.screenToHudLength(INVENTORY_PANEL_HEIGHT);
    const hudSlotSize = this.screenToHudLength(INVENTORY_SLOT_SIZE);
    const hudSlotGap = this.screenToHudLength(INVENTORY_SLOT_GAP);
    const hudPadding = this.screenToHudLength(INVENTORY_PANEL_PADDING);
    const hudTitleHeight = this.screenToHudLength(INVENTORY_TITLE_HEIGHT);

    this.inventoryPanelGraphics.fillStyle(0x102019, 0.96);
    this.inventoryPanelGraphics.fillRoundedRect(panelTopLeft.x, panelTopLeft.y, hudPanelWidth, hudPanelHeight, this.screenToHudLength(10));
    this.inventoryPanelGraphics.lineStyle(this.screenToHudLength(2), 0xe8f0f7, 0.9);
    this.inventoryPanelGraphics.strokeRoundedRect(panelTopLeft.x, panelTopLeft.y, hudPanelWidth, hudPanelHeight, this.screenToHudLength(10));

    const titlePosition = this.screenToHudPoint(left + INVENTORY_PANEL_PADDING, top + 10);
    this.inventoryTitleText.setScale(hudScale).setPosition(titlePosition.x, titlePosition.y).setVisible(true);

    const slots = this.inventory.getSlots();
    slots.forEach((slot, index) => {
      const column = index % INVENTORY_COLUMNS;
      const row = Math.floor(index / INVENTORY_COLUMNS);
      const slotX = panelTopLeft.x + hudPadding + column * (hudSlotSize + hudSlotGap);
      const slotY = panelTopLeft.y + hudPadding + hudTitleHeight + row * (hudSlotSize + hudSlotGap);
      const textPosition = this.screenToHudPoint(
        left + INVENTORY_PANEL_PADDING + column * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP) + INVENTORY_SLOT_SIZE / 2,
        top + INVENTORY_PANEL_PADDING + INVENTORY_TITLE_HEIGHT + row * (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_GAP) + INVENTORY_SLOT_SIZE / 2
      );
      const slotText = this.inventorySlotTexts[index];

      this.inventoryPanelGraphics.fillStyle(0x263b2e, 1);
      this.inventoryPanelGraphics.fillRoundedRect(slotX, slotY, hudSlotSize, hudSlotSize, this.screenToHudLength(4));
      this.inventoryPanelGraphics.lineStyle(this.screenToHudLength(1), 0x78907f, 0.9);
      this.inventoryPanelGraphics.strokeRoundedRect(slotX, slotY, hudSlotSize, hudSlotSize, this.screenToHudLength(4));

      if (!slot) {
        slotText.setVisible(false);
        return;
      }

      this.inventoryPanelGraphics.fillStyle(RESOURCE_COLORS[slot.resource], 1);
      this.inventoryPanelGraphics.fillCircle(slotX + hudSlotSize / 2, slotY + hudSlotSize * 0.32, this.screenToHudLength(11));
      slotText
        .setScale(hudScale)
        .setPosition(textPosition.x, textPosition.y + this.screenToHudLength(9))
        .setText(`${resourceLabel(slot.resource)}\n${slot.amount}`)
        .setVisible(true);
    });
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

  private updateInteractionTarget(): void {
    this.interactionTarget = getInteractionTarget(
      WORLD_SEED,
      this.player.x,
      this.player.y,
      (tileX, tileY) => !this.sessionWorldState.isFeatureHarvested(tileX, tileY)
    );

    if (this.harvestTarget) {
      return;
    }

    if (this.interactionTarget) {
      this.interactionPrompt.setText(`Hold Left Click to harvest ${this.interactionTarget.feature}`);
      this.interactionPrompt.setVisible(true);
      return;
    }

    this.interactionPrompt.setVisible(false);
  }

  private updateHarvesting(delta: number): void {
    if (this.harvestRequiresMouseRelease) {
      if (!this.input.activePointer.leftButtonDown()) {
        this.harvestRequiresMouseRelease = false;
      }

      return;
    }

    if (this.inventoryOpen || !this.input.activePointer.leftButtonDown() || !this.interactionTarget) {
      this.cancelHarvesting();
      return;
    }

    if (!this.harvestTarget || !this.sameTarget(this.harvestTarget, this.interactionTarget)) {
      this.cancelHarvesting();
      this.harvestTarget = { ...this.interactionTarget };
    }

    this.harvestElapsedMs = Math.min(this.harvestElapsedMs + delta, HARVEST_DURATION_MS);
    const progress = this.harvestElapsedMs / HARVEST_DURATION_MS;
    this.chunkManager.setHarvestAnimation(this.harvestTarget.tileX, this.harvestTarget.tileY, progress);
    this.drawHarvestProgress(this.harvestTarget, progress);
    this.interactionPrompt.setText(`Harvesting ${this.harvestTarget.feature} ${Math.round(progress * 100)}%`);
    this.interactionPrompt.setVisible(true);

    if (progress >= 1) {
      this.completeHarvest();
    }
  }

  private completeHarvest(): void {
    const target = this.harvestTarget;

    if (!target) {
      return;
    }

    this.cancelHarvesting();
    this.harvestRequiresMouseRelease = true;
    const resource = resourceForFeature(target.feature);

    if (!this.inventory.canAdd(resource, 1)) {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
      return;
    }

    if (!this.chunkManager.harvestFeature(target.tileX, target.tileY)) {
      return;
    }

    this.inventory.add(resource, 1);
    this.updateInventoryUi();
    this.showWorldFeedback(this.player.x, this.player.y - 28, `+ 1 ${resourceLabel(resource)}`);
    this.updateInteractionTarget();
  }

  private cancelHarvesting(): void {
    if (this.harvestTarget) {
      this.chunkManager.clearHarvestAnimation(this.harvestTarget.tileX, this.harvestTarget.tileY);
    }

    this.harvestTarget = null;
    this.harvestElapsedMs = 0;
    this.harvestProgressGraphics.clear();
  }

  private drawHarvestProgress(target: InteractionTarget, progress: number): void {
    const centerX = (target.tileX + 0.5) * WORLD_TILE_SIZE + 32;
    const centerY = (target.tileY + 0.5) * WORLD_TILE_SIZE - 32;
    const radius = 16;

    this.harvestProgressGraphics.clear();
    this.harvestProgressGraphics.fillStyle(0x102019, 0.88);
    this.harvestProgressGraphics.fillCircle(centerX, centerY, radius + 4);
    this.harvestProgressGraphics.lineStyle(4, 0x6f8492, 0.95);
    this.harvestProgressGraphics.strokeCircle(centerX, centerY, radius);
    this.harvestProgressGraphics.lineStyle(4, 0xf2d36b, 1);
    this.harvestProgressGraphics.beginPath();
    this.harvestProgressGraphics.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false);
    this.harvestProgressGraphics.strokePath();
  }

  private showWorldFeedback(worldX: number, worldY: number, message: string): void {
    const feedback = this.add
      .text(worldX, worldY, message, {
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

  private sameTarget(first: InteractionTarget, second: InteractionTarget): boolean {
    return first.tileX === second.tileX && first.tileY === second.tileY;
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
    const generatedFeature = featureAtTile(WORLD_SEED, tileX, tileY);
    const feature = this.sessionWorldState.isFeatureHarvested(tileX, tileY) ? 'harvested' : (generatedFeature ?? 'none');
    const target = this.interactionTarget ? this.interactionTarget.feature : 'none';
    const usedInventorySlots = this.inventory.getSlots().filter((slot) => slot !== null).length;

    this.debugElement.textContent = [
      'WILDBOUND DEBUG',
      `World      ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`,
      `Tile       ${tileX}, ${tileY} (${WORLD_TILE_SIZE}px)`,
      `Biome      ${biomeAtTile(WORLD_SEED, tileX, tileY)}`,
      `Elevation  ${climate.elevation.toFixed(2)}`,
      `Moisture   ${climate.moisture.toFixed(2)}`,
      `Temp       ${climate.temperature.toFixed(2)}`,
      `Feature    ${feature}`,
      `Facing     ${this.facing}`,
      `Target     ${target}`,
      `Harvested  ${this.sessionWorldState.harvestedFeatureCount}`,
      `Inventory  ${usedInventorySlots}/${INVENTORY_SLOT_COUNT} slots`,
      `Seed       ${WORLD_SEED}`,
      `Chunk      ${this.chunkManager.currentChunkX}, ${this.chunkManager.currentChunkY}`,
      `Loaded     ${this.chunkManager.loadedChunkCount} chunks`,
      `FPS        ${this.game.loop.actualFps.toFixed(0)}`
    ].join('\n');
  }
}
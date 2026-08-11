import Phaser from 'phaser';
import type { InventorySlot } from '../player/Inventory';
import { Inventory, INVENTORY_SLOT_COUNT } from '../player/Inventory';
import { FacingDirection, getInteractionTarget } from '../player/interaction';
import { PLAYER_SPEED_SCALE } from '../player/playerConfig';
import type { InteractionTarget } from '../player/interaction';
import { isSaveGameData, type SaveGameData } from '../save/SaveGameData';
import { InventoryOverlay } from '../ui/InventoryOverlay';
import { MinimapOverlay } from '../ui/MinimapOverlay';
import { MINIMAP_AREA_SCALE } from '../ui/uiConfig';
import { ChunkManager } from '../world/ChunkManager';
import { DropManager } from '../world/DropManager';
import { biomeAtTile, climateAtTile } from '../world/generation/biomeGenerator';
import { featureAtTile } from '../world/generation/featureGenerator';
import { isTraversableWaterAt } from '../world/generation/terrainGenerator';
import { resourceForFeature, resourceLabel } from '../world/resources';
import { SessionWorldState } from '../world/SessionWorldState';
import type { DroppedItem } from '../world/SessionWorldState';
import { WORLD_SEED, WORLD_TILE_SIZE, worldToTile } from '../world/worldConfig';

const BASE_PLAYER_SPEED = 220;
const PLAYER_SPEED = BASE_PLAYER_SPEED * (PLAYER_SPEED_SCALE / 50);
const SWIM_SPEED_MULTIPLIER = 0.42;
const PLAYER_SIZE = 32;
const HARVEST_DURATION_MS = 1000;
const HARVEST_RING_RADIUS = 16;
const CAMERA_WORLD_VIEW_WIDTH = 2560;
const CAMERA_WORLD_VIEW_HEIGHT = 1440;
const MINIMAP_UPDATE_INTERVAL_MS = 250;
const DEBUG_UPDATE_INTERVAL_MS = 250;
const DROP_INTERACTION_INTERVAL_MS = 120;
const SAVE_INTERVAL_MS = 900;
const MINIMAP_TILES_PER_CELL = Math.max(1, Math.round(16 * (MINIMAP_AREA_SCALE / 50)));

type MovementKeys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

export class AdventureScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerAvatar!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys!: MovementKeys;
  private chunkManager!: ChunkManager;
  private dropManager!: DropManager;
  private sessionWorldState!: SessionWorldState;
  private inventory!: Inventory;
  private inventoryOverlay!: InventoryOverlay;
  private minimapOverlay!: MinimapOverlay;
  private debugElement!: HTMLPreElement;
  private interactionHighlight!: Phaser.GameObjects.Ellipse;
  private dropHighlight!: Phaser.GameObjects.Ellipse;
  private dropHint!: Phaser.GameObjects.Text;
  private harvestProgressGraphics!: Phaser.GameObjects.Graphics;
  private isDebugVisible = false;
  private inventoryOpen = false;
  private worldReady = false;
  private worldSeed = WORLD_SEED;
  private facing = FacingDirection.Down;
  private isSwimming = false;
  private interactionTarget: InteractionTarget | null = null;
  private nearbyDrop: DroppedItem | null = null;
  private harvestTarget: InteractionTarget | null = null;
  private harvestElapsedMs = 0;
  private harvestRequiresMouseRelease = false;
  private lastInteractionTileX = Number.NaN;
  private lastInteractionTileY = Number.NaN;
  private lastMinimapUpdateMs = Number.NEGATIVE_INFINITY;
  private lastDebugUpdateMs = Number.NEGATIVE_INFINITY;
  private lastDropInteractionMs = Number.NEGATIVE_INFINITY;
  private lastSaveAttemptMs = Number.NEGATIVE_INFINITY;
  private animationElapsedMs = 0;
  private lastAvatarState = '';
  private saveDirty = false;
  private savePending = false;

  constructor() {
    super('adventure');
  }

  create(): void {
    this.sessionWorldState = new SessionWorldState();
    this.inventory = new Inventory();
    this.player = this.add.rectangle(WORLD_TILE_SIZE / 2, WORLD_TILE_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE).setVisible(false);
    this.playerAvatar = this.add.graphics().setDepth(10);
    this.harvestProgressGraphics = this.add.graphics().setDepth(15);
    this.interactionHighlight = this.add
      .ellipse(0, 0, 88, 88, 0xf5d76e, 0.12)
      .setStrokeStyle(3, 0xffec8b, 0.95)
      .setDepth(0.5)
      .setVisible(false);
    this.dropHighlight = this.add
      .ellipse(0, 0, 30, 30, 0x7de6ff, 0.09)
      .setStrokeStyle(2, 0xa9f4ff, 0.92)
      .setDepth(8.5)
      .setVisible(false);
    this.dropHint = this.add
      .text(0, 0, 'E', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#e9fdff' })
      .setOrigin(0.5)
      .setDepth(11)
      .setVisible(false);
    this.tweens.add({
      targets: [this.interactionHighlight, this.dropHighlight],
      alpha: { from: 0.35, to: 0.92 },
      scale: { from: 0.92, to: 1.08 },
      duration: 650,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });
    this.drawPlayerAvatar(0);

    this.configureCamera();
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.movementKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    }) as MovementKeys;
    this.input.keyboard!.on('keydown-F3', this.toggleDebug, this);
    this.input.keyboard!.on('keydown-E', this.handlePrimaryAction, this);

    const gameElement = document.getElementById('game');
    if (!gameElement) {
      throw new Error('Wildbound game container was not found.');
    }

    this.createDebugElement(gameElement);
    this.inventoryOverlay = new InventoryOverlay(
      gameElement,
      this.inventory,
      () => this.markSaveDirty(),
      (slot) => this.dropInventorySlot(slot)
    );
    this.minimapOverlay = new MinimapOverlay(gameElement);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    void this.loadSavedWorld();
  }

  update(time: number, delta: number): void {
    if (!this.worldReady) {
      return;
    }

    const horizontal = Number(this.isDown('right')) - Number(this.isDown('left'));
    const vertical = Number(this.isDown('down')) - Number(this.isDown('up'));
    const isMoving = horizontal !== 0 || vertical !== 0;

    this.updateFacing(horizontal, vertical);
    if (isMoving) {
      const length = Math.hypot(horizontal, vertical);
      const speed = PLAYER_SPEED * (this.isSwimming ? SWIM_SPEED_MULTIPLIER : 1);
      this.player.x += (horizontal / length) * speed * (delta / 1000);
      this.player.y += (vertical / length) * speed * (delta / 1000);
      this.markSaveDirty();
    }

    this.isSwimming = isTraversableWaterAt(this.worldSeed, worldToTile(this.player.x), worldToTile(this.player.y));
    this.updatePlayerAvatar(delta, isMoving);
    this.chunkManager.update(this.player.x, this.player.y);
    this.chunkManager.updateWaterAnimation(time);
    this.updateInteractionTarget();
    this.updateDropInteraction(time);
    this.updateHarvesting(delta);
    this.updateMinimap(time);
    this.persistIfNeeded(time);

    if (this.isDebugVisible && time - this.lastDebugUpdateMs >= DEBUG_UPDATE_INTERVAL_MS) {
      this.lastDebugUpdateMs = time;
      this.updateDebugText();
    }
  }

  private async loadSavedWorld(): Promise<void> {
    let savedGame: SaveGameData | null = null;

    try {
      const loaded = await window.wildboundSave?.load();
      savedGame = isSaveGameData(loaded) ? loaded : null;
    } catch (error) {
      console.warn('Wildbound could not load its local save.', error);
    }

    if (savedGame) {
      this.worldSeed = savedGame.seed;
      this.inventory.restore(savedGame.inventory);
      this.sessionWorldState.restore(savedGame.world);
      this.player.setPosition(savedGame.player.x, savedGame.player.y);
    }

    this.chunkManager = new ChunkManager(this, this.worldSeed, this.sessionWorldState);
    this.dropManager = new DropManager(this, this.sessionWorldState);
    this.worldReady = true;
    this.isSwimming = isTraversableWaterAt(this.worldSeed, worldToTile(this.player.x), worldToTile(this.player.y));
    this.chunkManager.update(this.player.x, this.player.y);
    this.updatePlayerAvatar(0, false);
    this.updateInteractionTarget(true);
    this.updateDropInteraction(0, true);
    this.updateMinimap(0, true);
    this.updateDebugText();

    if (!savedGame) {
      this.markSaveDirty();
    }
  }

  private isDown(direction: keyof MovementKeys): boolean {
    return Boolean(this.cursors[direction]?.isDown || this.movementKeys[direction].isDown);
  }

  private updateFacing(horizontal: number, vertical: number): void {
    if (horizontal === 0 && vertical === 0) {
      return;
    }

    if (horizontal > 0 && vertical < 0) {
      this.facing = FacingDirection.UpRight;
    } else if (horizontal > 0 && vertical > 0) {
      this.facing = FacingDirection.DownRight;
    } else if (horizontal < 0 && vertical < 0) {
      this.facing = FacingDirection.UpLeft;
    } else if (horizontal < 0 && vertical > 0) {
      this.facing = FacingDirection.DownLeft;
    } else if (horizontal > 0) {
      this.facing = FacingDirection.Right;
    } else if (horizontal < 0) {
      this.facing = FacingDirection.Left;
    } else if (vertical < 0) {
      this.facing = FacingDirection.Up;
    } else {
      this.facing = FacingDirection.Down;
    }
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
    const zoom = Math.min(camera.width / CAMERA_WORLD_VIEW_WIDTH, camera.height / CAMERA_WORLD_VIEW_HEIGHT);
    camera.setZoom(Math.max(zoom, 0.1));
  }

  private createDebugElement(gameElement: HTMLElement): void {
    this.debugElement = document.createElement('pre');
    this.debugElement.className = 'debug-overlay';
    gameElement.append(this.debugElement);
  }

  private toggleDebug(): void {
    this.isDebugVisible = !this.isDebugVisible;
    this.debugElement.classList.toggle('is-visible', this.isDebugVisible);

    if (this.isDebugVisible && this.worldReady) {
      this.updateDebugText();
    }
  }

  private handlePrimaryAction(): void {
    if (!this.worldReady) {
      return;
    }

    if (this.inventoryOpen) {
      this.toggleInventory();
      return;
    }

    if (this.pickupNearbyDrop()) {
      return;
    }

    this.toggleInventory();
  }

  private toggleInventory(): void {
    this.inventoryOpen = !this.inventoryOpen;
    this.cancelHarvesting();
    this.inventoryOverlay.setOpen(this.inventoryOpen);
  }

  private handleResize(): void {
    this.updateCameraZoom();
    if (this.worldReady) {
      this.updateMinimap(0, true);
    }
  }

  private handleShutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.debugElement.remove();
    this.inventoryOverlay.destroy();
    this.minimapOverlay.destroy();
    this.chunkManager?.destroy();
    this.dropManager?.destroy();
  }

  private readonly handleBeforeUnload = (): void => {
    void this.persistSave();
  };

  private updatePlayerAvatar(delta: number, isMoving: boolean): void {
    if (isMoving) {
      this.animationElapsedMs += delta;
    } else {
      this.animationElapsedMs = 0;
    }

    this.playerAvatar.setPosition(this.player.x, this.player.y);
    const animationFrame = isMoving
      ? Math.floor(this.animationElapsedMs / (this.isSwimming ? 145 : 115)) % (this.isSwimming ? 3 : 2)
      : 0;
    const state = `${this.facing}:${this.isSwimming}:${animationFrame}`;

    if (state !== this.lastAvatarState) {
      this.lastAvatarState = state;
      this.drawPlayerAvatar(animationFrame);
    }
  }

  private drawPlayerAvatar(animationFrame: number): void {
    const avatar = this.playerAvatar;
    const direction = this.facingVector();
    const stride = this.isSwimming ? Math.sin(animationFrame / 3 * Math.PI * 2) * 2 : animationFrame === 1 ? 3 : -3;
    const sideFacing = Math.abs(direction.x) > 0.45;
    const diagonalFacing = Math.abs(direction.x) > 0.45 && Math.abs(direction.y) > 0.45;

    avatar.clear();
    avatar.fillStyle(this.isSwimming ? 0x4ca7bd : 0x152129, this.isSwimming ? 0.45 : 0.32);
    avatar.fillEllipse(0, this.isSwimming ? 8 : 14, this.isSwimming ? 35 : 24, this.isSwimming ? 11 : 8);

    if (this.isSwimming) {
      avatar.fillStyle(0x5ebfd2, 0.64);
      avatar.fillEllipse(0, 5, 28, 10);
      avatar.fillStyle(0x65a8d8, 1);
      avatar.fillRoundedRect(-8, -4, 16, 13, 4);
      avatar.fillStyle(0xe1ae86, 1);
      avatar.fillCircle(0, -12, 8);
      avatar.fillStyle(0x3a2720, 1);
      avatar.fillRect(-7, -19, 14, 5);
      avatar.fillCircle(-5, -16, 3);
      avatar.fillCircle(5, -16, 3);
      avatar.fillStyle(0xe1ae86, 1);
      avatar.fillRoundedRect(-13 + direction.x * 3, -2 + stride, 6, 8, 3);
      avatar.fillRoundedRect(7 + direction.x * 3, -2 - stride, 6, 8, 3);
      if (direction.y >= 0 || diagonalFacing) {
        avatar.fillStyle(0x263238, 1);
        avatar.fillCircle(direction.x * 2 - 2, -12 + direction.y * 2, 1.2);
        avatar.fillCircle(direction.x * 2 + 3, -12 + direction.y * 2, 1.2);
      }
      return;
    }

    avatar.fillStyle(0x27394a, 1);
    avatar.fillRoundedRect(-8, -6, 16, 16, 4);
    avatar.fillStyle(0x1c2a37, 1);
    avatar.fillRect(-7, 9, 5, 10 + stride);
    avatar.fillRect(3, 9, 5, 10 - stride);
    avatar.fillStyle(0x65a8d8, 1);
    avatar.fillRoundedRect(-7, -5, 14, 13, 3);
    avatar.fillStyle(0xe1ae86, 1);
    avatar.fillCircle(0, -13, 8);
    avatar.fillStyle(0x3a2720, 1);
    avatar.fillRect(-7, -20, 14, 5);
    avatar.fillCircle(-5, -17, 3);
    avatar.fillCircle(5, -17, 3);
    avatar.fillStyle(0xe1ae86, 1);
    avatar.fillRoundedRect(-13 + direction.x * 3, -3 + stride * 0.45, 5, 12, 2);
    avatar.fillRoundedRect(8 + direction.x * 3, -3 - stride * 0.45, 5, 12, 2);

    if (direction.y >= 0 || diagonalFacing) {
      avatar.fillStyle(0x263238, 1);
      const eyeOffset = sideFacing ? direction.x * 3 : 0;
      avatar.fillCircle(-3 + eyeOffset, -13 + direction.y * 1.5, 1.2);
      avatar.fillCircle(3 + eyeOffset, -13 + direction.y * 1.5, 1.2);
      if (direction.y > 0) {
        avatar.lineStyle(1, 0x7b4e3b, 0.9);
        avatar.lineBetween(-2 + eyeOffset, -8, 2 + eyeOffset, -8);
      }
    } else {
      avatar.fillStyle(0x3a2720, 1);
      avatar.fillCircle(0, -14, 7);
    }
  }

  private updateMinimap(time: number, force = false): void {
    if (!force && time - this.lastMinimapUpdateMs < MINIMAP_UPDATE_INTERVAL_MS) {
      return;
    }

    this.lastMinimapUpdateMs = time;
    this.minimapOverlay.draw(
      this.worldSeed,
      this.player.x / WORLD_TILE_SIZE,
      this.player.y / WORLD_TILE_SIZE,
      MINIMAP_TILES_PER_CELL
    );
  }

  private updateInteractionTarget(force = false): void {
    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);

    if (!force && tileX === this.lastInteractionTileX && tileY === this.lastInteractionTileY) {
      return;
    }

    this.lastInteractionTileX = tileX;
    this.lastInteractionTileY = tileY;
    this.interactionTarget = getInteractionTarget(
      this.worldSeed,
      this.player.x,
      this.player.y,
      (candidateX, candidateY) => !this.sessionWorldState.isFeatureHarvested(candidateX, candidateY)
    );

    if (this.interactionTarget) {
      this.interactionHighlight
        .setPosition(
          (this.interactionTarget.tileX + 0.5) * WORLD_TILE_SIZE,
          (this.interactionTarget.tileY + 0.5) * WORLD_TILE_SIZE
        )
        .setVisible(true);
    } else {
      this.interactionHighlight.setVisible(false);
    }
  }

  private updateDropInteraction(time: number, force = false): void {
    if (!force && time - this.lastDropInteractionMs < DROP_INTERACTION_INTERVAL_MS) {
      return;
    }

    this.lastDropInteractionMs = time;
    this.nearbyDrop = this.dropManager.findNearest(this.player.x, this.player.y);
    if (!this.nearbyDrop) {
      this.dropHighlight.setVisible(false);
      this.dropHint.setVisible(false);
      return;
    }

    this.dropHighlight.setPosition(this.nearbyDrop.worldX, this.nearbyDrop.worldY).setVisible(true);
    this.dropHint.setPosition(this.nearbyDrop.worldX, this.nearbyDrop.worldY - 18).setVisible(true);
  }

  private pickupNearbyDrop(): boolean {
    const drop = this.dropManager.findNearest(this.player.x, this.player.y);
    if (!drop) {
      return false;
    }

    if (!this.inventory.canAdd(drop.resource, drop.amount)) {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
      return true;
    }

    const collected = this.dropManager.collect(drop.id);
    if (collected) {
      this.inventory.add(collected.resource, collected.amount);
      this.showWorldFeedback(this.player.x, this.player.y - 28, `+ ${collected.amount} ${resourceLabel(collected.resource)}`);
      this.markSaveDirty();
      this.updateDropInteraction(0, true);
    }

    return true;
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
    this.showWorldFeedback(this.player.x, this.player.y - 28, `+ 1 ${resourceLabel(resource)}`);
    this.markSaveDirty();
    this.updateInteractionTarget(true);
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
    this.harvestProgressGraphics.clear();
    this.harvestProgressGraphics.fillStyle(0x102019, 0.88);
    this.harvestProgressGraphics.fillCircle(centerX, centerY, HARVEST_RING_RADIUS + 4);
    this.harvestProgressGraphics.lineStyle(4, 0x6f8492, 0.95);
    this.harvestProgressGraphics.strokeCircle(centerX, centerY, HARVEST_RING_RADIUS);
    this.harvestProgressGraphics.lineStyle(4, 0xf2d36b, 1);
    this.harvestProgressGraphics.beginPath();
    this.harvestProgressGraphics.arc(
      centerX,
      centerY,
      HARVEST_RING_RADIUS,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
      false
    );
    this.harvestProgressGraphics.strokePath();
  }

  private dropInventorySlot(slot: InventorySlot): void {
    if (!this.worldReady) {
      return;
    }

    const direction = this.facingVector();
    const drop = this.sessionWorldState.createDropAt(
      this.player.x + direction.x * 68,
      this.player.y + direction.y * 68,
      slot.resource,
      slot.amount
    );
    this.dropManager.add(drop);
    this.showWorldFeedback(this.player.x, this.player.y - 28, `Dropped ${slot.amount} ${resourceLabel(slot.resource)}`);
    this.markSaveDirty();
    this.updateDropInteraction(0, true);
  }

  private facingVector(): Phaser.Math.Vector2 {
    switch (this.facing) {
      case FacingDirection.Up:
        return new Phaser.Math.Vector2(0, -1);
      case FacingDirection.UpRight:
        return new Phaser.Math.Vector2(0.707, -0.707);
      case FacingDirection.Right:
        return new Phaser.Math.Vector2(1, 0);
      case FacingDirection.DownRight:
        return new Phaser.Math.Vector2(0.707, 0.707);
      case FacingDirection.Down:
        return new Phaser.Math.Vector2(0, 1);
      case FacingDirection.DownLeft:
        return new Phaser.Math.Vector2(-0.707, 0.707);
      case FacingDirection.Left:
        return new Phaser.Math.Vector2(-1, 0);
      case FacingDirection.UpLeft:
        return new Phaser.Math.Vector2(-0.707, -0.707);
    }
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

  private markSaveDirty(): void {
    this.saveDirty = true;
  }

  private persistIfNeeded(time: number): void {
    if (!this.saveDirty || this.savePending || time - this.lastSaveAttemptMs < SAVE_INTERVAL_MS) {
      return;
    }

    this.lastSaveAttemptMs = time;
    void this.persistSave();
  }

  private async persistSave(): Promise<void> {
    if (!this.worldReady || this.savePending || !this.saveDirty) {
      return;
    }

    const saveApi = window.wildboundSave;
    if (!saveApi) {
      return;
    }

    this.savePending = true;
    this.saveDirty = false;
    const saveData: SaveGameData = {
      version: 1,
      seed: this.worldSeed,
      player: { x: this.player.x, y: this.player.y },
      inventory: [...this.inventory.getSlots()],
      world: this.sessionWorldState.toSaveData()
    };

    try {
      await saveApi.save(saveData);
    } catch (error) {
      console.warn('Wildbound could not write its local save.', error);
      this.saveDirty = true;
    } finally {
      this.savePending = false;
    }
  }

  private updateDebugText(): void {
    if (!this.worldReady) {
      return;
    }

    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);
    const climate = climateAtTile(this.worldSeed, tileX, tileY);
    const generatedFeature = featureAtTile(this.worldSeed, tileX, tileY);
    const feature = this.sessionWorldState.isFeatureHarvested(tileX, tileY) ? 'harvested' : (generatedFeature ?? 'none');
    const target = this.interactionTarget ? this.interactionTarget.feature : 'none';
    const usedInventorySlots = this.inventory.getSlots().filter((slot) => slot !== null).length;

    this.debugElement.textContent = [
      'WILDBOUND // SYSTEM STATUS',
      `World       ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`,
      `Tile        ${tileX}, ${tileY} (${WORLD_TILE_SIZE}px)`,
      `Biome       ${biomeAtTile(this.worldSeed, tileX, tileY)}`,
      `Elevation   ${climate.elevation.toFixed(2)}`,
      `Moisture    ${climate.moisture.toFixed(2)}`,
      `Temperature ${climate.temperature.toFixed(2)}`,
      `Feature     ${feature}`,
      `Target      ${target}`,
      `Facing      ${this.facing}`,
      `Movement    ${this.isSwimming ? 'swimming' : 'walking'}`,
      `Harvested   ${this.sessionWorldState.harvestedFeatureCount}`,
      `Drops       ${this.sessionWorldState.dropCount}`,
      `Inventory   ${usedInventorySlots}/${INVENTORY_SLOT_COUNT} slots`,
      `Seed        ${this.worldSeed}`,
      `Chunk       ${this.chunkManager.currentChunkX}, ${this.chunkManager.currentChunkY}`,
      `Loaded      ${this.chunkManager.loadedChunkCount} chunks`,
      `FPS         ${this.game.loop.actualFps.toFixed(0)}`
    ].join('\n');
  }
}

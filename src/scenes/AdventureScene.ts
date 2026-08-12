import Phaser from 'phaser';
import type { InventorySlot } from '../player/Inventory';
import { Inventory, INVENTORY_SLOT_COUNT } from '../player/Inventory';
import { FacingDirection, getInteractionTarget } from '../player/interaction';
import { PLAYER_SPEED_SCALE } from '../player/playerConfig';
import type { InteractionTarget } from '../player/interaction';
import { isSaveGameData, type SaveGameData } from '../save/SaveGameData';
import { DayNightOverlay } from '../ui/DayNightOverlay';
import { InventoryOverlay } from '../ui/InventoryOverlay';
import { MinimapOverlay } from '../ui/MinimapOverlay';
import { WorldMapOverlay } from '../ui/WorldMapOverlay';
import { MINIMAP_AREA_SCALE } from '../ui/uiConfig';
import { ChunkManager } from '../world/ChunkManager';
import { DropManager } from '../world/DropManager';
import { biomeAtTile, climateAtTile } from '../world/generation/biomeGenerator';
import { featureAtTile } from '../world/generation/featureGenerator';
import { isTraversableWaterAt } from '../world/generation/terrainGenerator';
import type { TopographySample } from '../world/generation/topographyGenerator';
import { RESOURCE_COLORS, resourceForFeature, resourceLabel } from '../world/resources';
import { SessionWorldState } from '../world/SessionWorldState';
import type { DroppedItem } from '../world/SessionWorldState';
import { normalizeWorldTime, sampleDayNight } from '../world/dayNight';
import {
  DAY_NIGHT_INITIAL_TIME_MS,
  DAY_NIGHT_OVERLAY_UPDATE_INTERVAL_MS,
  EXPLORATION_REGION_SIZE_TILES,
  EXPLORATION_REVEAL_RADIUS_REGIONS,
  EXPLORATION_REVEAL_STAMP_RADIUS_TILES,
  EXPLORATION_REVEAL_STAMP_SPACING_TILES,
  WORLD_TIME_SAVE_INTERVAL_MS
} from '../world/explorationConfig';
import { landmarkAtTile, landmarksIntersectingTiles } from '../world/generation/landmarkGenerator';
import { WORLD_SEED, WORLD_TILE_SIZE, worldToTile } from '../world/worldConfig';

const BASE_PLAYER_SPEED = 220;
const PLAYER_SPEED = BASE_PLAYER_SPEED * (PLAYER_SPEED_SCALE / 50);
const SWIM_SPEED_MULTIPLIER = 0.42;
const PLAYER_SIZE = 32;
// Visual-only scale: collision and interaction coordinates remain at the existing gameplay size.
const PLAYER_AVATAR_SCALE = 1.32;
const HARVEST_DURATION_MS = 1000;
const HARVEST_RING_RADIUS = 16;
const CAMERA_WORLD_VIEW_WIDTH = 2560;
const CAMERA_WORLD_VIEW_HEIGHT = 1440;
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
  private dayNightOverlay!: DayNightOverlay;
  private worldMapOverlay!: WorldMapOverlay;
  private debugElement!: HTMLPreElement;
  private interactionHighlight!: Phaser.GameObjects.Arc;
  private dropHighlight!: Phaser.GameObjects.Ellipse;
  private dropHintPanel!: Phaser.GameObjects.Graphics;
  private dropHint!: Phaser.GameObjects.Text;
  private harvestProgressGraphics!: Phaser.GameObjects.Graphics;
  private isDebugVisible = false;
  private inventoryOpen = false;
  private worldMapOpen = false;
  private worldReady = false;
  private worldSeed = WORLD_SEED;
  private facing = FacingDirection.Down;
  private isSwimming = false;
  private terrainSurface = 'ground';
  private currentTopography: TopographySample | null = null;
  private interactionTarget: InteractionTarget | null = null;
  private nearbyDrop: DroppedItem | null = null;
  private harvestTarget: InteractionTarget | null = null;
  private harvestElapsedMs = 0;
  private harvestRequiresMouseRelease = false;
  private lastInteractionTileX = Number.NaN;
  private lastInteractionTileY = Number.NaN;
  private lastSwimmingTileX = Number.NaN;
  private lastSwimmingTileY = Number.NaN;
  private lastDebugUpdateMs = Number.NEGATIVE_INFINITY;
  private lastDropInteractionMs = Number.NEGATIVE_INFINITY;
  private lastSaveAttemptMs = Number.NEGATIVE_INFINITY;
  private lastDayNightOverlayUpdateMs = Number.NEGATIVE_INFINITY;
  private lastWorldTimeSaveMs = Number.NEGATIVE_INFINITY;
  private lastExplorationRegionX = Number.NaN;
  private lastExplorationRegionY = Number.NaN;
  private animationElapsedMs = 0;
  private lastAvatarState = '';
  private saveDirty = false;
  private savePending = false;
  private worldTimeMs = DAY_NIGHT_INITIAL_TIME_MS;

  constructor() {
    super('adventure');
  }

  create(): void {
    this.sessionWorldState = new SessionWorldState();
    this.inventory = new Inventory();
    this.player = this.add.rectangle(WORLD_TILE_SIZE / 2, WORLD_TILE_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE).setVisible(false);
    this.playerAvatar = this.add.graphics().setDepth(10).setScale(PLAYER_AVATAR_SCALE);
    this.harvestProgressGraphics = this.add.graphics().setDepth(15);
    this.interactionHighlight = this.add
      .circle(0, 0, 62, 0xf5d76e, 0.09)
      .setStrokeStyle(3, 0xffec8b, 0.95)
      .setDepth(8)
      .setVisible(false);
    this.dropHighlight = this.add
      .ellipse(0, 0, 30, 30, 0x7de6ff, 0.09)
      .setStrokeStyle(2, 0xa9f4ff, 0.92)
      .setDepth(8.5)
      .setVisible(false);
    this.dropHintPanel = this.add.graphics().setDepth(10.8).setVisible(false);
    this.dropHint = this.add
      .text(0, 0, '', {
        fontFamily: 'Cascadia Mono, Consolas, system-ui, sans-serif',
        fontSize: '12px',
        color: '#f4fff6',
        fontStyle: '700'
      })
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
    this.input.keyboard!.on('keydown-F', this.handleWorldMapKeyDown, this);
    this.input.keyboard!.on('keydown-ESC', this.closeWorldMap, this);

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
    this.dayNightOverlay = new DayNightOverlay(gameElement);
    this.worldMapOverlay = new WorldMapOverlay(gameElement);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    void this.loadSavedWorld();
  }

  update(time: number, delta: number): void {
    if (!this.worldReady) {
      return;
    }

    this.updateWorldTime(time, delta);
    this.updateExploration();

    if (this.worldMapOpen) {
      this.chunkManager.updateWaterAnimation(time);
      this.chunkManager.updateAmbient(time, this.player.x, this.player.y);
      this.persistIfNeeded(time);

      if (this.isDebugVisible && time - this.lastDebugUpdateMs >= DEBUG_UPDATE_INTERVAL_MS) {
        this.lastDebugUpdateMs = time;
        this.updateDebugText();
      }
      return;
    }

    const horizontal = Number(this.isDown('right')) - Number(this.isDown('left'));
    const vertical = Number(this.isDown('down')) - Number(this.isDown('up'));
    const isMoving = horizontal !== 0 || vertical !== 0;

    this.updateFacing(horizontal, vertical);
    if (isMoving) {
      const currentTopography = this.currentTopography
        ?? this.chunkManager.getTopographyAt(this.player.x, this.player.y);
      const length = Math.hypot(horizontal, vertical);
      const speed = PLAYER_SPEED * (this.isSwimming ? SWIM_SPEED_MULTIPLIER : 1);
      this.movePlayer((horizontal / length) * speed * (delta / 1000), (vertical / length) * speed * (delta / 1000));
      this.currentTopography = this.chunkManager.getTopographyAt(this.player.x, this.player.y);
      this.terrainSurface = this.currentTopography.surface;
      this.markSaveDirty();
    }

    this.updateSwimmingState();
    this.updatePlayerAvatar(delta, isMoving);
    this.chunkManager.update(this.player.x, this.player.y);
    this.chunkManager.updateWaterAnimation(time);
    this.chunkManager.updateAmbient(time, this.player.x, this.player.y);
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

    const hadSavedWorldTime = this.sessionWorldState.worldTimeMs !== null;
    this.worldTimeMs = normalizeWorldTime(this.sessionWorldState.worldTimeMs ?? DAY_NIGHT_INITIAL_TIME_MS);
    this.sessionWorldState.setWorldTimeMs(this.worldTimeMs);

    this.chunkManager = new ChunkManager(this, this.worldSeed, this.sessionWorldState);
    this.dropManager = new DropManager(this, this.sessionWorldState);
    this.worldReady = true;
    this.currentTopography = this.chunkManager.getTopographyAt(this.player.x, this.player.y);
    this.terrainSurface = this.currentTopography.surface;
    this.updateSwimmingState(true);
    this.chunkManager.update(this.player.x, this.player.y);
    this.updatePlayerAvatar(0, false);
    this.updateInteractionTarget(true);
    this.updateDropInteraction(0, true);
    this.updateMinimap(0, true);
    this.dayNightOverlay.update(this.worldTimeMs);
    this.updateExploration(true);
    this.updateDebugText();

    if (!savedGame || !hadSavedWorldTime) {
      this.markSaveDirty();
    }
  }

  private updateSwimmingState(force = false): void {
    // Sample the player's actual feet rather than a floored tile corner. Terrain is rendered
    // at sub-tile resolution, so this keeps the swim state precisely on the visible waterline.
    const sampleTileX = this.player.x / WORLD_TILE_SIZE;
    const sampleTileY = (this.player.y + 9) / WORLD_TILE_SIZE;
    const tileX = Math.floor(sampleTileX);
    const tileY = Math.floor(sampleTileY);
    const waterAtFeet = isTraversableWaterAt(this.worldSeed, sampleTileX, sampleTileY);
    if (!force && tileX === this.lastSwimmingTileX && tileY === this.lastSwimmingTileY && waterAtFeet === this.isSwimming) {
      return;
    }

    this.lastSwimmingTileX = tileX;
    this.lastSwimmingTileY = tileY;
    this.isSwimming = waterAtFeet;
  }

  private movePlayer(deltaX: number, deltaY: number): void {
    this.player.setPosition(this.player.x + deltaX, this.player.y + deltaY);
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
    if (!this.worldReady || this.worldMapOpen) {
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

  private toggleWorldMap(): void {
    if (!this.worldReady) {
      return;
    }

    this.worldMapOpen = !this.worldMapOpen;
    if (this.worldMapOpen && this.inventoryOpen) {
      this.toggleInventory();
    }

    this.cancelHarvesting();
    this.worldMapOverlay.setOpen(this.worldMapOpen);
    if (this.worldMapOpen) {
      this.updateWorldMap();
    }
  }

  private handleWorldMapKeyDown(event: KeyboardEvent): void {
    if (!event.repeat) {
      this.toggleWorldMap();
    }
  }

  private closeWorldMap(): void {
    if (!this.worldMapOpen) {
      return;
    }

    this.worldMapOpen = false;
    this.worldMapOverlay.setOpen(false);
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
    this.dayNightOverlay.destroy();
    this.worldMapOverlay.destroy();
    this.chunkManager?.destroy();
    this.dropManager?.destroy();
  }

  private readonly handleBeforeUnload = (): void => {
    if (this.worldReady && this.sessionWorldState.setWorldTimeMs(this.worldTimeMs)) {
      this.markSaveDirty();
    }
    void this.persistSave();
  };

  private updateWorldTime(time: number, delta: number): void {
    this.worldTimeMs = normalizeWorldTime(this.worldTimeMs + delta);

    if (time - this.lastDayNightOverlayUpdateMs >= DAY_NIGHT_OVERLAY_UPDATE_INTERVAL_MS) {
      this.lastDayNightOverlayUpdateMs = time;
      this.dayNightOverlay.update(this.worldTimeMs);
    }

    if (time - this.lastWorldTimeSaveMs >= WORLD_TIME_SAVE_INTERVAL_MS) {
      this.lastWorldTimeSaveMs = time;
      if (this.sessionWorldState.setWorldTimeMs(this.worldTimeMs)) {
        this.markSaveDirty();
      }
    }
  }

  private updateExploration(force = false): void {
    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);
    const regionX = Math.floor(tileX / EXPLORATION_REGION_SIZE_TILES);
    const regionY = Math.floor(tileY / EXPLORATION_REGION_SIZE_TILES);

    if (!force && regionX === this.lastExplorationRegionX && regionY === this.lastExplorationRegionY) {
      return;
    }

    this.lastExplorationRegionX = regionX;
    this.lastExplorationRegionY = regionY;
    const revealedNewRegion = this.sessionWorldState.revealRegionsAround(
      regionX,
      regionY,
      EXPLORATION_REVEAL_RADIUS_REGIONS
    );
    const revealedMapStamp = this.sessionWorldState.revealMapStamp(
      tileX,
      tileY,
      EXPLORATION_REVEAL_STAMP_SPACING_TILES
    );
    if (revealedNewRegion || revealedMapStamp) {
      this.markSaveDirty();
      if (this.worldMapOpen) {
        this.updateWorldMap();
      }
    }
  }

  private updateWorldMap(): void {
    const exploredRegions = this.sessionWorldState.getExploredRegions();
    const regions = exploredRegions.map(([regionX, regionY]) => ({
      tileX: regionX * EXPLORATION_REGION_SIZE_TILES,
      tileY: regionY * EXPLORATION_REGION_SIZE_TILES,
      sizeTiles: EXPLORATION_REGION_SIZE_TILES
    }));
    const reveals = this.sessionWorldState.getExplorationRevealStamps().map(([tileX, tileY]) => ({
      tileX,
      tileY,
      radiusTiles: EXPLORATION_REVEAL_STAMP_RADIUS_TILES
    }));
    const landmarksById = new Map<string, ReturnType<typeof landmarksIntersectingTiles>[number]>();

    // Exploration advances in compact, contiguous areas. Looking up landmarks per explored
    // region avoids scanning unexplored gaps in an infinite world and the generator cache makes
    // revisiting existing territory inexpensive.
    regions.forEach((region) => {
      landmarksIntersectingTiles(
        this.worldSeed,
        region.tileX,
        region.tileY,
        region.tileX + region.sizeTiles,
        region.tileY + region.sizeTiles
      ).forEach((landmark) => {
        const landmarkRegionX = Math.floor(landmark.centerTileX / EXPLORATION_REGION_SIZE_TILES);
        const landmarkRegionY = Math.floor(landmark.centerTileY / EXPLORATION_REGION_SIZE_TILES);
        if (this.sessionWorldState.isRegionExplored(landmarkRegionX, landmarkRegionY)) {
          landmarksById.set(landmark.id, landmark);
        }
      });
    });

    this.worldMapOverlay.draw({
      seed: this.worldSeed,
      playerTileX: this.player.x / WORLD_TILE_SIZE,
      playerTileY: this.player.y / WORLD_TILE_SIZE,
      regions,
      reveals,
      landmarks: Array.from(landmarksById.values())
    });
  }

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
    const stride = this.isSwimming
      ? Math.sin(animationFrame / 3 * Math.PI * 2) * 2
      : animationFrame === 1 ? 3 : -3;

    avatar.clear();
    avatar.fillStyle(this.isSwimming ? 0x4ca7bd : 0x152129, this.isSwimming ? 0.45 : 0.32);
    avatar.fillEllipse(0, this.isSwimming ? 9 : 15, this.isSwimming ? 39 : 29, this.isSwimming ? 12 : 9);

    if (this.isSwimming) {
      avatar.fillStyle(0x5ebfd2, 0.64);
      avatar.fillEllipse(0, 5, 31, 11);
      avatar.fillStyle(0x65a8d8, 1);
      avatar.fillRoundedRect(-10, -5, 20, 15, 4);
      avatar.fillStyle(0xd8f3ff, 0.78);
      avatar.fillRect(-7, -2, 14, 2);
      avatar.fillStyle(0xe1ae86, 1);
      avatar.fillRoundedRect(-14 + direction.x * 3, -2 + stride, 7, 8, 3);
      avatar.fillRoundedRect(7 + direction.x * 3, -2 - stride, 7, 8, 3);
      this.drawDirectionalHead(direction, true);
      return;
    }

    avatar.fillStyle(0x182634, 1);
    avatar.fillRoundedRect(-10, -7, 20, 19, 4);
    avatar.fillStyle(0x1c2a37, 1);
    avatar.fillRect(-9, 9, 7, 11 + stride);
    avatar.fillRect(3, 9, 7, 11 - stride);
    avatar.fillStyle(0x0d151d, 1);
    avatar.fillRect(-10, 18 + stride, 9, 4);
    avatar.fillRect(2, 18 - stride, 9, 4);
    avatar.fillStyle(0x65a8d8, 1);
    avatar.fillRoundedRect(-9, -6, 18, 15, 3);
    avatar.fillStyle(0xd8f3ff, 0.72);
    avatar.fillRect(-7, -3, 14, 2);
    avatar.fillStyle(0x3d6f98, 1);
    avatar.fillRect(-9, 7, 18, 3);
    avatar.fillStyle(0xe1ae86, 1);
    avatar.fillRoundedRect(-14 + direction.x * 3, -3 + stride * 0.45, 6, 12, 2);
    avatar.fillRoundedRect(8 + direction.x * 3, -3 - stride * 0.45, 6, 12, 2);
    this.drawDirectionalHead(direction, false);
  }

  private drawDirectionalHead(direction: Phaser.Math.Vector2, swimming: boolean): void {
    const avatar = this.playerAvatar;
    const headY = swimming ? -12 : -13;
    const isBackFacing = direction.y < -0.35;
    const isFrontFacing = direction.y > 0.35;

    if (isBackFacing) {
      // Up, up-left, and up-right show a clear full back-of-hair silhouette with no facial features.
      avatar.fillStyle(0x3a2720, 1);
      avatar.fillCircle(0, headY, 10);
      avatar.fillRoundedRect(-9, headY - 6, 18, 14, 6);
      avatar.fillStyle(0x684432, 1);
      avatar.fillCircle(-4, headY - 4, 3);
      avatar.fillCircle(3, headY - 5, 3);
      avatar.lineStyle(1.5, 0x201510, 0.75);
      avatar.lineBetween(-6, headY + 2, -5, headY + 8);
      avatar.lineBetween(0, headY + 1, 0, headY + 9);
      avatar.lineBetween(6, headY + 2, 5, headY + 8);
      return;
    }

    avatar.fillStyle(0xe1ae86, 1);
    avatar.fillCircle(0, headY, 9);

    if (!isFrontFacing) {
      // Left and right are true profiles: one eye/nose face forward, and the hair sits behind it.
      const faceDirection = direction.x >= 0 ? 1 : -1;
      avatar.fillStyle(0x3a2720, 1);
      avatar.fillCircle(-faceDirection * 5, headY - 1, 8);
      // Keep the back-hair shape mirrored; the old left-facing rect was placed beyond the head.
      const hairX = faceDirection > 0 ? -10 : -1;
      avatar.fillRoundedRect(hairX, headY - 7, 11, 10, 5);
      avatar.fillStyle(0x684432, 1);
      avatar.fillCircle(-faceDirection * 6, headY - 4, 3);
      avatar.fillStyle(0x263238, 1);
      avatar.fillCircle(faceDirection * 4, headY - 2, 1.5);
      avatar.fillStyle(0x7b4e3b, 1);
      avatar.fillTriangle(faceDirection * 9, headY, faceDirection * 6, headY + 2, faceDirection * 6, headY - 2);
      return;
    }

    // Down, down-left, and down-right show the face clearly, with a hair cap and bangs above it.
    avatar.fillStyle(0x3a2720, 1);
    avatar.fillRoundedRect(-9, headY - 9, 18, 8, 5);
    avatar.fillCircle(-6, headY - 5, 4);
    avatar.fillCircle(6, headY - 5, 4);
    avatar.fillStyle(0x684432, 1);
    avatar.fillRect(-5, headY - 8, 3, 4);
    avatar.fillRect(2, headY - 8, 3, 4);
    avatar.fillStyle(0x263238, 1);
    const faceOffset = direction.x * 1.4;
    avatar.fillCircle(-3 + faceOffset, headY - 1, 1.5);
    avatar.fillCircle(3 + faceOffset, headY - 1, 1.5);
    avatar.lineStyle(1.4, 0x7b4e3b, 0.95);
    avatar.lineBetween(-2 + faceOffset, headY + 4, 2 + faceOffset, headY + 4);
  }
  private updateMinimap(_time: number, _force = false): void {
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
      this.dropHintPanel.clear().setVisible(false);
      this.dropHint.setVisible(false);
      return;
    }

    this.dropHighlight.setPosition(this.nearbyDrop.worldX, this.nearbyDrop.worldY).setVisible(true);
    this.drawDropHint(this.nearbyDrop);
  }

  private drawDropHint(drop: DroppedItem): void {
    const label = `${resourceLabel(drop.resource)}  E`;
    const x = drop.worldX;
    const y = drop.worldY - 34;
    this.dropHint.setText(label).setPosition(x + 4, y).setVisible(true);

    const paddingX = 10;
    const paddingY = 5;
    const width = Math.max(72, this.dropHint.width + paddingX * 2 + 14);
    const height = Math.max(26, this.dropHint.height + paddingY * 2);
    const left = x - width / 2;
    const top = y - height / 2;
    const dotX = left + 13;

    this.dropHintPanel.clear();
    this.dropHintPanel.fillStyle(0x07130f, 0.9);
    this.dropHintPanel.fillRoundedRect(left, top, width, height, 7);
    this.dropHintPanel.lineStyle(1.5, 0xbfe9c6, 0.9);
    this.dropHintPanel.strokeRoundedRect(left, top, width, height, 7);
    this.dropHintPanel.fillStyle(RESOURCE_COLORS[drop.resource], 1);
    this.dropHintPanel.fillCircle(dotX, y, 4);
    this.dropHintPanel.lineStyle(1, 0xffffff, 0.72);
    this.dropHintPanel.strokeCircle(dotX, y, 5.5);
    this.dropHintPanel.fillStyle(0x07130f, 0.9);
    this.dropHintPanel.fillTriangle(x - 6, top + height - 1, x + 6, top + height - 1, x, top + height + 7);
    this.dropHintPanel.setVisible(true);
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
    const requestedDropX = this.player.x + direction.x * 68;
    const requestedDropY = this.player.y + direction.y * 68;
    const dropPosition = { x: requestedDropX, y: requestedDropY };
    const drop = this.sessionWorldState.createDropAt(
      dropPosition.x,
      dropPosition.y,
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

    // Snapshot the clock immediately before serializing rather than relying only on the periodic
    // dirty tick. A save made after any gameplay change therefore restores the exact latest time.
    this.sessionWorldState.setWorldTimeMs(this.worldTimeMs);
    this.savePending = true;
    this.saveDirty = false;
    let saveSucceeded = false;
    const saveData: SaveGameData = {
      version: 1,
      seed: this.worldSeed,
      player: { x: this.player.x, y: this.player.y },
      inventory: [...this.inventory.getSlots()],
      world: this.sessionWorldState.toSaveData()
    };

    try {
      await saveApi.save(saveData);
      saveSucceeded = true;
    } catch (error) {
      console.warn('Wildbound could not write its local save.', error);
      this.saveDirty = true;
    } finally {
      this.savePending = false;
      // Changes can arrive while IPC is writing the previous snapshot. Queue one follow-up write
      // so exploration/time changes are not stranded behind an in-flight save.
      if (saveSucceeded && this.saveDirty) {
        void this.persistSave();
      }
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
    const landmark = landmarkAtTile(this.worldSeed, tileX, tileY)?.label ?? 'none';
    const usedInventorySlots = this.inventory.getSlots().filter((slot) => slot !== null).length;

    this.debugElement.textContent = [
      'WILDBOUND // SYSTEM STATUS',
      `World       ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`,
      `Tile        ${tileX}, ${tileY} (${WORLD_TILE_SIZE}px)`,
      `Biome       ${biomeAtTile(this.worldSeed, tileX, tileY)}`,
      `Elevation   ${climate.elevation.toFixed(2)}`,
      `Moisture    ${climate.moisture.toFixed(2)}`,
      `Temperature ${climate.temperature.toFixed(2)}`,
      `Time        ${sampleDayNight(this.worldTimeMs).label}`,
      `Landmark    ${landmark}`,
      `Feature     ${feature}`,
      `Target      ${target}`,
      `Facing      ${this.facing}`,
      `Movement    ${this.isSwimming ? 'swimming' : 'walking'}`,
      `Terrain     ${this.terrainSurface}`,
      `Harvested   ${this.sessionWorldState.harvestedFeatureCount}`,
      `Explored    ${this.sessionWorldState.exploredRegionCount} regions`,
      `Drops       ${this.sessionWorldState.dropCount}`,
      `Inventory   ${usedInventorySlots}/${INVENTORY_SLOT_COUNT} slots`,
      `Seed        ${this.worldSeed}`,
      `Chunk       ${this.chunkManager.currentChunkX}, ${this.chunkManager.currentChunkY}`,
      `Loaded      ${this.chunkManager.loadedChunkCount} chunks`,
      `Landmarks   ${this.chunkManager.loadedLandmarkCount} nearby`,
      `FPS         ${this.game.loop.actualFps.toFixed(0)}`
    ].join('\n');
  }
}

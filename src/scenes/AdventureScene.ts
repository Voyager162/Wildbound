import Phaser from 'phaser';
import type { InventorySlot } from '../player/Inventory';
import { HOTBAR_SLOT_COUNT, Inventory, INVENTORY_SLOT_COUNT } from '../player/Inventory';
import { FacingDirection, getInteractionTarget } from '../player/interaction';
import { PLAYER_SPEED_SCALE } from '../player/playerConfig';
import type { InteractionTarget } from '../player/interaction';
import { isSaveGameData, type SaveGameData } from '../save/SaveGameData';
import { DayNightOverlay } from '../ui/DayNightOverlay';
import { InventoryOverlay } from '../ui/InventoryOverlay';
import { HotbarOverlay } from '../ui/HotbarOverlay';
import { MinimapOverlay } from '../ui/MinimapOverlay';
import { NightAmbientOverlay } from '../ui/NightAmbientOverlay';
import { WorldMapOverlay } from '../ui/WorldMapOverlay';
import { MINIMAP_AREA_SCALE } from '../ui/uiConfig';
import { ChunkManager } from '../world/ChunkManager';
import { DropManager } from '../world/DropManager';
import { biomeAtTile, climateAtTile } from '../world/generation/biomeGenerator';
import { featureAtTile } from '../world/generation/featureGenerator';
import { randomAtTile } from '../world/generation/noise';
import { isTraversableWaterAt } from '../world/generation/terrainGenerator';
import type { TopographySample } from '../world/generation/topographyGenerator';
import { RESOURCE_COLORS, ResourceType, resourceForFeature, resourceLabel } from '../world/resources';
import { SessionWorldState } from '../world/SessionWorldState';
import type { DroppedItem } from '../world/SessionWorldState';
import { normalizeWorldTime, sampleDayNight, worldTimeForHour } from '../world/dayNight';
import { ambientLightScheduleAmount } from '../world/ambientLightScheduleConfig';
import {
  DAY_NIGHT_INITIAL_TIME_MS,
  DAY_NIGHT_OVERLAY_UPDATE_INTERVAL_MS,
  DAY_NIGHT_START_HOUR_OVERRIDE,
  EXPLORATION_REGION_SIZE_TILES,
  EXPLORATION_REVEAL_RADIUS_REGIONS,
  EXPLORATION_REVEAL_STAMP_RADIUS_TILES,
  EXPLORATION_REVEAL_STAMP_SPACING_TILES,
  WORLD_TIME_SAVE_INTERVAL_MS
} from '../world/explorationConfig';
import { landmarkAtTile, landmarksIntersectingTiles } from '../world/generation/landmarkGenerator';
import { WORLD_SEED, WORLD_TILE_SIZE, worldToTile } from '../world/worldConfig';
import { TERRAIN_MATERIAL_ASSETS } from '../world/terrainMaterialConfig';
import { type CraftingRecipe } from '../crafting/recipeConfig';
import { TOOL_DEFINITIONS, isToolId, type ToolId } from '../crafting/toolConfig';
import { craftRecipe as applyCraftingRecipe } from '../crafting/craftingService';
import { harvestSpeedForFeature } from '../crafting/harvestSpeedConfig';
import {
  caveEntranceAtTile,
  caveMouthCenter,
  caveWorldOrigin,
  caveWorldTilePosition,
  generateCaveLayout,
  type CaveEntrance,
  type CaveLayout,
  type CaveOre,
  type CaveWorldOrigin
} from '../world/caves/caveGenerator';

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
const MINIMAP_UPDATE_INTERVAL_MS = 80;
const NIGHT_AMBIENT_LIGHT_UPDATE_INTERVAL_MS = 33;
const MINIMAP_TILES_PER_CELL = Math.max(1, Math.round(16 * (MINIMAP_AREA_SCALE / 50)));
const CAVE_ENTRANCE_INTERACTION_RADIUS_PIXELS = 84;
const CAVE_ENTRANCE_SEARCH_RADIUS_TILES = 6;

type MovementKeys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

interface ActiveCave {
  readonly entrance: CaveEntrance;
  readonly layout: CaveLayout;
  readonly origin: CaveWorldOrigin;
  readonly returnWorldX: number;
  readonly returnWorldY: number;
}

interface CaveRenderPoint {
  readonly x: number;
  readonly y: number;
}

interface CaveBoundaryEdge {
  readonly from: CaveRenderPoint;
  readonly to: CaveRenderPoint;
}

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
  private hotbarOverlay!: HotbarOverlay;
  private minimapOverlay!: MinimapOverlay;
  private dayNightOverlay!: DayNightOverlay;
  private nightAmbientOverlay!: NightAmbientOverlay;
  private worldMapOverlay!: WorldMapOverlay;
  private debugElement!: HTMLPreElement;
  private interactionHighlight!: Phaser.GameObjects.Arc;
  private dropHighlight!: Phaser.GameObjects.Ellipse;
  private dropHintPanel!: Phaser.GameObjects.Graphics;
  private dropHint!: Phaser.GameObjects.Text;
  private harvestProgressGraphics!: Phaser.GameObjects.Graphics;
  private caveGraphics!: Phaser.GameObjects.Graphics;
  private caveHintPanel!: Phaser.GameObjects.Graphics;
  private caveHint!: Phaser.GameObjects.Text;
  private isDebugVisible = false;
  private inventoryOpen = false;
  private craftingOpen = false;
  private worldMapOpen = false;
  private worldReady = false;
  private worldSeed = WORLD_SEED;
  private facing = FacingDirection.Down;
  private isSwimming = false;
  private terrainSurface = 'ground';
  private currentTopography: TopographySample | null = null;
  private interactionTarget: InteractionTarget | null = null;
  private nearbyCaveEntrance: CaveEntrance | null = null;
  private activeCave: ActiveCave | null = null;
  private caveOreTarget: CaveOre | null = null;
  private caveHarvestOre: CaveOre | null = null;
  private caveExitNearby = false;
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
  private lastNightAmbientLightingUpdateMs = Number.NEGATIVE_INFINITY;
  private lastExplorationRegionX = Number.NaN;
  private lastExplorationRegionY = Number.NaN;
  private animationElapsedMs = 0;
  private lastAvatarState = '';
  private saveDirty = false;
  private savePending = false;
  private worldTimeMs = DAY_NIGHT_INITIAL_TIME_MS;
  private nightAmount = 0;
  private ambientLightAmount = 0;
  private equippedTool: ToolId | null = null;
  private activeHotbarSlot = 0;
  private lastMinimapUpdateMs = Number.NEGATIVE_INFINITY;
  private lastMinimapTileX = Number.NaN;
  private lastMinimapTileY = Number.NaN;
  private lastCaveEntranceTileX = Number.NaN;
  private lastCaveEntranceTileY = Number.NaN;

  constructor() {
    super('adventure');
  }

  preload(): void {
    TERRAIN_MATERIAL_ASSETS.forEach(({ key, url }) => this.load.image(key, url));
  }

  create(): void {
    this.sessionWorldState = new SessionWorldState();
    this.inventory = new Inventory();
    this.player = this.add.rectangle(WORLD_TILE_SIZE / 2, WORLD_TILE_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE).setVisible(false);
    this.playerAvatar = this.add.graphics().setDepth(10).setScale(PLAYER_AVATAR_SCALE);
    this.harvestProgressGraphics = this.add.graphics().setDepth(15);
    this.caveGraphics = this.add.graphics().setDepth(2).setVisible(false);
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
    this.caveHintPanel = this.add.graphics().setDepth(10.8).setVisible(false);
    this.caveHint = this.add
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
    this.input.keyboard!.on('keydown-C', this.handleCraftingKeyDown, this);
    this.input.keyboard!.on('keydown-F', this.handleWorldMapKeyDown, this);
    this.input.keyboard!.on('keydown-ESC', this.closeWorldMap, this);

    const gameElement = document.getElementById('game');
    if (!gameElement) {
      throw new Error('Wildbound game container was not found.');
    }

    this.createDebugElement(gameElement);
    this.hotbarOverlay = new HotbarOverlay(
      gameElement,
      this.inventory,
      () => this.activeHotbarSlot,
      (slotIndex) => this.selectHotbarSlot(slotIndex),
      () => this.worldReady && !this.inventoryOpen && !this.craftingOpen && !this.worldMapOpen
    );
    this.inventoryOverlay = new InventoryOverlay(
      gameElement,
      this.inventory,
      () => this.handleInventoryChanged(),
      (slot) => this.dropInventorySlot(slot),
      () => this.equippedTool,
      (tool) => this.setEquippedTool(tool),
      (recipe) => this.craftRecipe(recipe)
    );
    this.minimapOverlay = new MinimapOverlay(gameElement);
    this.dayNightOverlay = new DayNightOverlay(gameElement);
    this.nightAmbientOverlay = new NightAmbientOverlay(gameElement);
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
    if (this.activeCave) {
      this.updateCave(time, delta);
      this.persistIfNeeded(time);
      if (this.isDebugVisible && time - this.lastDebugUpdateMs >= DEBUG_UPDATE_INTERVAL_MS) {
        this.lastDebugUpdateMs = time;
        this.updateDebugText();
      }
      return;
    }
    this.updateExploration();

    if (this.worldMapOpen) {
      this.chunkManager.updateWaterAnimation(time);
      this.chunkManager.updateSwampWaterDecorations(time, delta, this.player.x, this.player.y, 0, 0, this.isSwimming);
      this.chunkManager.updateAmbient(time, this.player.x, this.player.y, this.ambientLightAmount);
      this.updateNightAmbientLighting(time);
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
    let playerVelocityX = 0;
    let playerVelocityY = 0;

    this.updateFacing(horizontal, vertical);
    if (isMoving) {
      const currentTopography = this.currentTopography
        ?? this.chunkManager.getTopographyAt(this.player.x, this.player.y);
      const length = Math.hypot(horizontal, vertical);
      const speed = PLAYER_SPEED * (this.isSwimming ? SWIM_SPEED_MULTIPLIER : 1);
      const movementX = (horizontal / length) * speed * (delta / 1000);
      const movementY = (vertical / length) * speed * (delta / 1000);
      this.movePlayer(movementX, movementY);
      const elapsedSeconds = Math.max(0.001, delta / 1000);
      playerVelocityX = movementX / elapsedSeconds;
      playerVelocityY = movementY / elapsedSeconds;
      this.currentTopography = this.chunkManager.getTopographyAt(this.player.x, this.player.y);
      this.terrainSurface = this.currentTopography.surface;
      this.markSaveDirty();
    }

    this.updateSwimmingState();
    this.chunkManager.update(this.player.x, this.player.y, time);
    this.chunkManager.updateFoliage(time);
    this.chunkManager.updateWaterAnimation(time);
    this.chunkManager.updateSwampWaterDecorations(
      time,
      delta,
      this.player.x,
      this.player.y,
      playerVelocityX,
      playerVelocityY,
      this.isSwimming
    );
    this.chunkManager.updateAmbient(time, this.player.x, this.player.y, this.ambientLightAmount);
    this.updateNightAmbientLighting(time);
    this.updateInteractionTarget();
    this.updateCaveEntranceInteraction();
    this.updateDropInteraction(time);
    this.updateHarvesting(delta);
    this.updatePlayerAvatar(delta, isMoving);
    this.updateMinimap(time);
    this.persistIfNeeded(time);

    if (this.isDebugVisible && time - this.lastDebugUpdateMs >= DEBUG_UPDATE_INTERVAL_MS) {
      this.lastDebugUpdateMs = time;
      this.updateDebugText();
    }
  }

  private async loadSavedWorld(): Promise<void> {
    let savedGame: SaveGameData | null = null;
    let savedActiveCave: SaveGameData['activeCave'] | undefined;

    try {
      const loaded = await window.wildboundSave?.load();
      savedGame = isSaveGameData(loaded) ? loaded : null;
    } catch (error) {
      console.warn('Wildbound could not load its local save.', error);
    }

    if (savedGame) {
      this.worldSeed = savedGame.seed;
      this.inventory.restore(savedGame.inventory);
      const savedTool = savedGame.equipment?.equippedTool;
      this.equippedTool = isToolId(savedTool) && this.inventory.get(savedTool) > 0 ? savedTool : null;
      const savedHotbarSlot = savedGame.equipment?.activeHotbarSlot;
      this.activeHotbarSlot = typeof savedHotbarSlot === 'number'
        && Number.isInteger(savedHotbarSlot)
        && savedHotbarSlot >= 0
        && savedHotbarSlot < HOTBAR_SLOT_COUNT
        ? savedHotbarSlot
        : 0;
      this.sessionWorldState.restore(savedGame.world);
      savedActiveCave = savedGame.activeCave;
      this.player.setPosition(
        savedActiveCave?.returnWorldX ?? savedGame.player.x,
        savedActiveCave?.returnWorldY ?? savedGame.player.y
      );
    }

    const hadSavedWorldTime = this.sessionWorldState.worldTimeMs !== null;
    this.worldTimeMs = DAY_NIGHT_START_HOUR_OVERRIDE === null
      ? normalizeWorldTime(this.sessionWorldState.worldTimeMs ?? DAY_NIGHT_INITIAL_TIME_MS)
      : worldTimeForHour(DAY_NIGHT_START_HOUR_OVERRIDE);
    this.sessionWorldState.setWorldTimeMs(this.worldTimeMs);

    this.chunkManager = new ChunkManager(this, this.worldSeed, this.sessionWorldState);
    this.dropManager = new DropManager(this, this.sessionWorldState);
    this.chunkManager.prime(this.player.x, this.player.y);
    this.worldReady = true;
    this.currentTopography = this.chunkManager.getTopographyAt(this.player.x, this.player.y);
    this.terrainSurface = this.currentTopography.surface;
    this.updateSwimmingState(true);
    this.updatePlayerAvatar(0, false);
    this.inventoryOverlay.refresh();
    this.hotbarOverlay.refresh();
    if (savedActiveCave) {
      const entrance = caveEntranceAtTile(this.worldSeed, savedActiveCave.entranceTileX, savedActiveCave.entranceTileY);
      if (entrance) {
        this.enterCave(entrance, savedActiveCave.returnWorldX, savedActiveCave.returnWorldY, false);
      }
    }
    this.updateInteractionTarget(true);
    this.updateDropInteraction(0, true);
    this.updateMinimap(0, true);
    this.dayNightOverlay.update(this.worldTimeMs);
    this.nightAmount = sampleDayNight(this.worldTimeMs).nightAmount;
    this.ambientLightAmount = ambientLightScheduleAmount(this.worldTimeMs);
    this.updateNightAmbientLighting(this.time.now);
    this.updateExploration(true);
    this.updateDebugText();

    if (!savedGame || !hadSavedWorldTime || DAY_NIGHT_START_HOUR_OVERRIDE !== null) {
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

  private handlePrimaryAction(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }
    event.preventDefault();
    if (!this.worldReady || this.worldMapOpen) {
      return;
    }

    if (this.craftingOpen) {
      this.craftingOpen = false;
      this.inventoryOpen = false;
      this.cancelHarvesting();
      this.inventoryOverlay.setCraftingOpen(false);
      this.inventoryOverlay.setOpen(false);
      this.updateHotbarVisibility();
      return;
    }

    if (this.inventoryOpen) {
      this.toggleInventory();
      return;
    }

    if (this.activeCave) {
      if (this.caveExitNearby) {
        this.exitCave();
      } else {
        this.toggleInventory();
      }
      return;
    }

    if (this.nearbyCaveEntrance) {
      this.enterCave(this.nearbyCaveEntrance, this.player.x, this.player.y);
      return;
    }

    if (this.pickupNearbyDrop()) {
      return;
    }

    this.toggleInventory();
  }

  private toggleInventory(): void {
    this.inventoryOpen = !this.inventoryOpen;
    if (this.inventoryOpen && this.craftingOpen) {
      this.craftingOpen = false;
      this.inventoryOverlay.setCraftingOpen(false);
    }
    this.cancelHarvesting();
    this.inventoryOverlay.setOpen(this.inventoryOpen);
    this.updateHotbarVisibility();
  }

  private handleCraftingKeyDown(event: KeyboardEvent): void {
    if (!event.repeat) {
      this.toggleCrafting();
    }
  }

  private toggleCrafting(): void {
    if (!this.worldReady || this.worldMapOpen) {
      return;
    }

    if (this.craftingOpen) {
      this.craftingOpen = false;
      this.inventoryOpen = true;
      this.cancelHarvesting();
      this.inventoryOverlay.setCraftingOpen(false);
      this.inventoryOverlay.setOpen(true);
      this.updateHotbarVisibility();
      return;
    }

    this.craftingOpen = true;
    this.inventoryOpen = false;
    this.cancelHarvesting();
    this.inventoryOverlay.setCraftingOpen(this.craftingOpen);
    this.inventoryOverlay.setOpen(this.craftingOpen);
    this.updateHotbarVisibility();
  }

  private toggleWorldMap(): void {
    if (!this.worldReady) {
      return;
    }

    this.worldMapOpen = !this.worldMapOpen;
    if (this.worldMapOpen && this.inventoryOpen) {
      this.toggleInventory();
    }
    if (this.worldMapOpen && this.craftingOpen) {
      this.craftingOpen = false;
      this.inventoryOverlay.setCraftingOpen(false);
      this.inventoryOverlay.setOpen(false);
    }

    this.cancelHarvesting();
    this.worldMapOverlay.setOpen(this.worldMapOpen);
    this.updateHotbarVisibility();
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
    this.updateHotbarVisibility();
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
    this.hotbarOverlay.destroy();
    this.minimapOverlay.destroy();
    this.dayNightOverlay.destroy();
    this.nightAmbientOverlay.destroy();
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
    this.nightAmount = sampleDayNight(this.worldTimeMs).nightAmount;
    this.ambientLightAmount = ambientLightScheduleAmount(this.worldTimeMs);

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

  private updateNightAmbientLighting(time: number): void {
    // The DOM glow canvas is intentionally updated every frame once light is visible, but doing
    // a full transparent canvas clear at 60 Hz during daylight is pure overhead—particularly in
    // a foliage-dense forest where the game otherwise has no active night lights.
    const updateInterval = this.ambientLightAmount <= 0 ? 250 : NIGHT_AMBIENT_LIGHT_UPDATE_INTERVAL_MS;
    if (time - this.lastNightAmbientLightingUpdateMs < updateInterval) {
      return;
    }

    this.lastNightAmbientLightingUpdateMs = time;
    this.nightAmbientOverlay.update(
      this.ambientLightAmount,
      this.cameras.main,
      this.chunkManager.getNightAmbientLights(time)
    );
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
    const harvestAnimationFrame = this.harvestTarget || this.caveHarvestOre ? Math.floor(this.harvestElapsedMs / 45) % 8 : -1;
    const heldResource = this.heldHotbarResource();
    const state = `${this.facing}:${this.isSwimming}:${animationFrame}:${harvestAnimationFrame}:${this.equippedTool ?? 'none'}:${heldResource ?? 'none'}`;

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
    const harvestSwing = this.harvestSwingAmount();
    const isUnarmedHarvesting = !this.equippedTool && (this.harvestTarget !== null || this.caveHarvestOre !== null);
    const heldResource = this.heldHotbarResource();

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
      if (!isUnarmedHarvesting) {
        avatar.fillRoundedRect(7 + direction.x * 3, -2 - stride, 7, 8, 3);
      }
      this.drawHeldTool(direction, stride, harvestSwing);
      if (isUnarmedHarvesting) {
        this.drawHarvestFist(direction, stride);
        if (heldResource) {
          this.drawHeldResource(direction, stride, heldResource, this.harvestStrikeReach());
        }
      } else if (!this.equippedTool && heldResource) {
        this.drawHeldResource(direction, stride, heldResource);
      }
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
    if (!isUnarmedHarvesting) {
      avatar.fillRoundedRect(8 + direction.x * 3, -3 - stride * 0.45, 6, 12, 2);
    }
    this.drawHeldTool(direction, stride, harvestSwing);
    if (isUnarmedHarvesting) {
      this.drawHarvestFist(direction, stride);
      if (heldResource) {
        this.drawHeldResource(direction, stride, heldResource, this.harvestStrikeReach());
      }
    } else if (!this.equippedTool && heldResource) {
      this.drawHeldResource(direction, stride, heldResource);
    }
    this.drawDirectionalHead(direction, false);
  }

  private harvestSwingAmount(): number {
    if (!this.harvestTarget && !this.caveHarvestOre) {
      return 0;
    }

    // A complete wind-up/impact/recovery cycle is driven by accumulated game time rather than
    // frame count, so the motion remains smooth and consistent at any frame rate.
    return Math.sin((this.harvestElapsedMs % 220) / 220 * Math.PI);
  }

  private drawHeldTool(direction: Phaser.Math.Vector2, stride: number, swing: number): void {
    if (!this.equippedTool) {
      return;
    }

    const avatar = this.playerAvatar;
    const tool = TOOL_DEFINITIONS[this.equippedTool];
    const perpendicularX = -direction.y;
    const perpendicularY = direction.x;
    const shoulderX = direction.x * 3 + perpendicularX * 5;
    const shoulderY = 1 + direction.y * 2 + perpendicularY * 2;
    const handX = shoulderX + direction.x * (10 + swing * 4) + perpendicularX * (4 - swing * 6);
    const handY = shoulderY + direction.y * (10 + swing * 4) + perpendicularY * (4 - swing * 6) + stride * 0.14;
    let toolDirectionX = direction.x + perpendicularX * (0.22 - swing * 0.46);
    let toolDirectionY = direction.y + perpendicularY * (0.22 - swing * 0.46);
    const toolDirectionLength = Math.hypot(toolDirectionX, toolDirectionY) || 1;
    toolDirectionX /= toolDirectionLength;
    toolDirectionY /= toolDirectionLength;
    const toolPerpendicularX = -toolDirectionY;
    const toolPerpendicularY = toolDirectionX;
    const headX = handX + toolDirectionX * 13;
    const headY = handY + toolDirectionY * 13;

    avatar.lineStyle(5.7, 0xe1ae86, 1);
    avatar.lineBetween(shoulderX, shoulderY, handX, handY);
    avatar.fillStyle(0xe1ae86, 1);
    avatar.fillCircle(handX, handY, 4);
    avatar.lineStyle(3.3, 0x6f4327, 1);
    avatar.lineBetween(handX, handY, headX, headY);
    avatar.lineStyle(1, 0xc89252, 0.9);
    avatar.lineBetween(handX + toolPerpendicularX, handY + toolPerpendicularY, headX + toolPerpendicularX, headY + toolPerpendicularY);

    if (tool.kind === 'axe') {
      const headColor = tool.headMaterial === 'stone' ? 0xaeb8bd : 0xb77a3d;
      const edgeColor = tool.headMaterial === 'stone' ? 0x52646b : 0x704124;
      avatar.fillStyle(edgeColor, 1);
      avatar.fillTriangle(
        headX - toolDirectionX * 2 + toolPerpendicularX * 6.4,
        headY - toolDirectionY * 2 + toolPerpendicularY * 6.4,
        headX + toolDirectionX * 6 - toolPerpendicularX * 5.7,
        headY + toolDirectionY * 6 - toolPerpendicularY * 5.7,
        headX + toolDirectionX * 7 + toolPerpendicularX * 5.7,
        headY + toolDirectionY * 7 + toolPerpendicularY * 5.7
      );
      avatar.fillStyle(headColor, 1);
      avatar.fillTriangle(
        headX - toolDirectionX + toolPerpendicularX * 4.4,
        headY - toolDirectionY + toolPerpendicularY * 4.4,
        headX + toolDirectionX * 4.5 - toolPerpendicularX * 4,
        headY + toolDirectionY * 4.5 - toolPerpendicularY * 4,
        headX + toolDirectionX * 5.5 + toolPerpendicularX * 4,
        headY + toolDirectionY * 5.5 + toolPerpendicularY * 4
      );
    } else {
      const headColor = tool.headMaterial === 'stone' ? 0xaeb8bd : 0xb77a3d;
      const edgeColor = tool.headMaterial === 'stone' ? 0x52646b : 0x704124;
      avatar.lineStyle(5.6, edgeColor, 1);
      avatar.lineBetween(
        headX - toolPerpendicularX * 7.5,
        headY - toolPerpendicularY * 7.5,
        headX + toolPerpendicularX * 7.5,
        headY + toolPerpendicularY * 7.5
      );
      avatar.lineStyle(3, headColor, 1);
      avatar.lineBetween(
        headX - toolPerpendicularX * 7.2,
        headY - toolPerpendicularY * 7.2,
        headX + toolPerpendicularX * 7.2,
        headY + toolPerpendicularY * 7.2
      );
      avatar.fillStyle(headColor, 1);
      avatar.fillTriangle(
        headX - toolPerpendicularX * 9,
        headY - toolPerpendicularY * 9,
        headX - toolPerpendicularX * 4.5 - toolDirectionX * 3,
        headY - toolPerpendicularY * 4.5 - toolDirectionY * 3,
        headX - toolPerpendicularX * 4.5 + toolDirectionX * 2,
        headY - toolPerpendicularY * 4.5 + toolDirectionY * 2
      );
      avatar.fillTriangle(
        headX + toolPerpendicularX * 9,
        headY + toolPerpendicularY * 9,
        headX + toolPerpendicularX * 4.5 - toolDirectionX * 3,
        headY + toolPerpendicularY * 4.5 - toolDirectionY * 3,
        headX + toolPerpendicularX * 4.5 + toolDirectionX * 2,
        headY + toolPerpendicularY * 4.5 + toolDirectionY * 2
      );
    }
  }

  private drawHarvestFist(direction: Phaser.Math.Vector2, stride: number): void {
    const avatar = this.playerAvatar;
    // Anchor to the resting foreground arm, then bend through a small elbow arc. The extra side
    // offset keeps the arm on one side of the body as the facing changes instead of flipping it.
    const restingHandX = (this.isSwimming ? 10.5 : 11) + direction.x * 3;
    const restingHandY = this.isSwimming ? 2 - stride : 3 - stride * 0.45;
    const sideX = direction.y;
    const sideY = -direction.x;
    const reach = this.harvestStrikeReach();
    const shoulderX = restingHandX - direction.x * 4 - sideX * 2;
    const shoulderY = restingHandY - direction.y * 4 - sideY * 2;
    const elbowX = restingHandX - direction.x + sideX * 2;
    const elbowY = restingHandY - direction.y + sideY * 2;
    const wristX = restingHandX + direction.x * reach + sideX;
    const wristY = restingHandY + direction.y * reach + sideY;

    avatar.lineStyle(5.6, 0xe1ae86, 1);
    avatar.lineBetween(shoulderX, shoulderY, elbowX, elbowY);
    avatar.lineBetween(elbowX, elbowY, wristX, wristY);
    avatar.fillStyle(0xd59e77, 1);
    avatar.fillCircle(wristX, wristY, 4.2);
  }

  private harvestStrikeReach(): number {
    if (!this.harvestTarget && !this.caveHarvestOre) {
      return 0;
    }

    const phase = (this.harvestElapsedMs % 260) / 260;
    if (phase < 0.28) {
      // Pull back a little before each strike.
      return -2 * Math.sin(phase / 0.28 * Math.PI / 2);
    }

    const impactPhase = (phase - 0.28) / 0.72;
    const release = Math.min(1, impactPhase / 0.18);
    return -2 * (1 - release) + 5 * Math.sin(impactPhase * Math.PI);
  }

  private heldHotbarResource(): ResourceType | null {
    if (this.equippedTool) {
      return null;
    }

    const item = this.inventory.getSlots()[this.activeHotbarSlot]?.item;
    return item && !isToolId(item) ? item : null;
  }

  private drawHeldResource(
    direction: Phaser.Math.Vector2,
    stride: number,
    resource: ResourceType,
    harvestReach: number | null = null
  ): void {
    const avatar = this.playerAvatar;
    const restingHandX = (this.isSwimming ? 10.5 : 11) + direction.x * 3;
    const restingHandY = this.isSwimming ? 2 - stride : 3 - stride * 0.45;
    const handX = harvestReach === null
      ? restingHandX + direction.x * 2
      : restingHandX + direction.x * harvestReach + direction.y;
    const handY = harvestReach === null
      ? restingHandY + direction.y * 2
      : restingHandY + direction.y * harvestReach - direction.x;
    const outline = 0x24332a;

    switch (resource) {
      case ResourceType.Wood:
        avatar.fillStyle(outline, 1);
        avatar.fillRoundedRect(handX - 6, handY - 3.5, 12, 7, 3);
        avatar.fillStyle(RESOURCE_COLORS[resource], 1);
        avatar.fillRoundedRect(handX - 5, handY - 2.5, 10, 5, 2);
        avatar.fillStyle(0xe5b16d, 0.9);
        avatar.fillCircle(handX + 3.5, handY, 1.4);
        break;
      case ResourceType.Stone:
      case ResourceType.Coal:
      case ResourceType.Iron:
      case ResourceType.Gold:
      case ResourceType.Diamond:
        avatar.fillStyle(outline, 1);
        avatar.fillTriangle(handX, handY - 6, handX + 6, handY - 1, handX + 3, handY + 5);
        avatar.fillTriangle(handX, handY - 6, handX + 3, handY + 5, handX - 5, handY + 3);
        avatar.fillStyle(RESOURCE_COLORS[resource], 1);
        avatar.fillTriangle(handX, handY - 4.5, handX + 4.5, handY - 1, handX + 2.2, handY + 3.7);
        avatar.fillTriangle(handX, handY - 4.5, handX + 2.2, handY + 3.7, handX - 3.8, handY + 2.2);
        break;
      case ResourceType.Fiber:
        avatar.lineStyle(3.2, outline, 1);
        avatar.lineBetween(handX - 3.5, handY + 4, handX - 3.5, handY - 5);
        avatar.lineBetween(handX, handY + 4, handX, handY - 6);
        avatar.lineBetween(handX + 3.5, handY + 4, handX + 3.5, handY - 5);
        avatar.lineStyle(1.7, RESOURCE_COLORS[resource], 1);
        avatar.lineBetween(handX - 3.5, handY + 4, handX - 3.5, handY - 5);
        avatar.lineBetween(handX, handY + 4, handX, handY - 6);
        avatar.lineBetween(handX + 3.5, handY + 4, handX + 3.5, handY - 5);
        break;
      case ResourceType.Cactus:
        avatar.fillStyle(outline, 1);
        avatar.fillRoundedRect(handX - 3.5, handY - 6, 7, 12, 3);
        avatar.fillStyle(RESOURCE_COLORS[resource], 1);
        avatar.fillRoundedRect(handX - 2.3, handY - 5, 4.6, 10, 2);
        break;
      case ResourceType.IceShard:
        avatar.fillStyle(outline, 1);
        avatar.fillTriangle(handX, handY - 7, handX + 4.5, handY + 5, handX - 4.5, handY + 5);
        avatar.fillStyle(RESOURCE_COLORS[resource], 1);
        avatar.fillTriangle(handX, handY - 5.5, handX + 3, handY + 3.8, handX - 3, handY + 3.8);
        break;
    }
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
  private updateMinimap(time: number, force = false): void {
    if (this.activeCave) {
      this.minimapOverlay.setVisible(false);
      return;
    }
    const tileX = Math.floor(this.player.x / WORLD_TILE_SIZE);
    const tileY = Math.floor(this.player.y / WORLD_TILE_SIZE);
    if (!force && (
      time - this.lastMinimapUpdateMs < MINIMAP_UPDATE_INTERVAL_MS
      || (tileX === this.lastMinimapTileX && tileY === this.lastMinimapTileY)
    )) {
      return;
    }

    this.lastMinimapUpdateMs = time;
    this.lastMinimapTileX = tileX;
    this.lastMinimapTileY = tileY;
    this.minimapOverlay.draw(
      this.worldSeed,
      this.player.x / WORLD_TILE_SIZE,
      this.player.y / WORLD_TILE_SIZE,
      MINIMAP_TILES_PER_CELL
    );
  }

  private updateCaveEntranceInteraction(force = false): void {
    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);
    if (!force && tileX === this.lastCaveEntranceTileX && tileY === this.lastCaveEntranceTileY) {
      return;
    }

    this.lastCaveEntranceTileX = tileX;
    this.lastCaveEntranceTileY = tileY;
    let nearest: CaveEntrance | null = null;
    let nearestDistanceSquared = CAVE_ENTRANCE_INTERACTION_RADIUS_PIXELS ** 2;
    for (let candidateY = tileY - CAVE_ENTRANCE_SEARCH_RADIUS_TILES; candidateY <= tileY + CAVE_ENTRANCE_SEARCH_RADIUS_TILES; candidateY += 1) {
      for (let candidateX = tileX - CAVE_ENTRANCE_SEARCH_RADIUS_TILES; candidateX <= tileX + CAVE_ENTRANCE_SEARCH_RADIUS_TILES; candidateX += 1) {
        const entrance = caveEntranceAtTile(this.worldSeed, candidateX, candidateY);
        if (!entrance) {
          continue;
        }
        const mouth = caveMouthCenter(entrance);
        const distanceSquared = Phaser.Math.Distance.Squared(this.player.x, this.player.y, mouth.x, mouth.y);
        if (distanceSquared < nearestDistanceSquared) {
          nearest = entrance;
          nearestDistanceSquared = distanceSquared;
        }
      }
    }

    this.nearbyCaveEntrance = nearest;
    if (!nearest) {
      this.caveHintPanel.clear().setVisible(false);
      this.caveHint.setVisible(false);
      return;
    }

    const mouth = caveMouthCenter(nearest);
    this.interactionHighlight
      .setRadius(Math.max(16, nearest.mouthForwardRadiusTiles * WORLD_TILE_SIZE * 0.15))
      .setPosition(mouth.x, mouth.y)
      .setVisible(true);
    this.drawCaveHint(
      mouth.x,
      mouth.y - Math.max(40, nearest.mouthForwardRadiusTiles * WORLD_TILE_SIZE * 0.8),
      'Press E to enter'
    );
  }

  private drawCaveHint(worldX: number, worldY: number, label: string): void {
    this.caveHint.setText(label).setPosition(worldX, worldY).setVisible(true);
    const width = Math.max(118, this.caveHint.width + 22);
    const height = Math.max(28, this.caveHint.height + 10);
    const left = worldX - width / 2;
    const top = worldY - height / 2;
    this.caveHintPanel.clear();
    this.caveHintPanel.fillStyle(0x090b0d, 0.92);
    this.caveHintPanel.fillRoundedRect(left, top, width, height, 7);
    this.caveHintPanel.lineStyle(1.5, 0x91a7b0, 0.92);
    this.caveHintPanel.strokeRoundedRect(left, top, width, height, 7);
    this.caveHintPanel.fillStyle(0x11161a, 0.95);
    this.caveHintPanel.fillTriangle(worldX - 6, top + height - 1, worldX + 6, top + height - 1, worldX, top + height + 7);
    this.caveHintPanel.setVisible(true);
  }

  private enterCave(entrance: CaveEntrance, returnWorldX: number, returnWorldY: number, markDirty = true): void {
    this.cancelHarvesting();
    this.nearbyCaveEntrance = null;
    this.caveHintPanel.clear().setVisible(false);
    this.caveHint.setVisible(false);
    this.dropHighlight.setVisible(false);
    this.dropHintPanel.clear().setVisible(false);
    this.dropHint.setVisible(false);
    this.interactionHighlight.setVisible(false);

    const layout = generateCaveLayout(this.worldSeed, entrance);
    const origin = caveWorldOrigin(entrance);
    this.activeCave = { entrance, layout, origin, returnWorldX, returnWorldY };
    const spawn = caveWorldTilePosition(origin, layout.entranceTileX, layout.entranceTileY);
    this.player.setPosition(spawn.x, spawn.y);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.isSwimming = false;
    this.terrainSurface = 'cave floor';
    this.minimapOverlay.setVisible(false);
    this.drawActiveCave();
    this.updateCaveInteraction(true);
    this.updatePlayerAvatar(0, false);
    if (markDirty) {
      this.markSaveDirty();
    }
  }

  private exitCave(): void {
    const cave = this.activeCave;
    if (!cave) {
      return;
    }

    this.cancelHarvesting();
    this.activeCave = null;
    this.caveOreTarget = null;
    this.caveExitNearby = false;
    this.caveGraphics.clear().setVisible(false);
    this.caveHintPanel.clear().setVisible(false);
    this.caveHint.setVisible(false);
    this.player.setPosition(cave.returnWorldX, cave.returnWorldY);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.currentTopography = this.chunkManager.getTopographyAt(this.player.x, this.player.y);
    this.terrainSurface = this.currentTopography.surface;
    this.updateSwimmingState(true);
    this.chunkManager.update(this.player.x, this.player.y);
    this.updateInteractionTarget(true);
    this.updateCaveEntranceInteraction(true);
    this.updateDropInteraction(0, true);
    this.minimapOverlay.setVisible(true);
    this.lastMinimapUpdateMs = Number.NEGATIVE_INFINITY;
    this.lastMinimapTileX = Number.NaN;
    this.lastMinimapTileY = Number.NaN;
    this.updateMinimap(0, true);
    this.updatePlayerAvatar(0, false);
    this.markSaveDirty();
  }

  private drawActiveCave(): void {
    const cave = this.activeCave;
    if (!cave) {
      return;
    }

    const graphics = this.caveGraphics;
    const { layout, origin } = cave;
    const outerX = origin.x - WORLD_TILE_SIZE;
    const outerY = origin.y - WORLD_TILE_SIZE;
    graphics.clear().setVisible(true);
    graphics.fillStyle(0x07090b, 1);
    graphics.fillRect(outerX, outerY, (layout.width + 2) * WORLD_TILE_SIZE, (layout.height + 2) * WORLD_TILE_SIZE);

    // The floor base follows the collision data exactly. Curved wall contours are then layered
    // on top, so a blocked rock cell can never be painted as walkable ground.
    for (let y = 0; y < layout.height; y += 1) {
      let runStart = -1;
      for (let x = 0; x <= layout.width; x += 1) {
        if (x < layout.width && layout.floorTiles[y][x]) {
          if (runStart < 0) {
            runStart = x;
          }
        } else if (runStart >= 0) {
          graphics.fillStyle(0x353c39, 1);
          graphics.fillRect(
            origin.x + runStart * WORLD_TILE_SIZE,
            origin.y + y * WORLD_TILE_SIZE,
            (x - runStart) * WORLD_TILE_SIZE,
            WORLD_TILE_SIZE
          );
          runStart = -1;
        }
      }
    }

    // The collision grid remains private to movement. Its boundary is traced into broad,
    // uneven rock slopes, which keeps the visible cave curved without hiding solid rock.
    const contours = this.createCaveContours(layout, origin);
    contours.forEach((contour) => {
      graphics.lineStyle(82, 0x101516, 1);
      graphics.strokePoints(contour as CaveRenderPoint[], true);
      graphics.lineStyle(62, 0x1e2927, 1);
      graphics.strokePoints(contour as CaveRenderPoint[], true);
      graphics.lineStyle(42, 0x303e39, 0.98);
      graphics.strokePoints(contour as CaveRenderPoint[], true);
      graphics.lineStyle(21, 0x526159, 0.86);
      graphics.strokePoints(contour as CaveRenderPoint[], true);
    });
    contours.forEach((contour, index) => {
      this.drawCaveWallStrata(contour, index);
    });

    for (let y = 0; y < layout.height; y += 1) {
      for (let x = 0; x < layout.width; x += 1) {
        if (!layout.floorTiles[y][x]) {
          continue;
        }
        const worldX = origin.x + x * WORLD_TILE_SIZE;
        const worldY = origin.y + y * WORLD_TILE_SIZE;
        const detail = randomAtTile(this.worldSeed, cave.entrance.tileX * 211 + x, cave.entrance.tileY * 211 + y, 0x6c7e);
        if ((x + y) % 2 === 0 && detail > 0.46) {
          this.drawCaveRockPatch(
            worldX + 6 + this.caveVisualRandom(x, y, 0x6c81) * 20,
            worldY + 6 + this.caveVisualRandom(x, y, 0x6c82) * 20,
            7 + detail * 9,
            3 + detail * 5,
            x,
            y,
            0x6c83,
            detail > 0.8 ? 0x68716a : 0x4a524e,
            detail > 0.8 ? 0.2 : 0.16
          );
        }
      }
    }

    // The exit is a worn opening in the floor, not a separate marker sprite.
    const exit = caveWorldTilePosition(origin, layout.entranceTileX, layout.entranceTileY);
    this.drawCaveRockPatch(exit.x, exit.y + 3, 18, 12, layout.entranceTileX, layout.entranceTileY, 0x6d01, 0x746647, 0.7);
    this.fillCavePolygon(this.createCaveVeinPoints(exit.x, exit.y + 3, 0.08, 23, 7, layout.entranceTileX, layout.entranceTileY, 0x6d02), 0x111416, 0.96);

    layout.ores.forEach((ore) => {
      if (this.sessionWorldState.isCaveOreHarvested(ore.id)) {
        this.drawMinedCaveOreGouge(ore, origin);
      } else {
        this.drawCaveOre(ore, origin);
      }
    });
  }

  private caveVisualRandom(tileX: number, tileY: number, salt: number): number {
    const cave = this.activeCave;
    if (!cave) {
      return 0.5;
    }
    return randomAtTile(
      this.worldSeed,
      cave.entrance.tileX * 997 + tileX * 37,
      cave.entrance.tileY * 991 + tileY * 41,
      salt
    );
  }

  private fillCavePolygon(points: readonly CaveRenderPoint[], color: number, alpha = 1): void {
    if (points.length < 3) {
      return;
    }
    this.caveGraphics.fillStyle(color, alpha);
    this.caveGraphics.fillPoints(points as CaveRenderPoint[], true);
  }

  private drawCaveRockPatch(
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    tileX: number,
    tileY: number,
    salt: number,
    color: number,
    alpha: number
  ): void {
    const points: CaveRenderPoint[] = [];
    const count = 7;
    const phase = this.caveVisualRandom(tileX, tileY, salt) * Math.PI * 2;
    for (let index = 0; index < count; index += 1) {
      const angle = phase + index / count * Math.PI * 2;
      const variation = 0.72 + this.caveVisualRandom(tileX + index, tileY - index, salt + index + 1) * 0.42;
      points.push({
        x: centerX + Math.cos(angle) * radiusX * variation,
        y: centerY + Math.sin(angle) * radiusY * variation
      });
    }
    this.fillCavePolygon(points, color, alpha);
  }

  private createCaveContours(layout: CaveLayout, origin: CaveWorldOrigin): CaveRenderPoint[][] {
    const edges: CaveBoundaryEdge[] = [];
    const edgesByStart = new Map<string, CaveBoundaryEdge[]>();
    const addEdge = (fromX: number, fromY: number, toX: number, toY: number): void => {
      const edge: CaveBoundaryEdge = {
        from: { x: origin.x + fromX * WORLD_TILE_SIZE, y: origin.y + fromY * WORLD_TILE_SIZE },
        to: { x: origin.x + toX * WORLD_TILE_SIZE, y: origin.y + toY * WORLD_TILE_SIZE }
      };
      edges.push(edge);
      const key = `${edge.from.x}:${edge.from.y}`;
      const linked = edgesByStart.get(key) ?? [];
      linked.push(edge);
      edgesByStart.set(key, linked);
    };

    for (let y = 0; y < layout.height; y += 1) {
      for (let x = 0; x < layout.width; x += 1) {
        if (!layout.floorTiles[y][x]) {
          continue;
        }
        if (y === 0 || !layout.floorTiles[y - 1][x]) addEdge(x, y, x + 1, y);
        if (x === layout.width - 1 || !layout.floorTiles[y][x + 1]) addEdge(x + 1, y, x + 1, y + 1);
        if (y === layout.height - 1 || !layout.floorTiles[y + 1][x]) addEdge(x + 1, y + 1, x, y + 1);
        if (x === 0 || !layout.floorTiles[y][x - 1]) addEdge(x, y + 1, x, y);
      }
    }

    const used = new Set<CaveBoundaryEdge>();
    const contours: CaveRenderPoint[][] = [];
    for (const initialEdge of edges) {
      if (used.has(initialEdge)) {
        continue;
      }
      const points: CaveRenderPoint[] = [];
      const startKey = `${initialEdge.from.x}:${initialEdge.from.y}`;
      let edge: CaveBoundaryEdge | undefined = initialEdge;
      let closed = false;
      while (edge && !used.has(edge)) {
        used.add(edge);
        points.push(edge.from);
        const endKey: string = `${edge.to.x}:${edge.to.y}`;
        if (endKey === startKey) {
          closed = true;
          break;
        }
        edge = (edgesByStart.get(endKey) ?? []).find((candidate) => !used.has(candidate));
      }
      if (closed && points.length >= 3) {
        contours.push(this.smoothCaveContour(points, contours.length));
      }
    }
    return contours;
  }

  private smoothCaveContour(points: readonly CaveRenderPoint[], contourIndex: number): CaveRenderPoint[] {
    let smoothed = [...points];
    for (let pass = 0; pass < 2; pass += 1) {
      const next: CaveRenderPoint[] = [];
      for (let index = 0; index < smoothed.length; index += 1) {
        const current = smoothed[index];
        const following = smoothed[(index + 1) % smoothed.length];
        next.push({ x: current.x * 0.75 + following.x * 0.25, y: current.y * 0.75 + following.y * 0.25 });
        next.push({ x: current.x * 0.25 + following.x * 0.75, y: current.y * 0.25 + following.y * 0.75 });
      }
      smoothed = next;
    }
    return smoothed.map((point, index) => {
      const prior = smoothed[(index + smoothed.length - 1) % smoothed.length];
      const following = smoothed[(index + 1) % smoothed.length];
      const distance = Math.hypot(following.x - prior.x, following.y - prior.y) || 1;
      const outwardX = (following.y - prior.y) / distance;
      const outwardY = -(following.x - prior.x) / distance;
      const jag = (this.caveVisualRandom(contourIndex * 193 + index, contourIndex * 31 + index, 0x7201 + index) - 0.5) * 5.4;
      return { x: point.x + outwardX * jag, y: point.y + outwardY * jag };
    });
  }

  private caveContourArea(points: readonly CaveRenderPoint[]): number {
    if (points.length < 3) {
      return 0;
    }
    const anchor = points[0];
    return points.reduce((area, point, index) => {
      const following = points[(index + 1) % points.length];
      return area
        + (point.x - anchor.x) * (following.y - anchor.y)
        - (following.x - anchor.x) * (point.y - anchor.y);
    }, 0) / 2;
  }

  private drawCaveWallStrata(contour: readonly CaveRenderPoint[], contourIndex: number): void {
    const area = this.caveContourArea(contour);
    const step = 34;
    for (let index = contourIndex * 11; index < contour.length; index += step) {
      const point = contour[index];
      const following = contour[(index + 5) % contour.length];
      const deltaX = following.x - point.x;
      const deltaY = following.y - point.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < 8) {
        continue;
      }
      const outwardSign = area > 0 ? 1 : -1;
      const outwardX = deltaY / distance * outwardSign;
      const outwardY = -deltaX / distance * outwardSign;
      const length = 20 + this.caveVisualRandom(contourIndex, index, 0x7221) * 22;
      const width = 2.8 + this.caveVisualRandom(contourIndex, index, 0x7222) * 3.6;
      const centerX = point.x + outwardX * (19 + this.caveVisualRandom(contourIndex, index, 0x7223) * 10);
      const centerY = point.y + outwardY * (19 + this.caveVisualRandom(contourIndex, index, 0x7223) * 10);
      const angle = Math.atan2(deltaY, deltaX);
      this.fillCavePolygon(this.createCaveVeinPoints(centerX, centerY, angle, length + 8, width + 2.5, contourIndex, index, 0x7224), 0x121917, 0.54);
      this.fillCavePolygon(this.createCaveVeinPoints(centerX, centerY, angle, length, width, contourIndex, index, 0x7234), 0x5b6a60, 0.42);
    }
  }

  private createCaveVeinPoints(
    centerX: number,
    centerY: number,
    angle: number,
    length: number,
    width: number,
    tileX: number,
    tileY: number,
    salt: number
  ): CaveRenderPoint[] {
    const forwardX = Math.cos(angle);
    const forwardY = Math.sin(angle);
    const sideX = -forwardY;
    const sideY = forwardX;
    const left: CaveRenderPoint[] = [];
    const right: CaveRenderPoint[] = [];
    const samples = 6;
    for (let index = 0; index < samples; index += 1) {
      const progress = index / (samples - 1);
      const along = (progress - 0.5) * length;
      const drift = (this.caveVisualRandom(tileX + index, tileY, salt + index) - 0.5) * width * 1.15;
      const halfWidth = width * (0.58 + this.caveVisualRandom(tileX, tileY + index, salt + 13 + index) * 0.48);
      const endTaper = 0.45 + Math.sin(progress * Math.PI) * 0.55;
      left.push({
        x: centerX + forwardX * along + sideX * (drift + halfWidth * endTaper),
        y: centerY + forwardY * along + sideY * (drift + halfWidth * endTaper)
      });
      right.push({
        x: centerX + forwardX * along + sideX * (drift - halfWidth * endTaper),
        y: centerY + forwardY * along + sideY * (drift - halfWidth * endTaper)
      });
    }
    return [...left, ...right.reverse()];
  }

  private drawCaveOre(ore: CaveOre, origin: CaveWorldOrigin): void {
    const color = RESOURCE_COLORS[ore.type === 'coal' ? ResourceType.Coal
      : ore.type === 'iron' ? ResourceType.Iron
        : ore.type === 'gold' ? ResourceType.Gold : ResourceType.Diamond];
    this.drawCaveOreFormation(ore, origin, color, false);
  }

  private drawMinedCaveOreGouge(ore: CaveOre, origin: CaveWorldOrigin): void {
    this.drawCaveOreFormation(ore, origin, 0x111718, true);
    const position = caveWorldTilePosition(origin, ore.tileX, ore.tileY);
    const salt = ore.placement === 'wall' ? 0x7301 : 0x7311;
    const angle = this.caveVisualRandom(ore.tileX, ore.tileY, salt) * Math.PI;
    this.drawCaveRockPatch(position.x - Math.cos(angle) * 8, position.y - Math.sin(angle) * 8 + 6, 7, 3.8, ore.tileX, ore.tileY, salt + 97, 0x25302c, 0.88);
  }

  private drawCaveOreFormation(ore: CaveOre, origin: CaveWorldOrigin, mineralColor: number, mined: boolean): void {
    const position = caveWorldTilePosition(origin, ore.tileX, ore.tileY);
    const salt = ore.placement === 'wall' ? 0x7301 : 0x7311;
    const angle = this.caveVisualRandom(ore.tileX, ore.tileY, salt) * Math.PI;
    const baseLength = ore.placement === 'wall' ? 68 : 58;
    const baseWidth = ore.placement === 'wall' ? 11.5 : 9.4;
    const hostRockColor = mined ? 0x4b5750 : ore.placement === 'wall' ? 0x34413c : 0x46514b;
    const sideX = -Math.sin(angle);
    const sideY = Math.cos(angle);
    const drawStrand = (centerX: number, centerY: number, strandAngle: number, length: number, width: number, strandSalt: number): void => {
      this.fillCavePolygon(
        this.createCaveVeinPoints(centerX, centerY, strandAngle, length + 10, width + 5.5, ore.tileX, ore.tileY, strandSalt),
        hostRockColor,
        mined ? 0.74 : 0.68
      );
      this.fillCavePolygon(
        this.createCaveVeinPoints(centerX, centerY, strandAngle, length, width, ore.tileX, ore.tileY, strandSalt + 19),
        mineralColor,
        mined ? 0.95 : 0.82
      );
    };

    // Every placement has a seed-derived form. The individual strands overlap in the parent
    // rock, creating geological seams and pockets instead of freestanding item-like marks.
    switch (ore.veinStyle) {
      case 'thread': {
        drawStrand(position.x, position.y, angle, baseLength * 1.08, baseWidth * 0.46, salt + 1);
        drawStrand(
          position.x + Math.cos(angle) * baseLength * 0.1,
          position.y + Math.sin(angle) * baseLength * 0.1,
          angle + (this.caveVisualRandom(ore.tileX, ore.tileY, salt + 2) - 0.5) * 0.92,
          baseLength * 0.56,
          baseWidth * 0.28,
          salt + 31
        );
        break;
      }
      case 'seam': {
        drawStrand(position.x, position.y, angle, baseLength, baseWidth, salt + 41);
        drawStrand(
          position.x + sideX * baseWidth * 0.42,
          position.y + sideY * baseWidth * 0.42,
          angle + (this.caveVisualRandom(ore.tileX, ore.tileY, salt + 42) - 0.5) * 0.22,
          baseLength * 0.78,
          baseWidth * 0.5,
          salt + 53
        );
        break;
      }
      case 'pocket': {
        this.drawCaveRockPatch(position.x, position.y, baseWidth * 2.1, baseWidth * 1.55, ore.tileX, ore.tileY, salt + 61, hostRockColor, mined ? 0.76 : 0.7);
        drawStrand(position.x, position.y, angle, baseLength * 0.58, baseWidth * 1.06, salt + 67);
        drawStrand(position.x, position.y, angle + Math.PI / 2 + (this.caveVisualRandom(ore.tileX, ore.tileY, salt + 68) - 0.5) * 0.34, baseLength * 0.45, baseWidth * 0.68, salt + 79);
        break;
      }
      case 'fan': {
        for (let branch = -1; branch <= 1; branch += 1) {
          const branchAngle = angle + branch * (0.42 + this.caveVisualRandom(ore.tileX, ore.tileY, salt + branch + 73) * 0.2);
          const offset = branch * baseWidth * 0.46;
          drawStrand(
            position.x + sideX * offset + Math.cos(branchAngle) * baseLength * 0.13,
            position.y + sideY * offset + Math.sin(branchAngle) * baseLength * 0.13,
            branchAngle,
            baseLength * (0.6 + this.caveVisualRandom(ore.tileX, ore.tileY, salt + branch + 77) * 0.2),
            baseWidth * 0.42,
            salt + 89 + branch * 13
          );
        }
        break;
      }
      case 'ribbon': {
        for (let ribbon = -1; ribbon <= 1; ribbon += 1) {
          const offset = ribbon * baseWidth * 0.88;
          drawStrand(
            position.x + sideX * offset,
            position.y + sideY * offset,
            angle + (this.caveVisualRandom(ore.tileX, ore.tileY, salt + ribbon + 103) - 0.5) * 0.16,
            baseLength * (0.72 + this.caveVisualRandom(ore.tileX, ore.tileY, salt + ribbon + 107) * 0.23),
            baseWidth * 0.31,
            salt + 113 + ribbon * 13
          );
        }
        break;
      }
      case 'cluster': {
        for (let cluster = 0; cluster < 4; cluster += 1) {
          const clusterAngle = angle + (cluster - 1.5) * 0.52;
          const distance = baseWidth * (0.42 + this.caveVisualRandom(ore.tileX, ore.tileY, salt + cluster + 131) * 0.55);
          drawStrand(
            position.x + Math.cos(clusterAngle) * distance,
            position.y + Math.sin(clusterAngle) * distance,
            clusterAngle + (this.caveVisualRandom(ore.tileX, ore.tileY, salt + cluster + 137) - 0.5) * 0.38,
            baseLength * (0.35 + this.caveVisualRandom(ore.tileX, ore.tileY, salt + cluster + 139) * 0.22),
            baseWidth * 0.5,
            salt + 149 + cluster * 13
          );
        }
        break;
      }
    }
  }

  private updateCave(time: number, delta: number): void {
    if (this.worldMapOpen || this.inventoryOpen || this.craftingOpen) {
      this.updatePlayerAvatar(delta, false);
      return;
    }

    const horizontal = Number(this.isDown('right')) - Number(this.isDown('left'));
    const vertical = Number(this.isDown('down')) - Number(this.isDown('up'));
    const isMoving = horizontal !== 0 || vertical !== 0;
    this.updateFacing(horizontal, vertical);
    if (isMoving) {
      const length = Math.hypot(horizontal, vertical);
      const distance = PLAYER_SPEED * delta / 1000;
      this.moveCavePlayer(horizontal / length * distance, vertical / length * distance);
      this.markSaveDirty();
    }
    this.updateCaveInteraction();
    this.updateCaveHarvesting(delta);
    this.updatePlayerAvatar(delta, isMoving);
  }

  private moveCavePlayer(deltaX: number, deltaY: number): void {
    const cave = this.activeCave;
    if (!cave) {
      return;
    }
    const tryMove = (x: number, y: number): boolean => {
      const tileX = Math.floor((x - cave.origin.x) / WORLD_TILE_SIZE);
      const tileY = Math.floor((y - cave.origin.y) / WORLD_TILE_SIZE);
      return tileY >= 0 && tileY < cave.layout.height && tileX >= 0 && tileX < cave.layout.width && cave.layout.floorTiles[tileY][tileX];
    };
    if (tryMove(this.player.x + deltaX, this.player.y)) {
      this.player.x += deltaX;
    }
    if (tryMove(this.player.x, this.player.y + deltaY)) {
      this.player.y += deltaY;
    }
  }

  private updateCaveInteraction(force = false): void {
    const cave = this.activeCave;
    if (!cave) {
      return;
    }
    const exit = caveWorldTilePosition(cave.origin, cave.layout.entranceTileX, cave.layout.entranceTileY);
    this.caveExitNearby = Phaser.Math.Distance.Between(this.player.x, this.player.y, exit.x, exit.y) < 52;
    let nearest: CaveOre | null = null;
    let nearestDistanceSquared = 84 * 84;
    cave.layout.ores.forEach((ore) => {
      if (this.sessionWorldState.isCaveOreHarvested(ore.id)) {
        return;
      }
      const position = caveWorldTilePosition(cave.origin, ore.tileX, ore.tileY);
      const distanceSquared = Phaser.Math.Distance.Squared(this.player.x, this.player.y, position.x, position.y);
      if (distanceSquared < nearestDistanceSquared) {
        nearest = ore;
        nearestDistanceSquared = distanceSquared;
      }
    });
    this.caveOreTarget = nearest;

    if (this.caveExitNearby) {
      this.interactionHighlight.setRadius(48).setPosition(exit.x, exit.y).setVisible(true);
      this.drawCaveHint(exit.x, exit.y - 33, 'Press E to exit');
    } else if (nearest) {
      const ore = nearest as CaveOre;
      const position = caveWorldTilePosition(cave.origin, ore.tileX, ore.tileY);
      this.interactionHighlight.setRadius(36).setPosition(position.x, position.y).setVisible(true);
      this.caveHintPanel.clear().setVisible(false);
      this.caveHint.setVisible(false);
    } else {
      this.interactionHighlight.setVisible(false);
      this.caveHintPanel.clear().setVisible(false);
      this.caveHint.setVisible(false);
    }
  }

  private updateCaveHarvesting(delta: number): void {
    if (this.harvestRequiresMouseRelease) {
      if (!this.input.activePointer.leftButtonDown()) {
        this.harvestRequiresMouseRelease = false;
      }
      return;
    }
    if (!this.input.activePointer.leftButtonDown() || !this.caveOreTarget) {
      if (this.caveHarvestOre) {
        this.caveHarvestOre = null;
        this.harvestElapsedMs = 0;
        this.harvestProgressGraphics.clear();
      }
      return;
    }
    if (!this.caveHarvestOre || this.caveHarvestOre.id !== this.caveOreTarget.id) {
      this.caveHarvestOre = this.caveOreTarget;
      this.harvestElapsedMs = 0;
    }
    const speed = this.caveMiningSpeed();
    const durationMs = HARVEST_DURATION_MS / speed;
    this.harvestElapsedMs = Math.min(durationMs, this.harvestElapsedMs + delta);
    const cave = this.activeCave;
    if (!cave) {
      return;
    }
    const position = caveWorldTilePosition(cave.origin, this.caveHarvestOre.tileX, this.caveHarvestOre.tileY);
    this.drawHarvestProgressAt(position.x, position.y - 32, this.harvestElapsedMs / durationMs);
    if (this.harvestElapsedMs >= durationMs) {
      const ore = this.caveHarvestOre;
      this.caveHarvestOre = null;
      this.harvestElapsedMs = 0;
      this.harvestProgressGraphics.clear();
      this.harvestRequiresMouseRelease = true;
      const resource = ore.type === 'coal' ? ResourceType.Coal : ore.type === 'iron' ? ResourceType.Iron
        : ore.type === 'gold' ? ResourceType.Gold : ResourceType.Diamond;
      if (!this.inventory.canAdd(resource, 1)) {
        this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
        return;
      }
      if (this.sessionWorldState.harvestCaveOre(ore.id)) {
        this.inventory.add(resource, 1);
        this.showWorldFeedback(this.player.x, this.player.y - 28, `+ 1 ${resourceLabel(resource)}`);
        this.handleInventoryChanged();
        this.drawActiveCave();
        this.updateCaveInteraction(true);
      }
    }
  }

  private caveMiningSpeed(): number {
    if (!this.equippedTool) {
      return 0.55;
    }
    const tool = TOOL_DEFINITIONS[this.equippedTool];
    if (tool.kind !== 'pickaxe') {
      return 0.7;
    }
    return tool.headMaterial === 'stone' ? 2.35 : 1.6;
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
        .setRadius(62)
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
      this.handleInventoryChanged();
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

    if (this.inventoryOpen || this.craftingOpen || !this.input.activePointer.leftButtonDown() || !this.interactionTarget) {
      this.cancelHarvesting();
      return;
    }

    if (!this.harvestTarget || !this.sameTarget(this.harvestTarget, this.interactionTarget)) {
      this.cancelHarvesting();
      this.harvestTarget = { ...this.interactionTarget };
    }

    const speedMultiplier = harvestSpeedForFeature(this.equippedTool, this.harvestTarget.feature);
    const durationMs = HARVEST_DURATION_MS / speedMultiplier;
    this.harvestElapsedMs = Math.min(this.harvestElapsedMs + delta, durationMs);
    const progress = this.harvestElapsedMs / durationMs;
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
    this.handleInventoryChanged();
    this.updateInteractionTarget(true);
  }

  private cancelHarvesting(): void {
    if (this.harvestTarget) {
      this.chunkManager.clearHarvestAnimation(this.harvestTarget.tileX, this.harvestTarget.tileY);
    }

    this.harvestTarget = null;
    this.caveHarvestOre = null;
    this.harvestElapsedMs = 0;
    this.harvestProgressGraphics.clear();
  }

  private drawHarvestProgress(target: InteractionTarget, progress: number): void {
    const centerX = (target.tileX + 0.5) * WORLD_TILE_SIZE + 32;
    const centerY = (target.tileY + 0.5) * WORLD_TILE_SIZE - 32;
    this.drawHarvestProgressAt(centerX, centerY, progress);
  }

  private drawHarvestProgressAt(centerX: number, centerY: number, progress: number): void {
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

  private craftRecipe(recipe: CraftingRecipe): boolean {
    const result = applyCraftingRecipe(this.inventory, recipe);
    if (result === 'missing-ingredients') {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Need more resources');
      return false;
    }
    if (result === 'inventory-full') {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
      return false;
    }

    this.showWorldFeedback(this.player.x, this.player.y - 28, `Crafted ${TOOL_DEFINITIONS[recipe.output].label}`);
    this.handleInventoryChanged();
    return true;
  }

  private selectHotbarSlot(slotIndex: number): void {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= HOTBAR_SLOT_COUNT) {
      return;
    }

    this.activeHotbarSlot = slotIndex;
    const selectedItem = this.inventory.getSlots()[slotIndex]?.item;
    this.setEquippedTool(selectedItem && isToolId(selectedItem) ? selectedItem : null);
  }

  private setEquippedTool(tool: ToolId | null): void {
    if (tool && this.inventory.get(tool) < 1) {
      return;
    }

    this.equippedTool = tool;
    this.lastAvatarState = '';
    this.updatePlayerAvatar(0, false);
    this.hotbarOverlay.refresh();
    this.markSaveDirty();
  }

  private handleInventoryChanged(): void {
    if (this.equippedTool && this.inventory.get(this.equippedTool) < 1) {
      this.equippedTool = null;
      this.lastAvatarState = '';
      this.updatePlayerAvatar(0, false);
    }

    this.hotbarOverlay.refresh();
    this.markSaveDirty();
  }

  private updateHotbarVisibility(): void {
    this.hotbarOverlay.setVisible(!this.inventoryOpen && !this.craftingOpen && !this.worldMapOpen);
  }

  private dropInventorySlot(slot: InventorySlot): void {
    if (!this.worldReady) {
      return;
    }

    if (isToolId(slot.item)) {
      return;
    }

    const direction = this.facingVector();
    const requestedDropX = this.player.x + direction.x * 68;
    const requestedDropY = this.player.y + direction.y * 68;
    const dropPosition = { x: requestedDropX, y: requestedDropY };
    const drop = this.sessionWorldState.createDropAt(
      dropPosition.x,
      dropPosition.y,
      slot.item,
      slot.amount
    );
    this.dropManager.add(drop);
    this.showWorldFeedback(this.player.x, this.player.y - 28, `Dropped ${slot.amount} ${resourceLabel(slot.item)}`);
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
      equipment: { equippedTool: this.equippedTool, activeHotbarSlot: this.activeHotbarSlot },
      world: this.sessionWorldState.toSaveData(),
      activeCave: this.activeCave ? {
        entranceTileX: this.activeCave.entrance.tileX,
        entranceTileY: this.activeCave.entrance.tileY,
        returnWorldX: this.activeCave.returnWorldX,
        returnWorldY: this.activeCave.returnWorldY
      } : undefined
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

    if (this.activeCave) {
      const cave = this.activeCave;
      const localTileX = Math.floor((this.player.x - cave.origin.x) / WORLD_TILE_SIZE);
      const localTileY = Math.floor((this.player.y - cave.origin.y) / WORLD_TILE_SIZE);
      const remainingOres = cave.layout.ores.filter((ore) => !this.sessionWorldState.isCaveOreHarvested(ore.id)).length;
      this.debugElement.textContent = [
        'WILDBOUND // CAVE STATUS',
        `Cave        ${cave.entrance.id}`,
        `Depth       ${cave.entrance.depth}`,
        `Interior    ${cave.layout.width} x ${cave.layout.height} tiles`,
        `Tile        ${localTileX}, ${localTileY}`,
        `Target      ${this.caveOreTarget?.type ?? (this.caveExitNearby ? 'exit' : 'none')}`,
        `Ores        ${remainingOres} remaining / ${this.sessionWorldState.harvestedCaveOreCount} harvested`,
        `Tool        ${this.equippedTool ? TOOL_DEFINITIONS[this.equippedTool].label : 'hand'}`,
        `FPS         ${this.game.loop.actualFps.toFixed(0)}`
      ].join('\n');
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
      `Tool        ${this.equippedTool ? TOOL_DEFINITIONS[this.equippedTool].label : 'none'}`,
      `Seed        ${this.worldSeed}`,
      `Chunk       ${this.chunkManager.currentChunkX}, ${this.chunkManager.currentChunkY}`,
      `Loaded      ${this.chunkManager.loadedChunkCount} chunks`,
      `Landmarks   ${this.chunkManager.loadedLandmarkCount} nearby`,
      `FPS         ${this.game.loop.actualFps.toFixed(0)}`
    ].join('\n');
  }
}

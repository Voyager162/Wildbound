import Phaser from 'phaser';
import type { InventoryItem, InventorySlot } from '../player/Inventory';
import { HOTBAR_SLOT_COUNT, Inventory, INVENTORY_SLOT_COUNT } from '../player/Inventory';
import { FacingDirection } from '../player/interaction';
import { PLAYER_SPEED_SCALE } from '../player/playerConfig';
import { FootprintTrail } from '../player/FootprintTrail';
import { mainMenuMusic } from '../audio/MainMenuMusic';
import { gameMusic } from '../audio/GameMusic';
import type { InteractionTarget } from '../player/interaction';
import { isSaveGameData, type SaveGameData } from '../save/SaveGameData';
import { MAX_WORLD_SEED_LENGTH, isWorldMode, type WorldMode } from '../save/WorldLibrary';
import {
  CONTROL_ACTIONS,
  createDefaultGameSettings,
  isMouseBinding,
  normalizeGameSettings,
  type ControlAction,
  type ControlBinding,
  type GameSettings
} from '../settings/GameSettings';
import { DayNightOverlay } from '../ui/DayNightOverlay';
import { InventoryOverlay } from '../ui/InventoryOverlay';
import { HotbarOverlay } from '../ui/HotbarOverlay';
import { MinimapOverlay } from '../ui/MinimapOverlay';
import { NightAmbientOverlay } from '../ui/NightAmbientOverlay';
import { PlacedLightOverlay } from '../ui/PlacedLightOverlay';
import { PauseMenuOverlay } from '../ui/PauseMenuOverlay';
import { PlacedObjectOverlay } from '../ui/PlacedObjectOverlay';
import { PotionEffectOverlay } from '../ui/PotionEffectOverlay';
import { WorldMapOverlay } from '../ui/WorldMapOverlay';
import { MINIMAP_AREA_SCALE } from '../ui/uiConfig';
import { ChunkManager } from '../world/ChunkManager';
import type { NightAmbientLight } from '../world/AmbientParticleManager';
import { BiomeAmbientAudio } from '../world/BiomeAmbientAudio';
import { SWIM_RECORDING_REPEAT_INTERVAL_MS } from '../world/swimmingAudioConfig';
import {
  caveOreHarvestSoundContactCountFor,
  harvestSoundContactCountFor
} from '../world/harvestAudioConfig';
import { DropManager } from '../world/DropManager';
import { PlaceableManager } from '../world/PlaceableManager';
import { biomeAtTile, climateAtTile } from '../world/generation/biomeGenerator';
import { featureAtTile } from '../world/generation/featureGenerator';
import { randomAtTile } from '../world/generation/noise';
import { surfaceAtTile } from '../world/generation/terrainGenerator';
import type { TopographySample } from '../world/generation/topographyGenerator';
import { RESOURCE_COLORS, ResourceType, resourceForFeature, resourceLabel } from '../world/resources';
import { SessionWorldState } from '../world/SessionWorldState';
import type { DroppedItem, PlacedObject } from '../world/SessionWorldState';
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
import {
  landmarkAtTile,
  landmarksIntersectingTiles,
  nearestLandmarkToTile
} from '../world/generation/landmarkGenerator';
import { LandmarkType, type ProceduralLandmark } from '../world/landmarkConfig';
import {
  landmarkEntranceVisualPosition,
  type LandmarkEntrance,
  type LandmarkMaterialNode
} from '../world/landmarks/landmarkSurfaceGenerator';
import { ancientTreeFeatureRegrowthDelayMs } from '../world/landmarks/ancientTreeConfig';
import {
  STONE_CIRCLE_RUNE_RESTORE_MIGRATION_VERSION,
  stoneCircleRuneRegrowthDelayMs
} from '../world/landmarks/stoneCircleConfig';
import {
  generateLandmarkInterior,
  isLandmarkInteriorType,
  landmarkInteriorContainsPoint,
  landmarkInteriorWorldOrigin,
  landmarkInteriorWorldTilePosition,
  type LandmarkInteriorDecoration,
  type LandmarkInteriorFloor,
  type LandmarkInteriorLayout,
  type LandmarkInteriorMaterialNode,
  type LandmarkInteriorRoom,
  type LandmarkInteriorStair,
  type LandmarkInteriorType,
  type LandmarkInteriorWorldPoint
} from '../world/landmarks/landmarkInteriorGenerator';
import { WORLD_SEED, WORLD_TILE_SIZE, worldToTile } from '../world/worldConfig';
import { TERRAIN_MATERIAL_ASSETS } from '../world/terrainMaterialConfig';
import { type CraftingRecipe } from '../crafting/recipeConfig';
import { PLACEABLE_DEFINITIONS, PlaceableId, isPlaceableId } from '../crafting/placeableConfig';
import { POTION_DEFINITIONS, isPotionId, type PotionEffect, type PotionId } from '../crafting/potionConfig';
import { TOOL_DEFINITIONS, TOOL_HEAD_PALETTES, isToolId, type ToolId } from '../crafting/toolConfig';
import { craftRecipeIntoSlot as applyCraftingRecipe } from '../crafting/craftingService';
import {
  caveOreMiningDurationMultiplierFor,
  caveOreMiningSpeedForTool,
  harvestSpeedForFeature,
  meetsMiningRequirement,
  miningRequirementForCaveOre,
  miningRequirementForFeature
} from '../crafting/harvestSpeedConfig';
import {
  caveEntranceAtTile,
  caveTerrainContainsPoint,
  caveMouthCenter,
  caveWorldOrigin,
  caveWorldTilePosition,
  generateCaveLayout,
  type CaveEntrance,
  type CaveLayout,
  type CaveLavaPool,
  type CaveOre,
  type CaveStalagmite,
  type CaveSurfaceExit,
  type CaveWorldOrigin
} from '../world/caves/caveGenerator';
import { CAVE_WALL_PUFFINESS_SCALE } from '../world/caves/caveInteriorVisualConfig';
import { CAVE_DEPTH_SCALE_MAX } from '../world/caves/caveInteriorGenerationConfig';
import { caveOreYieldFor } from '../world/caves/caveOreYieldService';

const BASE_PLAYER_SPEED = 220;
const PLAYER_SPEED = BASE_PLAYER_SPEED * (PLAYER_SPEED_SCALE / 50);
const SWIM_SPEED_MULTIPLIER = 0.42;
const PLAYER_SIZE = 32;
// Visual-only scale: collision and interaction coordinates remain at the existing gameplay size.
const PLAYER_AVATAR_SCALE = 1.32;
const HARVEST_DURATION_MS = 1000;
const HARVEST_RING_RADIUS = 16;
const TONIC_DRINK_DURATION_MS = 1500;
const CAMERA_WORLD_VIEW_WIDTH = 2560;
const CAMERA_WORLD_VIEW_HEIGHT = 1440;
const DEBUG_UPDATE_INTERVAL_MS = 250;
const DROP_INTERACTION_INTERVAL_MS = 120;
// Saving remains automatic, but serializing the growing explored-world state every movement
// second can compete with chunk streaming on the renderer thread.
const SAVE_INTERVAL_MS = 5000;
const MINIMAP_UPDATE_INTERVAL_MS = 80;
const NIGHT_AMBIENT_LIGHT_UPDATE_INTERVAL_MS = 33;
const FOOTSTEP_SOUND_INTERVAL_MS = 265;
const MINIMAP_TILES_PER_CELL = Math.max(1, Math.round(16 * (MINIMAP_AREA_SCALE / 50)));
const CAVE_ENTRANCE_INTERACTION_RADIUS_PIXELS = 84;
const LANDMARK_ENTRANCE_INTERACTION_RADIUS_PIXELS = 92;
const CAVE_INTERACTION_BUCKET_SIZE_TILES = 6;
// Kept visual-only: designers can reshape the cave wall art without changing layouts or
// collision. The clamp also protects the renderer from accidental extreme configuration.
const CAVE_WALL_PUFFINESS = Math.max(0.25, Math.min(2, CAVE_WALL_PUFFINESS_SCALE));
// Thin walls still need a legible rock face. Puffiness controls the physical visual weight,
// while this keeps the layered face broad enough to read at the game's normal camera scale.
const CAVE_WALL_FACE_SCALE = 0.72 + CAVE_WALL_PUFFINESS * 0.28;
// A simple, player-centred low-light circle is deliberately more readable than a jagged
// tile-by-tile sight polygon. It still limits how much of a tunnel is known at once, while
// keeping nearby cave walls and floor details legible.
const CAVE_PLAYER_VISION_RADIUS_TILES = 10.5;
// Cave exit shafts sample the surface clock. They can carry daylight underground, but must not
// leave a permanent overhead glow at night when the surface opening itself is dark.

// Placement follows the visible world, not an invisible collision grid.  Keep these reasons
// narrow and explicit so a clear patch of ground never becomes unexpectedly unavailable.
type PlacementBlocker = 'water' | 'feature' | 'cave' | 'landmark' | 'placed-object';

interface PlacementTarget {
  readonly tileX: number;
  readonly tileY: number;
  readonly valid: boolean;
  readonly blocker: PlacementBlocker | null;
}
const CAVE_VISIBILITY_REFRESH_DISTANCE_PIXELS = 5;

type MovementDirection = 'up' | 'down' | 'left' | 'right';
type ControlKeys = Record<ControlAction, Phaser.Input.Keyboard.Key | null>;

const keyCodeForBinding = (binding: ControlBinding): number | null => {
  if (isMouseBinding(binding)) {
    return null;
  }
  const keyCodes = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number>;
  const keyName = binding.startsWith('Key') ? binding.slice(3)
    : binding.startsWith('Digit') ? ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][Number(binding.slice(5))]
      : ({ ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Escape: 'ESC', Space: 'SPACE', ControlLeft: 'CTRL', ControlRight: 'CTRL', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', AltLeft: 'ALT', AltRight: 'ALT' } as Record<string, string>)[binding] ?? binding;
  return typeof keyCodes[keyName] === 'number' ? keyCodes[keyName] : null;
};

interface ActiveCave {
  readonly entrance: CaveEntrance;
  readonly layout: CaveLayout;
  readonly origin: CaveWorldOrigin;
  readonly oreBuckets: ReadonlyMap<string, readonly CaveOre[]>;
  readonly returnWorldX: number;
  readonly returnWorldY: number;
  readonly entrySurfaceExitId: string;
  readonly exitVisuals: ReadonlyMap<string, CaveExitVisual>;
}

interface ActiveLandmarkInterior {
  readonly landmark: ProceduralLandmark & { readonly type: LandmarkInteriorType };
  readonly layout: LandmarkInteriorLayout;
  readonly origin: LandmarkInteriorWorldPoint;
  readonly materialBuckets: ReadonlyMap<string, readonly LandmarkInteriorMaterialNode[]>;
  readonly returnWorldX: number;
  readonly returnWorldY: number;
}

interface CaveRenderPoint {
  readonly x: number;
  readonly y: number;
}

interface CaveExitVisual extends CaveRenderPoint {
  readonly wallNormalX: number;
  readonly wallNormalY: number;
}

const caveOreBucketKey = (bucketX: number, bucketY: number): string => `${bucketX}:${bucketY}`;

const landmarkMaterialBucketKey = (bucketX: number, bucketY: number): string => `${bucketX}:${bucketY}`;

const createCaveOreBuckets = (ores: readonly CaveOre[]): ReadonlyMap<string, readonly CaveOre[]> => {
  const buckets = new Map<string, CaveOre[]>();
  ores.forEach((ore) => {
    const key = caveOreBucketKey(
      Math.floor(ore.tileX / CAVE_INTERACTION_BUCKET_SIZE_TILES),
      Math.floor(ore.tileY / CAVE_INTERACTION_BUCKET_SIZE_TILES)
    );
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(ore);
    } else {
      buckets.set(key, [ore]);
    }
  });
  return buckets;
};

const createLandmarkMaterialBuckets = (
  materials: readonly LandmarkInteriorMaterialNode[]
): ReadonlyMap<string, readonly LandmarkInteriorMaterialNode[]> => {
  const buckets = new Map<string, LandmarkInteriorMaterialNode[]>();
  materials.forEach((material) => {
    const key = landmarkMaterialBucketKey(
      Math.floor(material.tileX / CAVE_INTERACTION_BUCKET_SIZE_TILES),
      Math.floor(material.tileY / CAVE_INTERACTION_BUCKET_SIZE_TILES)
    );
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(material);
    } else {
      buckets.set(key, [material]);
    }
  });
  return buckets;
};

export class AdventureScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerAvatar!: Phaser.GameObjects.Graphics;
  private footprintTrail!: FootprintTrail;
  private controlKeys!: ControlKeys;
  private chunkManager!: ChunkManager;
  private dropManager!: DropManager;
  private placeableManager!: PlaceableManager;
  private ambientAudio: BiomeAmbientAudio | null = null;
  private sessionWorldState!: SessionWorldState;
  private inventory!: Inventory;
  private inventoryOverlay!: InventoryOverlay;
  private hotbarOverlay!: HotbarOverlay;
  private minimapOverlay!: MinimapOverlay;
  private dayNightOverlay!: DayNightOverlay;
  private nightAmbientOverlay!: NightAmbientOverlay;
  private placedLightOverlay!: PlacedLightOverlay;
  private readonly ambientWorldLights: NightAmbientLight[] = [];
  private potionEffectOverlay!: PotionEffectOverlay;
  private worldMapOverlay!: WorldMapOverlay;
  private pauseMenuOverlay!: PauseMenuOverlay;
  private placedObjectOverlay!: PlacedObjectOverlay;
  private debugElement!: HTMLPreElement;
  private loadingOverlay!: HTMLDivElement;
  private loadingTitle!: HTMLElement;
  private loadingProgressBar!: HTMLDivElement;
  private loadingProgressFill!: HTMLDivElement;
  private loadingProgressText!: HTMLSpanElement;
  private interactionHighlight!: Phaser.GameObjects.Arc;
  private placedObjectHighlight!: Phaser.GameObjects.Arc;
  private dropHighlight!: Phaser.GameObjects.Ellipse;
  private dropHintPanel!: Phaser.GameObjects.Graphics;
  private dropHint!: Phaser.GameObjects.Text;
  private placedObjectHintPanel!: Phaser.GameObjects.Graphics;
  private placedObjectHint!: Phaser.GameObjects.Text;
  private harvestProgressGraphics!: Phaser.GameObjects.Graphics;
  private placementPreviewGraphics!: Phaser.GameObjects.Graphics;
  private placementHint!: Phaser.GameObjects.Text;
  private caveGraphics!: Phaser.GameObjects.Graphics;
  private caveLavaGraphics!: Phaser.GameObjects.Graphics;
  private caveEntranceLightGraphics!: Phaser.GameObjects.Graphics;
  private landmarkInteriorGraphics!: Phaser.GameObjects.Graphics;
  private landmarkInteriorAccentGraphics!: Phaser.GameObjects.Graphics;
  private landmarkHintPanel!: Phaser.GameObjects.Graphics;
  private landmarkHint!: Phaser.GameObjects.Text;
  private caveFogOverlay!: SVGSVGElement;
  private caveFogMask!: SVGMaskElement;
  private caveFogMaskBase!: SVGRectElement;
  private caveFogDarkness!: SVGRectElement;
  private caveFogPlayerLight!: SVGCircleElement;
  private isDebugVisible = false;
  private inventoryOpen = false;
  private craftingOpen = false;
  private worldMapOpen = false;
  private travelStoneSourceId: string | null = null;
  private pauseMenuOpen = false;
  private returningToMainMenu = false;
  private worldReady = false;
  private caveTransitionInProgress = false;
  private landmarkEntranceSequenceInProgress = false;
  private worldSeed = WORLD_SEED;
  private worldId: string | null = null;
  private worldMode: WorldMode = 'survival';
  private facing = FacingDirection.Down;
  private isSwimming = false;
  private isSwimmingInSwampWater = false;
  private swimStrokeElapsedMs = 0;
  private footstepElapsedMs = 0;
  private terrainSurface = 'ground';
  private currentTopography: TopographySample | null = null;
  private interactionTarget: InteractionTarget | null = null;
  private nearbyCaveEntrance: CaveEntrance | null = null;
  private nearbyLandmarkEntrance: LandmarkEntrance | null = null;
  private activeCave: ActiveCave | null = null;
  private activeLandmarkInterior: ActiveLandmarkInterior | null = null;
  private caveOreTarget: CaveOre | null = null;
  private caveHarvestOre: CaveOre | null = null;
  private caveExitNearby = false;
  private caveExitTarget: CaveSurfaceExit | null = null;
  private landmarkInteriorExitNearby = false;
  private landmarkInteriorStairTarget: LandmarkInteriorStair | null = null;
  private surfaceLandmarkMaterialTarget: LandmarkMaterialNode | null = null;
  private surfaceLandmarkHarvestMaterial: LandmarkMaterialNode | null = null;
  private interiorLandmarkMaterialTarget: LandmarkInteriorMaterialNode | null = null;
  private interiorLandmarkHarvestMaterial: LandmarkInteriorMaterialNode | null = null;
  private lastCaveVisibilityWorldX = Number.NaN;
  private lastCaveVisibilityWorldY = Number.NaN;
  private nearbyDrop: DroppedItem | null = null;
  private nearbyPlacedObject: PlacedObject | null = null;
  private placementPreview: (PlacementTarget & { readonly placeable: PlaceableId }) | null = null;
  private harvestTarget: InteractionTarget | null = null;
  private harvestElapsedMs = 0;
  private harvestContactSoundCount = 0;
  private harvestRequiresControlRelease = false;
  private drinkingPotion: { readonly id: PotionId; readonly slotIndex: number } | null = null;
  private tonicDrinkElapsedMs = 0;
  private tonicDrinkRequiresRelease = false;
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
  private readonly activePotionEffects = new Map<PotionEffect, number>();
  private equippedTool: ToolId | null = null;
  private activeHotbarSlot = 0;
  private lastMinimapUpdateMs = Number.NEGATIVE_INFINITY;
  private lastMinimapTileX = Number.NaN;
  private lastMinimapTileY = Number.NaN;
  private lastCaveEntranceTileX = Number.NaN;
  private lastCaveEntranceTileY = Number.NaN;
  private lastLandmarkEntranceTileX = Number.NaN;
  private lastLandmarkEntranceTileY = Number.NaN;
  private lastCaveLavaFrame = Number.NEGATIVE_INFINITY;
  private lastCaveEntranceLightFrame = Number.NEGATIVE_INFINITY;
  private lastLandmarkInteriorAccentFrame = Number.NEGATIVE_INFINITY;
  private movementSampleStartedAt = Number.NaN;
  private movementSampleFrameCount = 0;
  private movementSampleWorstFrameMs = 0;
  private movingFps = 0;
  private movingWorstFrameMs = 0;
  private frameSampleStartedAt = Number.NaN;
  private frameSampleCount = 0;
  private renderedFps = 0;
  private renderBackend = 'Detecting renderer…';
  private gameSettings: GameSettings = createDefaultGameSettings();
  private settingsSaveChain: Promise<void> = Promise.resolve();

  constructor() {
    super('adventure');
  }

  init(data: unknown): void {
    const selection = data as { id?: unknown; seed?: unknown; mode?: unknown } | undefined;
    const hasValidSelection = typeof selection?.id === 'string'
      && /^world-[1-9]\d*$/.test(selection.id)
      && typeof selection.seed === 'string'
      && selection.seed.length > 0
      && selection.seed.length <= MAX_WORLD_SEED_LENGTH;
    this.worldId = hasValidSelection ? selection.id as string : null;
    this.worldSeed = hasValidSelection ? selection.seed as string : WORLD_SEED;
    this.worldMode = hasValidSelection && isWorldMode(selection?.mode) ? selection.mode : 'survival';
    // Phaser reuses scene instances after returning to the main menu. Reset transient play state
    // here so a newly selected world never inherits a paused flag, cave context, or UI state.
    this.worldReady = false;
    this.inventoryOpen = false;
    this.craftingOpen = false;
    this.worldMapOpen = false;
    this.travelStoneSourceId = null;
    this.pauseMenuOpen = false;
    this.returningToMainMenu = false;
    this.caveTransitionInProgress = false;
    this.activeCave = null;
    this.activeLandmarkInterior = null;
    this.landmarkInteriorStairTarget = null;
    this.nearbyLandmarkEntrance = null;
    this.surfaceLandmarkMaterialTarget = null;
    this.surfaceLandmarkHarvestMaterial = null;
    this.interiorLandmarkMaterialTarget = null;
    this.interiorLandmarkHarvestMaterial = null;
    this.activePotionEffects.clear();
    this.drinkingPotion = null;
    this.tonicDrinkElapsedMs = 0;
    this.tonicDrinkRequiresRelease = false;
    this.saveDirty = false;
    this.savePending = false;
  }

  preload(): void {
    TERRAIN_MATERIAL_ASSETS.forEach(({ key, url }) => this.load.image(key, url));
  }

  create(): void {
    this.sessionWorldState = new SessionWorldState();
    this.inventory = new Inventory();
    this.placeableManager = new PlaceableManager(this, this.sessionWorldState);
    this.renderBackend = this.describeRenderBackend();
    this.player = this.add.rectangle(WORLD_TILE_SIZE / 2, WORLD_TILE_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE).setVisible(false);
    this.playerAvatar = this.add.graphics().setDepth(10).setScale(PLAYER_AVATAR_SCALE);
    this.footprintTrail = new FootprintTrail(this, this.worldSeed);
    this.harvestProgressGraphics = this.add.graphics().setDepth(15);
    this.placementPreviewGraphics = this.add.graphics().setDepth(14).setVisible(false);
    this.placementHint = this.add
      .text(0, 0, '', {
        fontFamily: 'Cascadia Mono, Consolas, system-ui, sans-serif',
        fontSize: '12px',
        color: '#efffe8',
        fontStyle: '700',
        backgroundColor: '#102019dd',
        padding: { x: 7, y: 4 }
      })
      .setOrigin(0.5)
      .setDepth(16)
      .setVisible(false);
    this.caveGraphics = this.add.graphics().setDepth(2).setVisible(false);
    this.caveLavaGraphics = this.add.graphics().setDepth(2.2).setVisible(false);
    this.caveEntranceLightGraphics = this.add.graphics().setDepth(2.1).setVisible(false);
    this.landmarkInteriorGraphics = this.add.graphics().setDepth(2).setVisible(false);
    this.landmarkInteriorAccentGraphics = this.add.graphics()
      .setDepth(2.35)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.createCaveFogOverlay();
    this.interactionHighlight = this.add
      .circle(0, 0, 62, 0xf5d76e, 0.09)
      .setStrokeStyle(3, 0xffec8b, 0.95)
      .setDepth(8)
      .setVisible(false);
    this.placedObjectHighlight = this.add
      .circle(0, 0, 45, 0x7dd8a4, 0.09)
      .setStrokeStyle(2.5, 0xb5ffd2, 0.94)
      .setDepth(8.2)
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
    this.placedObjectHintPanel = this.add.graphics().setDepth(10.8).setVisible(false);
    this.placedObjectHint = this.add
      .text(0, 0, '', {
        fontFamily: 'Cascadia Mono, Consolas, system-ui, sans-serif',
        fontSize: '12px',
        color: '#effff2',
        fontStyle: '700'
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setVisible(false);
    this.landmarkHintPanel = this.add.graphics().setDepth(13.8).setVisible(false);
    this.landmarkHint = this.add
      .text(0, 0, '', {
        fontFamily: 'Cascadia Mono, Consolas, system-ui, sans-serif',
        fontSize: '13px',
        color: '#f5fff0',
        fontStyle: '700'
      })
      .setOrigin(0.5)
      .setDepth(14)
      .setVisible(false);
    this.tweens.add({
      targets: [this.interactionHighlight, this.placedObjectHighlight, this.dropHighlight],
      alpha: { from: 0.35, to: 0.92 },
      scale: { from: 0.92, to: 1.08 },
      duration: 650,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });
    this.drawPlayerAvatar(0);

    this.configureCamera();
    this.resizeCaveFog();
    this.configureControlKeys();
    this.input.keyboard!.on('keydown', this.handleGameKeyDown, this);
    this.input.on('pointerdown', this.handleWorldPointerDown, this);
    // Mouse2 is a supported binding. Suppress the browser's canvas context menu so it can be
    // used just as reliably as Mouse0 and Mouse1 during exploration.
    this.input.mouse?.disableContextMenu();

    const gameElement = document.getElementById('game');
    if (!gameElement) {
      throw new Error('Wildbound game container was not found.');
    }

    this.createLoadingOverlay(gameElement);
    this.createDebugElement(gameElement);
    this.potionEffectOverlay = new PotionEffectOverlay(gameElement);
    this.hotbarOverlay = new HotbarOverlay(
      gameElement,
      this.inventory,
      () => this.activeHotbarSlot,
      (slotIndex) => this.selectHotbarSlot(slotIndex),
      () => this.worldReady && !this.inventoryOpen && !this.craftingOpen && !this.worldMapOpen && !this.pauseMenuOpen
    );
    this.inventoryOverlay = new InventoryOverlay(
      gameElement,
      this.inventory,
      () => this.handleInventoryChanged(),
      (slot) => this.dropInventorySlot(slot),
      () => this.equippedTool,
      (tool) => this.setEquippedTool(tool),
      (recipe, destinationIndex) => this.claimCraftedTool(recipe, destinationIndex),
      this.worldMode === 'creative'
    );
    this.placedObjectOverlay = new PlacedObjectOverlay(gameElement, {
      getObject: (id) => this.sessionWorldState.getPlacedObject(id),
      getPlayerSlots: () => this.inventory.getSlots(),
      movePlayerInventorySlot: (sourceIndex, destinationIndex) => this.inventory.moveSlot(sourceIndex, destinationIndex),
      movePlayerInventoryAmount: (sourceIndex, destinationIndex, amount) => this.inventory.moveAmount(sourceIndex, destinationIndex, amount),
      movePlayerSlotToStorage: (objectId, slotIndex, amount) => this.movePlayerSlotToStorage(objectId, slotIndex, amount),
      moveStorageSlotToPlayer: (objectId, slotIndex, destinationIndex, amount) => this.moveStorageSlotToPlayer(objectId, slotIndex, destinationIndex, amount),
      movePlayerSlotToBrewing: (objectId, slotIndex, ingredientIndex) => this.movePlayerSlotToBrewing(objectId, slotIndex, ingredientIndex),
      moveBrewingIngredientToPlayer: (objectId, ingredientIndex, destinationIndex) => this.moveBrewingIngredientToPlayer(objectId, ingredientIndex, destinationIndex),
      collectBrewingOutput: (objectId, destinationIndex) => this.collectBrewingOutput(objectId, destinationIndex),
      tryStartBrewing: (objectId) => this.startBrewing(objectId),
      brewingOutput: (objectId) => this.sessionWorldState.brewingOutput(objectId),
      movePlayerSlotToFurnace: (objectId, slotIndex, slot, amount) => this.movePlayerSlotToFurnace(objectId, slotIndex, slot, amount),
      moveFurnaceItemToPlayer: (objectId, slot, destinationIndex, amount) => this.moveFurnaceItemToPlayer(objectId, slot, destinationIndex, amount),
      collectFurnaceOutput: (objectId, destinationIndex, amount) => this.collectFurnaceOutput(objectId, destinationIndex, amount),
      furnaceOutput: (objectId) => this.sessionWorldState.furnaceOutput(objectId),
      furnaceItemAvailableToTake: (objectId, slot) => this.sessionWorldState.furnaceItemAvailableToTake(objectId, slot),
      onRest: (object) => this.restAtPlacedObject(object),
      setWaypointLabel: (objectId, label) => this.setWaypointLabel(objectId, label),
      onChanged: () => this.handleInventoryChanged(),
      onClose: () => this.updateHotbarVisibility()
    });
    this.minimapOverlay = new MinimapOverlay(gameElement);
    this.dayNightOverlay = new DayNightOverlay(gameElement);
    this.nightAmbientOverlay = new NightAmbientOverlay(gameElement);
    this.placedLightOverlay = new PlacedLightOverlay(gameElement);
    this.worldMapOverlay = new WorldMapOverlay(gameElement, {
      onTravelStoneSelected: (id) => void this.travelToStone(id),
      onCloseRequested: () => this.closeWorldMap()
    });
    this.pauseMenuOverlay = new PauseMenuOverlay(gameElement, this.gameSettings, {
      onResume: () => this.closePauseMenu(),
      onReturnToMainMenu: () => this.returnToMainMenu(),
      onSettingsChanged: (settings) => this.updateGameSettings(settings)
    });
    this.applyGameSettings();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    void this.loadSavedWorld();
  }

  update(time: number, delta: number): void {
    if (!this.worldReady) {
      return;
    }

    this.sampleRenderedFrameRate(time);
    this.footprintTrail.update(time, this.isInsideInterior());

    this.updateWorldTime(time, delta);
    this.updatePotionEffects();
    this.updateAmbientAudio();
    // Menus are true input pauses. Keep world time/save bookkeeping alive, but never let held
    // movement keys carry the player while the inventory or settings UI has focus.
    if (this.pauseMenuOpen) {
      this.ambientAudio?.setSwimming(false, false, false);
      this.cancelTonicDrinking();
      this.clearPlacementPreview();
      this.updatePlayerAvatar(delta, false);
      this.persistIfNeeded(time);
      if (this.isDebugVisible && time - this.lastDebugUpdateMs >= DEBUG_UPDATE_INTERVAL_MS) {
        this.lastDebugUpdateMs = time;
        this.updateDebugText();
      }
      return;
    }
    if (this.activeLandmarkInterior) {
      this.ambientAudio?.setSwimming(false, false, false);
      this.clearPlacementPreview();
      this.updateLandmarkInterior(time, delta);
      this.persistIfNeeded(time);
      if (this.isDebugVisible && time - this.lastDebugUpdateMs >= DEBUG_UPDATE_INTERVAL_MS) {
        this.lastDebugUpdateMs = time;
        this.updateDebugText();
      }
      return;
    }
    if (this.activeCave) {
      this.ambientAudio?.setSwimming(false, false, false);
      this.clearPlacementPreview();
      this.updateCave(time, delta);
      this.persistIfNeeded(time);
      if (this.isDebugVisible && time - this.lastDebugUpdateMs >= DEBUG_UPDATE_INTERVAL_MS) {
        this.lastDebugUpdateMs = time;
        this.updateDebugText();
      }
      return;
    }
    this.updateExploration();

    if (this.landmarkEntranceSequenceInProgress) {
      this.ambientAudio?.setSwimming(false, false, false);
      this.cancelTonicDrinking();
      this.clearPlacementPreview();
      this.chunkManager.update(this.player.x, this.player.y, time);
      this.chunkManager.updateFoliage(time);
      this.chunkManager.updateWaterAnimation(time);
      this.chunkManager.updateAmbient(time, this.player.x, this.player.y, this.ambientLightAmount);
      this.updateNightAmbientLighting(time);
      this.updatePlayerAvatar(delta, true);
      return;
    }

    if (this.worldMapOpen) {
      this.ambientAudio?.setSwimming(false, false, false);
      this.cancelTonicDrinking();
      this.clearPlacementPreview();
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

    if (this.inventoryOpen || this.craftingOpen) {
      this.ambientAudio?.setSwimming(false, false, false);
      this.cancelTonicDrinking();
      this.clearPlacementPreview();
      this.chunkManager.updateWaterAnimation(time);
      this.chunkManager.updateSwampWaterDecorations(time, delta, this.player.x, this.player.y, 0, 0, this.isSwimming);
      this.chunkManager.updateAmbient(time, this.player.x, this.player.y, this.ambientLightAmount);
      this.placeableManager.update(this.player.x, this.player.y);
      this.updateNightAmbientLighting(time);
      this.updatePlayerAvatar(delta, false);
      this.persistIfNeeded(time);
      if (this.isDebugVisible && time - this.lastDebugUpdateMs >= DEBUG_UPDATE_INTERVAL_MS) {
        this.lastDebugUpdateMs = time;
        this.updateDebugText();
      }
      return;
    }

    if (this.placedObjectOverlay.isOpen) {
      this.ambientAudio?.setSwimming(false, false, false);
      this.cancelTonicDrinking();
      this.clearPlacementPreview();
      this.chunkManager.updateWaterAnimation(time);
      this.chunkManager.updateSwampWaterDecorations(time, delta, this.player.x, this.player.y, 0, 0, this.isSwimming);
      this.chunkManager.updateAmbient(time, this.player.x, this.player.y, this.ambientLightAmount);
      this.placeableManager.update(this.player.x, this.player.y);
      this.updateNightAmbientLighting(time);
      this.placedObjectOverlay.update(time);
      this.updatePlayerAvatar(delta, false);
      this.persistIfNeeded(time);
      return;
    }

    const horizontal = Number(this.isDown('right')) - Number(this.isDown('left'));
    const vertical = Number(this.isDown('down')) - Number(this.isDown('up'));
    const wantsToMove = horizontal !== 0 || vertical !== 0;
    let isMoving = wantsToMove;
    this.sampleMovementPerformance(time, delta, wantsToMove);
    let playerVelocityX = 0;
    let playerVelocityY = 0;

    this.updateFacing(horizontal, vertical);
    if (wantsToMove) {
      const length = Math.hypot(horizontal, vertical);
      const speed = PLAYER_SPEED * this.potionSpeedMultiplier() * (this.isSwimming ? SWIM_SPEED_MULTIPLIER : 1);
      const movementX = (horizontal / length) * speed * (delta / 1000);
      const movementY = (vertical / length) * speed * (delta / 1000);
      const previousPlayerX = this.player.x;
      const previousPlayerY = this.player.y;
      if (this.movePlayer(movementX, movementY, time)) {
        const elapsedSeconds = Math.max(0.001, delta / 1000);
        playerVelocityX = (this.player.x - previousPlayerX) / elapsedSeconds;
        playerVelocityY = (this.player.y - previousPlayerY) / elapsedSeconds;
        this.currentTopography = this.chunkManager.getTopographyAt(this.player.x, this.player.y);
        this.terrainSurface = this.currentTopography.surface;
        this.markSaveDirty();
      } else {
        // A boundary is held only while its presentation window finishes preparing. Keep the
        // avatar idle rather than animating a walk against terrain the player cannot yet enter.
        isMoving = false;
      }
    }

    this.updateSwimmingState();
    this.footprintTrail.recordMovement(time, this.player.x, this.player.y, isMoving && !this.isSwimming);
    this.updateSurfaceSwimAudio(delta, isMoving);
    this.updateSurfaceFootsteps(delta, isMoving);
    this.chunkManager.update(this.player.x, this.player.y, time);
    if (this.resolvePlayerLandmarkOverlap(time)) {
      isMoving = false;
      playerVelocityX = 0;
      playerVelocityY = 0;
    }
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
    this.placeableManager.update(this.player.x, this.player.y);
    this.updateNightAmbientLighting(time);
    this.updateInteractionTarget();
    this.updateCaveEntranceInteraction();
    this.updateLandmarkEntranceInteraction();
    this.updateDropInteraction(time);
    this.updatePlacedObjectInteraction();
    this.updatePlacementPreview();
    this.updateTonicDrinking(delta);
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
    let savedActiveLandmarkInterior: SaveGameData['activeLandmarkInterior'] | undefined;
    let migratedLandmarkRegrowth = false;

    await this.loadGameSettings();

    try {
      const loaded = this.worldId ? await window.wildboundWorlds?.load(this.worldId) : null;
      savedGame = isSaveGameData(loaded) ? loaded : null;
    } catch (error) {
      console.warn('Wildbound could not load its local save.', error);
    }

    if (savedGame) {
      this.worldSeed = savedGame.seed;
      if (isWorldMode(savedGame.mode)) {
        this.worldMode = savedGame.mode;
      }
      this.inventory.restore(savedGame.inventory);
      this.restorePotionEffects(savedGame.effects);
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
      const ancientTreeIdMarker = `:${LandmarkType.GiantAncientTree}:`;
      this.sessionWorldState.getHarvestedLandmarkMaterialIds().forEach((materialId) => {
        if (!materialId.includes(ancientTreeIdMarker) || !materialId.includes(':interior-material:')) {
          return;
        }
        migratedLandmarkRegrowth = this.sessionWorldState.scheduleLandmarkMaterialRegrowth(
          materialId,
          ancientTreeFeatureRegrowthDelayMs(this.worldSeed, materialId, this.sessionWorldState.worldAgeMs)
        ) || migratedLandmarkRegrowth;
      });
      const stoneCircleIdMarker = `:${LandmarkType.StoneCircle}:`;
      const stoneCircleRuneMarker = ':surface-material:rune-stone:';
      if (this.sessionWorldState.landmarkMaterialMigrationVersion
        < STONE_CIRCLE_RUNE_RESTORE_MIGRATION_VERSION) {
        this.sessionWorldState.getHarvestedLandmarkMaterialIds().forEach((materialId) => {
          if (materialId.includes(stoneCircleIdMarker) && materialId.includes(stoneCircleRuneMarker)) {
            migratedLandmarkRegrowth = this.sessionWorldState.restoreLandmarkMaterial(materialId)
              || migratedLandmarkRegrowth;
          }
        });
        migratedLandmarkRegrowth = this.sessionWorldState.setLandmarkMaterialMigrationVersion(
          STONE_CIRCLE_RUNE_RESTORE_MIGRATION_VERSION
        ) || migratedLandmarkRegrowth;
      } else {
        this.sessionWorldState.getHarvestedLandmarkMaterialIds().forEach((materialId) => {
          if (!materialId.includes(stoneCircleIdMarker) || !materialId.includes(stoneCircleRuneMarker)) {
            return;
          }
          migratedLandmarkRegrowth = this.sessionWorldState.scheduleLandmarkMaterialRegrowth(
            materialId,
            stoneCircleRuneRegrowthDelayMs(this.worldSeed, materialId, this.sessionWorldState.worldAgeMs)
          ) || migratedLandmarkRegrowth;
        });
      }
      savedActiveCave = savedGame.activeCave;
      savedActiveLandmarkInterior = savedGame.activeLandmarkInterior;
      this.player.setPosition(
        savedActiveCave?.returnWorldX ?? savedActiveLandmarkInterior?.returnWorldX ?? savedGame.player.x,
        savedActiveCave?.returnWorldY ?? savedActiveLandmarkInterior?.returnWorldY ?? savedGame.player.y
      );
    }

    const hadSavedWorldTime = this.sessionWorldState.worldTimeMs !== null;
    this.worldTimeMs = DAY_NIGHT_START_HOUR_OVERRIDE === null
      ? normalizeWorldTime(this.sessionWorldState.worldTimeMs ?? DAY_NIGHT_INITIAL_TIME_MS)
      : worldTimeForHour(DAY_NIGHT_START_HOUR_OVERRIDE);
    this.sessionWorldState.setWorldTimeMs(this.worldTimeMs);

    this.chunkManager = new ChunkManager(this, this.worldSeed, this.sessionWorldState);
    this.ambientAudio?.destroy();
    this.ambientAudio = new BiomeAmbientAudio(this.worldSeed);
    if (this.gameSettings.audio.biomeAmbienceEnabled) {
      this.ambientAudio.prepare();
    }
    this.chunkManager.applyVideoSettings(this.gameSettings.video);
    this.dropManager = new DropManager(this, this.sessionWorldState);
    const savedCaveEntrance = savedActiveCave
      ? caveEntranceAtTile(this.worldSeed, savedActiveCave.entranceTileX, savedActiveCave.entranceTileY)
      : null;
    const savedLandmark = savedActiveLandmarkInterior
      ? landmarkAtTile(
        this.worldSeed,
        savedActiveLandmarkInterior.centerTileX,
        savedActiveLandmarkInterior.centerTileY
      )
      : null;
    const savedLandmarkInterior = savedLandmark
      && savedActiveLandmarkInterior
      && savedLandmark.id === savedActiveLandmarkInterior.landmarkId
      && savedLandmark.type === savedActiveLandmarkInterior.landmarkType
      && isLandmarkInteriorType(savedLandmark.type)
      ? savedLandmark
      : null;
    // A save already inside a cave does not need a surface presentation yet. Skipping that prime
    // avoids completing a wilderness loading pass only to immediately begin a second cave pass;
    // the correct surface window is prepared later when the player actually leaves the cave.
    if (!savedCaveEntrance && !savedLandmarkInterior) {
      await this.chunkManager.prime(this.player.x, this.player.y, (progress) => {
        this.updateLoadingProgress(progress.completed, progress.total);
      });
    }
    this.worldReady = true;
    if (!savedCaveEntrance && !savedLandmarkInterior) {
      this.currentTopography = this.chunkManager.getTopographyAt(this.player.x, this.player.y);
      this.terrainSurface = this.currentTopography.surface;
      this.placeableManager.refresh(this.player.x, this.player.y);
      this.updateSwimmingState(true);
      this.updatePlayerAvatar(0, false);
    }
    this.inventoryOverlay.refresh();
    this.hotbarOverlay.refresh();
    if (savedActiveCave && savedCaveEntrance) {
      await this.enterCave(
        savedCaveEntrance,
        savedActiveCave.returnWorldX,
        savedActiveCave.returnWorldY,
        false,
        true
      );
    } else if (savedActiveLandmarkInterior && savedLandmarkInterior) {
      await this.enterLandmarkInterior(
        savedLandmarkInterior,
        savedActiveLandmarkInterior.returnWorldX,
        savedActiveLandmarkInterior.returnWorldY,
        false,
        true,
        savedActiveLandmarkInterior.floorNumber ?? 1
      );
    }
    this.loadingOverlay.classList.add('is-hidden');
    mainMenuMusic.stop();
    void gameMusic.start();
    if (this.activeLandmarkInterior) {
      this.updateLandmarkInteriorInteraction(true);
    } else if (this.activeCave) {
      this.updateCaveInteraction(true);
    } else {
      this.updateInteractionTarget(true);
      this.updateCaveEntranceInteraction(true);
      this.updateLandmarkEntranceInteraction(true);
      this.updateExploration(true);
    }
    this.updateDropInteraction(0, true);
    this.updateMinimap(0, true);
    this.dayNightOverlay.update(this.worldTimeMs);
    this.nightAmount = sampleDayNight(this.worldTimeMs).nightAmount;
    this.ambientLightAmount = ambientLightScheduleAmount(this.worldTimeMs);
    this.updateNightAmbientLighting(this.time.now);
    this.updateDebugText();

    if (!savedGame || !hadSavedWorldTime || DAY_NIGHT_START_HOUR_OVERRIDE !== null || migratedLandmarkRegrowth) {
      this.markSaveDirty();
    }
  }

  private updateSwimmingState(force = false): void {
    if (this.activeLandmarkInterior) {
      this.lastSwimmingTileX = Math.floor(this.player.x / WORLD_TILE_SIZE);
      this.lastSwimmingTileY = Math.floor((this.player.y + 9) / WORLD_TILE_SIZE);
      this.isSwimming = false;
      this.isSwimmingInSwampWater = false;
      this.swimStrokeElapsedMs = 0;
      return;
    }
    if (this.activeCave) {
      this.updateCaveSwimmingState(force);
      return;
    }

    // Sample the player's actual feet rather than a floored tile corner. Terrain is rendered
    // at sub-tile resolution, so this keeps the swim state precisely on the visible waterline.
    const sampleTileX = this.player.x / WORLD_TILE_SIZE;
    const sampleTileY = (this.player.y + 9) / WORLD_TILE_SIZE;
    const tileX = Math.floor(sampleTileX);
    const tileY = Math.floor(sampleTileY);
    const surface = surfaceAtTile(this.worldSeed, sampleTileX, sampleTileY);
    const waterAtFeet = surface.isWater;
    const isSwampWater = waterAtFeet && surface.isSwampWater;
    if (!force && tileX === this.lastSwimmingTileX && tileY === this.lastSwimmingTileY
      && waterAtFeet === this.isSwimming && isSwampWater === this.isSwimmingInSwampWater) {
      return;
    }

    const enteredWater = waterAtFeet && !this.isSwimming;
    this.lastSwimmingTileX = tileX;
    this.lastSwimmingTileY = tileY;
    this.isSwimming = waterAtFeet;
    this.isSwimmingInSwampWater = isSwampWater;
    if (!waterAtFeet) {
      this.swimStrokeElapsedMs = 0;
    } else if (enteredWater) {
      this.swimStrokeElapsedMs = SWIM_RECORDING_REPEAT_INTERVAL_MS * 0.58;
      if (!force) {
        this.ambientAudio?.playWaterEntry(tileX, tileY, isSwampWater);
      }
    }
  }

  private updateCaveSwimmingState(force = false): void {
    const tileX = Math.floor(this.player.x / WORLD_TILE_SIZE);
    const tileY = Math.floor((this.player.y + 9) / WORLD_TILE_SIZE);
    const lavaAtFeet = this.isCaveLavaAt(this.player.x, this.player.y + 9);
    if (!force && tileX === this.lastSwimmingTileX && tileY === this.lastSwimmingTileY && lavaAtFeet === this.isSwimming) {
      return;
    }

    this.lastSwimmingTileX = tileX;
    this.lastSwimmingTileY = tileY;
    this.isSwimming = lavaAtFeet;
    this.isSwimmingInSwampWater = false;
    this.swimStrokeElapsedMs = 0;
  }

  private updateSurfaceSwimAudio(delta: number, isMoving: boolean): void {
    const swimmingOnSurface = !this.isInsideInterior() && this.isSwimming;
    this.ambientAudio?.setSwimming(
      swimmingOnSurface,
      swimmingOnSurface && isMoving,
      this.isSwimmingInSwampWater
    );
    if (!swimmingOnSurface || !isMoving) {
      this.swimStrokeElapsedMs = 0;
      return;
    }
    this.swimStrokeElapsedMs += Math.max(0, delta);
    if (this.swimStrokeElapsedMs < SWIM_RECORDING_REPEAT_INTERVAL_MS) {
      return;
    }
    this.swimStrokeElapsedMs %= SWIM_RECORDING_REPEAT_INTERVAL_MS;
    this.ambientAudio?.playSwimStroke(
      this.lastSwimmingTileX,
      this.lastSwimmingTileY,
      this.isSwimmingInSwampWater
    );
  }

  private updateSurfaceFootsteps(delta: number, isMoving: boolean): void {
    if (this.isInsideInterior() || this.isSwimming || !isMoving) {
      this.footstepElapsedMs = 0;
      return;
    }
    this.footstepElapsedMs += Math.max(0, delta);
    if (this.footstepElapsedMs < FOOTSTEP_SOUND_INTERVAL_MS) {
      return;
    }
    this.footstepElapsedMs %= FOOTSTEP_SOUND_INTERVAL_MS;
    // Sample at the same visible feet point used by swimming, so a step changes material exactly
    // when the avatar crosses the rendered shoreline or biome surface.
    const sampleTileX = this.player.x / WORLD_TILE_SIZE;
    const sampleTileY = (this.player.y + 9) / WORLD_TILE_SIZE;
    const surface = surfaceAtTile(this.worldSeed, sampleTileX, sampleTileY);
    if (surface.isWater) {
      return;
    }
    this.ambientAudio?.playFootstep(
      surface.biome,
      Math.floor(sampleTileX),
      Math.floor(sampleTileY)
    );
  }

  private updateCaveFootsteps(delta: number, isMoving: boolean): void {
    if (!isMoving || this.isSwimming) {
      this.footstepElapsedMs = 0;
      return;
    }
    this.footstepElapsedMs += Math.max(0, delta);
    if (this.footstepElapsedMs < FOOTSTEP_SOUND_INTERVAL_MS) {
      return;
    }
    this.footstepElapsedMs %= FOOTSTEP_SOUND_INTERVAL_MS;
    const cave = this.activeCave;
    if (!cave) {
      return;
    }
    this.ambientAudio?.playCaveFootstep(
      Math.floor((this.player.x - cave.origin.x) / WORLD_TILE_SIZE),
      Math.floor((this.player.y - cave.origin.y) / WORLD_TILE_SIZE)
    );
  }

  private isCaveLavaAt(worldX: number, worldY: number): boolean {
    const cave = this.activeCave;
    if (!cave) {
      return false;
    }

    // Use the exact seeded pool outline for both the surface art and swim state, keeping the
    // transition at the visible lava edge instead of an invisible circular hitbox.
    return cave.layout.lavaPools.some((pool) => Phaser.Geom.Polygon.Contains(
      new Phaser.Geom.Polygon(this.caveLavaPoints(pool, cave.origin)),
      worldX,
      worldY
    ));
  }

  private movePlayer(deltaX: number, deltaY: number, time: number): boolean {
    const nextX = this.player.x + deltaX;
    const nextY = this.player.y + deltaY;
    const canEnterSurfacePosition = (worldX: number, worldY: number): boolean => (
      this.chunkManager.canEnterPosition(worldX, worldY, time)
      && !this.chunkManager.isLandmarkStructureAtWorldPoint(worldX, worldY)
    );
    if (canEnterSurfacePosition(nextX, nextY)) {
      this.player.setPosition(nextX, nextY);
      return true;
    }

    // If a diagonal step reaches an unprepared edge, keep the already-ready axis responsive.
    // This avoids a whole-character freeze at a chunk corner and does not let the player enter
    // a terrain or grass chunk that has not finished preparing.
    let moved = false;
    let resolvedX = this.player.x;
    let resolvedY = this.player.y;
    if (deltaX !== 0 && canEnterSurfacePosition(nextX, resolvedY)) {
      resolvedX = nextX;
      moved = true;
    }
    if (deltaY !== 0 && canEnterSurfacePosition(resolvedX, nextY)) {
      resolvedY = nextY;
      moved = true;
    }
    if (moved) {
      this.player.setPosition(resolvedX, resolvedY);
    }
    return moved;
  }

  private resolvePlayerLandmarkOverlap(time: number): boolean {
    if (this.activeCave || this.activeLandmarkInterior
      || !this.chunkManager.isLandmarkStructureAtWorldPoint(this.player.x, this.player.y)) {
      return false;
    }
    const safe = this.chunkManager.findNearestOpenLandmarkWorldPoint(this.player.x, this.player.y);
    if (!safe || !this.chunkManager.canEnterPosition(safe.x, safe.y, time)) {
      return false;
    }
    this.player.setPosition(safe.x, safe.y);
    this.playerAvatar.setPosition(safe.x, safe.y);
    this.currentTopography = this.chunkManager.getTopographyAt(safe.x, safe.y);
    this.terrainSurface = this.currentTopography.surface;
    this.footprintTrail.clear();
    this.updateSwimmingState(true);
    this.showWorldFeedback(safe.x, safe.y - 28, 'Moved outside solid landmark');
    this.markSaveDirty();
    return true;
  }

  private configureControlKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    // Game input is handled by `handleGameKeyDown`, which only prevents a browser default after
    // it has established that no text control owns the event. Phaser's default `addKey` capture
    // does the opposite: it calls preventDefault for W/A/S/D/E/F before a waypoint input can
    // receive the character. Clear any old captured bindings before rebuilding controls and let
    // the scene decide when a gameplay shortcut should consume a key.
    keyboard.removeAllKeys(true, true);
    this.controlKeys = {} as ControlKeys;
    CONTROL_ACTIONS.forEach((action) => {
      const keyCode = keyCodeForBinding(this.gameSettings.controls[action]);
      this.controlKeys[action] = keyCode === null ? null : keyboard.addKey(keyCode, false);
    });
  }

  private isControlDown(action: ControlAction): boolean {
    const binding = this.gameSettings.controls[action];
    if (!isMouseBinding(binding)) {
      return Boolean(this.controlKeys[action]?.isDown);
    }
    const pointer = this.input.activePointer;
    if (binding === 'Mouse0') return pointer.leftButtonDown();
    if (binding === 'Mouse1') return pointer.middleButtonDown();
    return pointer.rightButtonDown();
  }

  private matchesControl(action: ControlAction, event: KeyboardEvent): boolean {
    const binding = this.gameSettings.controls[action];
    return !isMouseBinding(binding) && binding === event.code;
  }

  private matchesPointerControl(action: ControlAction, pointer: Phaser.Input.Pointer): boolean {
    if (pointer.button < 0 || pointer.button > 2) {
      return false;
    }
    const binding = this.gameSettings.controls[action];
    return isMouseBinding(binding) && binding === `Mouse${pointer.button}`;
  }

  private isTypingIntoTextControl(event: KeyboardEvent): boolean {
    const isTextControl = (target: EventTarget | null): boolean => target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || (target instanceof HTMLElement && target.isContentEditable);
    // Phaser can forward a keyboard event through its own input manager. Keep the active element
    // as a second source of truth so a DOM text field retains ownership even if that forwarding
    // layer reports the canvas as the event target.
    return isTextControl(event.target) || isTextControl(document.activeElement);
  }

  private isDown(direction: MovementDirection): boolean {
    const actions: Record<MovementDirection, readonly [ControlAction, ControlAction]> = {
      up: ['moveUp', 'moveUpAlternate'],
      down: ['moveDown', 'moveDownAlternate'],
      left: ['moveLeft', 'moveLeftAlternate'],
      right: ['moveRight', 'moveRightAlternate']
    };
    return actions[direction].some((action) => this.isControlDown(action));
  }

  private isInsideInterior(): boolean {
    return Boolean(this.activeCave || this.activeLandmarkInterior);
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
    // Terrain and characters use high-resolution painted artwork, rather than a fixed pixel
    // grid. Rounding the camera converts time-based sub-pixel movement into a repeating
    // 1px/2px cadence, which reads as a stop-and-go walk even when the simulation is smooth.
    camera.setRoundPixels(false);
    this.updateCameraZoom();
    // The previous 10% follow lerp made the camera visibly catch up after every movement step.
    // The player is already moved from time-based deltas, so direct following keeps terrain
    // motion continuous without changing zoom, sprite sharpness, or world coordinates.
    camera.startFollow(this.player, true, 1, 1);
  }

  private describeRenderBackend(): string {
    const renderer = this.game.renderer;
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) {
      return 'Canvas fallback (GPU unavailable)';
    }

    const gl = renderer.gl;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) {
      return 'WebGL · hardware adapter';
    }

    const adapter = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
    if (adapter.includes('NVIDIA')) {
      return 'WebGL · NVIDIA GPU';
    }
    if (adapter.includes('AMD') || adapter.includes('Radeon')) {
      return 'WebGL · AMD GPU';
    }
    if (adapter.includes('Intel')) {
      return 'WebGL · Intel GPU';
    }
    if (adapter.includes('Microsoft Basic')) {
      return 'WebGL · Microsoft Basic (software)';
    }
    return 'WebGL · hardware adapter';
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

  private createLoadingOverlay(gameElement: HTMLElement): void {
    this.loadingOverlay = document.createElement('div');
    this.loadingOverlay.className = 'world-loading-overlay';
    this.loadingOverlay.setAttribute('role', 'status');
    this.loadingOverlay.setAttribute('aria-live', 'polite');
    const title = document.createElement('strong');
    title.textContent = 'Preparing wilderness';
    this.loadingTitle = title;
    this.loadingProgressText = document.createElement('span');
    this.loadingProgressText.className = 'world-loading-overlay__progress-text';
    const track = document.createElement('div');
    track.className = 'world-loading-overlay__progress';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'Nearby terrain generation');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', '0');
    this.loadingProgressBar = track;
    this.loadingProgressFill = document.createElement('div');
    this.loadingProgressFill.className = 'world-loading-overlay__progress-fill';
    track.append(this.loadingProgressFill);
    this.loadingOverlay.append(title, this.loadingProgressText, track);
    this.updateLoadingProgress(0, 1);
    gameElement.append(this.loadingOverlay);
  }

  private updateLoadingProgress(
    completed: number,
    total: number,
    status = 'Building the nearby terrain'
  ): void {
    const safeTotal = Math.max(1, total);
    const ratio = Phaser.Math.Clamp(completed / safeTotal, 0, 1);
    const percentage = Math.round(ratio * 100);
    this.loadingProgressText.textContent = `${status}… ${percentage}%`;
    this.loadingProgressBar.setAttribute('aria-valuenow', String(percentage));
    this.loadingProgressBar.setAttribute('aria-valuetext', `${status}: ${percentage}%`);
    this.loadingProgressFill.style.transform = `scaleX(${ratio})`;
  }

  private showTerrainLoading(continueExistingProgress = false): void {
    // Cave travel deliberately uses the exact original terrain presentation. It is one world,
    // so entering underground should not look like navigating to a separate cave-specific scene.
    this.loadingTitle.textContent = 'Preparing wilderness';
    if (!continueExistingProgress) {
      this.updateLoadingProgress(0, 100);
    }
    this.loadingOverlay.classList.remove('is-hidden');
    this.loadingOverlay.setAttribute('aria-busy', 'true');
  }

  // A pair of animation frames guarantees the DOM overlay has actually painted before a
  // synchronous cave-generation or cave-rendering phase begins. One rAF callback alone still
  // runs before paint and can leave the previous world visible during the expensive work.
  private waitForTerrainLoadingPaint(): Promise<void> {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }

  private async finishTerrainLoading(): Promise<void> {
    this.updateLoadingProgress(100, 100);
    await this.waitForTerrainLoadingPaint();
    this.worldReady = true;
    this.updateAmbientAudio();
    this.loadingOverlay.setAttribute('aria-busy', 'false');
    this.loadingOverlay.classList.add('is-hidden');
    this.caveTransitionInProgress = false;
  }

  private recoverFromTerrainLoadingFailure(action: string, error: unknown): void {
    console.error(`Wildbound could not ${action}.`, error);
    this.worldReady = true;
    this.updateAmbientAudio();
    this.loadingOverlay.setAttribute('aria-busy', 'false');
    this.loadingOverlay.classList.add('is-hidden');
    this.caveTransitionInProgress = false;
  }

  private async loadGameSettings(): Promise<void> {
    try {
      const settings = await window.wildboundSettings?.load();
      const normalized = normalizeGameSettings(settings);
      if (normalized) {
        this.gameSettings = normalized;
      }
    } catch (error) {
      console.warn('Wildbound could not load local settings.', error);
    }
    this.applyGameSettings();
    this.pauseMenuOverlay.setSettings(this.gameSettings);
  }

  private updateGameSettings(settings: GameSettings): void {
    const normalized = normalizeGameSettings(settings);
    if (!normalized) {
      return;
    }
    this.gameSettings = normalized;
    this.applyGameSettings();
    this.pauseMenuOverlay.setSettings(normalized);
    const settingsApi = window.wildboundSettings;
    if (!settingsApi) {
      return;
    }
    const snapshot = normalized;
    this.settingsSaveChain = this.settingsSaveChain
      .catch(() => undefined)
      .then(() => settingsApi.save(snapshot))
      .catch((error: unknown) => console.warn('Wildbound could not save local settings.', error));
  }

  private applyGameSettings(): void {
    // Phaser's `stepLimitFPS` drops whole requestAnimationFrame callbacks. At common 120 / 144 Hz
    // refresh rates, a 60 cap then alternates between two and three refreshes (or falls to 40/48),
    // which is visible as camera jitter while walking. For capped modes, drive the normal TimeStep
    // at the requested steady rate; Unlimited returns to the browser's VSync scheduler.
    const loop = this.game.loop as Phaser.Core.TimeStep & {
      _limitRate: number;
      _target: number;
      forceSetTimeOut: boolean;
    };
    const frameRate = this.gameSettings.video.performance.maxFps;
    const isCapped = frameRate > 0;
    const targetInterval = 1000 / (isCapped ? frameRate : 60);
    const needsSchedulerRestart = loop.forceSetTimeOut !== isCapped
      || Math.abs(loop._target - targetInterval) > 0.01
      || loop.hasFpsLimit;

    // The scheduler sets the actual cadence, so deliberately use the regular TimeStep callback
    // instead of its accumulator limiter. Simulation remains time-based through Phaser's delta.
    loop.fpsLimit = 0;
    loop.hasFpsLimit = false;
    loop._limitRate = 0;
    loop.smoothStep = false;
    loop.forceSetTimeOut = isCapped;
    loop._target = targetInterval;

    if (needsSchedulerRestart && loop.running) {
      loop.sleep();
      loop.wake(true);
    }
    this.configureControlKeys();
    this.chunkManager?.applyVideoSettings(this.gameSettings.video);
    this.nightAmbientOverlay?.setEnabled(this.gameSettings.video.quality.showNightLights && !this.isInsideInterior());
    this.nightAmbientOverlay?.setRenderScale(this.gameSettings.video.quality.nightLightResolution);
    if (this.gameSettings.audio.biomeAmbienceEnabled) {
      this.ambientAudio?.activate();
    }
    if (this.activeCave) {
      this.updateCaveLava(this.gameSettings.video.quality.animateLava ? this.time.now : 0, true);
    }
    this.updateAmbientAudio();
  }

  private toggleDebug(): void {
    this.isDebugVisible = !this.isDebugVisible;
    this.debugElement.classList.toggle('is-visible', this.isDebugVisible);

    if (this.isDebugVisible && this.worldReady) {
      this.updateDebugText();
    }
  }

  private handleGameKeyDown(event: KeyboardEvent): void {
    this.ambientAudio?.activate();
    if (event.repeat) {
      return;
    }

    // A focused text field owns every key. In particular, a waypoint name containing E, F, or
    // another rebound game key must not close a menu or trigger a world action while typing.
    if (this.isTypingIntoTextControl(event)) {
      return;
    }

    if (this.returningToMainMenu) {
      return;
    }

    if (this.pauseMenuOpen) {
      return;
    }

    if (this.matchesControl('pauseMenu', event)) {
      event.preventDefault();
      this.openPauseMenu();
      return;
    }
    if (this.matchesControl('debugOverlay', event)) {
      event.preventDefault();
      this.toggleDebug();
      return;
    }
    if (!this.worldReady) {
      return;
    }
    if (this.matchesControl('worldMap', event)) {
      event.preventDefault();
      this.toggleWorldMap();
      return;
    }
    if (this.worldMapOpen) {
      return;
    }
    this.handleContextualAction(event);
  }

  private handleContextualAction(event: KeyboardEvent): void {
    if (this.landmarkEntranceSequenceInProgress) {
      return;
    }
    if (this.placedObjectOverlay.isOpen) {
      if (this.matchesControl('openInventory', event)) {
        this.placedObjectOverlay.close();
      }
      return;
    }
    if (this.craftingOpen) {
      if (this.matchesControl('openInventory', event)) {
        this.craftingOpen = false;
        this.inventoryOpen = false;
        this.cancelHarvesting();
        this.inventoryOverlay.setCraftingOpen(false);
        this.inventoryOverlay.setOpen(false);
        this.updateHotbarVisibility();
      }
      return;
    }
    if (this.inventoryOpen) {
      if (this.matchesControl('openInventory', event)) {
        this.toggleInventory();
      }
      return;
    }

    if (this.activeLandmarkInterior) {
      const pressedE = event.code === 'KeyE' || event.key.toLowerCase() === 'e';
      if (pressedE && this.landmarkInteriorStairTarget) {
        void this.changeWatchtowerFloor(this.landmarkInteriorStairTarget);
        return;
      }
      if (pressedE && this.takeWatchtowerMap()) {
        return;
      }
      if (pressedE && this.landmarkInteriorExitNearby) {
        void this.exitLandmarkInterior();
        return;
      }
      if (this.matchesControl('pickUpItem', event) && this.pickupNearbyDrop()) {
        return;
      }
      if (this.matchesControl('enterExitCave', event)) {
        if (this.landmarkInteriorStairTarget) {
          void this.changeWatchtowerFloor(this.landmarkInteriorStairTarget);
          return;
        }
        if (this.landmarkInteriorExitNearby) {
          void this.exitLandmarkInterior();
          return;
        }
      }
      if (this.matchesControl('openInventory', event)) {
        this.toggleInventory();
      }
      return;
    }

    if (this.activeCave) {
      // A floor drop remains the priority for shared default bindings, matching the original E
      // interaction. Rebound actions can intentionally separate drop pickup from cave travel.
      if (this.matchesControl('pickUpItem', event) && this.pickupNearbyDrop()) {
        return;
      }
      if (this.matchesControl('enterExitCave', event) && this.caveExitNearby) {
        void this.exitCave(this.caveExitTarget ?? undefined);
        return;
      }
      if (this.matchesControl('openInventory', event)) {
        this.toggleInventory();
      }
      return;
    }

    if ((event.code === 'KeyE' || event.key.toLowerCase() === 'e') && this.takeNearbyStoneCircleRune()) {
      return;
    }
    if ((event.code === 'KeyE' || event.key.toLowerCase() === 'e') && this.nearbyLandmarkEntrance) {
      void this.beginLandmarkEntranceSequence(this.nearbyLandmarkEntrance);
      return;
    }
    if (this.matchesControl('enterExitCave', event) && this.nearbyCaveEntrance) {
      void this.enterCave(this.nearbyCaveEntrance, this.player.x, this.player.y);
      return;
    }
    if (this.matchesControl('pickUpItem', event) && this.pickupNearbyDrop()) {
      return;
    }
    if (this.matchesControl('pickUpUtility', event) && this.pickupNearbyPlacedObject()) {
      return;
    }
    if (this.matchesControl('placeUtility', event) && this.heldPlaceable()) {
      this.tryPlaceHeldObject();
      return;
    }
    if (this.matchesControl('accessUtility', event)
      && this.nearbyPlacedObject?.placeable !== PlaceableId.TrailLantern
      && this.nearbyPlacedObject) {
      this.openPlacedObject(this.nearbyPlacedObject);
      return;
    }
    if (this.matchesControl('openInventory', event)) {
      this.toggleInventory();
    }
  }

  private toggleInventory(): void {
    this.cancelTonicDrinking();
    if (this.placedObjectOverlay.isOpen) {
      this.placedObjectOverlay.close();
    }
    this.inventoryOpen = !this.inventoryOpen;
    if (this.inventoryOpen && this.craftingOpen) {
      this.craftingOpen = false;
    }
    this.cancelHarvesting();
    this.inventoryOverlay.setOpen(this.inventoryOpen);
    this.updateHotbarVisibility();
  }

  private readonly handleWorldPointerDown = (pointer: Phaser.Input.Pointer): void => {
    this.ambientAudio?.activate();
    if (!this.worldReady || this.inventoryOpen || this.craftingOpen || this.worldMapOpen
      || this.pauseMenuOpen || this.placedObjectOverlay.isOpen || this.landmarkEntranceSequenceInProgress) {
      return;
    }
    // Non-harvest controls are normally keyboard actions, but they are fully data-driven and
    // can now be assigned to Mouse0/1/2 as well. Preserve the same priority as keyboard input.
    if (this.matchesPointerControl('pauseMenu', pointer)) {
      this.openPauseMenu();
      return;
    }
    if (this.matchesPointerControl('debugOverlay', pointer)) {
      this.toggleDebug();
      return;
    }
    if (this.matchesPointerControl('worldMap', pointer)) {
      this.toggleWorldMap();
      return;
    }
    if (this.activeLandmarkInterior) {
      if (this.matchesPointerControl('pickUpItem', pointer) && this.pickupNearbyDrop()) {
        return;
      }
      if (this.matchesPointerControl('pickUpItem', pointer) && this.takeWatchtowerMap()) {
        return;
      }
      if (this.matchesPointerControl('enterExitCave', pointer)) {
        if (this.landmarkInteriorStairTarget) {
          void this.changeWatchtowerFloor(this.landmarkInteriorStairTarget);
          return;
        }
        if (this.landmarkInteriorExitNearby) {
          void this.exitLandmarkInterior();
          return;
        }
      }
      if (this.matchesPointerControl('openInventory', pointer)) {
        this.toggleInventory();
      }
      return;
    }
    if (this.activeCave) {
      if (this.matchesPointerControl('pickUpItem', pointer) && this.pickupNearbyDrop()) {
        return;
      }
      if (this.matchesPointerControl('enterExitCave', pointer) && this.caveExitNearby) {
        void this.exitCave(this.caveExitTarget ?? undefined);
        return;
      }
      if (this.matchesPointerControl('openInventory', pointer)) {
        this.toggleInventory();
      }
      return;
    }
    if (this.matchesPointerControl('enterExitCave', pointer) && this.nearbyLandmarkEntrance) {
      void this.beginLandmarkEntranceSequence(this.nearbyLandmarkEntrance);
      return;
    }
    if (this.matchesPointerControl('enterExitCave', pointer) && this.nearbyCaveEntrance) {
      void this.enterCave(this.nearbyCaveEntrance, this.player.x, this.player.y);
      return;
    }
    if (this.matchesPointerControl('pickUpItem', pointer) && this.pickupNearbyDrop()) {
      return;
    }
    if (this.matchesPointerControl('pickUpUtility', pointer) && this.pickupNearbyPlacedObject()) {
      return;
    }
    if (this.matchesPointerControl('openInventory', pointer)) {
      this.toggleInventory();
      return;
    }
    const heldPlaceable = this.heldPlaceable();
    if (heldPlaceable && this.matchesPointerControl('placeUtility', pointer)) {
      this.tryPlaceHeldObject();
      return;
    }
    if (this.nearbyPlacedObject && this.nearbyPlacedObject.placeable !== PlaceableId.TrailLantern
      && this.matchesPointerControl('accessUtility', pointer)) {
      this.openPlacedObject(this.nearbyPlacedObject);
    }
  };

  private heldPlaceable(): PlaceableId | null {
    if (this.equippedTool) {
      return null;
    }
    const item = this.inventory.getSlots()[this.activeHotbarSlot]?.item;
    return item && isPlaceableId(item) ? item : null;
  }

  private placementTarget(placeable: PlaceableId): PlacementTarget {
    const definition = PLACEABLE_DEFINITIONS[placeable];
    const pointer = this.input.activePointer;
    const tileX = Math.floor(pointer.worldX / WORLD_TILE_SIZE - definition.footprint[0] / 2);
    const tileY = Math.floor(pointer.worldY / WORLD_TILE_SIZE - definition.footprint[1] / 2);

    for (let y = tileY; y < tileY + definition.footprint[1]; y += 1) {
      for (let x = tileX; x < tileX + definition.footprint[0]; x += 1) {
        const surface = surfaceAtTile(this.worldSeed, x + 0.5, y + 0.5);
        // isSwampWater is also water today, but testing it explicitly preserves the intended
        // placement rule if swamp traversal is ever given its own behavior.
        if (surface.isWater || surface.isSwampWater) {
          return { tileX, tileY, valid: false, blocker: 'water' };
        }
        if (featureAtTile(this.worldSeed, x, y) && !this.sessionWorldState.isFeatureHarvested(x, y)) {
          return { tileX, tileY, valid: false, blocker: 'feature' };
        }
        if (this.chunkManager.isCaveFormationAtTile(x, y)) {
          return { tileX, tileY, valid: false, blocker: 'cave' };
        }
        if (landmarkAtTile(this.worldSeed, x, y)) {
          return { tileX, tileY, valid: false, blocker: 'landmark' };
        }
      }
    }

    // Placed objects retain their own footprint collision. This is the only non-terrain guard:
    // without it, two chests or stations could occupy one location and become impossible to use.
    const blocker = this.placeableManager.canPlace(placeable, tileX, tileY) ? null : 'placed-object';
    return {
      tileX,
      tileY,
      valid: blocker === null,
      blocker
    };
  }

  private placementBlockerHint(blocker: PlacementBlocker | null): string {
    switch (blocker) {
      case 'water':
        return 'Cannot place in water';
      case 'feature':
        return 'Harvest the feature first';
      case 'cave':
        return 'Cannot build on cave terrain';
      case 'landmark':
        return 'Cannot build on a landmark';
      case 'placed-object':
        return 'A placed object occupies this space';
      default:
        return 'Choose a valid placement spot';
    }
  }

  private updatePlacementPreview(): void {
    const placeable = this.heldPlaceable();
    if (!placeable) {
      this.clearPlacementPreview();
      return;
    }
    const target = this.placementTarget(placeable);
    this.placementPreview = { placeable, ...target };
    const definition = PLACEABLE_DEFINITIONS[placeable];
    const x = target.tileX * WORLD_TILE_SIZE;
    const y = target.tileY * WORLD_TILE_SIZE;
    const width = definition.footprint[0] * WORLD_TILE_SIZE;
    const height = definition.footprint[1] * WORLD_TILE_SIZE;
    const color = target.valid ? 0x7deca2 : 0xef7668;
    this.placementPreviewGraphics.clear();
    this.placementPreviewGraphics.fillStyle(color, 0.14);
    this.placementPreviewGraphics.fillRoundedRect(x + 2, y + 2, width - 4, height - 4, 6);
    this.placementPreviewGraphics.lineStyle(2.5, color, 0.96);
    this.placementPreviewGraphics.strokeRoundedRect(x + 2, y + 2, width - 4, height - 4, 6);
    this.placementPreviewGraphics.setVisible(true);
    this.placementHint.setText(target.valid
      ? `Left click to place ${definition.label}`
      : this.placementBlockerHint(target.blocker))
      .setPosition(x + width / 2, y - 13)
      .setVisible(true);
  }

  private clearPlacementPreview(): void {
    this.placementPreview = null;
    this.placementPreviewGraphics?.clear().setVisible(false);
    this.placementHint?.setVisible(false);
  }

  private tryPlaceHeldObject(): void {
    const placeable = this.heldPlaceable();
    const preview = this.placementPreview;
    if (!placeable || !preview || preview.placeable !== placeable || !preview.valid) {
      this.showWorldFeedback(this.player.x, this.player.y - 28, this.placementBlockerHint(preview?.blocker ?? null));
      this.harvestRequiresControlRelease = true;
      return;
    }
    const source = this.inventory.takeSlot(this.activeHotbarSlot);
    if (!source || source.item !== placeable) {
      return;
    }
    const placed = this.placeableManager.place(placeable, preview.tileX, preview.tileY, this.player.x, this.player.y);
    if (!placed) {
      this.inventory.placeInSlot(this.activeHotbarSlot, source.item, source.amount);
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'That space is occupied');
      this.harvestRequiresControlRelease = true;
      return;
    }
    if (source.amount > 1) {
      this.inventory.placeInSlot(this.activeHotbarSlot, source.item, source.amount - 1);
    }
    this.harvestRequiresControlRelease = true;
    this.handleInventoryChanged();
    this.inventoryOverlay.refresh();
    this.clearPlacementPreview();
    if (placeable === PlaceableId.Waypoint || placeable === PlaceableId.TravelStone) {
      this.updateMinimap(0, true);
      this.updateWorldMap();
    }
    this.showWorldFeedback(this.player.x, this.player.y - 28, `Placed ${PLACEABLE_DEFINITIONS[placeable].label}`);
  }

  private updatePlacedObjectInteraction(): void {
    const heldPlaceable = this.heldPlaceable();
    this.nearbyPlacedObject = heldPlaceable ? null : this.placeableManager.nearest(this.player.x, this.player.y);
    const object = this.nearbyPlacedObject;
    if (!object) {
      this.placedObjectHighlight.setVisible(false);
      this.placedObjectHintPanel.clear().setVisible(false);
      this.placedObjectHint.setVisible(false);
      return;
    }
    const definition = PLACEABLE_DEFINITIONS[object.placeable];
    const centerX = (object.tileX + definition.footprint[0] / 2) * WORLD_TILE_SIZE;
    const centerY = (object.tileY + definition.footprint[1] / 2) * WORLD_TILE_SIZE;
    this.placedObjectHighlight.setPosition(centerX, centerY).setVisible(true);
    // Keep the world hover treatment clean. Utilities are still fully interactable; their
    // menus and controls communicate available actions once the player opens one.
    const label = definition.label;
    const hintY = centerY - definition.footprint[1] * WORLD_TILE_SIZE / 2 - 20;
    this.placedObjectHint.setText(label).setPosition(centerX, hintY).setVisible(true);
    const width = this.placedObjectHint.width + 20;
    const height = this.placedObjectHint.height + 10;
    this.placedObjectHintPanel.clear();
    this.placedObjectHintPanel.fillStyle(0x07130f, 0.9);
    this.placedObjectHintPanel.fillRoundedRect(centerX - width / 2, hintY - height / 2, width, height, 7);
    this.placedObjectHintPanel.lineStyle(1.5, 0xb5ffd2, 0.88);
    this.placedObjectHintPanel.strokeRoundedRect(centerX - width / 2, hintY - height / 2, width, height, 7);
    this.placedObjectHintPanel.setVisible(true);
  }

  private openPlacedObject(object: PlacedObject): void {
    this.cancelTonicDrinking();
    this.cancelHarvesting();
    this.harvestRequiresControlRelease = true;
    if (object.placeable === PlaceableId.TravelStone) {
      this.openTravelStone(object);
      return;
    }
    this.placedObjectOverlay.open(object);
    this.updateHotbarVisibility();
  }

  private movePlayerSlotToStorage(objectId: string, slotIndex: number, requestedAmount?: number): boolean {
    const source = this.inventory.getSlots()[slotIndex];
    const amount = Math.min(source?.amount ?? 0, requestedAmount ?? source?.amount ?? 0);
    if (!source || amount < 1 || !this.sessionWorldState.storageCanAccept(objectId, source.item, amount)) {
      return false;
    }
    const transferred = this.inventory.takeFromSlot(slotIndex, amount);
    if (!transferred) {
      return false;
    }
    const stored = this.sessionWorldState.storeInObject(objectId, transferred.item, transferred.amount);
    if (stored !== transferred.amount) {
      this.inventory.placeInSlot(slotIndex, transferred.item, transferred.amount);
      return false;
    }
    return true;
  }

  private moveStorageSlotToPlayer(
    objectId: string,
    slotIndex: number,
    destinationIndex: number,
    requestedAmount?: number
  ): boolean {
    const object = this.sessionWorldState.getPlacedObject(objectId);
    const slot = object?.storage?.[slotIndex] ?? null;
    const amount = Math.min(slot?.amount ?? 0, requestedAmount ?? slot?.amount ?? 0);
    if (!slot || amount < 1 || !this.inventory.canPlaceInSlot(destinationIndex, slot.item, amount)) {
      return false;
    }
    const taken = this.sessionWorldState.takeFromObject(objectId, slotIndex, amount);
    if (!taken) {
      return false;
    }
    return this.inventory.placeInSlot(destinationIndex, taken.item, taken.amount);
  }

  private movePlayerSlotToBrewing(objectId: string, slotIndex: number, ingredientIndex: number): boolean {
    const slot = this.inventory.getSlots()[slotIndex];
    if (!slot || !Object.values(ResourceType).includes(slot.item as ResourceType)) {
      return false;
    }
    const ingredient = this.inventory.takeFromSlot(slotIndex, 1);
    if (!ingredient) {
      return false;
    }
    if (this.sessionWorldState.putBrewingIngredient(objectId, ingredientIndex, ingredient)) {
      return true;
    }
    this.inventory.placeInSlot(slotIndex, ingredient.item, ingredient.amount);
    return false;
  }

  private moveBrewingIngredientToPlayer(objectId: string, ingredientIndex: number, destinationIndex: number): boolean {
    const brewing = this.sessionWorldState.getBrewingState(objectId);
    const ingredient = brewing?.ingredients[ingredientIndex] ?? null;
    if (!ingredient || !this.inventory.canPlaceInSlot(destinationIndex, ingredient.item, ingredient.amount)) {
      return false;
    }
    const taken = this.sessionWorldState.takeBrewingIngredient(objectId, ingredientIndex);
    return Boolean(taken && this.inventory.placeInSlot(destinationIndex, taken.item, taken.amount));
  }

  private startBrewing(objectId: string): PotionId | null {
    const potion = this.sessionWorldState.startBrewing(objectId);
    if (potion) {
      this.markSaveDirty();
    }
    return potion;
  }

  private collectBrewingOutput(objectId: string, destinationIndex: number): boolean {
    const potion = this.sessionWorldState.brewingOutput(objectId);
    if (!potion || !this.inventory.canPlaceInSlot(destinationIndex, potion, 1)) {
      return false;
    }
    const collected = this.sessionWorldState.collectBrewingOutput(objectId);
    return Boolean(collected && this.inventory.placeInSlot(destinationIndex, collected, 1));
  }

  private movePlayerSlotToFurnace(
    objectId: string,
    slotIndex: number,
    furnaceSlot: 'fuel' | 'ore',
    requestedAmount?: number
  ): boolean {
    const source = this.inventory.getSlots()[slotIndex];
    if (!source) {
      return false;
    }
    const capacity = this.sessionWorldState.furnaceItemCapacity(objectId, furnaceSlot, source.item);
    const amount = Math.min(source.amount, capacity, requestedAmount ?? source.amount);
    const ingredient = this.inventory.takeFromSlot(slotIndex, amount);
    if (!ingredient) {
      return false;
    }
    if (this.sessionWorldState.putFurnaceItem(objectId, furnaceSlot, ingredient)) {
      return true;
    }
    this.inventory.placeInSlot(slotIndex, ingredient.item, ingredient.amount);
    return false;
  }

  private moveFurnaceItemToPlayer(
    objectId: string,
    furnaceSlot: 'fuel' | 'ore',
    destinationIndex: number,
    requestedAmount?: number
  ): boolean {
    const item = this.sessionWorldState.furnaceItemAvailableToTake(objectId, furnaceSlot);
    const amount = Math.min(item?.amount ?? 0, requestedAmount ?? item?.amount ?? 0);
    if (!item || amount < 1 || !this.inventory.canPlaceInSlot(destinationIndex, item.item, amount)) {
      return false;
    }
    const taken = this.sessionWorldState.takeFurnaceItem(objectId, furnaceSlot, amount);
    return Boolean(taken && this.inventory.placeInSlot(destinationIndex, taken.item, taken.amount));
  }

  private collectFurnaceOutput(objectId: string, destinationIndex: number, requestedAmount?: number): boolean {
    const output = this.sessionWorldState.furnaceOutput(objectId);
    const amount = Math.min(output?.amount ?? 0, requestedAmount ?? output?.amount ?? 0);
    if (!output || amount < 1 || !this.inventory.canPlaceInSlot(destinationIndex, output.item, amount)) {
      return false;
    }
    const collected = this.sessionWorldState.collectFurnaceOutput(objectId, Date.now(), amount);
    if (!collected) {
      return false;
    }
    const stored = this.inventory.placeInSlot(destinationIndex, collected.item, collected.amount);
    if (stored) {
      this.markSaveDirty();
      this.placeableManager.refresh(this.player.x, this.player.y);
    }
    return stored;
  }

  private pickupReason(object: PlacedObject): string | null {
    if (!this.inventory.canAdd(object.placeable, 1)) {
      return 'Make room in your inventory before packing this placed object.';
    }
    if (object.storage?.some((slot) => slot !== null)) {
      return 'Empty its storage before picking up this placed object.';
    }
    if (object.brewing?.job) {
      return 'Collect the finished brew before picking up this placed object.';
    }
    if (object.brewing?.ingredients.some((slot) => slot !== null)) {
      return 'Remove the ingredients before picking up this placed object.';
    }
    if (object.furnace?.job) {
      return 'Collect the refined material before picking up this placed object.';
    }
    if (object.furnace?.fuel || object.furnace?.ore || object.furnace?.output) {
      return 'Remove the furnace materials before picking up this placed object.';
    }
    return null;
  }

  private pickUpPlacedObject(object: PlacedObject): { success: boolean; message: string } {
    const reason = this.pickupReason(object);
    if (reason) {
      return { success: false, message: reason };
    }
    const removed = this.placeableManager.remove(object.id, this.player.x, this.player.y);
    if (!removed || this.inventory.add(removed.placeable, 1) !== 1) {
      return { success: false, message: 'This placed object could not be packed right now.' };
    }
    this.handleInventoryChanged();
    this.inventoryOverlay.refresh();
    if (removed.placeable === PlaceableId.Waypoint || removed.placeable === PlaceableId.TravelStone) {
      this.updateMinimap(0, true);
      this.updateWorldMap();
    }
    this.showWorldFeedback(this.player.x, this.player.y - 28, `Picked up ${PLACEABLE_DEFINITIONS[removed.placeable].label}`);
    this.updatePlacedObjectInteraction();
    return { success: true, message: '' };
  }

  private restAtPlacedObject(object: PlacedObject): void {
    this.worldTimeMs = worldTimeForHour(6);
    this.sessionWorldState.setWorldTimeMs(this.worldTimeMs);
    this.lastDayNightOverlayUpdateMs = Number.NEGATIVE_INFINITY;
    this.lastNightAmbientLightingUpdateMs = Number.NEGATIVE_INFINITY;
    this.dayNightOverlay.update(this.worldTimeMs);
    this.nightAmount = sampleDayNight(this.worldTimeMs).nightAmount;
    this.ambientLightAmount = ambientLightScheduleAmount(this.worldTimeMs);
    this.placedObjectOverlay.close();
    this.markSaveDirty();
    this.showWorldFeedback(this.player.x, this.player.y - 28, `Rested at ${PLACEABLE_DEFINITIONS[object.placeable].label}`);
  }

  private setWaypointLabel(objectId: string, label: string): boolean {
    const changed = this.sessionWorldState.setWaypointLabel(objectId, label);
    if (changed) {
      this.markSaveDirty();
      this.updateMinimap(0, true);
      this.updateWorldMap();
    }
    return changed;
  }

  private toggleWorldMap(): void {
    if (!this.worldReady) {
      return;
    }

    if (this.worldMapOpen) {
      this.closeWorldMap();
      return;
    }

    this.cancelTonicDrinking();
    this.travelStoneSourceId = null;
    this.worldMapOpen = true;
    if (this.worldMapOpen && this.placedObjectOverlay.isOpen) {
      this.placedObjectOverlay.close();
    }
    if (this.worldMapOpen && this.inventoryOpen) {
      this.toggleInventory();
    }
    if (this.worldMapOpen && this.craftingOpen) {
      this.craftingOpen = false;
      this.inventoryOverlay.setCraftingOpen(false);
      this.inventoryOverlay.setOpen(false);
    }

    this.cancelHarvesting();
    this.worldMapOverlay.setTravelSource(null);
    this.worldMapOverlay.centerOn(this.player.x / WORLD_TILE_SIZE, this.player.y / WORLD_TILE_SIZE);
    this.worldMapOverlay.setOpen(true);
    this.updateHotbarVisibility();
    this.updateWorldMap();
  }

  private closeWorldMap(): void {
    if (!this.worldMapOpen) {
      return;
    }
    this.worldMapOpen = false;
    this.travelStoneSourceId = null;
    this.worldMapOverlay.setOpen(false);
    this.worldMapOverlay.setTravelSource(null);
    this.updateHotbarVisibility();
  }

  private openTravelStone(source: PlacedObject): void {
    if (!this.worldReady || source.placeable !== PlaceableId.TravelStone) {
      return;
    }
    this.cancelTonicDrinking();
    this.cancelHarvesting();
    if (this.placedObjectOverlay.isOpen) {
      this.placedObjectOverlay.close();
    }
    if (this.inventoryOpen) {
      this.inventoryOpen = false;
      this.inventoryOverlay.setOpen(false);
    }
    if (this.craftingOpen) {
      this.craftingOpen = false;
      this.inventoryOverlay.setCraftingOpen(false);
      this.inventoryOverlay.setOpen(false);
    }
    this.travelStoneSourceId = source.id;
    this.worldMapOpen = true;
    this.worldMapOverlay.setTravelSource(source.id);
    this.worldMapOverlay.centerOn(source.tileX + 0.5, source.tileY + 0.5);
    this.worldMapOverlay.setOpen(true);
    this.updateWorldMap();
    this.updateHotbarVisibility();
  }

  private async travelToStone(destinationId: string): Promise<void> {
    const sourceId = this.travelStoneSourceId;
    const source = sourceId ? this.sessionWorldState.getPlacedObject(sourceId) : null;
    const destination = this.sessionWorldState.getPlacedObject(destinationId);
    if (!source || !destination || source.id === destination.id
      || source.placeable !== PlaceableId.TravelStone
      || destination.placeable !== PlaceableId.TravelStone
      || this.caveTransitionInProgress) {
      return;
    }
    const arrival = this.travelStoneArrival(destination);
    if (!arrival) {
      this.closeWorldMap();
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'The destination stone is blocked');
      return;
    }

    this.closeWorldMap();
    this.caveTransitionInProgress = true;
    this.worldReady = false;
    this.showTerrainLoading();
    this.ambientAudio?.setSwimming(false, false, false);
    this.footstepElapsedMs = 0;
    this.cancelHarvesting();
    try {
      await this.waitForTerrainLoadingPaint();
      await this.chunkManager.prime(arrival.x, arrival.y, (progress) => {
        const ratio = progress.completed / Math.max(1, progress.total);
        this.updateLoadingProgress(8 + ratio * 84, 100, 'Opening the travel route');
      });
      this.updateLoadingProgress(94, 100, 'Opening the travel route');
      await this.waitForTerrainLoadingPaint();
      this.player.setPosition(arrival.x, arrival.y);
      this.cameras.main.centerOn(arrival.x, arrival.y);
      this.footprintTrail.clear();
      this.currentTopography = this.chunkManager.getTopographyAt(arrival.x, arrival.y);
      this.terrainSurface = this.currentTopography.surface;
      this.placeableManager.refresh(arrival.x, arrival.y);
      this.updateSwimmingState(true);
      this.chunkManager.update(arrival.x, arrival.y);
      this.updateExploration(true);
      this.updateInteractionTarget(true);
      this.updateCaveEntranceInteraction(true);
      this.updateDropInteraction(0, true);
      this.updatePlacedObjectInteraction();
      this.lastMinimapUpdateMs = Number.NEGATIVE_INFINITY;
      this.updateMinimap(0, true);
      this.updatePlayerAvatar(0, false);
      this.markSaveDirty();
      await this.finishTerrainLoading();
      this.showWorldFeedback(arrival.x, arrival.y - 34, 'Travel route complete');
    } catch (error) {
      this.recoverFromTerrainLoadingFailure('travel between stones', error);
    }
  }

  private travelStoneArrival(stone: PlacedObject): { x: number; y: number } | null {
    // Prefer arriving just below the monolith, then walk a deterministic spiral if another
    // placed object or natural feature occupies that tile. This keeps teleporting safe without
    // altering any procedural terrain or silently harvesting the destination.
    const offsets: Array<readonly [number, number]> = [
      [0, 1], [1, 0], [-1, 0], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [0, 2], [2, 0], [-2, 0], [0, -2],
      [1, 2], [-1, 2], [2, 1], [-2, 1], [1, -2], [-1, -2], [2, -1], [-2, -1]
    ];
    const placedObjects = this.sessionWorldState.getPlacedObjects();
    for (const [offsetX, offsetY] of offsets) {
      const tileX = stone.tileX + offsetX;
      const tileY = stone.tileY + offsetY;
      if (!this.isTravelArrivalTileOpen(tileX, tileY, stone.id, placedObjects)) {
        continue;
      }
      return {
        x: (tileX + 0.5) * WORLD_TILE_SIZE,
        y: (tileY + 0.5) * WORLD_TILE_SIZE - 9
      };
    }
    return null;
  }

  private isTravelArrivalTileOpen(
    tileX: number,
    tileY: number,
    destinationStoneId: string,
    placedObjects: readonly PlacedObject[]
  ): boolean {
    const surface = surfaceAtTile(this.worldSeed, tileX + 0.5, tileY + 0.5);
    if (surface.isWater || surface.isSwampWater
      || (featureAtTile(this.worldSeed, tileX, tileY) && !this.sessionWorldState.isFeatureHarvested(tileX, tileY))
      || this.chunkManager.isCaveFormationAtTile(tileX, tileY)
      || landmarkAtTile(this.worldSeed, tileX, tileY)) {
      return false;
    }
    return placedObjects.every((object) => {
      if (object.id === destinationStoneId) {
        return true;
      }
      const [width, height] = PLACEABLE_DEFINITIONS[object.placeable].footprint;
      return tileX < object.tileX || tileX >= object.tileX + width
        || tileY < object.tileY || tileY >= object.tileY + height;
    });
  }

  private openPauseMenu(): void {
    if (!this.worldReady || this.pauseMenuOpen || this.returningToMainMenu) {
      return;
    }
    this.pauseMenuOpen = true;
    this.cancelTonicDrinking();
    this.cancelHarvesting();
    this.harvestRequiresControlRelease = this.isControlDown('harvestAttack');
    if (this.placedObjectOverlay.isOpen) {
      this.placedObjectOverlay.close();
    }
    if (this.inventoryOpen || this.craftingOpen) {
      this.inventoryOpen = false;
      this.craftingOpen = false;
      this.inventoryOverlay.setCraftingOpen(false);
      this.inventoryOverlay.setOpen(false);
    }
    if (this.worldMapOpen) {
      this.closeWorldMap();
    }
    this.pauseMenuOverlay.setOpen(true);
    this.updateHotbarVisibility();
  }

  private closePauseMenu(): void {
    if (!this.pauseMenuOpen) {
      return;
    }
    this.pauseMenuOpen = false;
    this.pauseMenuOverlay.setOpen(false);
    this.updateHotbarVisibility();
  }

  private returnToMainMenu(): void {
    if (!this.pauseMenuOpen || this.returningToMainMenu) {
      return;
    }
    this.returningToMainMenu = true;
    this.closePauseMenu();
    if (this.worldReady && this.sessionWorldState.setWorldTimeMs(this.worldTimeMs)) {
      this.markSaveDirty();
    }
    void this.persistSave().finally(() => this.scene.start('main-menu'));
  }

  private handleResize(): void {
    this.updateCameraZoom();
    this.chunkManager?.handleViewportChanged();
    this.resizeCaveFog();
    this.lastCaveVisibilityWorldX = Number.NaN;
    this.lastCaveVisibilityWorldY = Number.NaN;
    if (this.worldReady) {
      this.updateMinimap(0, true);
    }
  }

  private handleShutdown(): void {
    gameMusic.stop();
    this.footprintTrail.destroy();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.input.keyboard?.off('keydown', this.handleGameKeyDown, this);
    this.input.off('pointerdown', this.handleWorldPointerDown, this);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.debugElement.remove();
    this.loadingOverlay.remove();
    this.inventoryOverlay.destroy();
    this.placedObjectOverlay.destroy();
    this.hotbarOverlay.destroy();
    this.minimapOverlay.destroy();
    this.dayNightOverlay.destroy();
    this.nightAmbientOverlay.destroy();
    this.placedLightOverlay.destroy();
    this.potionEffectOverlay.destroy();
    this.worldMapOverlay.destroy();
    this.pauseMenuOverlay.destroy();
    this.chunkManager?.destroy();
    this.dropManager?.destroy();
    this.placeableManager?.destroy();
    this.ambientAudio?.destroy();
    this.ambientAudio = null;
    this.caveFogOverlay.remove();
  }

  private readonly handleBeforeUnload = (): void => {
    if (this.worldReady && this.sessionWorldState.setWorldTimeMs(this.worldTimeMs)) {
      this.markSaveDirty();
    }
    void this.persistSave();
  };

  private updateWorldTime(time: number, delta: number): void {
    this.worldTimeMs = normalizeWorldTime(this.worldTimeMs + delta);
    const regrownMaterialIds = this.sessionWorldState.advanceWorldAge(delta);
    if (regrownMaterialIds.length > 0) {
      this.markSaveDirty();
      regrownMaterialIds.forEach((materialId) => {
        if (materialId.includes(':surface-material:')) {
          this.chunkManager.refreshLandmarkMaterial(materialId);
        }
      });
      if (!this.activeLandmarkInterior && !this.activeCave) {
        this.updateLandmarkEntranceInteraction(true);
      }
      const interior = this.activeLandmarkInterior;
      if (interior?.landmark.type === LandmarkType.GiantAncientTree) {
        const regrownIds = new Set(regrownMaterialIds);
        if (interior.layout.materialNodes.some((material) => regrownIds.has(material.id))) {
          this.drawActiveLandmarkInterior();
          this.updateLandmarkInteriorAccents(time, true);
          this.updateLandmarkInteriorInteraction(true);
        }
      }
    }
    this.nightAmount = sampleDayNight(this.worldTimeMs).nightAmount;
    this.ambientLightAmount = ambientLightScheduleAmount(this.worldTimeMs);

    if (!this.isInsideInterior() && time - this.lastDayNightOverlayUpdateMs >= DAY_NIGHT_OVERLAY_UPDATE_INTERVAL_MS) {
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
    // Surface ambience and placed lights must never leak into cave rendering. Caves use their
    // own static fog, wall shading, exit shafts, and lava glow, independent of world time.
    if (this.isInsideInterior()) {
      this.placedLightOverlay.update(this.cameras.main, []);
      this.nightAmbientOverlay.setEnabled(false);
      return;
    }

    if (!this.gameSettings.video.quality.showNightLights) {
      this.placedLightOverlay.update(this.cameras.main, []);
      return;
    }
    // Lanterns are projected directly every rendered frame from their exact flame coordinate.
    // This is a tiny, bounded list and does not involve terrain or chunk work.
    this.placedLightOverlay.update(this.cameras.main, this.placeableManager.getNightLights());
    // The expensive Canvas 2D gradients refresh at a controlled cadence, while this lightweight
    // compositor transform runs every scene update. Glows therefore track camera motion smoothly
    // instead of snapping relative to the player at the source-refresh rate.
    this.nightAmbientOverlay.followCamera(this.cameras.main);
    // Sampling and drawing the radial sources more often than this is unnecessary because the
    // camera-follow pass above already moves the composited glow every frame. During daylight,
    // a sparse clear prevents an otherwise invisible canvas from consuming frame time.
    const updateInterval = this.ambientLightAmount <= 0 ? 250 : NIGHT_AMBIENT_LIGHT_UPDATE_INTERVAL_MS;
    if (time - this.lastNightAmbientLightingUpdateMs < updateInterval) {
      return;
    }

    this.lastNightAmbientLightingUpdateMs = time;
    this.ambientWorldLights.length = 0;
    this.ambientWorldLights.push(...this.chunkManager.getNightAmbientLights(time));
    this.ambientWorldLights.push(...this.chunkManager.getLandmarkNightLights());
    this.nightAmbientOverlay.update(this.ambientLightAmount, this.cameras.main, this.ambientWorldLights);
  }

  private updateAmbientAudio(): void {
    if (!this.worldReady || !this.ambientAudio) {
      return;
    }
    // A changed user setting is recognized as a mixer-state change. Its own AudioParam ramp
    // updates immediately but still prevents the result from sounding like a switch.
    this.ambientAudio.update({
      playerWorldX: this.player.x,
      playerWorldY: this.player.y,
      worldTimeMs: this.worldTimeMs,
      daylightAmount: sampleDayNight(this.worldTimeMs).lightLevel,
      isCave: this.isInsideInterior(),
      caveDepthMeters: this.activeLandmarkInterior ? 160 : this.caveDepthMetersAt(this.player.x, this.player.y),
      nearLava: this.isSwimming,
      isPaused: this.pauseMenuOpen,
      enabled: this.gameSettings.audio.biomeAmbienceEnabled,
      volume: this.gameSettings.audio.ambientVolume
    });
  }

  private setCaveLightingActive(active: boolean): void {
    this.dayNightOverlay.setEnabled(!active);
    this.nightAmbientOverlay.setEnabled(!active && this.gameSettings.video.quality.showNightLights);
    this.placedLightOverlay.setEnabled(!active);
    this.chunkManager?.setSurfaceAmbientEnabled(!active);
    this.lastDayNightOverlayUpdateMs = Number.NEGATIVE_INFINITY;
    this.lastNightAmbientLightingUpdateMs = Number.NEGATIVE_INFINITY;

    if (active) {
      // The finite interior artwork cannot cover an unbounded camera. Matching the camera clear
      // color prevents the surface-green canvas from appearing when the viewport reaches an edge.
      this.cameras.main.setBackgroundColor(this.activeLandmarkInterior?.layout.palette.background ?? 0x050704);
      return;
    }

    this.cameras.main.setBackgroundColor('#16261f');

    // Repaint the normal surface overlays immediately on exit instead of waiting for their
    // throttled refresh cadence.
    this.dayNightOverlay.update(this.worldTimeMs);
    this.updateNightAmbientLighting(this.time.now);
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
      landmarks: Array.from(landmarksById.values()),
      waypoints: this.sessionWorldState.getWaypoints()
        .map((waypoint) => ({
          id: waypoint.id,
          tileX: waypoint.tileX + 0.5,
          tileY: waypoint.tileY + 0.5,
          label: waypoint.label
        })),
      travelStones: this.sessionWorldState.getPlacedObjects()
        .filter((object) => object.placeable === PlaceableId.TravelStone)
        .sort((first, second) => first.id.localeCompare(second.id, undefined, { numeric: true }))
        .map((stone, index) => ({
          id: stone.id,
          tileX: stone.tileX + 0.5,
          tileY: stone.tileY + 0.5,
          label: `Travel Stone ${index + 1}`
        }))
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
    const harvestAnimationFrame = this.harvestTarget || this.caveHarvestOre
      || this.surfaceLandmarkHarvestMaterial || this.interiorLandmarkHarvestMaterial
      ? Math.floor(this.harvestElapsedMs / 45) % 8
      : -1;
    const heldResource = this.heldHotbarResource();
    const heldPlaceable = this.heldPlaceable();
    const heldTonic = this.heldTonic();
    const state = `${this.facing}:${this.isSwimming}:${animationFrame}:${harvestAnimationFrame}:${this.equippedTool ?? 'none'}:${heldResource ?? 'none'}:${heldPlaceable ?? 'none'}:${heldTonic?.id ?? 'none'}:${this.drinkingPotion?.id ?? 'none'}`;

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
    const isUnarmedHarvesting = !this.equippedTool && (
      this.harvestTarget !== null
      || this.caveHarvestOre !== null
      || this.surfaceLandmarkHarvestMaterial !== null
      || this.interiorLandmarkHarvestMaterial !== null
    );
    const heldResource = this.heldHotbarResource();
    const heldPlaceable = this.heldPlaceable();
    const heldTonic = this.heldTonic();

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
        if (heldTonic) {
          this.drawHeldTonic(direction, stride, heldTonic.id);
        }
      } else if (!this.equippedTool && heldResource) {
        this.drawHeldResource(direction, stride, heldResource);
      } else if (!this.equippedTool && heldPlaceable) {
        this.drawHeldPlaceable(direction, stride, heldPlaceable);
      } else if (!this.equippedTool && heldTonic) {
        this.drawHeldTonic(direction, stride, heldTonic.id);
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
      if (heldTonic) {
        this.drawHeldTonic(direction, stride, heldTonic.id);
      }
    } else if (!this.equippedTool && heldResource) {
      this.drawHeldResource(direction, stride, heldResource);
    } else if (!this.equippedTool && heldPlaceable) {
      this.drawHeldPlaceable(direction, stride, heldPlaceable);
    } else if (!this.equippedTool && heldTonic) {
      this.drawHeldTonic(direction, stride, heldTonic.id);
    }
    this.drawDirectionalHead(direction, false);
  }

  private harvestSwingAmount(): number {
    if (!this.harvestTarget && !this.caveHarvestOre
      && !this.surfaceLandmarkHarvestMaterial && !this.interiorLandmarkHarvestMaterial) {
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

    const { fill: headColor, edge: edgeColor } = TOOL_HEAD_PALETTES[tool.headMaterial];
    if (tool.kind === 'axe') {
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
    } else if (tool.kind === 'pickaxe') {
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
    } else if (tool.kind === 'hoe') {
      avatar.lineStyle(5, edgeColor, 1);
      avatar.lineBetween(
        headX - toolPerpendicularX * 7,
        headY - toolPerpendicularY * 7,
        headX + toolPerpendicularX * 7,
        headY + toolPerpendicularY * 7
      );
      avatar.lineStyle(2.8, headColor, 1);
      avatar.lineBetween(
        headX - toolPerpendicularX * 6.5,
        headY - toolPerpendicularY * 6.5,
        headX + toolPerpendicularX * 6.5,
        headY + toolPerpendicularY * 6.5
      );
      avatar.fillStyle(headColor, 1);
      avatar.fillTriangle(
        headX + toolPerpendicularX * 7,
        headY + toolPerpendicularY * 7,
        headX + toolPerpendicularX * 2 + toolDirectionX * 5,
        headY + toolPerpendicularY * 2 + toolDirectionY * 5,
        headX + toolPerpendicularX * 2 - toolDirectionX * 2,
        headY + toolPerpendicularY * 2 - toolDirectionY * 2
      );
    } else {
      // Swords retain the normal forearm anchor, but their blade extends in the direction of
      // the swing instead of using a harvesting head. Combat can build on this visual later.
      const bladeTipX = headX + toolDirectionX * 9;
      const bladeTipY = headY + toolDirectionY * 9;
      avatar.fillStyle(edgeColor, 1);
      avatar.fillTriangle(
        headX - toolPerpendicularX * 3.5,
        headY - toolPerpendicularY * 3.5,
        bladeTipX,
        bladeTipY,
        headX + toolPerpendicularX * 3.5,
        headY + toolPerpendicularY * 3.5
      );
      avatar.fillStyle(headColor, 1);
      avatar.fillTriangle(
        headX - toolPerpendicularX * 2,
        headY - toolPerpendicularY * 2,
        bladeTipX - toolDirectionX * 2,
        bladeTipY - toolDirectionY * 2,
        headX + toolPerpendicularX * 2,
        headY + toolPerpendicularY * 2
      );
      avatar.lineStyle(3.3, edgeColor, 1);
      avatar.lineBetween(
        handX - toolPerpendicularX * 5,
        handY - toolPerpendicularY * 5,
        handX + toolPerpendicularX * 5,
        handY + toolPerpendicularY * 5
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
    if (!this.harvestTarget && !this.caveHarvestOre
      && !this.surfaceLandmarkHarvestMaterial && !this.interiorLandmarkHarvestMaterial) {
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
    return item && Object.values(ResourceType).includes(item as ResourceType) ? item as ResourceType : null;
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
      case ResourceType.AncientWood:
      case ResourceType.Heartwood:
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
      case ResourceType.IronIngot:
      case ResourceType.GoldIngot:
      case ResourceType.Diamond:
        avatar.fillStyle(outline, 1);
        avatar.fillTriangle(handX, handY - 6, handX + 6, handY - 1, handX + 3, handY + 5);
        avatar.fillTriangle(handX, handY - 6, handX + 3, handY + 5, handX - 5, handY + 3);
        avatar.fillStyle(RESOURCE_COLORS[resource], 1);
        avatar.fillTriangle(handX, handY - 4.5, handX + 4.5, handY - 1, handX + 2.2, handY + 3.7);
        avatar.fillTriangle(handX, handY - 4.5, handX + 2.2, handY + 3.7, handX - 3.8, handY + 2.2);
        break;
      case ResourceType.Fiber:
      case ResourceType.VineFiber:
      case ResourceType.MossFiber:
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
      case ResourceType.MapFragments:
        avatar.fillStyle(outline, 1);
        avatar.fillRoundedRect(handX - 6, handY - 5, 12, 10, 2);
        avatar.fillStyle(RESOURCE_COLORS[resource], 1);
        avatar.fillRoundedRect(handX - 4.8, handY - 4, 9.6, 8, 1.5);
        avatar.lineStyle(1, 0x705f43, 0.84);
        avatar.lineBetween(handX - 3, handY - 1.5, handX + 3, handY + 1.5);
        break;
      case ResourceType.GlowSpores:
      case ResourceType.LuminousMushrooms:
      case ResourceType.AmberSap:
      case ResourceType.FossilResin:
        avatar.fillStyle(outline, 1);
        avatar.fillCircle(handX, handY, 6.2);
        avatar.fillStyle(RESOURCE_COLORS[resource], 1);
        avatar.fillCircle(handX, handY, 4.8);
        avatar.fillStyle(0xffffff, 0.55);
        avatar.fillCircle(handX - 1.7, handY - 1.8, 1.4);
        break;
      default:
        // Every rare landmark material remains legible when selected even if it does not map to
        // one of the legacy wood/stone/fiber silhouettes.
        avatar.fillStyle(outline, 1);
        avatar.fillTriangle(handX, handY - 6.5, handX + 6.5, handY, handX + 2, handY + 6);
        avatar.fillTriangle(handX, handY - 6.5, handX + 2, handY + 6, handX - 5.5, handY + 2.5);
        avatar.fillStyle(RESOURCE_COLORS[resource], 1);
        avatar.fillTriangle(handX, handY - 5, handX + 5, handY, handX + 1.5, handY + 4.5);
        avatar.fillTriangle(handX, handY - 5, handX + 1.5, handY + 4.5, handX - 4, handY + 2);
        avatar.fillStyle(0xffffff, 0.46);
        avatar.fillTriangle(handX - 0.5, handY - 3.8, handX + 2.5, handY - 0.5, handX, handY + 0.5);
        break;
    }
  }

  private drawHeldTonic(direction: Phaser.Math.Vector2, stride: number, tonic: PotionId): void {
    const avatar = this.playerAvatar;
    const drinking = this.drinkingPotion?.id === tonic;
    const shoulderX = 7 + direction.x * 2;
    const shoulderY = (this.isSwimming ? 0 : 1) + direction.y * 2;
    const handX = drinking
      ? direction.x * 5 + direction.y * 3
      : 11 + direction.x * 4 + direction.y * 2;
    const handY = drinking
      ? -8 + direction.y * 2 - direction.x * 2
      : (this.isSwimming ? 1 : 2) + direction.y * 4 - direction.x * 2 - stride * 0.35;
    const color = POTION_DEFINITIONS[tonic].color;
    avatar.lineStyle(4.6, 0xe1ae86, 1);
    avatar.lineBetween(shoulderX, shoulderY, handX, handY);
    avatar.fillStyle(0xe1ae86, 1);
    avatar.fillCircle(handX, handY, 3.2);
    avatar.fillStyle(0x24353a, 1);
    avatar.fillRoundedRect(handX - 4, handY - 9, 8, 11, 3);
    avatar.fillStyle(color, 1);
    avatar.fillRoundedRect(handX - 2.8, handY - 7.6, 5.6, 7.2, 2);
    avatar.fillStyle(0xded8b6, 1);
    avatar.fillRect(handX - 1.8, handY - 11, 3.6, 3);
    avatar.fillStyle(0xffffff, 0.55);
    avatar.fillRect(handX - 1.4, handY - 6.4, 1.4, 3.2);
  }

  private drawHeldPlaceable(direction: Phaser.Math.Vector2, stride: number, placeable: PlaceableId): void {
    const avatar = this.playerAvatar;
    const handX = 12 + direction.x * 5 + direction.y * 2;
    const handY = (this.isSwimming ? 0 : 2) + direction.y * 4 - direction.x * 2 - stride * 0.35;
    const outline = 0x24332a;
    const definition = PLACEABLE_DEFINITIONS[placeable];
    avatar.lineStyle(4.8, 0xe1ae86, 1);
    avatar.lineBetween(7 + direction.x * 2, 1 + direction.y * 2, handX, handY);
    avatar.fillStyle(0xe1ae86, 1);
    avatar.fillCircle(handX, handY, 3.5);

    if (definition.interaction === 'light') {
      avatar.fillStyle(outline, 1);
      avatar.fillRoundedRect(handX - 5, handY - 10, 10, 12, 3);
      avatar.fillStyle(0xffca61, 1);
      avatar.fillRoundedRect(handX - 3.5, handY - 8.5, 7, 7, 2);
      avatar.fillStyle(0xffffbd, 0.9);
      avatar.fillCircle(handX, handY - 5, 1.7);
      return;
    }
    if (definition.interaction === 'waypoint') {
      avatar.lineStyle(3, 0x425e63, 1);
      avatar.lineBetween(handX, handY + 5, handX, handY - 8);
      avatar.fillStyle(0x3f9bcd, 1);
      avatar.fillTriangle(handX, handY - 12, handX + 9, handY - 8, handX, handY - 4);
      avatar.lineStyle(1, 0xc9efff, 0.9);
      avatar.strokeTriangle(handX, handY - 12, handX + 9, handY - 8, handX, handY - 4);
      return;
    }
    if (definition.interaction === 'travel') {
      avatar.fillStyle(outline, 1);
      avatar.fillPoints([
        new Phaser.Geom.Point(handX - 7, handY + 5),
        new Phaser.Geom.Point(handX - 5, handY - 7),
        new Phaser.Geom.Point(handX, handY - 11),
        new Phaser.Geom.Point(handX + 6, handY - 6),
        new Phaser.Geom.Point(handX + 7, handY + 5)
      ], true);
      avatar.fillStyle(0x65777a, 1);
      avatar.fillTriangle(handX - 4, handY + 3, handX, handY - 8, handX + 4, handY + 3);
      avatar.lineStyle(1.5, 0x67f1e7, 0.95);
      avatar.strokeCircle(handX, handY - 2, 3);
      avatar.fillStyle(0xd6fffb, 1);
      avatar.fillCircle(handX, handY - 2, 1.1);
      return;
    }
    if (definition.interaction === 'storage') {
      avatar.fillStyle(outline, 1);
      avatar.fillRoundedRect(handX - 8, handY - 7, 16, 13, 3);
      avatar.fillStyle(placeable === 'diamond vault' ? 0x55b8c5 : placeable === 'reinforced chest' ? 0x758885 : 0xa76a3b, 1);
      avatar.fillRoundedRect(handX - 6.5, handY - 5.5, 13, 10, 2);
      avatar.fillStyle(0xffe88c, 1);
      avatar.fillRect(handX - 1.5, handY - 1, 3, 4);
      return;
    }
    if (definition.interaction === 'rest') {
      avatar.fillStyle(outline, 1);
      avatar.fillTriangle(handX - 9, handY + 5, handX, handY - 10, handX + 9, handY + 5);
      avatar.fillStyle(placeable === 'stone shelter' ? 0x71898a : placeable === 'wooden shelter' ? 0xa46b43 : 0xf07a37, 1);
      avatar.fillTriangle(handX - 7, handY + 4, handX, handY - 7, handX + 7, handY + 4);
      return;
    }
    avatar.fillStyle(outline, 1);
    avatar.fillRoundedRect(handX - 8, handY - 5, 16, 10, 3);
    avatar.fillStyle(placeable === 'furnace' || placeable === 'anvil' ? 0x79898b : 0xa66c40, 1);
    avatar.fillRoundedRect(handX - 6.5, handY - 3.5, 13, 7, 2);
    if (placeable === 'upgrade table') {
      avatar.fillStyle(0x70d8d8, 1);
      avatar.fillCircle(handX, handY - 7, 3);
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
    if (this.isInsideInterior()) {
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
      MINIMAP_TILES_PER_CELL,
      this.sessionWorldState.getWaypoints()
        .map((waypoint) => ({ tileX: waypoint.tileX + 0.5, tileY: waypoint.tileY + 0.5 }))
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
    // A cave that can be entered is necessarily part of a loaded terrain chunk. Querying those
    // existing formations is exact, but avoids a 13 x 13 procedural scan (including reverse
    // linked-cave lookup) each time the player crosses a tile.
    const nearest = this.chunkManager.findNearbyCaveEntrance(
      this.player.x,
      this.player.y,
      CAVE_ENTRANCE_INTERACTION_RADIUS_PIXELS
    );

    this.nearbyCaveEntrance = nearest;
    if (!nearest) {
      return;
    }

    const mouth = caveMouthCenter(nearest);
    this.interactionHighlight
      .setRadius(Math.max(16, nearest.mouthForwardRadiusTiles * WORLD_TILE_SIZE * 0.15))
      .setPosition(mouth.x, mouth.y)
      .setVisible(true);
  }

  private updateLandmarkEntranceInteraction(force = false): void {
    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);
    if (!force && tileX === this.lastLandmarkEntranceTileX && tileY === this.lastLandmarkEntranceTileY) {
      return;
    }

    this.lastLandmarkEntranceTileX = tileX;
    this.lastLandmarkEntranceTileY = tileY;
    const entrance = this.chunkManager.findNearbyLandmarkEntrance(
      this.player.x,
      this.player.y,
      LANDMARK_ENTRANCE_INTERACTION_RADIUS_PIXELS
    );
    this.nearbyLandmarkEntrance = entrance;

    if (entrance) {
      this.surfaceLandmarkMaterialTarget = null;
      const visualPosition = landmarkEntranceVisualPosition(entrance);
      this.interactionHighlight
        .setRadius(38)
        .setPosition(visualPosition.worldX, visualPosition.worldY)
        .setVisible(true);
      this.drawLandmarkHint('Press E to enter', visualPosition.worldX, visualPosition.worldY - 54, 0x9ed9a5);
      return;
    }

    this.hideLandmarkHint();
    const material = this.chunkManager.findNearbyLandmarkMaterial(this.player.x, this.player.y, 88);
    this.surfaceLandmarkMaterialTarget = material;
    if (material) {
      this.interactionHighlight
        .setRadius(31)
        .setPosition(material.worldX, material.worldY)
        .setVisible(true);
      if (material.landmarkType === LandmarkType.StoneCircle
        && material.resource === ResourceType.RuneStone
        && material.style === 'rune-slab') {
        this.drawLandmarkHint('Press E to take rune', material.worldX, material.worldY - 58, 0xc78aff);
      }
    }
  }

  private takeNearbyStoneCircleRune(): boolean {
    const target = this.surfaceLandmarkMaterialTarget;
    if (!target
      || target.landmarkType !== LandmarkType.StoneCircle
      || target.resource !== ResourceType.RuneStone
      || target.style !== 'rune-slab') {
      return false;
    }
    if (!this.inventory.canAdd(target.resource, 1)) {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
      return true;
    }
    const regrowthDelayMs = stoneCircleRuneRegrowthDelayMs(
      this.worldSeed,
      target.id,
      this.sessionWorldState.worldAgeMs
    );
    if (!this.sessionWorldState.harvestLandmarkMaterial(target.id, regrowthDelayMs)) {
      this.updateLandmarkEntranceInteraction(true);
      return true;
    }
    this.inventory.add(target.resource, 1);
    this.showWorldFeedback(this.player.x, this.player.y - 28, '+ 1 Ancient Rune');
    this.handleInventoryChanged();
    this.surfaceLandmarkMaterialTarget = null;
    this.chunkManager.refreshLandmarkMaterial(target.id);
    this.updateLandmarkEntranceInteraction(true);
    return true;
  }

  private drawLandmarkHint(label: string, worldX: number, worldY: number, color: number): void {
    this.landmarkHint.setText(label).setPosition(worldX, worldY).setVisible(true);
    const paddingX = 13;
    const paddingY = 7;
    const width = Math.max(126, this.landmarkHint.width + paddingX * 2 + 18);
    const height = Math.max(31, this.landmarkHint.height + paddingY * 2);
    const left = worldX - width / 2;
    const top = worldY - height / 2;
    this.landmarkHintPanel.clear().setVisible(true);
    this.landmarkHintPanel.fillStyle(0x07130f, 0.93);
    this.landmarkHintPanel.fillRoundedRect(left, top, width, height, 9);
    this.landmarkHintPanel.lineStyle(1.6, color, 0.94);
    this.landmarkHintPanel.strokeRoundedRect(left, top, width, height, 9);
    this.landmarkHintPanel.fillStyle(color, 0.95);
    this.landmarkHintPanel.fillCircle(left + 14, worldY, 4.2);
  }

  private hideLandmarkHint(): void {
    this.landmarkHintPanel.clear().setVisible(false);
    this.landmarkHint.setVisible(false);
  }

  private tweenPlayerForLandmarkEntrance(
    worldX: number,
    worldY: number,
    duration: number,
    facingX: number,
    facingY: number
  ): Promise<void> {
    this.updateFacing(facingX, facingY);
    this.lastAvatarState = '';
    return new Promise((resolve) => {
      this.tweens.add({
        targets: this.player,
        x: worldX,
        y: worldY,
        duration,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          this.playerAvatar.setPosition(this.player.x, this.player.y);
        },
        onComplete: () => {
          this.player.setPosition(worldX, worldY);
          this.playerAvatar.setPosition(worldX, worldY);
          resolve();
        }
      });
    });
  }

  private async beginLandmarkEntranceSequence(entrance: LandmarkEntrance): Promise<void> {
    if (this.landmarkEntranceSequenceInProgress || this.caveTransitionInProgress) {
      return;
    }
    const returnWorldX = this.player.x;
    const returnWorldY = this.player.y;
    const usesAnimatedDoor = entrance.landmark.type === LandmarkType.GiantAncientTree
      || entrance.landmark.type === LandmarkType.Watchtower;
    if (!usesAnimatedDoor) {
      await this.enterLandmarkInterior(entrance.landmark, returnWorldX, returnWorldY);
      return;
    }

    this.landmarkEntranceSequenceInProgress = true;
    this.cancelHarvesting();
    this.cancelTonicDrinking();
    this.nearbyLandmarkEntrance = null;
    this.surfaceLandmarkMaterialTarget = null;
    this.interactionHighlight.setVisible(false);
    this.hideLandmarkHint();

    const landmarkCenterX = (entrance.landmark.centerTileX + 0.5) * WORLD_TILE_SIZE;
    const landmarkCenterY = (entrance.landmark.centerTileY + 0.5) * WORLD_TILE_SIZE;
    const radialX = entrance.worldX - landmarkCenterX;
    const radialY = entrance.worldY - landmarkCenterY;
    const radialLength = Math.max(1, Math.hypot(radialX, radialY));
    const outwardX = radialX / radialLength;
    const outwardY = radialY / radialLength;
    const radius = entrance.landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
    const grabDistance = Math.max(34, radius * 0.09);
    const pullDistance = Math.max(16, radius * 0.045);

    try {
      // Approach the closed door, brace backward while it swings outward, then walk through the
      // revealed opening. Player input stays locked for this short authored sequence.
      await this.tweenPlayerForLandmarkEntrance(
        entrance.worldX + outwardX * grabDistance,
        entrance.worldY + outwardY * grabDistance,
        280,
        -outwardX,
        -outwardY
      );
      await Promise.all([
        this.chunkManager.animateLandmarkDoorOpen(entrance.landmark.id),
        this.tweenPlayerForLandmarkEntrance(
          entrance.worldX + outwardX * (grabDistance + pullDistance),
          entrance.worldY + outwardY * (grabDistance + pullDistance),
          620,
          -outwardX,
          -outwardY
        )
      ]);
      await this.tweenPlayerForLandmarkEntrance(
        entrance.worldX - outwardX * radius * 0.19,
        entrance.worldY - outwardY * radius * 0.19,
        430,
        -outwardX,
        -outwardY
      );
      await this.enterLandmarkInterior(entrance.landmark, returnWorldX, returnWorldY);
    } catch (error) {
      console.error(`Wildbound could not complete the ${entrance.landmark.type} entrance sequence.`, error);
      this.player.setPosition(returnWorldX, returnWorldY);
      this.playerAvatar.setPosition(returnWorldX, returnWorldY);
      this.updateLandmarkEntranceInteraction(true);
    } finally {
      this.chunkManager.resetLandmarkDoor(entrance.landmark.id);
      this.landmarkEntranceSequenceInProgress = false;
    }
  }

  private async enterLandmarkInterior(
    landmark: ProceduralLandmark,
    returnWorldX: number,
    returnWorldY: number,
    markDirty = true,
    continueExistingLoading = false,
    floorNumber: LandmarkInteriorFloor = 1
  ): Promise<void> {
    if (this.caveTransitionInProgress || !isLandmarkInteriorType(landmark.type)) {
      return;
    }

    this.caveTransitionInProgress = true;
    this.worldReady = false;
    this.ambientAudio?.setSwimming(false, false, false);
    this.footstepElapsedMs = 0;
    this.showTerrainLoading(continueExistingLoading);
    this.cancelHarvesting();
    this.nearbyLandmarkEntrance = null;
    this.nearbyCaveEntrance = null;
    this.landmarkInteriorExitNearby = false;
    this.landmarkInteriorStairTarget = null;
    this.surfaceLandmarkMaterialTarget = null;
    this.interactionHighlight.setVisible(false);
    this.hideLandmarkHint();
    this.dropHighlight.setVisible(false);
    this.dropHintPanel.clear().setVisible(false);
    this.dropHint.setVisible(false);

    try {
      await this.waitForTerrainLoadingPaint();
      const layout = generateLandmarkInterior(this.worldSeed, landmark, floorNumber);
      const origin = landmarkInteriorWorldOrigin(this.worldSeed, landmark, floorNumber);
      this.updateLoadingProgress(58, 100, `Growing ${layout.themeLabel}`);
      await this.waitForTerrainLoadingPaint();

      this.activeLandmarkInterior = {
        landmark: landmark as ProceduralLandmark & { readonly type: LandmarkInteriorType },
        layout,
        origin,
        materialBuckets: createLandmarkMaterialBuckets(layout.materialNodes),
        returnWorldX,
        returnWorldY
      };
      this.setCaveLightingActive(true);
      this.caveFogOverlay.classList.remove('is-visible');
      this.caveGraphics.clear().setVisible(false);
      this.caveLavaGraphics.clear().setVisible(false);
      this.caveEntranceLightGraphics.clear().setVisible(false);
      const spawn = landmarkInteriorWorldTilePosition(origin, layout.spawnTileX, layout.spawnTileY);
      this.player.setPosition(spawn.x, spawn.y);
      this.cameras.main.centerOn(spawn.x, spawn.y);
      this.isSwimming = false;
      this.isSwimmingInSwampWater = false;
      this.terrainSurface = layout.themeId === 'watchtower'
        ? `${layout.floorLabel} · floor ${layout.floorNumber}`
        : layout.floorLabel;
      this.minimapOverlay.setVisible(false);
      this.drawActiveLandmarkInterior();
      this.lastLandmarkInteriorAccentFrame = Number.NEGATIVE_INFINITY;
      this.updateLandmarkInteriorAccents(this.time.now, true);
      this.updateLoadingProgress(91, 100, `Entering ${layout.themeLabel}`);
      await this.waitForTerrainLoadingPaint();
      this.updateLandmarkInteriorInteraction(true);
      this.updateDropInteraction(0, true);
      this.updatePlayerAvatar(0, false);
      if (markDirty) {
        this.markSaveDirty();
      }
      await this.finishTerrainLoading();
    } catch (error) {
      this.activeLandmarkInterior = null;
      this.landmarkInteriorGraphics.clear().setVisible(false);
      this.landmarkInteriorAccentGraphics.clear().setVisible(false);
      this.setCaveLightingActive(false);
      this.player.setPosition(returnWorldX, returnWorldY);
      this.cameras.main.centerOn(returnWorldX, returnWorldY);
      this.currentTopography = this.chunkManager.getTopographyAt(returnWorldX, returnWorldY);
      this.terrainSurface = this.currentTopography.surface;
      this.updateInteractionTarget(true);
      this.updateCaveEntranceInteraction(true);
      this.updateLandmarkEntranceInteraction(true);
      this.recoverFromTerrainLoadingFailure('enter the landmark', error);
    }
  }

  private async exitLandmarkInterior(): Promise<void> {
    const interior = this.activeLandmarkInterior;
    if (!interior || this.caveTransitionInProgress) {
      return;
    }

    this.caveTransitionInProgress = true;
    this.worldReady = false;
    this.ambientAudio?.setSwimming(false, false, false);
    this.footstepElapsedMs = 0;
    this.showTerrainLoading();
    this.cancelHarvesting();
    this.hideLandmarkHint();

    try {
      await this.waitForTerrainLoadingPaint();
      await this.chunkManager.prime(interior.returnWorldX, interior.returnWorldY, (progress) => {
        const ratio = progress.completed / Math.max(1, progress.total);
        this.updateLoadingProgress(8 + ratio * 82, 100, 'Returning to the wilderness');
      });
      this.updateLoadingProgress(93, 100, 'Returning to the wilderness');
      await this.waitForTerrainLoadingPaint();

      this.activeLandmarkInterior = null;
      this.landmarkInteriorExitNearby = false;
      this.landmarkInteriorStairTarget = null;
      this.interiorLandmarkMaterialTarget = null;
      this.interiorLandmarkHarvestMaterial = null;
      this.landmarkInteriorGraphics.clear().setVisible(false);
      this.landmarkInteriorAccentGraphics.clear().setVisible(false);
      this.setCaveLightingActive(false);
      this.player.setPosition(interior.returnWorldX, interior.returnWorldY);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.currentTopography = this.chunkManager.getTopographyAt(this.player.x, this.player.y);
      this.terrainSurface = this.currentTopography.surface;
      this.placeableManager.refresh(this.player.x, this.player.y);
      this.updateSwimmingState(true);
      this.chunkManager.update(this.player.x, this.player.y, this.time.now);
      this.updateInteractionTarget(true);
      this.updateCaveEntranceInteraction(true);
      this.updateLandmarkEntranceInteraction(true);
      this.updateDropInteraction(0, true);
      this.minimapOverlay.setVisible(true);
      this.lastMinimapUpdateMs = Number.NEGATIVE_INFINITY;
      this.lastMinimapTileX = Number.NaN;
      this.lastMinimapTileY = Number.NaN;
      this.updateMinimap(0, true);
      this.updatePlayerAvatar(0, false);
      this.markSaveDirty();
      await this.finishTerrainLoading();
    } catch (error) {
      this.recoverFromTerrainLoadingFailure('leave the landmark', error);
    }
  }

  private async changeWatchtowerFloor(stair: LandmarkInteriorStair): Promise<void> {
    const previous = this.activeLandmarkInterior;
    if (!previous || previous.landmark.type !== LandmarkType.Watchtower || this.caveTransitionInProgress) {
      return;
    }

    this.caveTransitionInProgress = true;
    this.worldReady = false;
    this.cancelHarvesting();
    this.landmarkInteriorStairTarget = null;
    this.landmarkInteriorExitNearby = false;
    this.interactionHighlight.setVisible(false);
    this.hideLandmarkHint();
    this.cameras.main.fadeOut(170, 13, 17, 18);
    await new Promise<void>((resolve) => this.time.delayedCall(175, () => resolve()));

    try {
      const layout = generateLandmarkInterior(this.worldSeed, previous.landmark, stair.targetFloor);
      const origin = landmarkInteriorWorldOrigin(this.worldSeed, previous.landmark, stair.targetFloor);
      this.activeLandmarkInterior = {
        landmark: previous.landmark,
        layout,
        origin,
        materialBuckets: createLandmarkMaterialBuckets(layout.materialNodes),
        returnWorldX: previous.returnWorldX,
        returnWorldY: previous.returnWorldY
      };

      const arrivalStair = layout.stairs.find((candidate) => candidate.targetFloor === previous.layout.floorNumber);
      const arrivalTile = arrivalStair ?? { tileX: layout.spawnTileX, tileY: layout.spawnTileY };
      const arrival = landmarkInteriorWorldTilePosition(origin, arrivalTile.tileX, arrivalTile.tileY);
      let arrivalX = arrival.x;
      let arrivalY = arrival.y;
      const room = layout.terrain.rooms[0];
      if (arrivalStair && room) {
        const stairTileX = arrivalStair.tileX + 0.5;
        const stairTileY = arrivalStair.tileY + 0.5;
        const deltaX = room.x - stairTileX;
        const deltaY = room.y - stairTileY;
        const length = Math.max(0.001, Math.hypot(deltaX, deltaY));
        arrivalX += deltaX / length * WORLD_TILE_SIZE * 1.45;
        arrivalY += deltaY / length * WORLD_TILE_SIZE * 1.45;
      }
      this.player.setPosition(arrivalX, arrivalY);
      this.cameras.main.centerOn(arrivalX, arrivalY);
      this.terrainSurface = `${layout.floorLabel} · floor ${layout.floorNumber}`;
      this.drawActiveLandmarkInterior();
      this.lastLandmarkInteriorAccentFrame = Number.NEGATIVE_INFINITY;
      this.updateLandmarkInteriorAccents(this.time.now, true);
      this.updateLandmarkInteriorInteraction(true);
      this.updateDropInteraction(this.time.now, true);
      this.updatePlayerAvatar(0, false);
      this.markSaveDirty();
      this.cameras.main.fadeIn(190, 13, 17, 18);
    } catch (error) {
      this.activeLandmarkInterior = previous;
      this.drawActiveLandmarkInterior();
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.cameras.main.fadeIn(190, 13, 17, 18);
      console.error('Wildbound could not change watchtower floors.', error);
    } finally {
      this.worldReady = true;
      this.caveTransitionInProgress = false;
    }
  }

  private landmarkInteriorRoomPoints(
    room: LandmarkInteriorRoom,
    origin: LandmarkInteriorWorldPoint,
    radiusScale = 1
  ): CaveRenderPoint[] {
    const points: CaveRenderPoint[] = [];
    const pointCount = room.shape === 'ellipse' ? 58 : 48;
    const cosine = Math.cos(room.rotation);
    const sine = Math.sin(room.rotation);
    for (let index = 0; index < pointCount; index += 1) {
      const angle = index / pointCount * Math.PI * 2;
      let localX: number;
      let localY: number;
      if (room.shape === 'ellipse') {
        const boundary = 1
          + Math.sin(angle * room.edgeFrequency + room.edgePhase) * room.edgeRoughness
          + Math.sin(angle * (room.edgeFrequency + 2) - room.edgePhase * 0.63) * room.edgeRoughness * 0.38;
        localX = Math.cos(angle) * room.radiusX * boundary * radiusScale;
        localY = Math.sin(angle) * room.radiusY * boundary * radiusScale;
      } else {
        // A high-order superellipse gives the watchtower's rooms genuinely square masonry
        // corners while retaining the seeded lean and weathered edge variation.
        const exponent = 0.24;
        const edge = 1 + Math.sin(angle * room.edgeFrequency + room.edgePhase) * room.edgeRoughness * 0.25;
        localX = Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** exponent
          * room.radiusX * edge * radiusScale;
        localY = Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** exponent
          * room.radiusY * edge * radiusScale;
      }
      points.push({
        x: origin.x + (room.x + localX * cosine - localY * sine) * WORLD_TILE_SIZE,
        y: origin.y + (room.y + localX * sine + localY * cosine) * WORLD_TILE_SIZE
      });
    }
    return points;
  }

  private drawActiveLandmarkInterior(): void {
    const interior = this.activeLandmarkInterior;
    if (!interior) {
      return;
    }
    const graphics = this.landmarkInteriorGraphics;
    const { layout, origin } = interior;
    const palette = layout.palette;
    graphics.clear().setVisible(true);
    graphics.fillStyle(palette.background, 1);
    graphics.fillRect(
      origin.x - WORLD_TILE_SIZE * 2,
      origin.y - WORLD_TILE_SIZE * 2,
      (layout.width + 4) * WORLD_TILE_SIZE,
      (layout.height + 4) * WORLD_TILE_SIZE
    );

    // Passages are rendered beneath chambers in four concentric, rounded layers. The same
    // analytic centerlines drive collision, so a corridor never reads as a disconnected icon.
    const drawPassages = (extraWidth: number, color: number, alpha: number): void => {
      layout.terrain.passages.forEach((passage) => {
        for (let index = 1; index < passage.points.length; index += 1) {
          const from = passage.points[index - 1];
          const to = passage.points[index];
          const averageRadius = (from.radius + to.radius) * 0.5 * WORLD_TILE_SIZE;
          graphics.lineStyle(Math.max(2, averageRadius * 2 + extraWidth), color, alpha);
          graphics.lineBetween(
            origin.x + from.x * WORLD_TILE_SIZE,
            origin.y + from.y * WORLD_TILE_SIZE,
            origin.x + to.x * WORLD_TILE_SIZE,
            origin.y + to.y * WORLD_TILE_SIZE
          );
        }
        passage.points.forEach((point) => {
          graphics.fillStyle(color, alpha);
          graphics.fillCircle(
            origin.x + point.x * WORLD_TILE_SIZE,
            origin.y + point.y * WORLD_TILE_SIZE,
            point.radius * WORLD_TILE_SIZE + extraWidth * 0.5
          );
        });
      });
    };
    drawPassages(52, palette.wallShadow, 1);
    drawPassages(34, palette.wallBase, 1);
    drawPassages(16, palette.wallHighlight, 0.96);
    drawPassages(-2, palette.floorBase, 1);

    layout.terrain.rooms.forEach((room) => {
      graphics.fillStyle(palette.wallShadow, 1);
      graphics.fillPoints(this.landmarkInteriorRoomPoints(room, origin, 1.065), true);
      graphics.fillStyle(palette.wallBase, 1);
      graphics.fillPoints(this.landmarkInteriorRoomPoints(room, origin, 1.035), true);
      graphics.fillStyle(palette.wallHighlight, 0.94);
      graphics.fillPoints(this.landmarkInteriorRoomPoints(room, origin, 1.014), true);
      graphics.fillStyle(palette.floorBase, 1);
      graphics.fillPoints(this.landmarkInteriorRoomPoints(room, origin), true);
    });

    if (layout.themeId === 'hollow-tree') {
      this.drawAncientTreeInteriorArchitecture(interior);
    } else if (layout.themeId === 'watchtower') {
      this.drawWatchtowerInteriorArchitecture(interior);
    }
    this.drawLandmarkInteriorFloorTexture(interior);
    if (layout.themeId === 'watchtower' && layout.floorNumber === 3) {
      this.drawWatchtowerCartographyFurniture(interior);
    }
    layout.decorations.filter((decoration) => decoration.layer === 'floor')
      .forEach((decoration) => this.drawLandmarkInteriorDecoration(decoration, interior));
    if (layout.exit) {
      this.drawLandmarkInteriorExit(interior);
    }
    this.drawLandmarkInteriorStairs(interior);
    layout.decorations.filter((decoration) => decoration.layer === 'object')
      .forEach((decoration) => this.drawLandmarkInteriorDecoration(decoration, interior));
    layout.materialNodes.forEach((material) => {
      if (this.sessionWorldState.isLandmarkMaterialHarvested(material.id)) {
        this.drawHarvestedLandmarkMaterial(material, interior);
      } else {
        this.drawLandmarkInteriorMaterial(material, interior);
      }
    });
    layout.decorations.filter((decoration) => decoration.layer === 'overhead')
      .forEach((decoration) => this.drawLandmarkInteriorDecoration(decoration, interior));
  }

  private drawAncientTreeInteriorArchitecture(interior: ActiveLandmarkInterior): void {
    const room = interior.layout.terrain.rooms[0];
    if (!room) {
      return;
    }
    const graphics = this.landmarkInteriorGraphics;
    const palette = interior.layout.palette;
    const centerX = interior.origin.x + room.x * WORLD_TILE_SIZE;
    const centerY = interior.origin.y + room.y * WORLD_TILE_SIZE;
    const cosine = Math.cos(room.rotation);
    const sine = Math.sin(room.rotation);
    const radialPoint = (angle: number, radiusScale: number): CaveRenderPoint => {
      const localX = Math.cos(angle) * room.radiusX * WORLD_TILE_SIZE * radiusScale;
      const localY = Math.sin(angle) * room.radiusY * WORLD_TILE_SIZE * radiusScale;
      return {
        x: centerX + localX * cosine - localY * sine,
        y: centerY + localX * sine + localY * cosine
      };
    };

    // These nested grain lines make the room read as one continuous hollow trunk. They are
    // deliberately static, with all variation derived from the landmark seed.
    [0.965, 0.93, 0.885, 0.82].forEach((scale, index) => {
      graphics.lineStyle(2.6 - index * 0.35, index % 2 ? palette.floorAccent : palette.wallHighlight, 0.23 + index * 0.035);
      graphics.strokePoints(this.landmarkInteriorRoomPoints(room, interior.origin, scale), true);
    });

    for (let root = 0; root < 18; root += 1) {
      const seeded = this.landmarkInteriorVisualRandom(interior, root, room.edgeFrequency, 0x4a91);
      const angle = root / 18 * Math.PI * 2 + (seeded - 0.5) * 0.18;
      const halfWidth = 0.022 + seeded * 0.018;
      const outerLeft = radialPoint(angle - halfWidth, 0.965);
      const outerRight = radialPoint(angle + halfWidth, 0.965);
      const innerRight = radialPoint(angle + halfWidth * 0.3, 0.58 + seeded * 0.17);
      const innerLeft = radialPoint(angle - halfWidth * 0.3, 0.58 + seeded * 0.17);
      const ridge = radialPoint(angle, 0.69 + seeded * 0.12);
      const outer = radialPoint(angle, 0.95);
      graphics.fillStyle(root % 3 === 0 ? palette.wallBase : palette.floorAccent, 0.19 + seeded * 0.08);
      graphics.fillPoints([outerLeft, outerRight, innerRight, innerLeft], true);
      graphics.lineStyle(1.3 + seeded, palette.wallHighlight, 0.3);
      graphics.lineBetween(outer.x, outer.y, ridge.x, ridge.y);
      graphics.lineStyle(1, palette.wallShadow, 0.46);
      graphics.lineBetween(outerLeft.x, outerLeft.y, innerLeft.x, innerLeft.y);
    }
  }

  private drawWatchtowerInteriorArchitecture(interior: ActiveLandmarkInterior): void {
    const room = interior.layout.terrain.rooms[0];
    if (!room) return;
    const graphics = this.landmarkInteriorGraphics;
    const palette = interior.layout.palette;
    const centerX = interior.origin.x + room.x * WORLD_TILE_SIZE;
    const centerY = interior.origin.y + room.y * WORLD_TILE_SIZE;

    // Layered inner masonry preserves the existing stone-wall language while making the circular
    // footprint read as a single tower shell instead of a painted floor floating in darkness.
    [0.988, 0.971, 0.948].forEach((scale, index) => {
      graphics.lineStyle(7 - index * 1.7, index === 1 ? palette.wallBase : palette.wallHighlight, 0.62 - index * 0.1);
      graphics.strokePoints(this.landmarkInteriorRoomPoints(room, interior.origin, scale), true);
    });
    for (let stone = 0; stone < 44; stone += 1) {
      const seeded = this.landmarkInteriorVisualRandom(interior, stone, interior.layout.floorNumber, 0x7a41);
      const angle = stone / 44 * Math.PI * 2 + (seeded - 0.5) * 0.025;
      const x = centerX + Math.cos(angle) * room.radiusX * WORLD_TILE_SIZE * 0.964;
      const y = centerY + Math.sin(angle) * room.radiusY * WORLD_TILE_SIZE * 0.964;
      graphics.fillStyle(stone % 3 === 0 ? palette.wallHighlight : palette.wallBase, 0.36 + seeded * 0.18);
      graphics.fillEllipse(x, y, 19 + seeded * 12, 11 + (1 - seeded) * 7);
      graphics.lineStyle(1, palette.wallShadow, 0.42);
      graphics.strokeEllipse(x, y, 19 + seeded * 12, 11 + (1 - seeded) * 7);
    }

    // Structural joists remain beneath the detailed boards. Their restrained contrast gives the
    // room believable construction without turning the floor into a radial icon.
    for (let joist = 0; joist < 8; joist += 1) {
      const angle = joist / 8 * Math.PI;
      const reachX = Math.cos(angle) * room.radiusX * WORLD_TILE_SIZE * 0.82;
      const reachY = Math.sin(angle) * room.radiusY * WORLD_TILE_SIZE * 0.82;
      graphics.lineStyle(8, palette.wallShadow, 0.24);
      graphics.lineBetween(centerX - reachX, centerY - reachY, centerX + reachX, centerY + reachY);
      graphics.lineStyle(2, palette.floorDetail, 0.18);
      graphics.lineBetween(centerX - reachX, centerY - reachY - 2, centerX + reachX, centerY + reachY - 2);
    }

    if (interior.layout.floorNumber === 3) {
      graphics.lineStyle(3, palette.primaryAccent, 0.48);
      graphics.strokeCircle(centerX, centerY, 78);
      graphics.strokeCircle(centerX, centerY, 63);
      for (let point = 0; point < 16; point += 1) {
        const angle = point / 16 * Math.PI * 2;
        const outerRadius = point % 2 ? 76 : 62;
        graphics.lineBetween(
          centerX + Math.cos(angle) * 25,
          centerY + Math.sin(angle) * 25,
          centerX + Math.cos(angle) * outerRadius,
          centerY + Math.sin(angle) * outerRadius
        );
      }
      graphics.fillStyle(palette.primaryAccent, 0.56);
      graphics.fillCircle(centerX, centerY, 7);
    }
  }

  private drawLandmarkInteriorStairs(interior: ActiveLandmarkInterior): void {
    const graphics = this.landmarkInteriorGraphics;
    const palette = interior.layout.palette;
    interior.layout.stairs.forEach((stair) => {
      const position = landmarkInteriorWorldTilePosition(interior.origin, stair.tileX, stair.tileY);
      const pointsUp = stair.direction === 'up';
      graphics.fillStyle(palette.wallShadow, 0.94);
      graphics.fillEllipse(position.x, position.y + (pointsUp ? -2 : 5), 126, 82);
      graphics.lineStyle(5, palette.wallBase, 0.98);
      graphics.strokeEllipse(position.x, position.y + 2, 122, 78);
      for (let step = 0; step < 7; step += 1) {
        const progress = step / 6;
        const width = 92 - progress * 36;
        const y = position.y + (pointsUp ? 27 - step * 9 : -27 + step * 9);
        graphics.fillStyle(step % 2 ? palette.floorAccent : palette.floorDetail, 0.98);
        graphics.fillRoundedRect(position.x - width * 0.5, y - 5, width, 10, 2);
        graphics.lineStyle(1.5, palette.wallShadow, 0.75);
        graphics.lineBetween(position.x - width * 0.5 + 3, y + 4, position.x + width * 0.5 - 3, y + 4);
        for (let grain = -1; grain <= 1; grain += 1) {
          graphics.lineStyle(1, palette.floorBase, 0.34);
          graphics.lineBetween(position.x - width * 0.37, y + grain * 2, position.x + width * 0.31, y + grain * 2);
        }
      }
      graphics.lineStyle(5, palette.primaryAccent, 0.82);
      graphics.lineBetween(position.x - 56, position.y - 32, position.x - 43, position.y + 34);
      graphics.lineBetween(position.x + 56, position.y - 32, position.x + 43, position.y + 34);
      for (let rail = -1; rail <= 1; rail += 2) {
        graphics.fillStyle(palette.primaryAccent, 0.9);
        graphics.fillCircle(position.x + rail * 54, position.y - 32, 5);
      }
    });
  }

  private drawWatchtowerCartographyFurniture(interior: ActiveLandmarkInterior): void {
    const map = interior.layout.materialNodes.find((material) => material.resource === ResourceType.MapFragments);
    const room = interior.layout.terrain.rooms[0];
    if (!map || !room) return;
    const graphics = this.landmarkInteriorGraphics;
    const palette = interior.layout.palette;
    const position = landmarkInteriorWorldTilePosition(interior.origin, map.tileX, map.tileY);
    const scale = map.scale * 1.22;
    const point = (x: number, y: number): CaveRenderPoint => this.rotatedInteriorPoint(
      position.x, position.y, x * scale, y * scale, map.rotation
    );
    const shadow = [point(-52, -27), point(52, -27), point(46, 34), point(-46, 34)];
    graphics.fillStyle(palette.wallShadow, 0.98);
    graphics.fillPoints(shadow, true);
    const tabletop = [point(-49, -32), point(49, -32), point(45, 24), point(-45, 24)];
    graphics.fillStyle(palette.floorAccent, 1);
    graphics.fillPoints(tabletop, true);
    graphics.lineStyle(5 * scale, palette.primaryAccent, 0.9);
    graphics.strokePoints(tabletop, true);
    for (let board = -1; board <= 1; board += 1) {
      const from = point(-43, board * 15 - 4);
      const to = point(43, board * 15 - 4);
      graphics.lineStyle(1.3 * scale, palette.wallShadow, 0.55);
      graphics.lineBetween(from.x, from.y, to.x, to.y);
    }
    for (let leg = -1; leg <= 1; leg += 2) {
      const top = point(leg * 34, 24);
      const bottom = point(leg * 36, 43);
      graphics.lineStyle(9 * scale, palette.wallShadow, 0.94);
      graphics.lineBetween(top.x, top.y, bottom.x, bottom.y);
      graphics.lineStyle(2 * scale, palette.floorDetail, 0.42);
      graphics.lineBetween(top.x, top.y, bottom.x, bottom.y);
    }

    const centerX = interior.origin.x + room.x * WORLD_TILE_SIZE;
    const centerY = interior.origin.y + room.y * WORLD_TILE_SIZE;
    // Curved archive cabinets and rolled charts occupy the back wall without blocking the path
    // between the arrival stair and drafting table.
    for (let cabinet = -1; cabinet <= 1; cabinet += 1) {
      const x = centerX + cabinet * 128;
      const y = centerY - room.radiusY * WORLD_TILE_SIZE * 0.67 + Math.abs(cabinet) * 20;
      graphics.fillStyle(palette.wallShadow, 0.94);
      graphics.fillRoundedRect(x - 54, y - 24, 108, 48, 7);
      graphics.fillStyle(palette.floorAccent, 0.96);
      graphics.fillRoundedRect(x - 49, y - 20, 98, 39, 5);
      graphics.lineStyle(2, palette.primaryAccent, 0.7);
      graphics.strokeRoundedRect(x - 49, y - 20, 98, 39, 5);
      for (let roll = 0; roll < 6; roll += 1) {
        const rollX = x - 37 + roll * 15;
        graphics.fillStyle(roll % 2 ? 0xd2c092 : 0x9d8a63, 0.92);
        graphics.fillRoundedRect(rollX - 5, y - 12 + (roll % 3) * 3, 10, 25 - (roll % 3) * 3, 3);
        graphics.fillStyle(palette.wallShadow, 0.65);
        graphics.fillCircle(rollX, y - 10 + (roll % 3) * 3, 2.3);
      }
    }

    const instrumentX = centerX + room.radiusX * WORLD_TILE_SIZE * 0.47;
    const instrumentY = centerY - 10;
    graphics.fillStyle(palette.wallShadow, 0.8);
    graphics.fillEllipse(instrumentX, instrumentY + 18, 72, 34);
    graphics.lineStyle(5, palette.primaryAccent, 0.88);
    graphics.strokeCircle(instrumentX, instrumentY, 28);
    graphics.strokeCircle(instrumentX, instrumentY, 17);
    for (let spoke = 0; spoke < 8; spoke += 1) {
      const angle = spoke / 8 * Math.PI * 2;
      graphics.lineBetween(
        instrumentX + Math.cos(angle) * 8,
        instrumentY + Math.sin(angle) * 8,
        instrumentX + Math.cos(angle) * 25,
        instrumentY + Math.sin(angle) * 25
      );
    }
    graphics.fillStyle(palette.glow, 0.52);
    graphics.fillCircle(instrumentX, instrumentY, 7);
  }

  private landmarkInteriorVisualRandom(
    interior: ActiveLandmarkInterior,
    tileX: number,
    tileY: number,
    salt: number
  ): number {
    return randomAtTile(
      this.worldSeed,
      interior.landmark.centerTileX * 131 + tileX * 17,
      interior.landmark.centerTileY * 137 + tileY * 19,
      salt
    );
  }

  private drawLandmarkInteriorFloorTexture(interior: ActiveLandmarkInterior): void {
    const { layout, origin } = interior;
    const graphics = this.landmarkInteriorGraphics;
    for (let tileY = 0; tileY < layout.height; tileY += 1) {
      for (let tileX = 0; tileX < layout.width; tileX += 1) {
        if (!layout.floorTiles[tileY]?.[tileX]) {
          continue;
        }
        const random = this.landmarkInteriorVisualRandom(interior, tileX, tileY, 0x6b93);
        const centerX = origin.x + (tileX + 0.5) * WORLD_TILE_SIZE;
        const centerY = origin.y + (tileY + 0.5) * WORLD_TILE_SIZE;
        if (layout.themeId === 'watchtower') {
          const left = origin.x + tileX * WORLD_TILE_SIZE;
          const top = origin.y + tileY * WORLD_TILE_SIZE;
          const boardColor = random > 0.58 ? layout.palette.floorAccent : layout.palette.floorBase;
          graphics.fillStyle(boardColor, 0.24 + random * 0.12);
          graphics.fillRect(left, top, WORLD_TILE_SIZE, WORLD_TILE_SIZE);
          // Two long, staggered boards per tile keep seams continuous across tile boundaries.
          [0, WORLD_TILE_SIZE * 0.5].forEach((offsetY, row) => {
            graphics.lineStyle(2, layout.palette.wallShadow, 0.62);
            graphics.lineBetween(left, top + offsetY, left + WORLD_TILE_SIZE, top + offsetY);
            const jointAtLeft = (tileX + tileY + row) % 3 === 0;
            if (jointAtLeft) {
              graphics.lineStyle(1.6, layout.palette.wallShadow, 0.56);
              graphics.lineBetween(left + 1, top + offsetY + 2, left + 1, top + offsetY + 14);
            }
            for (let grain = 0; grain < 3; grain += 1) {
              const grainRandom = this.landmarkInteriorVisualRandom(
                interior,
                tileX * 7 + grain,
                tileY * 5 + row,
                0x5d21 + layout.floorNumber * 29
              );
              const grainY = top + offsetY + 4 + grain * 3.5 + grainRandom * 2;
              const inset = 3 + grainRandom * 7;
              graphics.lineStyle(0.8 + grainRandom * 0.7, layout.palette.floorDetail, 0.17 + grainRandom * 0.2);
              graphics.lineBetween(left + inset, grainY, left + WORLD_TILE_SIZE - 3, grainY + (grainRandom - 0.5) * 2);
            }
          });
          if (random > 0.72) {
            graphics.fillStyle(layout.palette.primaryAccent, 0.48);
            graphics.fillCircle(left + 4 + random * 22, top + 8 + (tileY % 2) * 16, 1.7);
          }
        } else if (random > 0.43) {
          const angle = this.landmarkInteriorVisualRandom(interior, tileX, tileY, 0x73d1) * Math.PI * 2;
          const length = 5 + random * 12;
          graphics.lineStyle(1.2, layout.palette.floorDetail, 0.16 + random * 0.2);
          graphics.lineBetween(
            centerX - Math.cos(angle) * length,
            centerY - Math.sin(angle) * length * 0.35,
            centerX + Math.cos(angle) * length,
            centerY + Math.sin(angle) * length * 0.35
          );
          if (layout.themeId === 'hollow-tree' && random > 0.78) {
            graphics.lineStyle(1.4, layout.palette.floorAccent, 0.34);
            graphics.strokeEllipse(centerX, centerY, 11 + random * 9, 5 + random * 5);
          }
        }
      }
    }
  }

  private landmarkInteriorDecorationPosition(
    decoration: LandmarkInteriorDecoration,
    interior: ActiveLandmarkInterior
  ): LandmarkInteriorWorldPoint {
    return landmarkInteriorWorldTilePosition(interior.origin, decoration.tileX, decoration.tileY);
  }

  private rotatedInteriorPoint(
    centerX: number,
    centerY: number,
    offsetX: number,
    offsetY: number,
    rotation: number
  ): CaveRenderPoint {
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    return {
      x: centerX + offsetX * cosine - offsetY * sine,
      y: centerY + offsetX * sine + offsetY * cosine
    };
  }

  private drawLandmarkInteriorDecoration(
    decoration: LandmarkInteriorDecoration,
    interior: ActiveLandmarkInterior
  ): void {
    const graphics = this.landmarkInteriorGraphics;
    const position = this.landmarkInteriorDecorationPosition(decoration, interior);
    const scale = decoration.scale;
    const alpha = decoration.opacity;
    const palette = interior.layout.palette;
    const point = (x: number, y: number): CaveRenderPoint => this.rotatedInteriorPoint(
      position.x, position.y, x * scale, y * scale, decoration.rotation
    );
    const line = (fromX: number, fromY: number, toX: number, toY: number, width: number, color: number, opacity = alpha): void => {
      const from = point(fromX, fromY);
      const to = point(toX, toY);
      graphics.lineStyle(width * scale, color, opacity);
      graphics.lineBetween(from.x, from.y, to.x, to.y);
    };

    switch (decoration.kind) {
      case 'moss-carpet':
        for (let tuft = 0; tuft < 13; tuft += 1) {
          const angle = decoration.rotation + tuft * 2.399;
          const distance = (4 + (tuft % 5) * 7) * scale;
          const tuftX = position.x + Math.cos(angle) * distance;
          const tuftY = position.y + Math.sin(angle) * distance * 0.58;
          graphics.fillStyle(
            tuft % 3 === 0 ? palette.glow : palette.secondaryAccent,
            alpha * (tuft % 3 === 0 ? 0.18 : 0.54)
          );
          graphics.fillEllipse(tuftX, tuftY, (11 + tuft % 4 * 3) * scale, (5 + tuft % 3 * 2) * scale);
          if (tuft % 2 === 0) {
            graphics.lineStyle(1.1 * scale, palette.wallHighlight, alpha * 0.24);
            graphics.lineBetween(tuftX, tuftY, tuftX + Math.cos(angle) * 7 * scale, tuftY - 5 * scale);
          }
        }
        break;
      case 'growth-rings':
        graphics.lineStyle(1.4 * scale, palette.floorDetail, alpha * 0.7);
        for (let ring = 0; ring < 3; ring += 1) {
          graphics.strokeEllipse(position.x, position.y, (25 + ring * 13) * scale, (10 + ring * 6) * scale);
        }
        break;
      case 'root-ridge':
      case 'bark-rib':
        line(-30, 0, 30, 0, decoration.kind === 'root-ridge' ? 10 : 7, palette.wallBase);
        line(-27, -2, 27, -2, 2, palette.wallHighlight, alpha * 0.74);
        line(-21, 3, 16, 3, 1.3, palette.wallShadow, alpha * 0.82);
        break;
      case 'sap-runnel':
      case 'rivulet': {
        const color = decoration.kind === 'sap-runnel' ? palette.primaryAccent : palette.water;
        const a = point(-26, -3);
        const b = point(-5, 4);
        const c = point(24, -2);
        graphics.lineStyle(7 * scale, color, alpha * 0.45);
        graphics.strokePoints([a, b, c], false);
        graphics.lineStyle(2 * scale, palette.wallHighlight, alpha * 0.58);
        graphics.strokePoints([a, b, c], false);
        break;
      }
      case 'spore-cluster':
      case 'firefly-motes':
        for (let mote = 0; mote < 7; mote += 1) {
          const angle = decoration.rotation + mote * 2.399;
          const distance = (6 + (mote % 3) * 7) * scale;
          graphics.fillStyle(palette.glow, alpha * (0.45 + (mote % 2) * 0.3));
          graphics.fillCircle(position.x + Math.cos(angle) * distance, position.y + Math.sin(angle) * distance, (1.8 + mote % 3) * scale);
        }
        break;
      case 'hanging-vines':
        for (let vine = -2; vine <= 2; vine += 1) {
          line(vine * 7, -27, vine * 6 + (vine % 2) * 4, 26, 2.5, palette.secondaryAccent, alpha * 0.85);
          const leaf = point(vine * 6 + (vine % 2) * 3, vine * 7);
          graphics.fillStyle(palette.glow, alpha * 0.35);
          graphics.fillEllipse(leaf.x, leaf.y, 9 * scale, 4 * scale);
        }
        break;
      case 'glowing-berry-cluster': {
        line(-18, -22, -5, -4, 2.5, palette.secondaryAccent, alpha * 0.86);
        line(17, -20, 4, -3, 2.2, palette.secondaryAccent, alpha * 0.82);
        const berryCount = 6 + decoration.variant;
        for (let berry = 0; berry < berryCount; berry += 1) {
          const berryAngle = berry * 2.399 + decoration.rotation * 0.18;
          const distance = (5 + (berry % 4) * 7) * scale;
          const berryX = position.x + Math.cos(berryAngle) * distance;
          const berryY = position.y + Math.sin(berryAngle) * distance * 0.72;
          graphics.fillStyle(0xffe88f, alpha * 0.42);
          graphics.fillCircle(berryX, berryY, (5.2 + berry % 2) * scale);
          graphics.fillStyle(berry % 3 === 0 ? 0xffffff : 0xfff7c7, alpha);
          graphics.fillCircle(berryX, berryY, (3.2 + berry % 2 * 0.5) * scale);
          graphics.fillStyle(0xffffff, alpha * 0.92);
          graphics.fillCircle(berryX - 1.1 * scale, berryY - 1.4 * scale, 1.1 * scale);
        }
        break;
      }
      case 'shelf-fungus':
        for (let shelf = 0; shelf < 5; shelf += 1) {
          const shelfPoint = point((shelf - 2) * 10, 8 - Math.abs(shelf - 2) * 5);
          graphics.fillStyle(shelf % 2 ? palette.primaryAccent : palette.floorDetail, alpha * 0.72);
          graphics.fillEllipse(shelfPoint.x, shelfPoint.y, (19 - Math.abs(shelf - 2) * 2) * scale, 7 * scale);
          graphics.lineStyle(1.2 * scale, palette.wallHighlight, alpha * 0.48);
          graphics.lineBetween(shelfPoint.x - 7 * scale, shelfPoint.y, shelfPoint.x + 7 * scale, shelfPoint.y);
        }
        break;
      case 'shallow-pool':
        graphics.fillStyle(palette.water, alpha * 0.46);
        graphics.fillEllipse(position.x, position.y, 68 * scale, 37 * scale);
        graphics.lineStyle(2 * scale, palette.mist, alpha * 0.55);
        graphics.strokeEllipse(position.x, position.y, 62 * scale, 31 * scale);
        graphics.lineStyle(1 * scale, palette.wallHighlight, alpha * 0.35);
        graphics.strokeEllipse(position.x - 9 * scale, position.y - 2 * scale, 25 * scale, 8 * scale);
        break;
      case 'wet-rock':
      case 'rubble':
        for (let rock = 0; rock < 5; rock += 1) {
          const angle = decoration.rotation + rock * 1.73;
          const distance = (rock % 3) * 8 * scale;
          graphics.fillStyle(rock % 2 ? palette.wallBase : palette.wallHighlight, alpha * 0.86);
          graphics.fillEllipse(
            position.x + Math.cos(angle) * distance,
            position.y + Math.sin(angle) * distance,
            (13 + rock % 3 * 4) * scale,
            (7 + rock % 2 * 4) * scale
          );
        }
        break;
      case 'crystal-shard':
        for (let shard = -1; shard <= 1; shard += 1) {
          const base = point(shard * 8, 8);
          const left = point(shard * 8 - 5, 8);
          const tip = point(shard * 9, -17 - Math.abs(shard) * 6);
          const right = point(shard * 8 + 5, 8);
          graphics.fillStyle(shard === 0 ? palette.primaryAccent : palette.glow, alpha * 0.72);
          graphics.fillPoints([left, tip, right, base], true);
          graphics.lineStyle(1.2, palette.mist, alpha * 0.8);
          graphics.strokePoints([left, tip, right], false);
        }
        break;
      case 'moss-bank':
        for (let tuft = -3; tuft <= 3; tuft += 1) {
          const tuftPosition = point(tuft * 7, Math.abs(tuft) * 2);
          graphics.fillStyle(tuft % 2 ? palette.secondaryAccent : palette.glow, alpha * 0.62);
          graphics.fillEllipse(tuftPosition.x, tuftPosition.y, 13 * scale, (9 + tuft % 3) * scale);
        }
        break;
      case 'mushroom-cluster':
        for (let mushroom = -2; mushroom <= 2; mushroom += 1) {
          const stem = point(mushroom * 9, 7);
          const cap = point(mushroom * 9, -2 - Math.abs(mushroom) * 2);
          line(mushroom * 9, 8, mushroom * 9, -2 - Math.abs(mushroom) * 2, 3, palette.mist, alpha * 0.75);
          graphics.fillStyle(mushroom % 2 ? palette.glow : palette.primaryAccent, alpha * 0.82);
          graphics.fillEllipse(cap.x, cap.y, (14 - Math.abs(mushroom)) * scale, 7 * scale);
          graphics.fillStyle(palette.wallShadow, alpha * 0.4);
          graphics.fillCircle(stem.x, stem.y, 2 * scale);
        }
        break;
      case 'mist-plume':
        for (let cloud = 0; cloud < 4; cloud += 1) {
          const cloudPoint = point((cloud - 1.5) * 12, Math.sin(cloud) * 6);
          graphics.fillStyle(palette.mist, alpha * (0.08 + cloud * 0.025));
          graphics.fillEllipse(cloudPoint.x, cloudPoint.y, 31 * scale, 15 * scale);
        }
        break;
      case 'timber-beam':
        line(-31, 0, 31, 0, 12, palette.wallShadow);
        line(-28, -2, 28, -2, 7, palette.floorAccent);
        for (let bolt = -2; bolt <= 2; bolt += 1) {
          const boltPoint = point(bolt * 13, -2);
          graphics.fillStyle(palette.secondaryAccent, alpha);
          graphics.fillCircle(boltPoint.x, boltPoint.y, 2.3 * scale);
        }
        break;
      case 'gear-train':
        for (let gear = 0; gear < 3; gear += 1) {
          const gearPoint = point((gear - 1) * 15, (gear % 2) * 7);
          const radius = (9 + gear * 2) * scale;
          graphics.lineStyle(3 * scale, palette.secondaryAccent, alpha);
          graphics.strokeCircle(gearPoint.x, gearPoint.y, radius);
          graphics.strokeCircle(gearPoint.x, gearPoint.y, radius * 0.32);
          for (let spoke = 0; spoke < 6; spoke += 1) {
            graphics.lineBetween(
              gearPoint.x + Math.cos(spoke * Math.PI / 3) * radius * 0.35,
              gearPoint.y + Math.sin(spoke * Math.PI / 3) * radius * 0.35,
              gearPoint.x + Math.cos(spoke * Math.PI / 3) * radius * 0.86,
              gearPoint.y + Math.sin(spoke * Math.PI / 3) * radius * 0.86
            );
          }
        }
        break;
      case 'map-table': {
        const corners = [point(-27, -16), point(27, -16), point(27, 16), point(-27, 16)];
        graphics.fillStyle(palette.wallShadow, alpha);
        graphics.fillPoints(corners, true);
        const paper = [point(-22, -12), point(22, -10), point(19, 12), point(-20, 10)];
        graphics.fillStyle(palette.floorDetail, alpha * 0.92);
        graphics.fillPoints(paper, true);
        line(-16, -4, 12, 5, 1.4, palette.wallBase, alpha * 0.8);
        line(-12, 5, 8, -5, 1, palette.primaryAccent, alpha * 0.7);
        break;
      }
      case 'lens-stand': {
        line(0, 20, 0, -10, 5, palette.primaryAccent);
        line(-18, 20, 18, 20, 5, palette.wallShadow);
        const lens = point(0, -13);
        graphics.fillStyle(palette.glow, alpha * 0.28);
        graphics.fillCircle(lens.x, lens.y, 16 * scale);
        graphics.lineStyle(4 * scale, palette.secondaryAccent, alpha);
        graphics.strokeCircle(lens.x, lens.y, 13 * scale);
        break;
      }
      case 'book-stack':
        for (let book = 0; book < 4; book += 1) {
          const left = point(-18 + (book % 2) * 3, 12 - book * 7);
          graphics.fillStyle(book % 2 ? palette.primaryAccent : palette.secondaryAccent, alpha * 0.78);
          graphics.fillRoundedRect(left.x, left.y, (35 - book * 2) * scale, 6 * scale, 2 * scale);
        }
        break;
      case 'broken-stair':
        for (let step = 0; step < 5; step += 1) {
          const stepStart = point(-27 + step * 9, 14 - step * 7);
          const stepEnd = point(18 + step * 3, 14 - step * 7);
          graphics.lineStyle((9 - step * 0.7) * scale, palette.floorAccent, alpha * (1 - step * 0.1));
          graphics.lineBetween(stepStart.x, stepStart.y, stepEnd.x, stepEnd.y);
        }
        break;
      case 'faded-banner': {
        line(-18, -24, 18, -24, 4, palette.primaryAccent, alpha * 0.7);
        const cloth = [point(-14, -21), point(14, -21), point(10, 23), point(0, 15), point(-12, 24)];
        graphics.fillStyle(palette.primaryAccent, alpha * 0.42);
        graphics.fillPoints(cloth, true);
        line(0, -15, 0, 10, 2, palette.wallHighlight, alpha * 0.34);
        break;
      }
    }
  }

  private drawLandmarkInteriorExit(interior: ActiveLandmarkInterior): void {
    const { layout, origin } = interior;
    const exit = layout.exit;
    if (!exit) return;
    const position = landmarkInteriorWorldTilePosition(origin, exit.tileX, exit.tileY);
    const graphics = this.landmarkInteriorGraphics;
    const palette = layout.palette;
    graphics.fillStyle(palette.wallShadow, 0.94);
    graphics.fillEllipse(position.x, position.y + 14, 112, 54);
    graphics.lineStyle(8, palette.wallBase, 1);
    graphics.strokeEllipse(position.x, position.y - 3, 92, 88);
    graphics.lineStyle(3, palette.wallHighlight, 0.9);
    graphics.strokeEllipse(position.x, position.y - 5, 75, 70);
    for (let step = 0; step < 4; step += 1) {
      graphics.fillStyle(step % 2 ? palette.floorAccent : palette.floorDetail, 0.78);
      graphics.fillRoundedRect(position.x - 37 + step * 4, position.y + 7 + step * 9, 74 - step * 8, 7, 2);
    }
    if (layout.themeId === 'hidden-grotto') {
      for (let stream = -3; stream <= 3; stream += 1) {
        graphics.lineStyle(4 + Math.abs(stream % 2), palette.water, 0.52);
        graphics.lineBetween(position.x + stream * 10, position.y - 36, position.x + stream * 8, position.y + 34);
      }
    } else if (layout.themeId === 'hollow-tree') {
      graphics.lineStyle(5, palette.secondaryAccent, 0.58);
      graphics.strokeEllipse(position.x, position.y - 3, 61, 60);
    } else {
      graphics.lineStyle(5, palette.primaryAccent, 0.7);
      graphics.lineBetween(position.x - 34, position.y - 33, position.x - 34, position.y + 25);
      graphics.lineBetween(position.x + 34, position.y - 33, position.x + 34, position.y + 25);
    }
  }

  private drawLandmarkInteriorMaterial(
    material: LandmarkInteriorMaterialNode,
    interior: ActiveLandmarkInterior
  ): void {
    const graphics = this.landmarkInteriorGraphics;
    const position = landmarkInteriorWorldTilePosition(interior.origin, material.tileX, material.tileY);
    const scale = material.scale;
    const color = RESOURCE_COLORS[material.resource];
    const palette = interior.layout.palette;
    const point = (x: number, y: number): CaveRenderPoint => this.rotatedInteriorPoint(
      position.x, position.y, x * scale, y * scale, material.rotation
    );
    graphics.fillStyle(palette.wallShadow, 0.62);
    graphics.fillEllipse(position.x + 3, position.y + 12, 62 * scale, 27 * scale);

    switch (material.style) {
      case 'ancient-wood-knot':
        for (let ring = 3; ring >= 0; ring -= 1) {
          graphics.fillStyle(ring % 2 ? palette.floorAccent : color, 0.88);
          graphics.fillEllipse(position.x, position.y - ring * 1.5, (45 - ring * 8) * scale, (34 - ring * 6) * scale);
        }
        graphics.lineStyle(2, palette.wallHighlight, 0.72);
        graphics.strokeEllipse(position.x, position.y, 34 * scale, 22 * scale);
        break;
      case 'amber-sap-well':
        graphics.fillStyle(palette.wallBase, 1);
        graphics.fillEllipse(position.x, position.y, 56 * scale, 32 * scale);
        graphics.fillStyle(color, 0.9);
        graphics.fillEllipse(position.x, position.y - 2, 42 * scale, 22 * scale);
        graphics.fillStyle(palette.wallHighlight, 0.52);
        graphics.fillEllipse(position.x - 8 * scale, position.y - 7 * scale, 14 * scale, 5 * scale);
        break;
      case 'glow-spore-bloom':
      case 'luminous-mushroom-ring':
        for (let bloom = 0; bloom < 7; bloom += 1) {
          const angle = material.rotation + bloom * Math.PI * 2 / 7;
          const distance = (bloom % 2 ? 17 : 25) * scale;
          const x = position.x + Math.cos(angle) * distance;
          const y = position.y + Math.sin(angle) * distance;
          graphics.lineStyle(3 * scale, palette.mist, 0.72);
          graphics.lineBetween(x, y + 7 * scale, x, y);
          graphics.fillStyle(color, 0.9);
          graphics.fillEllipse(x, y, (12 + bloom % 3 * 2) * scale, 7 * scale);
        }
        break;
      case 'woven-vine-cluster':
        for (let vine = -3; vine <= 3; vine += 1) {
          const from = point(vine * 6, -25);
          const to = point(vine * 6 + Math.sin(vine) * 8, 25);
          graphics.lineStyle((3 + Math.abs(vine % 2)) * scale, color, 0.86);
          graphics.lineBetween(from.x, from.y, to.x, to.y);
        }
        break;
      case 'heartwood-core': {
        const diamond = [point(0, -31), point(26, 0), point(0, 31), point(-26, 0)];
        graphics.fillStyle(color, 0.92);
        graphics.fillPoints(diamond, true);
        graphics.lineStyle(4, palette.primaryAccent, 0.8);
        graphics.strokePoints(diamond, true);
        graphics.lineStyle(2, palette.wallHighlight, 0.74);
        graphics.strokeCircle(position.x, position.y, 14 * scale);
        break;
      }
      case 'damp-crystal-cluster':
        for (let shard = -2; shard <= 2; shard += 1) {
          const baseLeft = point(shard * 9 - 6, 15);
          const tip = point(shard * 8, -22 - (2 - Math.abs(shard)) * 8);
          const baseRight = point(shard * 9 + 6, 15);
          graphics.fillStyle(shard % 2 ? color : palette.glow, 0.82);
          graphics.fillPoints([baseLeft, tip, baseRight], true);
          graphics.lineStyle(1.5, palette.mist, 0.84);
          graphics.strokePoints([baseLeft, tip, baseRight], false);
        }
        break;
      case 'moss-fiber-bank':
        for (let tuft = -4; tuft <= 4; tuft += 1) {
          const tuftPoint = point(tuft * 6, Math.abs(tuft) * 1.5);
          graphics.fillStyle(tuft % 2 ? color : palette.secondaryAccent, 0.88);
          graphics.fillEllipse(tuftPoint.x, tuftPoint.y, 14 * scale, (12 + tuft % 3 * 3) * scale);
          graphics.lineStyle(1.4, palette.glow, 0.55);
          graphics.lineBetween(tuftPoint.x, tuftPoint.y, tuftPoint.x + tuft * scale, tuftPoint.y - 13 * scale);
        }
        break;
      case 'spring-stone-shelf':
        for (let shelf = 0; shelf < 4; shelf += 1) {
          const corners = [
            point(-28 + shelf * 5, 17 - shelf * 9),
            point(23 - shelf * 2, 15 - shelf * 9),
            point(18 - shelf * 2, 23 - shelf * 9),
            point(-24 + shelf * 5, 25 - shelf * 9)
          ];
          graphics.fillStyle(shelf % 2 ? color : palette.wallHighlight, 0.9);
          graphics.fillPoints(corners, true);
        }
        break;
      case 'map-cache': {
        const parchment = [point(-38, -23), point(35, -20), point(39, 17), point(-34, 20)];
        graphics.fillStyle(color, 0.98);
        graphics.fillPoints(parchment, true);
        graphics.lineStyle(1.7 * scale, palette.wallShadow, 0.7);
        graphics.strokePoints(parchment, true);
        // Coastlines, routes, settlements, and a compass rose make this a readable hand-drawn
        // map rather than a row of inventory icons.
        const route = [point(-25, 7), point(-13, -7), point(1, 3), point(17, -10), point(27, -4)];
        graphics.lineStyle(1.8 * scale, palette.wallBase, 0.76);
        graphics.strokePoints(route, false);
        [point(-13, -7), point(1, 3), point(17, -10)].forEach((settlement) => {
          graphics.fillStyle(palette.primaryAccent, 0.92);
          graphics.fillCircle(settlement.x, settlement.y, 2.8 * scale);
        });
        const compass = point(22, 8);
        graphics.lineStyle(1.3 * scale, palette.wallBase, 0.8);
        graphics.strokeCircle(compass.x, compass.y, 7 * scale);
        graphics.lineBetween(compass.x, compass.y - 9 * scale, compass.x, compass.y + 9 * scale);
        graphics.lineBetween(compass.x - 9 * scale, compass.y, compass.x + 9 * scale, compass.y);
        break;
      }
      case 'mechanical-salvage':
        for (let gear = 0; gear < 4; gear += 1) {
          const gearPoint = point((gear % 2) * 20 - 10, Math.floor(gear / 2) * 17 - 8);
          const radius = (10 + (gear % 3) * 3) * scale;
          graphics.lineStyle(4 * scale, color, 0.94);
          graphics.strokeCircle(gearPoint.x, gearPoint.y, radius);
          graphics.strokeCircle(gearPoint.x, gearPoint.y, radius * 0.3);
          for (let spoke = 0; spoke < 5; spoke += 1) {
            graphics.lineBetween(
              gearPoint.x,
              gearPoint.y,
              gearPoint.x + Math.cos(spoke * Math.PI * 0.4) * radius,
              gearPoint.y + Math.sin(spoke * Math.PI * 0.4) * radius
            );
          }
        }
        break;
      case 'lens-case': {
        graphics.fillStyle(palette.wallBase, 0.98);
        graphics.fillRoundedRect(position.x - 34 * scale, position.y - 22 * scale, 68 * scale, 44 * scale, 7 * scale);
        graphics.lineStyle(4 * scale, palette.primaryAccent, 0.86);
        graphics.strokeRoundedRect(position.x - 34 * scale, position.y - 22 * scale, 68 * scale, 44 * scale, 7 * scale);
        graphics.fillStyle(color, 0.42);
        graphics.fillCircle(position.x, position.y, 19 * scale);
        graphics.lineStyle(5 * scale, color, 0.96);
        graphics.strokeCircle(position.x, position.y, 17 * scale);
        graphics.fillStyle(palette.mist, 0.72);
        graphics.fillEllipse(position.x - 6 * scale, position.y - 7 * scale, 10 * scale, 5 * scale);
        break;
      }
    }
  }

  private drawHarvestedLandmarkMaterial(
    material: LandmarkInteriorMaterialNode,
    interior: ActiveLandmarkInterior
  ): void {
    if (material.resource === ResourceType.MapFragments
      && interior.landmark.type === LandmarkType.Watchtower) {
      return;
    }
    const position = landmarkInteriorWorldTilePosition(interior.origin, material.tileX, material.tileY);
    const graphics = this.landmarkInteriorGraphics;
    graphics.fillStyle(interior.layout.palette.wallShadow, 0.52);
    graphics.fillEllipse(position.x, position.y + 8, 44 * material.scale, 19 * material.scale);
    graphics.lineStyle(2, interior.layout.palette.floorDetail, 0.32);
    graphics.strokeEllipse(position.x, position.y + 5, 32 * material.scale, 13 * material.scale);
    for (let chip = -2; chip <= 2; chip += 1) {
      graphics.fillStyle(interior.layout.palette.wallHighlight, 0.3);
      graphics.fillCircle(position.x + chip * 8 * material.scale, position.y + 6 + Math.abs(chip) * 2, 2.3 * material.scale);
    }
  }

  private updateLandmarkInteriorAccents(time: number, force = false): void {
    const interior = this.activeLandmarkInterior;
    if (!interior || (!force && time - this.lastLandmarkInteriorAccentFrame < 66)) {
      return;
    }
    this.lastLandmarkInteriorAccentFrame = time;
    const graphics = this.landmarkInteriorAccentGraphics;
    const palette = interior.layout.palette;
    const pulse = 0.5 + Math.sin(time * 0.0024) * 0.5;
    graphics.clear().setVisible(true);

    interior.layout.materialNodes.forEach((material, index) => {
      if (this.sessionWorldState.isLandmarkMaterialHarvested(material.id) || material.glowStrength < 0.3) {
        return;
      }
      const position = landmarkInteriorWorldTilePosition(interior.origin, material.tileX, material.tileY);
      const phase = 0.5 + Math.sin(time * 0.002 + index * 1.71) * 0.5;
      graphics.fillStyle(RESOURCE_COLORS[material.resource], material.glowStrength * (0.035 + phase * 0.045));
      graphics.fillCircle(position.x, position.y, (34 + phase * 12) * material.scale);
      graphics.lineStyle(1.5, palette.mist, material.glowStrength * (0.25 + phase * 0.3));
      graphics.strokeCircle(position.x, position.y, (18 + phase * 5) * material.scale);
    });

    interior.layout.decorations.forEach((decoration, index) => {
      if (decoration.kind !== 'firefly-motes'
        && decoration.kind !== 'mist-plume'
        && decoration.kind !== 'glowing-berry-cluster') {
        return;
      }
      const position = this.landmarkInteriorDecorationPosition(decoration, interior);
      if (decoration.kind === 'glowing-berry-cluster') {
        const phase = 0.82 + Math.sin(time * 0.0014 + index * 0.73) * 0.08;
        graphics.fillStyle(0xfff1a8, 0.04 * phase);
        graphics.fillCircle(position.x, position.y, 53 * decoration.scale);
        graphics.fillStyle(0xffffdc, 0.075 * phase);
        graphics.fillCircle(position.x, position.y, 34 * decoration.scale);
        graphics.fillStyle(0xffffff, 0.11 * phase);
        graphics.fillCircle(position.x, position.y, 17 * decoration.scale);
      } else if (decoration.kind === 'firefly-motes') {
        for (let mote = 0; mote < 4; mote += 1) {
          const angle = time * 0.00035 * (mote % 2 ? 1 : -1) + index + mote * 1.57;
          const distance = (12 + mote * 7) * decoration.scale;
          graphics.fillStyle(palette.glow, 0.34 + pulse * 0.34);
          graphics.fillCircle(position.x + Math.cos(angle) * distance, position.y + Math.sin(angle * 1.3) * distance * 0.55, 2.2 + mote % 2);
        }
      } else {
        graphics.fillStyle(palette.mist, 0.035 + pulse * 0.025);
        graphics.fillEllipse(position.x + Math.sin(time * 0.0007 + index) * 9, position.y, 84 * decoration.scale, 34 * decoration.scale);
      }
    });

    const exit = interior.layout.exit;
    if (exit) {
      const exitPosition = landmarkInteriorWorldTilePosition(interior.origin, exit.tileX, exit.tileY);
      graphics.fillStyle(palette.ambientLight, palette.ambientLightStrength * (0.045 + pulse * 0.025));
      graphics.fillCircle(exitPosition.x, exitPosition.y, 76 + pulse * 9);
    }
    interior.layout.stairs.forEach((stair, index) => {
      const position = landmarkInteriorWorldTilePosition(interior.origin, stair.tileX, stair.tileY);
      const stairPulse = 0.5 + Math.sin(time * 0.0018 + index * 2.1) * 0.5;
      graphics.fillStyle(palette.ambientLight, 0.025 + stairPulse * 0.025);
      graphics.fillEllipse(position.x, position.y, 118 + stairPulse * 7, 77 + stairPulse * 4);
    });
  }

  private updateLandmarkInterior(time: number, delta: number): void {
    if (this.worldMapOpen || this.inventoryOpen || this.craftingOpen || this.pauseMenuOpen) {
      this.updateLandmarkInteriorFootsteps(delta, false);
      this.cancelTonicDrinking();
      this.updatePlayerAvatar(delta, false);
      return;
    }

    const horizontal = Number(this.isDown('right')) - Number(this.isDown('left'));
    const vertical = Number(this.isDown('down')) - Number(this.isDown('up'));
    const wantsToMove = horizontal !== 0 || vertical !== 0;
    let isMoving = false;
    this.sampleMovementPerformance(time, delta, wantsToMove);
    this.updateFacing(horizontal, vertical);
    if (wantsToMove) {
      const length = Math.hypot(horizontal, vertical);
      const distance = PLAYER_SPEED * this.potionSpeedMultiplier() * delta / 1000;
      isMoving = this.moveLandmarkInteriorPlayer(horizontal / length * distance, vertical / length * distance);
      if (isMoving) {
        this.markSaveDirty();
      }
    }
    this.isSwimming = false;
    this.isSwimmingInSwampWater = false;
    this.footprintTrail.recordMovement(time, this.player.x, this.player.y, isMoving);
    this.updateLandmarkInteriorFootsteps(delta, isMoving);
    this.updateLandmarkInteriorAccents(time);
    this.updateLandmarkInteriorInteraction();
    this.updateDropInteraction(time);
    this.updateTonicDrinking(delta);
    this.updateLandmarkMaterialHarvesting(delta, true);
    this.updatePlayerAvatar(delta, isMoving);
  }

  private moveLandmarkInteriorPlayer(deltaX: number, deltaY: number): boolean {
    const interior = this.activeLandmarkInterior;
    if (!interior) {
      return false;
    }
    const canEnter = (worldX: number, worldY: number): boolean => landmarkInteriorContainsPoint(
      interior.layout,
      (worldX - interior.origin.x) / WORLD_TILE_SIZE,
      (worldY - interior.origin.y) / WORLD_TILE_SIZE,
      -PLAYER_SIZE * 0.28 / WORLD_TILE_SIZE
    );
    let moved = false;
    if (canEnter(this.player.x + deltaX, this.player.y)) {
      this.player.x += deltaX;
      moved = moved || deltaX !== 0;
    }
    if (canEnter(this.player.x, this.player.y + deltaY)) {
      this.player.y += deltaY;
      moved = moved || deltaY !== 0;
    }
    return moved;
  }

  private updateLandmarkInteriorFootsteps(delta: number, isMoving: boolean): void {
    if (!isMoving) {
      this.footstepElapsedMs = 0;
      return;
    }
    this.footstepElapsedMs += Math.max(0, delta);
    if (this.footstepElapsedMs < FOOTSTEP_SOUND_INTERVAL_MS) {
      return;
    }
    this.footstepElapsedMs %= FOOTSTEP_SOUND_INTERVAL_MS;
    const interior = this.activeLandmarkInterior;
    if (!interior) {
      return;
    }
    this.ambientAudio?.playCaveFootstep(
      Math.floor((this.player.x - interior.origin.x) / WORLD_TILE_SIZE),
      Math.floor((this.player.y - interior.origin.y) / WORLD_TILE_SIZE)
    );
  }

  private updateLandmarkInteriorInteraction(force = false): void {
    const interior = this.activeLandmarkInterior;
    if (!interior) {
      return;
    }
    const exit = interior.layout.exit;
    const exitPosition = exit
      ? landmarkInteriorWorldTilePosition(interior.origin, exit.tileX, exit.tileY)
      : null;
    const exitRadius = (exit?.interactionRadiusTiles ?? 0) * WORLD_TILE_SIZE;
    this.landmarkInteriorExitNearby = Boolean(exitPosition && Phaser.Math.Distance.Squared(
      this.player.x,
      this.player.y,
      exitPosition.x,
      exitPosition.y
    ) <= exitRadius * exitRadius);

    let nearestStair: LandmarkInteriorStair | null = null;
    let nearestStairDistanceSquared = Number.POSITIVE_INFINITY;
    interior.layout.stairs.forEach((stair) => {
      const position = landmarkInteriorWorldTilePosition(interior.origin, stair.tileX, stair.tileY);
      const distanceSquared = Phaser.Math.Distance.Squared(this.player.x, this.player.y, position.x, position.y);
      const radius = stair.interactionRadiusTiles * WORLD_TILE_SIZE;
      if (distanceSquared <= radius * radius && distanceSquared < nearestStairDistanceSquared) {
        nearestStair = stair;
        nearestStairDistanceSquared = distanceSquared;
      }
    });
    this.landmarkInteriorStairTarget = nearestStair;

    let nearest: LandmarkInteriorMaterialNode | null = null;
    let nearestDistanceSquared = 88 * 88;
    const localTileX = Math.floor((this.player.x - interior.origin.x) / WORLD_TILE_SIZE);
    const localTileY = Math.floor((this.player.y - interior.origin.y) / WORLD_TILE_SIZE);
    const bucketX = Math.floor(localTileX / CAVE_INTERACTION_BUCKET_SIZE_TILES);
    const bucketY = Math.floor(localTileY / CAVE_INTERACTION_BUCKET_SIZE_TILES);
    for (let candidateBucketY = bucketY - 1; candidateBucketY <= bucketY + 1; candidateBucketY += 1) {
      for (let candidateBucketX = bucketX - 1; candidateBucketX <= bucketX + 1; candidateBucketX += 1) {
        interior.materialBuckets.get(landmarkMaterialBucketKey(candidateBucketX, candidateBucketY))?.forEach((material) => {
          if (this.sessionWorldState.isLandmarkMaterialHarvested(material.id)) {
            return;
          }
          const position = landmarkInteriorWorldTilePosition(interior.origin, material.tileX, material.tileY);
          const distanceSquared = Phaser.Math.Distance.Squared(this.player.x, this.player.y, position.x, position.y);
          if (distanceSquared < nearestDistanceSquared) {
            nearest = material;
            nearestDistanceSquared = distanceSquared;
          }
        });
      }
    }
    this.interiorLandmarkMaterialTarget = nearest;

    if (nearestStair) {
      const stair = nearestStair as LandmarkInteriorStair;
      const position = landmarkInteriorWorldTilePosition(interior.origin, stair.tileX, stair.tileY);
      this.interiorLandmarkMaterialTarget = null;
      this.interactionHighlight.setRadius(48).setPosition(position.x, position.y).setVisible(true);
      this.drawLandmarkHint(
        stair.direction === 'up' ? 'Press E to ascend' : 'Press E to descend',
        position.x,
        position.y - 68,
        interior.layout.palette.primaryAccent
      );
    } else if (this.landmarkInteriorExitNearby && exitPosition) {
      this.interiorLandmarkMaterialTarget = null;
      this.interactionHighlight.setRadius(43).setPosition(exitPosition.x, exitPosition.y).setVisible(true);
      this.drawLandmarkHint('Press E to exit', exitPosition.x, exitPosition.y - 61, interior.layout.palette.wallHighlight);
    } else if (nearest) {
      const material = nearest as LandmarkInteriorMaterialNode;
      const position = landmarkInteriorWorldTilePosition(interior.origin, material.tileX, material.tileY);
      this.interactionHighlight.setRadius(34).setPosition(position.x, position.y).setVisible(true);
      if (material.resource === ResourceType.MapFragments && interior.layout.floorNumber === 3) {
        this.drawLandmarkHint('Press E to take the map', position.x, position.y - 76, interior.layout.palette.primaryAccent);
      } else {
        this.hideLandmarkHint();
      }
    } else {
      this.interactionHighlight.setVisible(false);
      this.hideLandmarkHint();
    }
  }

  private landmarkMaterialHarvestDuration(resource: ResourceType): number {
    switch (resource) {
      case ResourceType.Heartwood:
      case ResourceType.DampCrystal:
      case ResourceType.SpringStone:
      case ResourceType.MechanicalParts:
      case ResourceType.LensGlass:
      case ResourceType.Starstone:
      case ResourceType.MeteorIron:
      case ResourceType.RuneStone:
      case ResourceType.AncientFragments:
      case ResourceType.RelicMaterials:
      case ResourceType.BoneFragments:
      case ResourceType.AncientRemains:
        return 1450;
      case ResourceType.AmberSap:
      case ResourceType.GlowSpores:
      case ResourceType.VineFiber:
      case ResourceType.MossFiber:
      case ResourceType.LuminousMushrooms:
      case ResourceType.MapFragments:
      case ResourceType.GlowingFragments:
      case ResourceType.FossilResin:
        return 1050;
      default:
        return 1250;
    }
  }

  private takeWatchtowerMap(): boolean {
    const interior = this.activeLandmarkInterior;
    const material = this.interiorLandmarkMaterialTarget;
    if (!interior || interior.landmark.type !== LandmarkType.Watchtower
      || interior.layout.floorNumber !== 3 || material?.resource !== ResourceType.MapFragments) {
      return false;
    }
    if (!this.inventory.canAdd(material.resource, material.yieldAmount)) {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
      return true;
    }
    if (!this.sessionWorldState.harvestLandmarkMaterial(material.id)) {
      this.updateLandmarkInteriorInteraction(true);
      return true;
    }
    this.inventory.add(material.resource, material.yieldAmount);
    this.showWorldFeedback(this.player.x, this.player.y - 28, '+ 1 Cartographer\'s Map');
    this.handleInventoryChanged();
    this.drawActiveLandmarkInterior();
    this.updateLandmarkInteriorAccents(this.time.now, true);
    this.updateLandmarkInteriorInteraction(true);
    return true;
  }

  private updateLandmarkMaterialHarvesting(delta: number, insideInterior: boolean): void {
    const target = insideInterior
      ? this.interiorLandmarkMaterialTarget
      : this.surfaceLandmarkMaterialTarget;
    if (!insideInterior
      && this.surfaceLandmarkMaterialTarget?.landmarkType === LandmarkType.StoneCircle
      && this.surfaceLandmarkMaterialTarget.resource === ResourceType.RuneStone
      && this.surfaceLandmarkMaterialTarget.style === 'rune-slab') {
      this.cancelHarvesting();
      return;
    }
    if (this.drinkingPotion) {
      this.cancelHarvesting(false);
      return;
    }
    if (this.harvestRequiresControlRelease) {
      if (!this.isControlDown('harvestAttack')) {
        this.harvestRequiresControlRelease = false;
      }
      return;
    }
    if (this.inventoryOpen || this.craftingOpen || this.placedObjectOverlay.isOpen
      || !this.isControlDown('harvestAttack') || !target) {
      if (insideInterior ? this.interiorLandmarkHarvestMaterial : this.surfaceLandmarkHarvestMaterial) {
        this.cancelHarvesting();
      }
      return;
    }

    const current = insideInterior
      ? this.interiorLandmarkHarvestMaterial
      : this.surfaceLandmarkHarvestMaterial;
    if (!current || current.id !== target.id) {
      this.cancelHarvesting();
      if (insideInterior) {
        this.interiorLandmarkHarvestMaterial = target as LandmarkInteriorMaterialNode;
      } else {
        this.surfaceLandmarkHarvestMaterial = target as LandmarkMaterialNode;
      }
    }

    const durationMs = this.landmarkMaterialHarvestDuration(target.resource) / this.hasteMultiplier();
    this.harvestElapsedMs = Math.min(durationMs, this.harvestElapsedMs + Math.max(0, delta));
    const progress = this.harvestElapsedMs / durationMs;
    const position = insideInterior
      ? landmarkInteriorWorldTilePosition(
        this.activeLandmarkInterior!.origin,
        (target as LandmarkInteriorMaterialNode).tileX,
        (target as LandmarkInteriorMaterialNode).tileY
      )
      : { x: (target as LandmarkMaterialNode).worldX, y: (target as LandmarkMaterialNode).worldY };
    this.drawHarvestProgressAt(position.x, position.y - 35, progress);
    if (progress < 1) {
      return;
    }

    this.cancelHarvesting();
    this.harvestRequiresControlRelease = true;
    const amount = Math.max(1, target.yieldAmount);
    if (!this.inventory.canAdd(target.resource, amount)) {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
      return;
    }
    const regrowthDelayMs = insideInterior
      && this.activeLandmarkInterior?.landmark.type === LandmarkType.GiantAncientTree
      ? ancientTreeFeatureRegrowthDelayMs(
        this.worldSeed,
        target.id,
        this.sessionWorldState.worldAgeMs
      )
      : undefined;
    if (!this.sessionWorldState.harvestLandmarkMaterial(target.id, regrowthDelayMs)) {
      return;
    }
    this.inventory.add(target.resource, amount);
    this.showWorldFeedback(
      this.player.x,
      this.player.y - 28,
      `+ ${amount} ${resourceLabel(target.resource)}`
    );
    this.handleInventoryChanged();

    if (insideInterior) {
      this.drawActiveLandmarkInterior();
      this.updateLandmarkInteriorAccents(this.time.now, true);
      this.updateLandmarkInteriorInteraction(true);
    } else {
      this.chunkManager.refreshLandmarkMaterial(target.id);
      this.updateLandmarkEntranceInteraction(true);
    }
  }

  private async enterCave(
    entrance: CaveEntrance,
    returnWorldX: number,
    returnWorldY: number,
    markDirty = true,
    continueExistingLoading = false
  ): Promise<void> {
    if (this.caveTransitionInProgress) {
      return;
    }
    this.caveTransitionInProgress = true;
    this.worldReady = false;
    this.ambientAudio?.setSwimming(false, false, false);
    this.footstepElapsedMs = 0;
    this.showTerrainLoading(continueExistingLoading);
    this.cancelHarvesting();
    this.nearbyCaveEntrance = null;
    this.nearbyLandmarkEntrance = null;
    this.surfaceLandmarkMaterialTarget = null;
    this.caveExitTarget = null;
    this.lastCaveLavaFrame = Number.NEGATIVE_INFINITY;
    this.dropHighlight.setVisible(false);
    this.dropHintPanel.clear().setVisible(false);
    this.dropHint.setVisible(false);
    this.interactionHighlight.setVisible(false);
    this.hideLandmarkHint();

    try {
      await this.waitForTerrainLoadingPaint();

      const layout = generateCaveLayout(this.worldSeed, entrance);
      this.updateLoadingProgress(55, 100);
      await this.waitForTerrainLoadingPaint();
      const origin = caveWorldOrigin(entrance);
      const entrySurfaceExitId = layout.surfaceExits.find((exit) => (
        exit.surfaceTileX === entrance.tileX && exit.surfaceTileY === entrance.tileY
      ))?.id ?? layout.entrance.id;
      const exitVisuals = this.createCaveExitVisuals(layout, origin);
      this.activeCave = {
        entrance,
        layout,
        origin,
        oreBuckets: createCaveOreBuckets(layout.ores),
        returnWorldX,
        returnWorldY,
        entrySurfaceExitId,
        exitVisuals
      };
      this.setCaveLightingActive(true);
      this.lastCaveVisibilityWorldX = Number.NaN;
      this.lastCaveVisibilityWorldY = Number.NaN;
      const spawn = caveWorldTilePosition(origin, layout.spawnTileX, layout.spawnTileY);
      this.player.setPosition(spawn.x, spawn.y);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.isSwimming = false;
      this.terrainSurface = 'cave floor';
      this.minimapOverlay.setVisible(false);
      this.drawActiveCave();
      this.updateLoadingProgress(90, 100);
      await this.waitForTerrainLoadingPaint();
      this.updateCaveVisibility(true);
      this.updateCaveInteraction(true);
      this.updateDropInteraction(0, true);
      this.updatePlayerAvatar(0, false);
      if (markDirty) {
        this.markSaveDirty();
      }
      await this.finishTerrainLoading();
    } catch (error) {
      this.recoverFromTerrainLoadingFailure('enter the cave', error);
    }
  }

  private async exitCave(exitTarget?: CaveSurfaceExit): Promise<void> {
    const cave = this.activeCave;
    if (!cave || this.caveTransitionInProgress) {
      return;
    }

    this.caveTransitionInProgress = true;
    this.worldReady = false;
    this.ambientAudio?.setSwimming(false, false, false);
    this.footstepElapsedMs = 0;
    this.showTerrainLoading();
    this.cancelHarvesting();
    try {
      await this.waitForTerrainLoadingPaint();

      const returnToEntrySurface = !exitTarget || exitTarget.id === cave.entrySurfaceExitId;
      const destinationX = returnToEntrySurface
        ? cave.returnWorldX
        : (exitTarget.surfaceTileX + 0.5) * WORLD_TILE_SIZE;
      const destinationY = returnToEntrySurface
        ? cave.returnWorldY
        : (exitTarget.surfaceTileY + 0.5) * WORLD_TILE_SIZE;
      await this.chunkManager.prime(destinationX, destinationY, (progress) => {
        const ratio = progress.completed / Math.max(1, progress.total);
        this.updateLoadingProgress(8 + ratio * 80, 100);
      });
      this.updateLoadingProgress(92, 100);
      await this.waitForTerrainLoadingPaint();

      this.activeCave = null;
      this.setCaveLightingActive(false);
      this.caveOreTarget = null;
      this.caveExitNearby = false;
      this.caveExitTarget = null;
      this.caveGraphics.clear().setVisible(false);
      this.caveLavaGraphics.clear().setVisible(false);
      this.caveEntranceLightGraphics.clear().setVisible(false);
      this.caveFogOverlay.classList.remove('is-visible');
      this.lastCaveVisibilityWorldX = Number.NaN;
      this.lastCaveVisibilityWorldY = Number.NaN;
      this.player.setPosition(destinationX, destinationY);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.currentTopography = this.chunkManager.getTopographyAt(this.player.x, this.player.y);
      this.terrainSurface = this.currentTopography.surface;
      this.placeableManager.refresh(this.player.x, this.player.y);
      this.updateSwimmingState(true);
      this.chunkManager.update(this.player.x, this.player.y);
      this.updateInteractionTarget(true);
      this.updateCaveEntranceInteraction(true);
      this.updateLandmarkEntranceInteraction(true);
      this.updateDropInteraction(0, true);
      this.minimapOverlay.setVisible(true);
      this.lastMinimapUpdateMs = Number.NEGATIVE_INFINITY;
      this.lastMinimapTileX = Number.NaN;
      this.lastMinimapTileY = Number.NaN;
      this.updateMinimap(0, true);
      this.updatePlayerAvatar(0, false);
      this.markSaveDirty();
      await this.finishTerrainLoading();
    } catch (error) {
      this.recoverFromTerrainLoadingFailure('leave the cave', error);
    }
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
    // The cave keeps a near-black backdrop; depth comes from the rock-face layers rather than
    // a bright background fill.
    graphics.fillStyle(0x070a0b, 1);
    graphics.fillRect(outerX, outerY, (layout.width + 2) * WORLD_TILE_SIZE, (layout.height + 2) * WORLD_TILE_SIZE);

    // The rendered floor is a deterministic continuous field of irregular chambers and curved
    // tunnels. Its contour is also the movement boundary, while the compact grid remains for
    // depth and feature generation only.
    const contours = layout.terrainContours.map((contour) => ({
      enclosesFloor: contour.enclosesFloor,
      points: contour.points.map((point) => ({
        x: origin.x + point.x * WORLD_TILE_SIZE,
        y: origin.y + point.y * WORLD_TILE_SIZE
      }))
    }));
    contours.filter((contour) => contour.enclosesFloor).forEach((contour) => {
      this.fillCavePolygon(contour.points, 0x26352e, 1);
    });
    this.drawCaveDepthShading(layout, origin);
    contours.forEach((contour) => {
      graphics.lineStyle(39 * CAVE_WALL_FACE_SCALE, 0x17241e, 1);
      graphics.strokePoints(contour.points as CaveRenderPoint[], true);
      graphics.lineStyle(30 * CAVE_WALL_FACE_SCALE, 0x354b3d, 1);
      graphics.strokePoints(contour.points as CaveRenderPoint[], true);
      graphics.lineStyle(19 * CAVE_WALL_FACE_SCALE, 0x6e856b, 0.98);
      graphics.strokePoints(contour.points as CaveRenderPoint[], true);
      graphics.lineStyle(Math.max(2.5, 5 * CAVE_WALL_FACE_SCALE), 0xb3cea5, 0.9);
      graphics.strokePoints(contour.points as CaveRenderPoint[], true);
    });
    contours.forEach((contour, index) => {
      this.drawCaveWallStrata(contour.points, index);
    });
    this.drawCaveFloorTexture(layout, origin);
    this.drawCaveStalagmites(layout.stalagmites, origin);
    layout.surfaceExits.forEach((exit, index) => this.drawCaveSurfaceExit(exit, cave, index > 0));
    this.drawCaveLavaRims(layout.lavaPools, origin);
    this.lastCaveLavaFrame = Number.NEGATIVE_INFINITY;
    this.lastCaveEntranceLightFrame = Number.NEGATIVE_INFINITY;
    this.updateCaveEntranceDaylight(this.time.now, true);
    this.updateCaveLava(this.gameSettings.video.quality.animateLava ? this.time.now : 0, true);

    layout.ores.forEach((ore) => {
      if (ore.placement !== 'floor') {
        return;
      }
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
      cave.layout.entrance.tileX * 997 + tileX * 37,
      cave.layout.entrance.tileY * 991 + tileY * 41,
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

  private caveDepthAt(layout: CaveLayout, tileX: number, tileY: number): number {
    const sampleX = Math.max(0, Math.min(layout.width - 1, Math.floor(tileX)));
    const sampleY = Math.max(0, Math.min(layout.height - 1, Math.floor(tileY)));
    const directDepth = layout.depthByTile[sampleY]?.[sampleX] ?? -1;
    if (directDepth >= 0) {
      return directDepth;
    }

    // Movement uses the exact smoothed cave contour, whereas the compact depth map samples
    // each tile at its centre. A narrow ledge beside a wall can therefore be valid floor even
    // though its centre sample is rock. Inherit the nearest reachable cell's route depth so a
    // continuous cave never reports an artificial zero-metre pocket at its boundary.
    let nearestDepth = 0;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    const fallbackRadius = 3;
    for (let y = Math.max(0, sampleY - fallbackRadius); y <= Math.min(layout.height - 1, sampleY + fallbackRadius); y += 1) {
      for (let x = Math.max(0, sampleX - fallbackRadius); x <= Math.min(layout.width - 1, sampleX + fallbackRadius); x += 1) {
        const candidateDepth = layout.depthByTile[y]?.[x] ?? -1;
        if (candidateDepth < 0) {
          continue;
        }
        const distanceSquared = (x + 0.5 - tileX) ** 2 + (y + 0.5 - tileY) ** 2;
        if (distanceSquared < nearestDistanceSquared) {
          nearestDistanceSquared = distanceSquared;
          nearestDepth = candidateDepth;
        }
      }
    }
    return nearestDepth;
  }

  private caveDepthMetersAt(worldX: number, worldY: number): number {
    const cave = this.activeCave;
    if (!cave) {
      return 0;
    }
    const localTileX = (worldX - cave.origin.x) / WORLD_TILE_SIZE;
    const localTileY = (worldY - cave.origin.y) / WORLD_TILE_SIZE;
    return Math.max(0, Math.min(CAVE_DEPTH_SCALE_MAX,
      this.caveDepthAt(cave.layout, localTileX, localTileY) * CAVE_DEPTH_SCALE_MAX));
  }

  private drawCaveDepthShading(layout: CaveLayout, origin: CaveWorldOrigin): void {
    // Large, overlapping shadow pools darken continuous floor regions as their graph-distance
    // from a surface entrance grows. They are static seed-derived geology, not per-frame fog.
    layout.terrain.chambers.forEach((chamber, index) => {
      const depth = this.caveDepthAt(layout, chamber.x, chamber.y);
      if (depth < 0.24) {
        return;
      }
      this.drawCaveRockPatch(
        origin.x + chamber.x * WORLD_TILE_SIZE,
        origin.y + chamber.y * WORLD_TILE_SIZE,
        chamber.radiusX * WORLD_TILE_SIZE * 0.72,
        chamber.radiusY * WORLD_TILE_SIZE * 0.72,
        index,
        0,
        0x6c71,
        0x020607,
        Math.min(0.48, 0.1 + (depth - 0.24) * 0.48)
      );
    });
    layout.terrain.tunnels.forEach((tunnel, index) => {
      const progress = 0.5;
      const inverse = 1 - progress;
      const tileX = inverse * inverse * tunnel.fromX + 2 * inverse * progress * tunnel.controlX + progress * progress * tunnel.toX;
      const tileY = inverse * inverse * tunnel.fromY + 2 * inverse * progress * tunnel.controlY + progress * progress * tunnel.toY;
      const depth = this.caveDepthAt(layout, tileX, tileY);
      if (depth > 0.42) {
        this.drawCaveRockPatch(origin.x + tileX * WORLD_TILE_SIZE, origin.y + tileY * WORLD_TILE_SIZE, 22, 12, index, 1, 0x6c72, 0x020607, (depth - 0.36) * 0.34);
      }
    });
  }

  private drawCaveStalagmites(stalagmites: readonly CaveStalagmite[], origin: CaveWorldOrigin): void {
    stalagmites.forEach((stalagmite) => {
      const position = caveWorldTilePosition(origin, stalagmite.tileX, stalagmite.tileY);
      const rootSize = 11.2 * stalagmite.scale;
      const spireCount = 1 + Math.floor(this.caveVisualRandom(stalagmite.tileX, stalagmite.tileY, 0x6d31) * 3);
      // A mottled, low rock apron anchors the crystal growth into the cave floor.
      this.drawCaveRockPatch(position.x, position.y + 4, rootSize * 1.85, rootSize * 0.74, stalagmite.tileX, stalagmite.tileY, 0x6d32, 0x182725, 0.92);
      this.fillCavePolygon(
        this.createCaveVeinPoints(position.x, position.y + 4, 0.08, rootSize * 3.1, rootSize * 0.8, stalagmite.tileX, stalagmite.tileY, 0x6d33),
        0x334842,
        0.74
      );
      for (let spireIndex = 0; spireIndex < spireCount; spireIndex += 1) {
        const spread = spireCount === 1 ? 0 : (spireIndex / (spireCount - 1) - 0.5) * rootSize * 1.45;
        const baseWidth = rootSize * (0.42 + this.caveVisualRandom(stalagmite.tileX, stalagmite.tileY, 0x6d34 + spireIndex) * 0.29);
        const height = rootSize * (1.55 + this.caveVisualRandom(stalagmite.tileX, stalagmite.tileY, 0x6d37 + spireIndex) * 1.95);
        const lean = (this.caveVisualRandom(stalagmite.tileX, stalagmite.tileY, 0x6d3a + spireIndex) - 0.5) * baseWidth * 1.25;
        const baseX = position.x + spread;
        const baseY = position.y + rootSize * 0.48;
        const tipX = baseX + lean;
        const tipY = baseY - height;
        const silhouette: CaveRenderPoint[] = [
          { x: baseX - baseWidth * 1.08, y: baseY + baseWidth * 0.28 },
          { x: baseX - baseWidth * 0.72, y: baseY - baseWidth * 0.34 },
          { x: baseX - baseWidth * 0.28 + lean * 0.16, y: baseY - height * 0.46 },
          { x: tipX, y: tipY },
          { x: baseX + baseWidth * 0.34 + lean * 0.5, y: baseY - height * 0.49 },
          { x: baseX + baseWidth * 0.96, y: baseY - baseWidth * 0.17 },
          { x: baseX + baseWidth * 1.13, y: baseY + baseWidth * 0.25 }
        ];
        this.fillCavePolygon(silhouette, spireIndex % 2 ? 0x3d5a52 : 0x46645a, 0.95);
        this.caveGraphics.fillStyle(0x1e3330, 0.66);
        this.caveGraphics.fillTriangle(baseX - baseWidth * 0.72, baseY - baseWidth * 0.26, baseX + baseWidth * 0.96, baseY - baseWidth * 0.17, tipX, tipY);
        this.caveGraphics.fillStyle(0x9fc29f, 0.42);
        this.caveGraphics.fillTriangle(baseX - baseWidth * 0.2, baseY - baseWidth * 0.28, baseX + baseWidth * 0.18 + lean * 0.25, baseY - height * 0.42, tipX, tipY);
        this.caveGraphics.lineStyle(1.05, 0xb6d4ad, 0.34);
        this.caveGraphics.strokePoints([
          { x: baseX - baseWidth * 0.05, y: baseY - baseWidth * 0.14 },
          { x: baseX + lean * 0.38, y: baseY - height * 0.53 },
          { x: tipX, y: tipY }
        ], false);
      }
      for (let chip = 0; chip < 3; chip += 1) {
        const angle = this.caveVisualRandom(stalagmite.tileX, stalagmite.tileY, 0x6d51 + chip) * Math.PI * 2;
        const distance = rootSize * (0.7 + this.caveVisualRandom(stalagmite.tileX, stalagmite.tileY, 0x6d55 + chip) * 0.75);
        const x = position.x + Math.cos(angle) * distance;
        const y = position.y + 3 + Math.sin(angle) * distance * 0.42;
        this.caveGraphics.fillStyle(chip === 0 ? 0x91b496 : 0x47655b, 0.7);
        this.caveGraphics.fillTriangle(x - 1.8, y + 1.2, x + 2, y + 0.8, x + 0.3, y - 2.3);
      }
    });
  }

  private createCaveExitVisuals(layout: CaveLayout, origin: CaveWorldOrigin): ReadonlyMap<string, CaveExitVisual> {
    const visuals = new Map<string, CaveExitVisual>();
    layout.surfaceExits.forEach((exit) => {
      const sourceX = exit.tileX + 0.5;
      const sourceY = exit.tileY + 0.5;
      let wallNormalX = 0;
      let wallNormalY = -1;
      let wallDistance = Infinity;
      // Put each ladder just inside the nearest real contour wall. This anchors the exit to the
      // cave geometry instead of leaving a marker in the middle of the floor.
      for (let sample = 0; sample < 28; sample += 1) {
        const angle = sample / 28 * Math.PI * 2;
        const normalX = Math.cos(angle);
        const normalY = Math.sin(angle);
        for (let distance = 0.45; distance <= 4.2; distance += 0.14) {
          if (caveTerrainContainsPoint(layout.terrainContours, sourceX + normalX * distance, sourceY + normalY * distance)) {
            continue;
          }
          if (distance < wallDistance) {
            wallDistance = distance;
            wallNormalX = normalX;
            wallNormalY = normalY;
          }
          break;
        }
      }
      // Keep the ladder almost on the contour edge. The small inset preserves a reachable
      // interaction point without making a new floor-side platform around the exit.
      const anchorDistance = Number.isFinite(wallDistance) ? Math.max(0.35, wallDistance - 0.16) : 0.5;
      visuals.set(exit.id, {
        x: origin.x + (sourceX + wallNormalX * anchorDistance) * WORLD_TILE_SIZE,
        y: origin.y + (sourceY + wallNormalY * anchorDistance) * WORLD_TILE_SIZE,
        wallNormalX,
        wallNormalY
      });
    });
    return visuals;
  }

  private caveExitVisual(cave: ActiveCave, exit: CaveSurfaceExit): CaveExitVisual {
    return cave.exitVisuals.get(exit.id) ?? {
      ...caveWorldTilePosition(cave.origin, exit.tileX, exit.tileY),
      wallNormalX: 0,
      wallNormalY: -1
    };
  }

  private drawCaveSurfaceExit(exit: CaveSurfaceExit, cave: ActiveCave, isLinkedOutlet: boolean): void {
    const visual = this.caveExitVisual(cave, exit);
    const insideX = -visual.wallNormalX;
    const insideY = -visual.wallNormalY;
    const sideX = -visual.wallNormalY;
    const sideY = visual.wallNormalX;
    // A narrow dark seam is cut straight into the existing contour wall. Unlike the old broad
    // panel, it preserves the cave's own wall texture and gives the ladder a believable recess.
    const seamHalfWidth = isLinkedOutlet ? 15 : 13;
    this.caveGraphics.lineStyle(14, 0x08100f, 0.58);
    this.caveGraphics.lineBetween(
      visual.x - sideX * seamHalfWidth + visual.wallNormalX * 2,
      visual.y - sideY * seamHalfWidth + visual.wallNormalY * 2,
      visual.x + sideX * seamHalfWidth + visual.wallNormalX * 2,
      visual.y + sideY * seamHalfWidth + visual.wallNormalY * 2
    );
    this.caveGraphics.lineStyle(1.2, 0x617466, 0.46);
    this.caveGraphics.lineBetween(
      visual.x - sideX * seamHalfWidth,
      visual.y - sideY * seamHalfWidth,
      visual.x + sideX * seamHalfWidth,
      visual.y + sideY * seamHalfWidth
    );

    // The rails begin inside that wall seam and stay narrow against the contour. Their short
    // floor reach makes this read as a fixed ladder, not a standalone prop on the cave floor.
    const ladderTop = { x: visual.x + visual.wallNormalX * 5, y: visual.y + visual.wallNormalY * 5 };
    const ladderBottom = { x: visual.x + insideX * 30, y: visual.y + insideY * 30 };
    const railHalfWidth = 6.7;
    const railColor = isLinkedOutlet ? 0x82523a : 0x95613b;
    for (const side of [-1, 1]) {
      const offsetX = sideX * railHalfWidth * side;
      const offsetY = sideY * railHalfWidth * side;
      this.caveGraphics.lineStyle(3.4, 0x251913, 0.98);
      this.caveGraphics.lineBetween(ladderTop.x + offsetX, ladderTop.y + offsetY, ladderBottom.x + offsetX, ladderBottom.y + offsetY);
      this.caveGraphics.lineStyle(1.5, railColor, 1);
      this.caveGraphics.lineBetween(ladderTop.x + offsetX, ladderTop.y + offsetY, ladderBottom.x + offsetX, ladderBottom.y + offsetY);
    }
    const rungCount = 5 + Math.floor(this.caveVisualRandom(exit.tileX, exit.tileY, 0x6da1) * 2);
    for (let rung = 1; rung <= rungCount; rung += 1) {
      const progress = rung / (rungCount + 1);
      const x = ladderTop.x + (ladderBottom.x - ladderTop.x) * progress;
      const y = ladderTop.y + (ladderBottom.y - ladderTop.y) * progress;
      this.caveGraphics.lineStyle(3.1, 0x251913, 0.98);
      this.caveGraphics.lineBetween(x - sideX * 8.1, y - sideY * 8.1, x + sideX * 8.1, y + sideY * 8.1);
      this.caveGraphics.lineStyle(1.25, 0xb57743, 0.92);
      this.caveGraphics.lineBetween(x - sideX * 6.8, y - sideY * 6.8, x + sideX * 6.8, y + sideY * 6.8);
    }
  }

  private updateCaveEntranceDaylight(time: number, force = false): void {
    const cave = this.activeCave;
    const frame = Math.floor(time / 120);
    if (!cave) {
      this.caveEntranceLightGraphics.clear().setVisible(false);
      return;
    }
    if (!force && frame === this.lastCaveEntranceLightFrame) {
      return;
    }
    this.lastCaveEntranceLightFrame = frame;
    const lightLevel = sampleDayNight(this.worldTimeMs).lightLevel;
    const graphics = this.caveEntranceLightGraphics;
    if (lightLevel <= 0.001) {
      graphics.clear().setVisible(false);
      return;
    }
    graphics.clear().setVisible(true);

    cave.layout.surfaceExits.forEach((exit) => {
      const visual = this.caveExitVisual(cave, exit);
      const insideX = -visual.wallNormalX;
      const insideY = -visual.wallNormalY;
      const sideX = -visual.wallNormalY;
      const sideY = visual.wallNormalX;
      const beam = (reach: number, endHalfWidth: number, salt: number): CaveRenderPoint[] => {
        const left: CaveRenderPoint[] = [];
        const right: CaveRenderPoint[] = [];
        const segments = 6;
        for (let segment = 0; segment < segments; segment += 1) {
          const progress = segment / (segments - 1);
          const distance = 4 + reach * progress;
          const halfWidth = 6 + (endHalfWidth - 6) * progress;
          const jitter = (this.caveVisualRandom(exit.tileX + segment, exit.tileY - segment, salt + segment) - 0.5) * 2.2 * progress;
          const x = visual.x + insideX * distance;
          const y = visual.y + insideY * distance;
          left.push({ x: x + sideX * (halfWidth + jitter), y: y + sideY * (halfWidth + jitter) });
          right.push({ x: x - sideX * (halfWidth - jitter), y: y - sideY * (halfWidth - jitter) });
        }
        return [...left, ...right.reverse()];
      };
      // The narrow shaft begins above the wall ladder and falls onto the first few steps. It is
      // deliberately contained rather than an outward cone, so the opening feels overhead.
      graphics.fillStyle(0x9dcfc2, 0.028 * lightLevel);
      graphics.fillPoints(beam(54, 13, 0x6e71), true);
      graphics.fillStyle(0xc5e8d4, 0.06 * lightLevel);
      graphics.fillPoints(beam(31, 9, 0x6e91), true);
      graphics.fillStyle(0xeeffe6, 0.22 * lightLevel);
      graphics.fillEllipse(visual.x + insideX * 3, visual.y + insideY * 3, 16, 10);
    });
  }

  private caveLavaPoints(pool: CaveLavaPool, origin: CaveWorldOrigin): CaveRenderPoint[] {
    const center = caveWorldTilePosition(origin, pool.tileX, pool.tileY);
    const points: CaveRenderPoint[] = [];
    const count = 14;
    const phase = this.caveVisualRandom(pool.tileX, pool.tileY, 0x6d41) * Math.PI * 2;
    for (let index = 0; index < count; index += 1) {
      const angle = phase + index / count * Math.PI * 2;
      const variation = 0.76 + this.caveVisualRandom(pool.tileX + index, pool.tileY - index, 0x6d42 + index) * 0.35;
      points.push({
        x: center.x + Math.cos(angle) * pool.radiusX * WORLD_TILE_SIZE * variation,
        y: center.y + Math.sin(angle) * pool.radiusY * WORLD_TILE_SIZE * variation
      });
    }
    return points;
  }

  private drawCaveLavaRims(pools: readonly CaveLavaPool[], origin: CaveWorldOrigin): void {
    pools.forEach((pool) => {
      const center = caveWorldTilePosition(origin, pool.tileX, pool.tileY);
      // Lava is a contained liquid surface, not a cave light source. A thin dark mineral rim
      // anchors it to the floor without spilling any bright haze into neighbouring walls.
      this.drawCaveRockPatch(center.x, center.y, pool.radiusX * WORLD_TILE_SIZE + 8, pool.radiusY * WORLD_TILE_SIZE + 7, pool.tileX, pool.tileY, 0x6d43, 0x1d0b05, 0.96);
      this.fillCavePolygon(this.caveLavaPoints(pool, origin), 0x4a1206, 1);
    });
  }

  private updateCaveLava(time: number, force = false): void {
    const cave = this.activeCave;
    if (!cave || !cave.layout.lavaPools.length) {
      this.caveLavaGraphics.clear().setVisible(false);
      return;
    }
    const frame = Math.floor(time / 45);
    if (!force && frame === this.lastCaveLavaFrame) {
      return;
    }
    this.lastCaveLavaFrame = frame;
    const seconds = time / 1000;
    const graphics = this.caveLavaGraphics;
    graphics.clear().setVisible(true);
    cave.layout.lavaPools.forEach((pool) => {
      const center = caveWorldTilePosition(cave.origin, pool.tileX, pool.tileY);
      const points = this.caveLavaPoints(pool, cave.origin);
      // The solid base shares the seeded footprint with collision/swimming. Animated ripples
      // remain deliberately inset so no moving mark can cross the dark mineral rim.
      graphics.fillStyle(0x9d260b, 0.98);
      graphics.fillPoints(points as CaveRenderPoint[], true);
      for (let stream = 0; stream < 3; stream += 1) {
        const phase = seconds * (0.74 + stream * 0.13) + this.caveVisualRandom(pool.tileX, pool.tileY, 0x6d48 + stream) * Math.PI * 2;
        const x = center.x + Math.sin(phase * 0.77) * pool.radiusX * WORLD_TILE_SIZE * 0.25;
        const y = center.y + Math.cos(phase * 1.17) * pool.radiusY * WORLD_TILE_SIZE * 0.22;
        graphics.fillStyle(stream % 2 ? 0xd94714 : 0xed5c1b, 0.32 + (Math.sin(phase * 1.6) + 1) * 0.12);
        graphics.fillEllipse(x, y, pool.radiusX * WORLD_TILE_SIZE * (0.15 + stream * 0.018), pool.radiusY * WORLD_TILE_SIZE * 0.12);
      }
      for (let ripple = 0; ripple < 4; ripple += 1) {
        const phase = seconds * (0.56 + ripple * 0.08) + this.caveVisualRandom(pool.tileX, pool.tileY, 0x6d4c + ripple) * Math.PI * 2;
        const x = center.x + Math.sin(phase * 1.13) * pool.radiusX * WORLD_TILE_SIZE * 0.2;
        const y = center.y + Math.cos(phase * 0.93) * pool.radiusY * WORLD_TILE_SIZE * 0.18;
        const spread = 0.12 + (Math.sin(phase * 1.35) + 1) * 0.09;
        graphics.lineStyle(1.05, ripple % 2 ? 0xf07a28 : 0xffa33c, 0.22 + (Math.sin(phase) + 1) * 0.1);
        graphics.strokeEllipse(x, y, pool.radiusX * WORLD_TILE_SIZE * spread, pool.radiusY * WORLD_TILE_SIZE * spread * 0.38);
      }
      for (let bubble = 0; bubble < 6; bubble += 1) {
        const phase = seconds * (0.72 + bubble * 0.11) + this.caveVisualRandom(pool.tileX, pool.tileY, 0x6d50 + bubble) * Math.PI * 2;
        const x = center.x + Math.sin(phase * 1.21) * pool.radiusX * WORLD_TILE_SIZE * (0.22 + (bubble % 3) * 0.13);
        const y = center.y + Math.cos(phase * 1.73) * pool.radiusY * WORLD_TILE_SIZE * (0.2 + (bubble % 2) * 0.18);
        const size = 1.5 + (Math.sin(phase * 2.1) + 1) * 1.4;
        graphics.fillStyle(bubble % 2 ? 0xf48630 : 0xffb052, 0.48 + Math.sin(phase) * 0.12);
        graphics.fillCircle(x, y, size);
      }
    });
  }

  private resizeCaveFog(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    this.caveFogOverlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.caveFogMask.setAttribute('x', '0');
    this.caveFogMask.setAttribute('y', '0');
    this.caveFogMask.setAttribute('width', `${width}`);
    this.caveFogMask.setAttribute('height', `${height}`);
    this.caveFogMaskBase.setAttribute('width', `${width}`);
    this.caveFogMaskBase.setAttribute('height', `${height}`);
    this.caveFogDarkness.setAttribute('width', `${width}`);
    this.caveFogDarkness.setAttribute('height', `${height}`);
  }

  private createCaveFogOverlay(): void {
    const namespace = 'http://www.w3.org/2000/svg';
    const overlay = document.createElementNS(namespace, 'svg');
    overlay.classList.add('cave-fog-overlay');
    overlay.setAttribute('aria-hidden', 'true');
    // The SVG shares Phaser's viewport, not an intrinsic artboard. The browser's default
    // "meet" behavior letterboxes a non-matching viewport and leaves a hard vertical fog edge.
    overlay.setAttribute('preserveAspectRatio', 'none');
    const definitions = document.createElementNS(namespace, 'defs');
    const mask = document.createElementNS(namespace, 'mask');
    const maskId = 'wildbound-cave-fog-mask';
    mask.setAttribute('id', maskId);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
    mask.setAttribute('mask-type', 'luminance');
    this.caveFogMask = mask;
    this.caveFogMaskBase = document.createElementNS(namespace, 'rect');
    this.caveFogMaskBase.setAttribute('x', '0');
    this.caveFogMaskBase.setAttribute('y', '0');
    this.caveFogMaskBase.setAttribute('fill', '#ffffff');
    this.caveFogPlayerLight = document.createElementNS(namespace, 'circle');
    this.caveFogPlayerLight.setAttribute('fill', '#000000');
    mask.append(this.caveFogMaskBase, this.caveFogPlayerLight);
    definitions.appendChild(mask);
    this.caveFogDarkness = document.createElementNS(namespace, 'rect');
    this.caveFogDarkness.setAttribute('x', '0');
    this.caveFogDarkness.setAttribute('y', '0');
    this.caveFogDarkness.setAttribute('fill', '#020405');
    this.caveFogDarkness.setAttribute('fill-opacity', '0.995');
    this.caveFogDarkness.setAttribute('mask', `url(#${maskId})`);
    overlay.append(definitions, this.caveFogDarkness);
    document.getElementById('game')!.appendChild(overlay);
    this.caveFogOverlay = overlay;
  }

  private caveWorldToScreen(worldX: number, worldY: number): CaveRenderPoint {
    const camera = this.cameras.main;
    return {
      // The camera follows the avatar and keeps it at the viewport centre. Basing the light
      // from that same anchor avoids a visual drift while the camera's follow easing catches up.
      x: this.scale.width * 0.5 + (worldX - this.player.x) * camera.zoom,
      y: this.scale.height * 0.5 + (worldY - this.player.y) * camera.zoom
    };
  }

  private setCaveLight(circle: SVGCircleElement, worldX: number, worldY: number, radiusTiles: number): void {
    const screen = this.caveWorldToScreen(worldX, worldY);
    circle.setAttribute('cx', `${screen.x}`);
    circle.setAttribute('cy', `${screen.y}`);
    circle.setAttribute('r', `${radiusTiles * WORLD_TILE_SIZE * this.cameras.main.zoom}`);
  }

  private updateCaveVisibility(force = false): void {
    const cave = this.activeCave;
    if (!cave) {
      this.caveFogOverlay.classList.remove('is-visible');
      return;
    }
    if (!force && Math.hypot(
      this.player.x - this.lastCaveVisibilityWorldX,
      this.player.y - this.lastCaveVisibilityWorldY
    ) < CAVE_VISIBILITY_REFRESH_DISTANCE_PIXELS) {
      return;
    }
    this.lastCaveVisibilityWorldX = this.player.x;
    this.lastCaveVisibilityWorldY = this.player.y;
    this.setCaveLight(this.caveFogPlayerLight, this.player.x, this.player.y, CAVE_PLAYER_VISION_RADIUS_TILES);
    // Only the player reveals cave fog. Lava stays visible within explored space but never
    // punches a distant circular hole through the darkness.
    this.caveFogOverlay.classList.add('is-visible');
  }

  private drawCaveFloorTexture(layout: CaveLayout, origin: CaveWorldOrigin): void {
    // Floor texture follows the organic components rather than a tile scan, avoiding repeated
    // cell patterns while keeping each cave's geology tied to its seed and location.
    layout.terrain.chambers.forEach((chamber, chamberIndex) => {
      const patchCount = 3 + Math.floor(this.caveVisualRandom(chamberIndex, 0, 0x6c91) * 4);
      for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
        const angle = this.caveVisualRandom(chamberIndex, patchIndex, 0x6c92) * Math.PI * 2;
        const distance = 0.16 + this.caveVisualRandom(chamberIndex, patchIndex, 0x6c93) * 0.4;
        const centerX = origin.x + (chamber.x + Math.cos(angle) * chamber.radiusX * distance) * WORLD_TILE_SIZE;
        const centerY = origin.y + (chamber.y + Math.sin(angle) * chamber.radiusY * distance) * WORLD_TILE_SIZE;
        const detail = this.caveVisualRandom(chamberIndex, patchIndex, 0x6c94);
        this.drawCaveRockPatch(
          centerX,
          centerY,
          7 + detail * 11,
          3 + detail * 5,
          chamberIndex * 37 + patchIndex,
          patchIndex,
          0x6c95,
          detail > 0.76 ? 0x68716a : 0x4a524e,
          detail > 0.76 ? 0.2 : 0.13
        );
      }
    });
    layout.terrain.tunnels.forEach((tunnel, tunnelIndex) => {
      for (let patchIndex = 0; patchIndex < 2; patchIndex += 1) {
        const progress = 0.29 + patchIndex * 0.4 + this.caveVisualRandom(tunnelIndex, patchIndex, 0x6ca1) * 0.08;
        const inverse = 1 - progress;
        const centerX = origin.x + (inverse * inverse * tunnel.fromX + 2 * inverse * progress * tunnel.controlX + progress * progress * tunnel.toX) * WORLD_TILE_SIZE;
        const centerY = origin.y + (inverse * inverse * tunnel.fromY + 2 * inverse * progress * tunnel.controlY + progress * progress * tunnel.toY) * WORLD_TILE_SIZE;
        this.drawCaveRockPatch(centerX, centerY, 6, 2.8, tunnelIndex, patchIndex, 0x6ca2, 0x252f2c, 0.18);
      }
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
      const length = 25 + this.caveVisualRandom(contourIndex, index, 0x7221) * 27;
      const width = 3.4 + this.caveVisualRandom(contourIndex, index, 0x7222) * 4.4;
      const centerX = point.x + outwardX * (14 + CAVE_WALL_PUFFINESS * (13 + this.caveVisualRandom(contourIndex, index, 0x7223) * 11));
      const centerY = point.y + outwardY * (14 + CAVE_WALL_PUFFINESS * (13 + this.caveVisualRandom(contourIndex, index, 0x7223) * 11));
      const angle = Math.atan2(deltaY, deltaX);
      this.fillCavePolygon(this.createCaveVeinPoints(centerX, centerY, angle, length + 9, width + 3, contourIndex, index, 0x7224), 0x29483b, 0.92);
      this.fillCavePolygon(this.createCaveVeinPoints(centerX, centerY, angle, length, width, contourIndex, index, 0x7234), 0x82aa86, 0.76);
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
    // Coal uses a lifted graphite tone in the cave only, so it stays recognisable against the
    // dark rock while retaining a natural mineral rather than pickup-like appearance.
    const color = ore.type === 'coal' ? 0x75858e : RESOURCE_COLORS[
      ore.type === 'iron' ? ResourceType.Iron : ore.type === 'gold' ? ResourceType.Gold : ResourceType.Diamond
    ];
    this.drawCaveOreFormation(ore, origin, color, false);
  }

  private caveOreAnchor(ore: CaveOre, origin: CaveWorldOrigin): { readonly x: number; readonly y: number; readonly angle: number } {
    const position = caveWorldTilePosition(origin, ore.tileX, ore.tileY);
    return { x: position.x, y: position.y, angle: this.caveVisualRandom(ore.tileX, ore.tileY, 0x7311) * Math.PI };
  }

  private drawMinedCaveOreGouge(ore: CaveOre, origin: CaveWorldOrigin): void {
    this.drawCaveOreFormation(ore, origin, 0x111718, true);
    const position = this.caveOreAnchor(ore, origin);
    const salt = 0x7311;
    this.drawCaveRockPatch(position.x - Math.cos(position.angle) * 6, position.y - Math.sin(position.angle) * 6 + 4, 5.2, 2.8, ore.tileX, ore.tileY, salt + 97, 0x25302c, 0.88);
  }

  private drawCaveOreFormation(ore: CaveOre, origin: CaveWorldOrigin, mineralColor: number, mined: boolean): void {
    const position = this.caveOreAnchor(ore, origin);
    const salt = 0x7311;
    const angle = position.angle;
    const baseLength = 43;
    const baseWidth = 6.8;
    const hostRockColor = mined ? 0x4b5750 : 0x46514b;
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
    if (this.worldMapOpen || this.inventoryOpen || this.craftingOpen || this.pauseMenuOpen) {
      this.updateCaveFootsteps(delta, false);
      this.cancelTonicDrinking();
      this.updatePlayerAvatar(delta, false);
      return;
    }

    const horizontal = Number(this.isDown('right')) - Number(this.isDown('left'));
    const vertical = Number(this.isDown('down')) - Number(this.isDown('up'));
    this.updateSwimmingState();
    const wantsToMove = horizontal !== 0 || vertical !== 0;
    let isMoving = false;
    this.sampleMovementPerformance(time, delta, wantsToMove);
    this.updateFacing(horizontal, vertical);
    if (wantsToMove) {
      const length = Math.hypot(horizontal, vertical);
      const distance = PLAYER_SPEED * this.potionSpeedMultiplier() * (this.isSwimming ? SWIM_SPEED_MULTIPLIER : 1) * delta / 1000;
      isMoving = this.moveCavePlayer(horizontal / length * distance, vertical / length * distance);
      if (isMoving) {
        this.markSaveDirty();
      }
    }
    this.updateSwimmingState();
    this.footprintTrail.recordMovement(time, this.player.x, this.player.y, isMoving && !this.isSwimming);
    this.updateCaveFootsteps(delta, isMoving);
    if (this.gameSettings.video.quality.animateLava) {
      this.updateCaveLava(time);
    }
    this.updateCaveEntranceDaylight(time);
    this.updateCaveVisibility();
    this.updateCaveInteraction();
    this.updateDropInteraction(time);
    this.updateTonicDrinking(delta);
    this.updateCaveHarvesting(delta);
    this.updatePlayerAvatar(delta, isMoving);
  }

  private moveCavePlayer(deltaX: number, deltaY: number): boolean {
    const cave = this.activeCave;
    if (!cave) {
      return false;
    }
    const tryMove = (x: number, y: number): boolean => {
      const tileX = (x - cave.origin.x) / WORLD_TILE_SIZE;
      const tileY = (y - cave.origin.y) / WORLD_TILE_SIZE;
      if (tileY < 0 || tileY >= cave.layout.height || tileX < 0 || tileX >= cave.layout.width
        || !caveTerrainContainsPoint(cave.layout.terrainContours, tileX, tileY)) {
        return false;
      }
      // Lava is a traversable cave liquid. The exact terrain contour remains the sole wall
      // boundary, matching the visible cave floor without hidden pool collision.
      return true;
    };
    let moved = false;
    if (tryMove(this.player.x + deltaX, this.player.y)) {
      this.player.x += deltaX;
      moved = moved || deltaX !== 0;
    }
    if (tryMove(this.player.x, this.player.y + deltaY)) {
      this.player.y += deltaY;
      moved = moved || deltaY !== 0;
    }
    return moved;
  }

  private updateCaveInteraction(force = false): void {
    const cave = this.activeCave;
    if (!cave) {
      return;
    }
    let nearbyExit: CaveSurfaceExit | null = null;
    let nearestExitDistanceSquared = 52 * 52;
    cave.layout.surfaceExits.forEach((exit) => {
      const position = this.caveExitVisual(cave, exit);
      const distanceSquared = Phaser.Math.Distance.Squared(this.player.x, this.player.y, position.x, position.y);
      if (distanceSquared < nearestExitDistanceSquared) {
        nearbyExit = exit;
        nearestExitDistanceSquared = distanceSquared;
      }
    });
    this.caveExitTarget = nearbyExit;
    this.caveExitNearby = nearbyExit !== null;
    let nearest: CaveOre | null = null;
    let nearestDistanceSquared = 84 * 84;
    const localTileX = Math.floor((this.player.x - cave.origin.x) / WORLD_TILE_SIZE);
    const localTileY = Math.floor((this.player.y - cave.origin.y) / WORLD_TILE_SIZE);
    const bucketX = Math.floor(localTileX / CAVE_INTERACTION_BUCKET_SIZE_TILES);
    const bucketY = Math.floor(localTileY / CAVE_INTERACTION_BUCKET_SIZE_TILES);
    // Ore layouts in huge caves can contain thousands of formations. A fixed local 3 x 3 bucket
    // query preserves the same interaction radius while keeping the per-frame cave work bounded.
    for (let candidateBucketY = bucketY - 1; candidateBucketY <= bucketY + 1; candidateBucketY += 1) {
      for (let candidateBucketX = bucketX - 1; candidateBucketX <= bucketX + 1; candidateBucketX += 1) {
        cave.oreBuckets.get(caveOreBucketKey(candidateBucketX, candidateBucketY))?.forEach((ore) => {
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
      }
    }
    this.caveOreTarget = nearest;

    if (nearbyExit) {
      const exit = nearbyExit as CaveSurfaceExit;
      const position = this.caveExitVisual(cave, exit);
      this.interactionHighlight.setRadius(48).setPosition(position.x, position.y).setVisible(true);
    } else if (nearest) {
      const ore = nearest as CaveOre;
      const position = caveWorldTilePosition(cave.origin, ore.tileX, ore.tileY);
      this.interactionHighlight.setRadius(36).setPosition(position.x, position.y).setVisible(true);
    } else {
      this.interactionHighlight.setVisible(false);
    }
  }

  private updateCaveHarvesting(delta: number): void {
    if (this.drinkingPotion) {
      this.cancelHarvesting(false);
      return;
    }
    if (this.harvestRequiresControlRelease) {
      if (!this.isControlDown('harvestAttack')) {
        this.harvestRequiresControlRelease = false;
      }
      return;
    }
    if (!this.isControlDown('harvestAttack') || !this.caveOreTarget) {
      if (this.caveHarvestOre) {
        this.caveHarvestOre = null;
        this.harvestElapsedMs = 0;
        this.harvestProgressGraphics.clear();
      }
      return;
    }
    const requirement = miningRequirementForCaveOre(this.caveOreTarget.type);
    if (!meetsMiningRequirement(this.equippedTool, requirement)) {
      this.caveHarvestOre = null;
      this.harvestElapsedMs = 0;
      this.harvestProgressGraphics.clear();
      this.harvestRequiresControlRelease = true;
      this.showWorldFeedback(
        this.player.x,
        this.player.y - 28,
        `Requires ${TOOL_DEFINITIONS[requirement!].label}`
      );
      return;
    }
    if (!this.caveHarvestOre || this.caveHarvestOre.id !== this.caveOreTarget.id) {
      this.caveHarvestOre = this.caveOreTarget;
      this.harvestElapsedMs = 0;
      this.harvestContactSoundCount = 0;
    }
    const speed = this.caveMiningSpeed();
    const durationMs = HARVEST_DURATION_MS
      * caveOreMiningDurationMultiplierFor(this.caveHarvestOre.type)
      / speed;
    this.harvestElapsedMs = Math.min(durationMs, this.harvestElapsedMs + delta);
    const cave = this.activeCave;
    if (!cave) {
      return;
    }
    const position = caveWorldTilePosition(cave.origin, this.caveHarvestOre.tileX, this.caveHarvestOre.tileY);
    const progress = this.harvestElapsedMs / durationMs;
    this.drawHarvestProgressAt(position.x, position.y - 32, progress);
    this.updateCaveOreContactSound(this.caveHarvestOre, progress, durationMs);
    if (this.harvestElapsedMs >= durationMs) {
      const ore = this.caveHarvestOre;
      this.caveHarvestOre = null;
      this.harvestElapsedMs = 0;
      this.harvestProgressGraphics.clear();
      this.harvestRequiresControlRelease = true;
      const resource = ore.type === 'coal' ? ResourceType.Coal : ore.type === 'iron' ? ResourceType.Iron
        : ore.type === 'gold' ? ResourceType.Gold : ResourceType.Diamond;
      const amount = caveOreYieldFor(
        this.worldSeed,
        cave.layout.entrance.systemRootTileX,
        cave.layout.entrance.systemRootTileY,
        ore
      );
      if (!this.inventory.canAdd(resource, amount)) {
        this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
        return;
      }
      if (this.sessionWorldState.harvestCaveOre(ore.id)) {
        this.inventory.add(resource, amount);
        this.showWorldFeedback(this.player.x, this.player.y - 28, `+ ${amount} ${resourceLabel(resource)}`);
        this.handleInventoryChanged();
        this.drawActiveCave();
        this.updateCaveInteraction(true);
      }
    }
  }

  private caveMiningSpeed(): number {
    return caveOreMiningSpeedForTool(this.equippedTool) * this.hasteMultiplier();
  }

  private updateCaveOreContactSound(ore: CaveOre, progress: number, durationMs: number): void {
    const contactCount = caveOreHarvestSoundContactCountFor(ore.type, durationMs);
    const scheduledContacts = Math.min(contactCount, Math.ceil(progress * contactCount));
    const contactBudgetSeconds = durationMs / 1_000 / contactCount;
    while (this.harvestContactSoundCount < scheduledContacts) {
      this.ambientAudio?.playCaveOreImpact(
        ore.type,
        ore.tileX,
        ore.tileY,
        contactBudgetSeconds
      );
      this.harvestContactSoundCount += 1;
    }
  }

  private updateInteractionTarget(force = false): void {
    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);

    if (!force && tileX === this.lastInteractionTileX && tileY === this.lastInteractionTileY) {
      return;
    }

    this.lastInteractionTileX = tileX;
    this.lastInteractionTileY = tileY;
    this.interactionTarget = this.chunkManager.findNearbyFeature(
      this.player.x,
      this.player.y,
      96,
      (candidateX, candidateY) => !this.sessionWorldState.isFeatureHarvested(candidateX, candidateY)
        && !this.chunkManager.isCaveFormationAtTile(candidateX, candidateY)
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
    const label = `Press E to pick up ${this.inventoryItemLabel(drop.item)}`;
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
    this.dropHintPanel.fillStyle(this.inventoryItemColor(drop.item), 1);
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

    if (!this.inventory.canAdd(drop.item, drop.amount)) {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
      return true;
    }

    const collected = this.dropManager.collect(drop.id);
    if (collected) {
      this.inventory.add(collected.item, collected.amount);
      this.showWorldFeedback(this.player.x, this.player.y - 28, `+ ${collected.amount} ${this.inventoryItemLabel(collected.item)}`);
      this.handleInventoryChanged();
      this.updateDropInteraction(0, true);
    }

    return true;
  }

  // Anything the player has placed uses the same safe return path: storage must be empty and a
  // brewing station cannot be mid-job, but lanterns, shelters, beacons, and every other
  // placeable can all be packed directly from the world with the normal pickup binding.
  private pickupNearbyPlacedObject(): boolean {
    if (this.heldPlaceable()) {
      return false;
    }
    const object = this.nearbyPlacedObject ?? this.placeableManager.nearest(this.player.x, this.player.y);
    if (!object) {
      return false;
    }

    const result = this.pickUpPlacedObject(object);
    if (!result.success) {
      this.showWorldFeedback(this.player.x, this.player.y - 28, result.message);
    }
    return true;
  }

  private updateHarvesting(delta: number): void {
    if (this.nearbyLandmarkEntrance) {
      this.cancelHarvesting();
      return;
    }
    if (this.surfaceLandmarkMaterialTarget) {
      this.updateLandmarkMaterialHarvesting(delta, false);
      return;
    }
    if (this.drinkingPotion) {
      this.cancelHarvesting(false);
      return;
    }
    if (this.harvestRequiresControlRelease) {
      if (!this.isControlDown('harvestAttack')) {
        this.harvestRequiresControlRelease = false;
      }

      return;
    }

    if (this.inventoryOpen || this.craftingOpen || this.placedObjectOverlay.isOpen || this.heldPlaceable()
      || !this.isControlDown('harvestAttack') || !this.interactionTarget) {
      this.cancelHarvesting();
      return;
    }

    const requirement = miningRequirementForFeature(this.interactionTarget.feature);
    if (!meetsMiningRequirement(this.equippedTool, requirement)) {
      this.cancelHarvesting();
      this.harvestRequiresControlRelease = true;
      this.showWorldFeedback(
        this.player.x,
        this.player.y - 28,
        `Requires ${TOOL_DEFINITIONS[requirement!].label}`
      );
      return;
    }

    if (!this.harvestTarget || !this.sameTarget(this.harvestTarget, this.interactionTarget)) {
      this.cancelHarvesting();
      this.harvestTarget = { ...this.interactionTarget };
      // Contacts are scheduled from normalized harvest progress, so every configured tool tier
      // gets its exact count regardless of renderer frame rate or harvest speed.
      this.harvestContactSoundCount = 0;
    }

    const speedMultiplier = harvestSpeedForFeature(this.equippedTool, this.harvestTarget.feature) * this.hasteMultiplier();
    const durationMs = HARVEST_DURATION_MS / speedMultiplier;
    const handSpeedMultiplier = harvestSpeedForFeature(null, this.harvestTarget.feature) * this.hasteMultiplier();
    // Material tier only affects the contact phrase when it actually makes this target faster.
    // A diamond pickaxe, hoe, or sword used on a tree therefore keeps the tree's hand cadence.
    const usesFasterThanHandTool = speedMultiplier > handSpeedMultiplier + 0.0001;
    this.harvestElapsedMs = Math.min(this.harvestElapsedMs + delta, durationMs);
    const progress = this.harvestElapsedMs / durationMs;
    this.chunkManager.setHarvestAnimation(this.harvestTarget.tileX, this.harvestTarget.tileY, progress);
    this.drawHarvestProgress(this.harvestTarget, progress);

    this.updateHarvestContactSound(this.harvestTarget, progress, durationMs, usesFasterThanHandTool);

    if (progress >= 1) {
      this.completeHarvest();
      return;
    }
  }

  private updateHarvestContactSound(
    target: InteractionTarget,
    progress: number,
    durationMs: number,
    usesFasterThanHandTool: boolean
  ): void {
    const contactCount = harvestSoundContactCountFor(
      target.feature,
      usesFasterThanHandTool ? this.equippedTool : null
    );
    const scheduledContacts = Math.min(contactCount, Math.ceil(progress * contactCount));
    const contactBudgetSeconds = durationMs / 1_000 / contactCount;
    while (this.harvestContactSoundCount < scheduledContacts) {
      this.ambientAudio?.playHarvestImpact(
        target.feature,
        target.tileX,
        target.tileY,
        contactBudgetSeconds
      );
      this.harvestContactSoundCount += 1;
    }
  }

  private completeHarvest(): void {
    const target = this.harvestTarget;
    if (!target) {
      return;
    }

    this.cancelHarvesting();
    this.harvestRequiresControlRelease = true;
    const resource = resourceForFeature(target.feature);

    if (!this.inventory.canAdd(resource, 1)) {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
      return;
    }

    if (!this.chunkManager.harvestFeature(target.tileX, target.tileY)) {
      return;
    }

    this.ambientAudio?.playHarvest(target.feature, target.tileX, target.tileY);
    this.inventory.add(resource, 1);
    this.showWorldFeedback(this.player.x, this.player.y - 28, `+ 1 ${resourceLabel(resource)}`);
    this.handleInventoryChanged();
    this.updateInteractionTarget(true);
  }

  private cancelHarvesting(clearProgress = true): void {
    if (this.harvestTarget) {
      this.chunkManager.clearHarvestAnimation(this.harvestTarget.tileX, this.harvestTarget.tileY);
    }

    this.harvestTarget = null;
    this.caveHarvestOre = null;
    this.surfaceLandmarkHarvestMaterial = null;
    this.interiorLandmarkHarvestMaterial = null;
    this.harvestElapsedMs = 0;
    this.harvestContactSoundCount = 0;
    if (clearProgress) {
      this.harvestProgressGraphics.clear();
    }
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

  private claimCraftedTool(recipe: CraftingRecipe, destinationIndex: number): boolean {
    const result = applyCraftingRecipe(this.inventory, recipe, destinationIndex);
    if (result === 'missing-ingredients') {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Need more resources');
      return false;
    }
    if (result === 'inventory-full') {
      this.showWorldFeedback(this.player.x, this.player.y - 28, 'Inventory full');
      return false;
    }

    const outputLabel = isToolId(recipe.output)
      ? TOOL_DEFINITIONS[recipe.output].label
      : PLACEABLE_DEFINITIONS[recipe.output].label;
    this.showWorldFeedback(this.player.x, this.player.y - 28, `Crafted ${outputLabel}`);
    return true;
  }

  private selectHotbarSlot(slotIndex: number): void {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= HOTBAR_SLOT_COUNT) {
      return;
    }

    if (slotIndex !== this.activeHotbarSlot) {
      this.cancelTonicDrinking();
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

  private heldTonic(): { readonly id: PotionId; readonly slotIndex: number } | null {
    const slot = this.inventory.getSlots()[this.activeHotbarSlot];
    return slot && isPotionId(slot.item) ? { id: slot.item, slotIndex: this.activeHotbarSlot } : null;
  }

  private updateTonicDrinking(delta: number): void {
    const tonic = this.heldTonic();
    const isHoldingConsumeControl = this.isControlDown('consumeTonic');
    if (this.tonicDrinkRequiresRelease) {
      if (!isHoldingConsumeControl) {
        this.tonicDrinkRequiresRelease = false;
      }
      return;
    }
    if (!tonic || !isHoldingConsumeControl) {
      this.cancelTonicDrinking();
      return;
    }
    if (!this.drinkingPotion || this.drinkingPotion.id !== tonic.id || this.drinkingPotion.slotIndex !== tonic.slotIndex) {
      // A tonic is a hand-held item. Clear any stale equipped-tool state that could remain if
      // the player dragged this bottle into the currently selected hotbar slot.
      if (this.equippedTool) {
        this.setEquippedTool(null);
      }
      this.cancelHarvesting();
      this.drinkingPotion = tonic;
      this.tonicDrinkElapsedMs = 0;
    }

    this.tonicDrinkElapsedMs = Math.min(TONIC_DRINK_DURATION_MS, this.tonicDrinkElapsedMs + delta);
    this.drawHarvestProgressAt(this.player.x, this.player.y - 38, this.tonicDrinkElapsedMs / TONIC_DRINK_DURATION_MS);
    if (this.tonicDrinkElapsedMs < TONIC_DRINK_DURATION_MS) {
      return;
    }

    // Validate the active slot again at completion. This keeps drinking deterministic even if a
    // hotbar change or inventory mutation occurred during the held input.
    const activeSlot = this.inventory.getSlots()[tonic.slotIndex];
    if (!activeSlot || activeSlot.item !== tonic.id || !isPotionId(activeSlot.item)) {
      this.cancelTonicDrinking();
      return;
    }
    const consumed = this.inventory.takeFromSlot(tonic.slotIndex, 1);
    if (!consumed) {
      this.cancelTonicDrinking();
      return;
    }
    const definition = POTION_DEFINITIONS[tonic.id];
    this.activePotionEffects.set(definition.effect, Date.now() + definition.durationMs);
    this.showWorldFeedback(this.player.x, this.player.y - 28, `${definition.label} · ${definition.detail}`);
    this.handleInventoryChanged();
    this.tonicDrinkRequiresRelease = true;
    this.cancelTonicDrinking();
  }

  private cancelTonicDrinking(): void {
    if (!this.drinkingPotion) {
      return;
    }
    this.drinkingPotion = null;
    this.tonicDrinkElapsedMs = 0;
    this.harvestProgressGraphics.clear();
  }

  private restorePotionEffects(savedEffects: SaveGameData['effects'] | undefined): void {
    this.activePotionEffects.clear();
    const now = Date.now();
    savedEffects?.activePotions.forEach((effect) => {
      if (effect.expiresAtMs > now) {
        this.activePotionEffects.set(effect.effect, effect.expiresAtMs);
      }
    });
  }

  private updatePotionEffects(): void {
    const now = Date.now();
    let expired = false;
    this.activePotionEffects.forEach((expiresAtMs, effect) => {
      if (expiresAtMs <= now) {
        this.activePotionEffects.delete(effect);
        expired = true;
      }
    });
    if (expired) {
      this.markSaveDirty();
    }
    this.potionEffectOverlay.update(this.activePotionEffects, now);
  }

  private hasPotionEffect(effect: PotionEffect): boolean {
    return (this.activePotionEffects.get(effect) ?? 0) > Date.now();
  }

  private potionSpeedMultiplier(): number {
    return this.hasPotionEffect('speed') ? 1.35 : 1;
  }

  private hasteMultiplier(): number {
    return this.hasPotionEffect('haste') ? 1.45 : 1;
  }

  private strengthMultiplier(): number {
    // Combat has deliberately not been introduced yet. Keeping the modifier here means the
    // future damage system can consume the active strength effect without changing potion saves.
    return this.hasPotionEffect('strength') ? 1.5 : 1;
  }

  private updateHotbarVisibility(): void {
    this.hotbarOverlay.setVisible(!this.inventoryOpen && !this.craftingOpen && !this.worldMapOpen && !this.pauseMenuOpen
      && !this.placedObjectOverlay.isOpen);
  }

  private dropInventorySlot(slot: InventorySlot): void {
    if (!this.worldReady || this.pauseMenuOpen) {
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
    this.showWorldFeedback(this.player.x, this.player.y - 28, `Dropped ${slot.amount} ${this.inventoryItemLabel(slot.item)}`);
    this.markSaveDirty();
    this.updateDropInteraction(0, true);
  }

  private inventoryItemLabel(item: InventoryItem): string {
    if (isToolId(item)) {
      return TOOL_DEFINITIONS[item].label;
    }
    if (isPlaceableId(item)) {
      return PLACEABLE_DEFINITIONS[item].label;
    }
    if (isPotionId(item)) {
      return POTION_DEFINITIONS[item].label;
    }
    return resourceLabel(item);
  }

  private inventoryItemColor(item: InventoryItem): number {
    if (isToolId(item)) {
      return TOOL_HEAD_PALETTES[TOOL_DEFINITIONS[item].headMaterial].fill;
    }
    if (isPlaceableId(item)) {
      if (item === PlaceableId.Waypoint) {
        return 0x45b9ff;
      }
      if (item === PlaceableId.TrailLantern) {
        return 0xffc861;
      }
      if (item === PlaceableId.TravelStone) {
        return 0x62e6dc;
      }
      return PLACEABLE_DEFINITIONS[item].interaction === 'storage' ? 0xa76a3b : 0x9aa5a3;
    }
    if (isPotionId(item)) {
      return POTION_DEFINITIONS[item].color;
    }
    return RESOURCE_COLORS[item];
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

    const worldApi = window.wildboundWorlds;
    if (!worldApi || !this.worldId) {
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
      mode: this.worldMode,
      player: { x: this.player.x, y: this.player.y },
      inventory: [...this.inventory.getSlots()],
      equipment: { equippedTool: this.equippedTool, activeHotbarSlot: this.activeHotbarSlot },
      effects: {
        activePotions: Array.from(this.activePotionEffects, ([effect, expiresAtMs]) => ({ effect, expiresAtMs }))
          .filter((effect) => effect.expiresAtMs > Date.now())
      },
      world: this.sessionWorldState.toSaveData(),
      activeCave: this.activeCave ? {
        entranceTileX: this.activeCave.entrance.tileX,
        entranceTileY: this.activeCave.entrance.tileY,
        returnWorldX: this.activeCave.returnWorldX,
        returnWorldY: this.activeCave.returnWorldY
      } : undefined,
      activeLandmarkInterior: this.activeLandmarkInterior ? {
        landmarkId: this.activeLandmarkInterior.landmark.id,
        landmarkType: this.activeLandmarkInterior.landmark.type,
        centerTileX: this.activeLandmarkInterior.landmark.centerTileX,
        centerTileY: this.activeLandmarkInterior.landmark.centerTileY,
        returnWorldX: this.activeLandmarkInterior.returnWorldX,
        returnWorldY: this.activeLandmarkInterior.returnWorldY,
        ...(this.activeLandmarkInterior.landmark.type === LandmarkType.Watchtower
          ? { floorNumber: this.activeLandmarkInterior.layout.floorNumber }
          : {})
      } : undefined
    };

    try {
      await worldApi.save(this.worldId, saveData);
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

    if (this.activeLandmarkInterior) {
      const interior = this.activeLandmarkInterior;
      const localTileX = Math.floor((this.player.x - interior.origin.x) / WORLD_TILE_SIZE);
      const localTileY = Math.floor((this.player.y - interior.origin.y) / WORLD_TILE_SIZE);
      const remainingMaterials = interior.layout.materialNodes.filter(
        (material) => !this.sessionWorldState.isLandmarkMaterialHarvested(material.id)
      ).length;
      this.debugElement.textContent = [
        'WILDBOUND // LANDMARK INTERIOR',
        `Landmark    ${interior.landmark.label}`,
        `Location    ${interior.layout.themeLabel}`,
        `Interior    ${interior.layout.width} x ${interior.layout.height} tiles`,
        `Tower floor ${interior.landmark.type === LandmarkType.Watchtower ? `${interior.layout.floorNumber} / 3` : 'single level'}`,
        `Tile        ${localTileX}, ${localTileY}`,
        `Floor       ${interior.layout.floorLabel}`,
        `Target      ${this.interiorLandmarkMaterialTarget
          ? resourceLabel(this.interiorLandmarkMaterialTarget.resource)
          : this.landmarkInteriorStairTarget
            ? `${this.landmarkInteriorStairTarget.direction} stairs`
            : this.landmarkInteriorExitNearby ? 'exit' : 'none'}`,
        `Materials   ${remainingMaterials} remaining / ${interior.layout.materialNodes.length} generated`,
        `Harvested   ${this.sessionWorldState.harvestedLandmarkMaterialCount} landmark materials`,
        `Renderer    ${this.renderBackend}`,
        `Moving FPS  ${this.movingFps > 0 ? this.movingFps.toFixed(0) : '--'} (${this.movingWorstFrameMs.toFixed(1)}ms worst)`,
        `FPS         ${this.renderedFps.toFixed(0)} (${this.frameRateLimitLabel()})`
      ].join('\n');
      return;
    }

    if (this.activeCave) {
      const cave = this.activeCave;
      const localTileX = Math.floor((this.player.x - cave.origin.x) / WORLD_TILE_SIZE);
      const localTileY = Math.floor((this.player.y - cave.origin.y) / WORLD_TILE_SIZE);
      const localDepth = cave.layout.depthByTile[Math.max(0, Math.min(cave.layout.height - 1, localTileY))]
        ?.[Math.max(0, Math.min(cave.layout.width - 1, localTileX))] ?? 0;
      const depthMeter = Math.round(Math.max(0, localDepth) * CAVE_DEPTH_SCALE_MAX);
      const depthBars = Math.max(0, Math.min(10, Math.round(depthMeter / CAVE_DEPTH_SCALE_MAX * 10)));
      const remainingOres = cave.layout.ores.filter((ore) => !this.sessionWorldState.isCaveOreHarvested(ore.id)).length;
      this.debugElement.textContent = [
        'WILDBOUND // CAVE STATUS',
        `Cave        ${cave.entrance.id}`,
        `Cave class  ${cave.entrance.depth}`,
        `Depth meter ${depthMeter} / ${CAVE_DEPTH_SCALE_MAX} [${'█'.repeat(depthBars)}${'·'.repeat(10 - depthBars)}]`,
        `Interior    ${cave.layout.width} x ${cave.layout.height} tiles`,
        `Tile        ${localTileX}, ${localTileY}`,
        `Target      ${this.caveOreTarget?.type ?? (this.caveExitNearby ? 'exit' : 'none')}`,
        `Ores        ${remainingOres} remaining / ${this.sessionWorldState.harvestedCaveOreCount} harvested`,
        `Tool        ${this.equippedTool ? TOOL_DEFINITIONS[this.equippedTool].label : 'hand'}`,
        `Renderer    ${this.renderBackend}`,
        `Moving FPS  ${this.movingFps > 0 ? this.movingFps.toFixed(0) : '--'} (${this.movingWorstFrameMs.toFixed(1)}ms worst)`,
        `FPS         ${this.renderedFps.toFixed(0)} (${this.frameRateLimitLabel()})`
      ].join('\n');
      return;
    }

    const tileX = worldToTile(this.player.x);
    const tileY = worldToTile(this.player.y);
    const climate = climateAtTile(this.worldSeed, tileX, tileY);
    const generatedFeature = this.chunkManager.isCaveFormationAtTile(tileX, tileY)
      ? null
      : featureAtTile(this.worldSeed, tileX, tileY);
    const feature = this.sessionWorldState.isFeatureHarvested(tileX, tileY) ? 'harvested' : (generatedFeature ?? 'none');
    const target = this.surfaceLandmarkMaterialTarget
      ? resourceLabel(this.surfaceLandmarkMaterialTarget.resource)
      : this.nearbyLandmarkEntrance
        ? `${this.nearbyLandmarkEntrance.landmark.label} entrance`
        : this.interactionTarget?.feature ?? 'none';
    const landmark = landmarkAtTile(this.worldSeed, tileX, tileY)?.label ?? 'none';
    const nearestLandmark = nearestLandmarkToTile(this.worldSeed, tileX, tileY);
    const nearestLandmarkDirection = nearestLandmark
      ? this.cardinalDirection(nearestLandmark.deltaTileX, nearestLandmark.deltaTileY)
      : '';
    const nearestLandmarkText = nearestLandmark
      ? `${nearestLandmark.landmark.label} · ${Math.round(nearestLandmark.edgeDistanceTiles)} tiles ${nearestLandmarkDirection}`
      : 'none found';
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
      `Nearest LM  ${nearestLandmarkText}`,
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
      `Renderer    ${this.renderBackend}`,
      `Seed        ${this.worldSeed}`,
      `Chunk       ${this.chunkManager.currentChunkX}, ${this.chunkManager.currentChunkY}`,
      `Loaded      ${this.chunkManager.loadedChunkCount} chunks`,
      `Streaming   ${this.chunkManager.pendingChunkCount} terrain / ${this.chunkManager.pendingGroundGrassChunkCount} grass pending`,
      `Landmarks   ${this.chunkManager.loadedLandmarkCount} nearby`,
      `LM lights   ${this.chunkManager.loadedLandmarkNightLightCount} projected`,
      `Rare finds  ${this.sessionWorldState.harvestedLandmarkMaterialCount} harvested`,
      `Moving FPS  ${this.movingFps > 0 ? this.movingFps.toFixed(0) : '--'} (${this.movingWorstFrameMs.toFixed(1)}ms worst)`,
      `FPS         ${this.renderedFps.toFixed(0)} (${this.frameRateLimitLabel()})`
    ].join('\n');
  }

  private cardinalDirection(deltaX: number, deltaY: number): string {
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
      return 'HERE';
    }

    const vertical = deltaY < -0.5 ? 'N' : deltaY > 0.5 ? 'S' : '';
    const horizontal = deltaX < -0.5 ? 'W' : deltaX > 0.5 ? 'E' : '';
    return `${vertical}${horizontal}`;
  }

  // Phaser's TimeStep `actualFps` reports every browser animation callback. When the game is
  // capped, those callbacks can still arrive at a monitor's higher refresh rate even though the
  // scene (and therefore rendering/gameplay) only updates at the selected limit. Count this
  // scene's real updates instead so F3 reports the effective game frame rate.
  private sampleRenderedFrameRate(time: number): void {
    if (!Number.isFinite(this.frameSampleStartedAt)) {
      this.frameSampleStartedAt = time;
      this.frameSampleCount = 0;
    }

    this.frameSampleCount += 1;
    const elapsed = time - this.frameSampleStartedAt;
    if (elapsed < 1000) {
      return;
    }

    this.renderedFps = this.frameSampleCount * 1000 / elapsed;
    this.frameSampleStartedAt = time;
    this.frameSampleCount = 0;
  }

  private frameRateLimitLabel(): string {
    const limit = this.gameSettings.video.performance.maxFps;
    return limit > 0 ? `${limit} cap` : 'unlimited';
  }

  private sampleMovementPerformance(time: number, delta: number, isMoving: boolean): void {
    // The sampler is only active while F3 is visible. It reports movement-specific throughput
    // and the worst recent movement frame, so a chunk-build hitch cannot be hidden by idle FPS.
    if (!this.isDebugVisible) {
      return;
    }
    if (!isMoving) {
      this.movementSampleStartedAt = Number.NaN;
      this.movementSampleFrameCount = 0;
      this.movementSampleWorstFrameMs = 0;
      return;
    }
    if (!Number.isFinite(this.movementSampleStartedAt)) {
      this.movementSampleStartedAt = time;
      this.movementSampleFrameCount = 0;
      this.movementSampleWorstFrameMs = 0;
    }
    this.movementSampleFrameCount += 1;
    this.movementSampleWorstFrameMs = Math.max(this.movementSampleWorstFrameMs, delta);
    const elapsed = time - this.movementSampleStartedAt;
    if (elapsed < 1000) {
      return;
    }
    this.movingFps = this.movementSampleFrameCount * 1000 / elapsed;
    this.movingWorstFrameMs = this.movementSampleWorstFrameMs;
    this.movementSampleStartedAt = time;
    this.movementSampleFrameCount = 0;
    this.movementSampleWorstFrameMs = 0;
  }
}

export const CONTROL_ACTIONS = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'moveUpAlternate',
  'moveDownAlternate',
  'moveLeftAlternate',
  'moveRightAlternate',
  'harvestAttack',
  'openInventory',
  'enterExitCave',
  'pickUpItem',
  'pickUpUtility',
  'placeUtility',
  'accessUtility',
  'consumeTonic',
  'worldMap',
  'pauseMenu',
  'debugOverlay'
] as const;

export type ControlAction = (typeof CONTROL_ACTIONS)[number];
export type ControlBinding = string;

export const FRAME_RATE_OPTIONS = [30, 60, 120, 0] as const;
export type FrameRateLimit = (typeof FRAME_RATE_OPTIONS)[number];

export const CHUNK_GENERATION_RADIUS_OPTIONS = [1, 2, 3, 4] as const;
export type ChunkGenerationRadius = (typeof CHUNK_GENERATION_RADIUS_OPTIONS)[number];

export const CHUNK_STREAMING_PACE_OPTIONS = ['gentle', 'balanced', 'rapid'] as const;
export type ChunkStreamingPace = (typeof CHUNK_STREAMING_PACE_OPTIONS)[number];

export const EFFECT_UPDATE_RATE_OPTIONS = [15, 25, 30, 60] as const;
export type EffectUpdateRate = (typeof EFFECT_UPDATE_RATE_OPTIONS)[number];

export const PARTICLE_STRENGTH_OPTIONS = [0, 0.5, 1, 1.6] as const;
export type ParticleStrength = (typeof PARTICLE_STRENGTH_OPTIONS)[number];

export const NIGHT_LIGHT_RESOLUTION_OPTIONS = [0.35, 0.5, 0.75, 1] as const;
export type NightLightResolution = (typeof NIGHT_LIGHT_RESOLUTION_OPTIONS)[number];

export interface GameSettings {
  readonly version: 1;
  readonly controls: Readonly<Record<ControlAction, ControlBinding>>;
  readonly video: {
    readonly performance: {
      // Zero means no artificial cap; Phaser will use the display's available cadence.
      readonly maxFps: FrameRateLimit;
      // This is the radius of the deterministic terrain generation window around the player.
      readonly chunkGenerationRadius: ChunkGenerationRadius;
      // Spreads terrain baking across more or fewer frames while preserving the same world data.
      readonly chunkStreamingPace: ChunkStreamingPace;
      readonly foliageUpdateRate: EffectUpdateRate;
      readonly ambientEffectsUpdateRate: EffectUpdateRate;
      readonly waterAnimationUpdateRate: EffectUpdateRate;
    };
    readonly quality: {
      readonly particleStrength: ParticleStrength;
      readonly animateFoliage: boolean;
      readonly animateWater: boolean;
      readonly animateLava: boolean;
      readonly showNightLights: boolean;
      readonly nightLightResolution: NightLightResolution;
      readonly showGroundGrass: boolean;
      readonly showSwampDecorations: boolean;
    };
  };
}

const DEFAULT_CONTROLS: Readonly<Record<ControlAction, ControlBinding>> = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  moveUpAlternate: 'ArrowUp',
  moveDownAlternate: 'ArrowDown',
  moveLeftAlternate: 'ArrowLeft',
  moveRightAlternate: 'ArrowRight',
  harvestAttack: 'Mouse0',
  // Inventory and loose-item pickup remain on E, while utility interaction uses the player's
  // preferred mouse layout and cave travel is on Space. All actions remain independently rebindable.
  openInventory: 'KeyE',
  enterExitCave: 'Space',
  pickUpItem: 'KeyE',
  pickUpUtility: 'Mouse0',
  placeUtility: 'Mouse0',
  accessUtility: 'Mouse2',
  consumeTonic: 'Mouse2',
  worldMap: 'KeyF',
  pauseMenu: 'Escape',
  debugOverlay: 'F3'
};

export const createDefaultGameSettings = (): GameSettings => ({
  version: 1,
  controls: { ...DEFAULT_CONTROLS },
  video: {
    performance: {
      maxFps: 60,
      chunkGenerationRadius: 3,
      chunkStreamingPace: 'balanced',
      foliageUpdateRate: 60,
      ambientEffectsUpdateRate: 25,
      waterAnimationUpdateRate: 30
    },
    quality: {
      particleStrength: 1,
      animateFoliage: true,
      animateWater: true,
      animateLava: true,
      showNightLights: true,
      nightLightResolution: 0.5,
      showGroundGrass: true,
      showSwampDecorations: true
    }
  }
});

const isBinding = (value: unknown): value is ControlBinding => typeof value === 'string'
  && value.length > 0
  && value.length <= 32
  && (/^(?:Mouse[0-2]|Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Escape|Enter|Space|Tab|Backspace|F(?:[1-9]|1[0-2])|(?:Shift|Control|Alt)(?:Left|Right)?)$/).test(value);

const isOneOf = <Value>(value: unknown, options: readonly Value[]): value is Value =>
  options.includes(value as Value);

export const normalizeGameSettings = (value: unknown): GameSettings | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const settings = value as Partial<GameSettings>;
  const controls = settings.controls;
  const video = settings.video;
  if (
    settings.version !== 1
    || !controls
    || !video
    || !isOneOf(video.performance?.maxFps, FRAME_RATE_OPTIONS)
    || !isOneOf(video.performance?.chunkGenerationRadius, CHUNK_GENERATION_RADIUS_OPTIONS)
    || !isOneOf(video.quality?.particleStrength, PARTICLE_STRENGTH_OPTIONS)
    || typeof video.quality?.animateFoliage !== 'boolean'
    || typeof video.quality?.animateWater !== 'boolean'
    || typeof video.quality?.animateLava !== 'boolean'
    || typeof video.quality?.showNightLights !== 'boolean'
  ) {
    return null;
  }

  const defaults = createDefaultGameSettings();
  // New bindable actions must not discard a player's existing settings file. Missing entries
  // from an older file receive their defaults, while every saved valid binding is preserved.
  const normalizedControls = { ...defaults.controls };
  CONTROL_ACTIONS.forEach((action) => {
    const binding = controls[action];
    if (isBinding(binding)) {
      normalizedControls[action] = binding;
    }
  });
  return {
    version: 1,
    controls: normalizedControls,
    video: {
      performance: {
        maxFps: video.performance.maxFps,
        chunkGenerationRadius: video.performance.chunkGenerationRadius,
        chunkStreamingPace: isOneOf(video.performance.chunkStreamingPace, CHUNK_STREAMING_PACE_OPTIONS)
          ? video.performance.chunkStreamingPace
          : defaults.video.performance.chunkStreamingPace,
        foliageUpdateRate: isOneOf(video.performance.foliageUpdateRate, EFFECT_UPDATE_RATE_OPTIONS)
          ? video.performance.foliageUpdateRate
          : defaults.video.performance.foliageUpdateRate,
        ambientEffectsUpdateRate: isOneOf(video.performance.ambientEffectsUpdateRate, EFFECT_UPDATE_RATE_OPTIONS)
          ? video.performance.ambientEffectsUpdateRate
          : defaults.video.performance.ambientEffectsUpdateRate,
        waterAnimationUpdateRate: isOneOf(video.performance.waterAnimationUpdateRate, EFFECT_UPDATE_RATE_OPTIONS)
          ? video.performance.waterAnimationUpdateRate
          : defaults.video.performance.waterAnimationUpdateRate
      },
      quality: {
        particleStrength: video.quality.particleStrength,
        animateFoliage: video.quality.animateFoliage,
        animateWater: video.quality.animateWater,
        animateLava: video.quality.animateLava,
        showNightLights: video.quality.showNightLights,
        nightLightResolution: isOneOf(video.quality.nightLightResolution, NIGHT_LIGHT_RESOLUTION_OPTIONS)
          ? video.quality.nightLightResolution
          : defaults.video.quality.nightLightResolution,
        showGroundGrass: typeof video.quality.showGroundGrass === 'boolean'
          ? video.quality.showGroundGrass
          : defaults.video.quality.showGroundGrass,
        showSwampDecorations: typeof video.quality.showSwampDecorations === 'boolean'
          ? video.quality.showSwampDecorations
          : defaults.video.quality.showSwampDecorations
      }
    }
  };
};

export const isGameSettings = (value: unknown): value is GameSettings => normalizeGameSettings(value) !== null;

export const isMouseBinding = (binding: ControlBinding): boolean => /^Mouse[0-2]$/.test(binding);

export const bindingLabel = (binding: ControlBinding): string => {
  if (binding === 'Mouse0') return 'Left Mouse';
  if (binding === 'Mouse1') return 'Middle Mouse';
  if (binding === 'Mouse2') return 'Right Mouse';
  if (binding.startsWith('Key')) return binding.slice(3);
  if (binding.startsWith('Digit')) return binding.slice(5);
  if (binding === 'ArrowUp') return '↑';
  if (binding === 'ArrowDown') return '↓';
  if (binding === 'ArrowLeft') return '←';
  if (binding === 'ArrowRight') return '→';
  if (binding === 'Escape') return 'Esc';
  if (binding === 'Space') return 'Space';
  if (binding === 'Backspace') return 'Backspace';
  if (binding === 'ControlLeft' || binding === 'ControlRight') return 'Ctrl';
  if (binding === 'ShiftLeft' || binding === 'ShiftRight') return 'Shift';
  if (binding === 'AltLeft' || binding === 'AltRight') return 'Alt';
  return binding;
};

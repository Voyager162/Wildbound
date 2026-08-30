import Phaser from 'phaser';
import {
  GROUND_GRASS_ANIMATION_FRAME_COUNT,
  GROUND_GRASS_PATTERN_VARIANTS,
  GROUND_GRASS_WIND_CYCLE_DURATION_MS
} from './foliageAnimationConfig';

const PATCH_WIDTH = 52;
const PATCH_HEIGHT = 56;
const PATCH_ROOT_Y = 51;
const BLADE_COUNT = 13;
const PATCH_SCALE_VARIANTS = [0.46, 0.6, 0.74, 0.88] as const;

export interface AnimatedGroundGrassPatch {
  bob: Phaser.GameObjects.Bob;
  framePhase: number;
  frame: number;
  sizeVariant: number;
}

interface GrassColors {
  shadow: string;
  body: string;
  highlight: string;
  flower: string;
}

// The source art is intentionally bright and neutral. WorldChunk tints it from the continuous
// climate colour beneath each patch, avoiding a sharp palette switch at a named-biome boundary.
const colors: GrassColors = { shadow: '#53764a', body: '#a3d377', highlight: '#edffb4', flower: '#fff09a' };

const textureKeyFor = (pattern: number): string => `ground-grass-blades:v2:${pattern}`;

const frameFor = (time: number, framePhase: number): number => {
  const elapsedCycle = ((time % GROUND_GRASS_WIND_CYCLE_DURATION_MS) + GROUND_GRASS_WIND_CYCLE_DURATION_MS)
    % GROUND_GRASS_WIND_CYCLE_DURATION_MS;
  const progress = (elapsedCycle / GROUND_GRASS_WIND_CYCLE_DURATION_MS + framePhase) % 1;
  return Math.floor(progress * GROUND_GRASS_ANIMATION_FRAME_COUNT);
};

// A small deterministic hash is enough for art variation inside a shared texture. World placement
// remains seeded by WorldChunk, while these patterns make neighboring grass patches animate apart.
const artRandom = (pattern: number, blade: number, salt: number): number => {
  const value = Math.sin((pattern + 1) * 63.731 + (blade + 1) * 19.177 + salt * 11.913) * 24634.6345;
  return value - Math.floor(value);
};

const drawBlade = (
  context: CanvasRenderingContext2D,
  rootX: number,
  rootY: number,
  height: number,
  restLean: number,
  windLean: number,
  colors: GrassColors,
  blade: number,
  pattern: number
): void => {
  const curve = restLean + windLean;
  const midX = rootX + curve * 0.29;
  const midY = rootY - height * 0.53;
  const tipX = rootX + curve;
  const tipY = rootY - height;
  const darkWidth = 1.3 + artRandom(pattern, blade, 9) * 0.65;

  context.lineCap = 'round';
  context.strokeStyle = colors.shadow;
  context.globalAlpha = 0.76;
  context.lineWidth = darkWidth + 0.85;
  context.beginPath();
  context.moveTo(rootX + 0.45, rootY + 0.35);
  context.quadraticCurveTo(midX, midY, tipX, tipY);
  context.stroke();

  context.strokeStyle = colors.body;
  context.globalAlpha = 0.96;
  context.lineWidth = darkWidth;
  context.beginPath();
  context.moveTo(rootX, rootY);
  context.quadraticCurveTo(midX + 0.3, midY, tipX, tipY);
  context.stroke();

  if (blade % 3 === 0 || artRandom(pattern, blade, 5) > 0.72) {
    context.strokeStyle = colors.highlight;
    context.globalAlpha = 0.72;
    context.lineWidth = 0.7;
    context.beginPath();
    context.moveTo(rootX - 0.5, rootY - 1.5);
    context.quadraticCurveTo(midX - 0.6, midY + 2, tipX - 0.6, tipY + 3);
    context.stroke();
  }

  if (blade % 5 === 1 && height > 28) {
    context.fillStyle = colors.flower;
    context.globalAlpha = 0.68;
    context.beginPath();
    context.arc(tipX, tipY + 1.5, 1.15, 0, Math.PI * 2);
    context.fill();
  }
};

const drawFrame = (
  context: CanvasRenderingContext2D,
  frame: number,
  pattern: number
): void => {
  const progress = (frame / GROUND_GRASS_ANIMATION_FRAME_COUNT) * Math.PI * 2;
  context.clearRect(0, 0, PATCH_WIDTH, PATCH_HEIGHT);

  for (let blade = 0; blade < BLADE_COUNT; blade += 1) {
    const rootX = 4 + artRandom(pattern, blade, 1) * 44;
    const rootY = PATCH_ROOT_Y - artRandom(pattern, blade, 2) * 2.5;
    const height = 21 + artRandom(pattern, blade, 3) * 19;
    const restLean = (artRandom(pattern, blade, 4) - 0.5) * 10;
    const phase = artRandom(pattern, blade, 5) * Math.PI * 2;
    // Each blade receives a distinct phase, amplitude, and secondary gust. The root never moves;
    // only the curved blade changes, which avoids the rubber-sheet effect of UV warping.
    const windLean = (
      Math.sin(progress * (0.9 + artRandom(pattern, blade, 6) * 0.22) + phase) * 5.7
      + Math.sin(progress * 2.03 + phase * 1.73) * 1.9
    ) * (0.65 + artRandom(pattern, blade, 7) * 0.45);
    drawBlade(context, rootX, rootY, height, restLean, windLean, colors, blade, pattern);
  }

  context.globalAlpha = 1;
};

const ensureGrassTextures = (scene: Phaser.Scene): void => {
  for (let pattern = 0; pattern < GROUND_GRASS_PATTERN_VARIANTS; pattern += 1) {
    const textureKey = textureKeyFor(pattern);
    if (scene.textures.exists(textureKey)) {
      continue;
    }

    const texture = scene.textures.createCanvas(
      textureKey,
      PATCH_WIDTH,
      PATCH_HEIGHT * GROUND_GRASS_ANIMATION_FRAME_COUNT * PATCH_SCALE_VARIANTS.length
    );
    if (!texture) {
      throw new Error('Wildbound could not create ground-grass animation frames.');
    }

    const context = texture.getContext();
    for (let sizeVariant = 0; sizeVariant < PATCH_SCALE_VARIANTS.length; sizeVariant += 1) {
      for (let frame = 0; frame < GROUND_GRASS_ANIMATION_FRAME_COUNT; frame += 1) {
        const frameIndex = sizeVariant * GROUND_GRASS_ANIMATION_FRAME_COUNT + frame;
        context.save();
        context.translate(0, frameIndex * PATCH_HEIGHT);
        context.translate(PATCH_WIDTH / 2, PATCH_ROOT_Y);
        context.scale(PATCH_SCALE_VARIANTS[sizeVariant], PATCH_SCALE_VARIANTS[sizeVariant]);
        context.translate(-PATCH_WIDTH / 2, -PATCH_ROOT_Y);
        drawFrame(context, frame, pattern);
        context.restore();
        texture.add(`${frame}:${sizeVariant}`, 0, 0, frameIndex * PATCH_HEIGHT, PATCH_WIDTH, PATCH_HEIGHT);
      }
    }
    texture.refresh();
  }
};

export const ensureGroundGrassTextures = (scene: Phaser.Scene): void => {
  ensureGrassTextures(scene);
};

export const createGroundGrassBlitter = (
  scene: Phaser.Scene,
  worldX: number,
  worldY: number,
  pattern: number
): Phaser.GameObjects.Blitter => {
  ensureGrassTextures(scene);
  return scene.add
    .blitter(worldX, worldY, textureKeyFor(pattern))
    .setDepth(0.9)
    .setVisible(false);
};

export const createAnimatedGroundGrassPatch = (
  blitter: Phaser.GameObjects.Blitter,
  localX: number,
  localY: number,
  scale: number,
  tint: number,
  pattern: number,
  framePhase: number,
  time: number
): AnimatedGroundGrassPatch => {
  const frame = frameFor(time, framePhase);
  const sizeVariant = PATCH_SCALE_VARIANTS.reduce((best, candidate, index) => (
    Math.abs(candidate - scale) < Math.abs(PATCH_SCALE_VARIANTS[best] - scale) ? index : best
  ), 0);
  const bob = blitter.create(
    localX - PATCH_WIDTH / 2,
    localY - PATCH_ROOT_Y,
    `${frame}:${sizeVariant}`
  ).setTint(tint);
  return { bob, framePhase, frame, sizeVariant };
};

export const updateAnimatedGroundGrassPatch = (patch: AnimatedGroundGrassPatch, time: number): void => {
  const frame = frameFor(time, patch.framePhase);
  if (frame === patch.frame) {
    return;
  }

  patch.frame = frame;
  patch.bob.setFrame(`${frame}:${patch.sizeVariant}`);
};

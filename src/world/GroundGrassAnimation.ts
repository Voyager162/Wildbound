import Phaser from 'phaser';
import {
  GROUND_GRASS_ANIMATION_FRAME_COUNT,
  GROUND_GRASS_ANIMATION_FRAME_MS,
  GROUND_GRASS_PATTERN_VARIANTS
} from './foliageAnimationConfig';

const PATCH_WIDTH = 52;
const PATCH_HEIGHT = 56;
const PATCH_ROOT_Y = 51;
const BLADE_COUNT = 13;

export type GroundGrassPalette = 'meadow' | 'grove' | 'highland';

export interface AnimatedGroundGrassPatch {
  image: Phaser.GameObjects.Image;
  framePhase: number;
  frame: number;
}

interface GrassColors {
  shadow: string;
  body: string;
  highlight: string;
  flower: string;
}

const palettes: Record<GroundGrassPalette, GrassColors> = {
  meadow: { shadow: '#27613a', body: '#4d983f', highlight: '#a8ce62', flower: '#e4dc78' },
  grove: { shadow: '#173f2d', body: '#2f733a', highlight: '#79a850', flower: '#b8c96a' },
  highland: { shadow: '#365e39', body: '#6d984d', highlight: '#bad476', flower: '#e5d989' }
};

const textureKeyFor = (palette: GroundGrassPalette, pattern: number): string =>
  `ground-grass-blades:v1:${palette}:${pattern}`;

const frameFor = (time: number, framePhase: number): number =>
  Math.floor(time / GROUND_GRASS_ANIMATION_FRAME_MS + framePhase) % GROUND_GRASS_ANIMATION_FRAME_COUNT;

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
  pattern: number,
  palette: GroundGrassPalette
): void => {
  const colors = palettes[palette];
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
  (Object.keys(palettes) as GroundGrassPalette[]).forEach((palette) => {
    for (let pattern = 0; pattern < GROUND_GRASS_PATTERN_VARIANTS; pattern += 1) {
      const textureKey = textureKeyFor(palette, pattern);
      if (scene.textures.exists(textureKey)) {
        continue;
      }

      const texture = scene.textures.createCanvas(
        textureKey,
        PATCH_WIDTH,
        PATCH_HEIGHT * GROUND_GRASS_ANIMATION_FRAME_COUNT
      );
      if (!texture) {
        throw new Error('Wildbound could not create ground-grass animation frames.');
      }

      const context = texture.getContext();
      for (let frame = 0; frame < GROUND_GRASS_ANIMATION_FRAME_COUNT; frame += 1) {
        context.save();
        context.translate(0, frame * PATCH_HEIGHT);
        drawFrame(context, frame, pattern, palette);
        context.restore();
        texture.add(String(frame), 0, 0, frame * PATCH_HEIGHT, PATCH_WIDTH, PATCH_HEIGHT);
      }
      texture.refresh();
    }
  });
};

export const createAnimatedGroundGrassPatch = (
  scene: Phaser.Scene,
  worldX: number,
  worldY: number,
  scale: number,
  palette: GroundGrassPalette,
  pattern: number,
  framePhase: number,
  time: number
): AnimatedGroundGrassPatch => {
  ensureGrassTextures(scene);
  const frame = frameFor(time, framePhase);
  const image = scene.add.image(worldX, worldY, textureKeyFor(palette, pattern), String(frame))
    .setOrigin(0.5, PATCH_ROOT_Y / PATCH_HEIGHT)
    .setScale(scale)
    .setDepth(0.9);
  return { image, framePhase, frame };
};

export const updateAnimatedGroundGrassPatch = (patch: AnimatedGroundGrassPatch, time: number): void => {
  const frame = frameFor(time, patch.framePhase);
  if (frame === patch.frame) {
    return;
  }

  patch.frame = frame;
  patch.image.setFrame(String(frame));
};

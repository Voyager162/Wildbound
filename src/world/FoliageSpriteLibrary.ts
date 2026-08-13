import Phaser from 'phaser';
import { TerrainFeatureType } from './generation/featureGenerator';
import {
  FEATURE_FOLIAGE_SWAY_SPEED,
  HARVESTABLE_GRASS_SWAY_RADIANS,
  REED_SWAY_RADIANS,
  TREE_CANOPY_SWAY_RADIANS
} from './foliageAnimationConfig';

const TREE_TEXTURE_KEY = 'foliage-sprite:tree:v1';
const REED_TEXTURE_KEY = 'foliage-sprite:reeds:v1';
const GRASS_TEXTURE_KEY = 'foliage-sprite:wild-grass:v1';

interface FoliageSpriteDefinition {
  textureKey: string;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  swayRadians: number;
}

export interface AnimatedFoliageSprite {
  image: Phaser.GameObjects.Image;
  baseX: number;
  baseY: number;
  phase: number;
  swayRadians: number;
}

const definitionFor = (type: TerrainFeatureType): FoliageSpriteDefinition | null => {
  switch (type) {
    case TerrainFeatureType.Tree:
      return { textureKey: TREE_TEXTURE_KEY, width: 128, height: 128, pivotX: 64, pivotY: 94, swayRadians: TREE_CANOPY_SWAY_RADIANS };
    case TerrainFeatureType.Reeds:
      return { textureKey: REED_TEXTURE_KEY, width: 112, height: 112, pivotX: 56, pivotY: 92, swayRadians: REED_SWAY_RADIANS };
    case TerrainFeatureType.Grass:
      return { textureKey: GRASS_TEXTURE_KEY, width: 64, height: 64, pivotX: 32, pivotY: 55, swayRadians: HARVESTABLE_GRASS_SWAY_RADIANS };
    default:
      return null;
  }
};

export const isAnimatedFoliage = (type: TerrainFeatureType): boolean => definitionFor(type) !== null;

export const ensureFoliageSpriteTextures = (scene: Phaser.Scene): void => {
  if (scene.textures.exists(TREE_TEXTURE_KEY)) {
    return;
  }

  const tree = scene.textures.createCanvas(TREE_TEXTURE_KEY, 128, 128);
  const reeds = scene.textures.createCanvas(REED_TEXTURE_KEY, 112, 112);
  const grass = scene.textures.createCanvas(GRASS_TEXTURE_KEY, 64, 64);
  if (!tree || !reeds || !grass) {
    throw new Error('Wildbound could not create foliage animation textures.');
  }

  drawTreeCanopy(tree.getContext());
  drawReeds(reeds.getContext());
  drawWildGrass(grass.getContext());
  tree.refresh();
  reeds.refresh();
  grass.refresh();
};

export const createAnimatedFoliageSprite = (
  scene: Phaser.Scene,
  type: TerrainFeatureType,
  baseX: number,
  baseY: number,
  scale: number,
  mirror: number,
  phase: number
): AnimatedFoliageSprite | null => {
  const definition = definitionFor(type);
  if (!definition) {
    return null;
  }

  ensureFoliageSpriteTextures(scene);
  const image = scene.add.image(baseX, baseY, definition.textureKey)
    .setOrigin(definition.pivotX / definition.width, definition.pivotY / definition.height)
    .setScale(scale * mirror, scale)
    .setDepth(1.05);
  return { image, baseX, baseY, phase, swayRadians: definition.swayRadians };
};

export const updateAnimatedFoliageSprite = (sprite: AnimatedFoliageSprite, time: number): void => {
  const seconds = time / 1000;
  const gust = Math.sin(seconds * FEATURE_FOLIAGE_SWAY_SPEED + sprite.phase) * 0.72
    + Math.sin(seconds * FEATURE_FOLIAGE_SWAY_SPEED * 1.83 + sprite.phase * 1.61) * 0.28;
  sprite.image.setRotation(gust * sprite.swayRadians);
};

const circle = (context: CanvasRenderingContext2D, color: string, alpha: number, x: number, y: number, radius: number): void => {
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
};

const drawTreeCanopy = (context: CanvasRenderingContext2D): void => {
  const pivotX = 64;
  const pivotY = 94;
  const x = (value: number): number => pivotX + value;
  const y = (value: number): number => pivotY + value;
  circle(context, '#0e3927', 1, x(-26), y(-33), 27.3);
  circle(context, '#0e3927', 1, x(25), y(-35), 28.1);
  circle(context, '#0e3927', 1, x(-7), y(-59), 29.6);
  circle(context, '#0e3927', 1, x(20), y(-66), 25.0);
  circle(context, '#0e3927', 1, x(-31), y(-58), 20.3);
  circle(context, '#1f6035', 1, x(-21), y(-41), 22.2);
  circle(context, '#1f6035', 1, x(19), y(-46), 24.2);
  circle(context, '#1f6035', 1, x(-3), y(-70), 21.1);
  circle(context, '#4b8c42', 0.88, x(-18), y(-55), 10.5);
  circle(context, '#4b8c42', 0.88, x(15), y(-62), 8.6);
  circle(context, '#4b8c42', 0.88, x(31), y(-32), 7.8);
  circle(context, '#b7dc70', 0.62, x(-34), y(-46), 5.1);
  circle(context, '#b7dc70', 0.62, x(5), y(-82), 5.5);
  circle(context, '#27502d', 0.78, x(-13), y(26), 3.2);
  circle(context, '#27502d', 0.78, x(0), y(29), 3.2);
  circle(context, '#27502d', 0.78, x(12), y(26), 3.2);
  context.globalAlpha = 1;
};

const drawReeds = (context: CanvasRenderingContext2D): void => {
  const pivotX = 56;
  const pivotY = 92;
  const offsets = [-37, -27, -16, -5, 7, 19, 31, 40];
  context.lineCap = 'round';
  context.strokeStyle = '#2d6037';
  context.lineWidth = 4;
  context.beginPath();
  offsets.forEach((offset, index) => {
    const height = 54 + (index % 3) * 11;
    const lean = (index - 3.5) * 2.3;
    context.moveTo(pivotX + offset, pivotY);
    context.lineTo(pivotX + offset + lean, pivotY - height);
  });
  context.stroke();
  context.strokeStyle = '#83a84e';
  context.lineWidth = 2;
  context.beginPath();
  offsets.filter((_, index) => index % 2 === 0).forEach((offset, index) => {
    context.moveTo(pivotX + offset, pivotY - 8);
    context.lineTo(pivotX + offset - 8, pivotY - (37 + index * 5));
  });
  context.stroke();
  context.fillStyle = '#9f7e43';
  [-27, -5, 19, 40].forEach((offset, index) => context.fillRect(pivotX + offset - 3, pivotY - (63 + (index % 2) * 8), 6, 15));
  context.strokeStyle = '#b8d377';
  context.globalAlpha = 0.65;
  context.lineWidth = 1.15;
  context.beginPath();
  [-33, -18, -1, 17, 34].forEach((offset, index) => {
    context.moveTo(pivotX + offset, pivotY - 3);
    context.lineTo(pivotX + offset + (index - 2) * 4, pivotY - (44 + (index % 3) * 8));
  });
  context.stroke();
  context.globalAlpha = 1;
};

const drawWildGrass = (context: CanvasRenderingContext2D): void => {
  const pivotX = 32;
  const pivotY = 55;
  const blades = [-23, -16, -9, -2, 6, 14, 22];
  context.lineCap = 'round';
  context.strokeStyle = '#286c39';
  context.lineWidth = 3;
  context.beginPath();
  blades.forEach((offset, index) => {
    context.moveTo(pivotX + offset, pivotY);
    context.lineTo(pivotX + offset + (index - 3) * 3, pivotY - (37 + (index % 3) * 6));
  });
  context.stroke();
  context.strokeStyle = '#b6d66d';
  context.globalAlpha = 0.9;
  context.lineWidth = 1.4;
  context.beginPath();
  [-14, 2, 17].forEach((offset, index) => {
    context.moveTo(pivotX + offset, pivotY - 1);
    context.lineTo(pivotX + offset + 4, pivotY - (40 + index * 4));
  });
  context.stroke();
  circle(context, '#e7d95f', 0.88, pivotX - 12, pivotY - 32, 2.2);
  circle(context, '#e7d95f', 0.88, pivotX + 6, pivotY - 37, 2.2);
  circle(context, '#e7d95f', 0.88, pivotX + 20, pivotY - 42, 2.2);
  context.globalAlpha = 1;
};

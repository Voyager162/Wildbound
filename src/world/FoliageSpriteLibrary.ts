import Phaser from 'phaser';
import { TerrainFeatureType } from './generation/featureGenerator';
import {
  FEATURE_FOLIAGE_SWAY_SPEED,
  HARVESTABLE_GRASS_SWAY_RADIANS,
  REED_SWAY_RADIANS,
  TREE_CANOPY_SWAY_RADIANS
} from './foliageAnimationConfig';

const LEAF_CLUSTER_TEXTURE_KEY = 'foliage-sprite:leaf-cluster:v2';
const LOOSE_LEAF_TEXTURE_KEY = 'foliage-sprite:loose-leaf:v2';
const REED_BLADE_TEXTURE_KEY = 'foliage-sprite:reed-blade:v2';
const GRASS_BLADE_TEXTURE_KEY = 'foliage-sprite:wild-grass-blade:v2';

interface FoliageNode {
  image: Phaser.GameObjects.Image;
  offsetX: number;
  offsetY: number;
  scale: number;
  baseRotation: number;
  phase: number;
  swayRadians: number;
  flutterX: number;
  flutterY: number;
  baseX: number;
  baseY: number;
}

export interface AnimatedFoliageSprite {
  nodes: FoliageNode[];
  rootX: number;
  rootY: number;
  scale: number;
  mirror: number;
}

interface NodeSpec {
  textureKey: string;
  originX: number;
  originY: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  phaseOffset: number;
  swayRadians: number;
  flutterX?: number;
  flutterY?: number;
}

const circle = (context: CanvasRenderingContext2D, color: string, alpha: number, x: number, y: number, radius: number): void => {
  context.fillStyle = color;
  context.globalAlpha = alpha;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
};

const drawLeafCluster = (context: CanvasRenderingContext2D): void => {
  const pivotX = 36;
  const pivotY = 61;
  const leaf = (color: string, alpha: number, x: number, y: number, radiusX: number, radiusY: number, angle: number): void => {
    context.fillStyle = color;
    context.globalAlpha = alpha;
    context.save();
    context.translate(pivotX + x, pivotY + y);
    context.rotate(angle);
    context.beginPath();
    context.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  circle(context, '#0c3023', 0.96, pivotX - 7, pivotY - 30, 23);
  circle(context, '#164c2d', 1, pivotX + 9, pivotY - 27, 22);
  circle(context, '#285f32', 0.95, pivotX - 15, pivotY - 20, 16);
  leaf('#3e803e', 0.95, -15, -39, 7, 13, -0.62);
  leaf('#4d913f', 0.92, 3, -45, 7, 14, 0.24);
  leaf('#78ab4c', 0.87, 16, -34, 6, 12, 0.82);
  leaf('#6f9e43', 0.88, -23, -25, 6, 11, -0.95);
  leaf('#a8cd62', 0.68, -5, -49, 4.4, 8.4, -0.2);
  leaf('#b9d870', 0.58, 23, -20, 3.8, 7.2, 0.66);
  context.globalAlpha = 1;
};

const drawLooseLeaf = (context: CanvasRenderingContext2D): void => {
  context.fillStyle = '#b8d96a';
  context.globalAlpha = 0.92;
  context.beginPath();
  context.ellipse(6, 7, 3.2, 6.4, -0.46, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#496d38';
  context.globalAlpha = 0.78;
  context.lineWidth = 0.75;
  context.beginPath();
  context.moveTo(5, 11);
  context.lineTo(7, 3);
  context.stroke();
  context.globalAlpha = 1;
};

const drawBladeTexture = (context: CanvasRenderingContext2D, reed: boolean): void => {
  const width = reed ? 16 : 14;
  const height = reed ? 88 : 52;
  const rootX = width / 2;
  const rootY = height - 4;
  context.lineCap = 'round';
  context.strokeStyle = reed ? '#2a6037' : '#2f713b';
  context.lineWidth = reed ? 3.7 : 2.7;
  context.beginPath();
  context.moveTo(rootX, rootY);
  context.quadraticCurveTo(rootX - 2.2, rootY - height * 0.53, rootX + 3.4, 5);
  context.stroke();
  context.strokeStyle = reed ? '#91ae52' : '#a6cc63';
  context.globalAlpha = 0.82;
  context.lineWidth = reed ? 1.05 : 0.85;
  context.beginPath();
  context.moveTo(rootX - 0.45, rootY - 2);
  context.quadraticCurveTo(rootX - 1.8, rootY - height * 0.53, rootX + 2.2, 6);
  context.stroke();
  if (reed) {
    context.fillStyle = '#9d7d45';
    context.globalAlpha = 0.94;
    context.fillRect(rootX + 0.9, 11, 4.8, 13);
  }
  context.globalAlpha = 1;
};

export const ensureFoliageSpriteTextures = (scene: Phaser.Scene): void => {
  if (scene.textures.exists(LEAF_CLUSTER_TEXTURE_KEY)) {
    return;
  }

  const leafCluster = scene.textures.createCanvas(LEAF_CLUSTER_TEXTURE_KEY, 72, 72);
  const looseLeaf = scene.textures.createCanvas(LOOSE_LEAF_TEXTURE_KEY, 12, 14);
  const reedBlade = scene.textures.createCanvas(REED_BLADE_TEXTURE_KEY, 16, 88);
  const grassBlade = scene.textures.createCanvas(GRASS_BLADE_TEXTURE_KEY, 14, 52);
  if (!leafCluster || !looseLeaf || !reedBlade || !grassBlade) {
    throw new Error('Wildbound could not create foliage animation textures.');
  }

  drawLeafCluster(leafCluster.getContext());
  drawLooseLeaf(looseLeaf.getContext());
  drawBladeTexture(reedBlade.getContext(), true);
  drawBladeTexture(grassBlade.getContext(), false);
  leafCluster.refresh();
  looseLeaf.refresh();
  reedBlade.refresh();
  grassBlade.refresh();
};

const treeNodeSpecs = (): readonly NodeSpec[] => [
  { textureKey: LEAF_CLUSTER_TEXTURE_KEY, originX: 0.5, originY: 61 / 72, offsetX: -25, offsetY: -7, scale: 0.82, rotation: -0.09, phaseOffset: 0.1, swayRadians: TREE_CANOPY_SWAY_RADIANS * 0.76 },
  { textureKey: LEAF_CLUSTER_TEXTURE_KEY, originX: 0.5, originY: 61 / 72, offsetX: 23, offsetY: -9, scale: 0.86, rotation: 0.08, phaseOffset: 1.4, swayRadians: TREE_CANOPY_SWAY_RADIANS * 0.83 },
  { textureKey: LEAF_CLUSTER_TEXTURE_KEY, originX: 0.5, originY: 61 / 72, offsetX: -7, offsetY: -39, scale: 0.93, rotation: -0.04, phaseOffset: 2.6, swayRadians: TREE_CANOPY_SWAY_RADIANS },
  { textureKey: LEAF_CLUSTER_TEXTURE_KEY, originX: 0.5, originY: 61 / 72, offsetX: 20, offsetY: -47, scale: 0.72, rotation: 0.12, phaseOffset: 3.75, swayRadians: TREE_CANOPY_SWAY_RADIANS * 0.92 },
  { textureKey: LEAF_CLUSTER_TEXTURE_KEY, originX: 0.5, originY: 61 / 72, offsetX: -31, offsetY: -39, scale: 0.62, rotation: -0.15, phaseOffset: 4.85, swayRadians: TREE_CANOPY_SWAY_RADIANS * 0.68 },
  { textureKey: LOOSE_LEAF_TEXTURE_KEY, originX: 0.5, originY: 0.5, offsetX: -38, offsetY: -36, scale: 0.85, rotation: -0.3, phaseOffset: 0.9, swayRadians: 0.3, flutterX: 7, flutterY: 5 },
  { textureKey: LOOSE_LEAF_TEXTURE_KEY, originX: 0.5, originY: 0.5, offsetX: 36, offsetY: -25, scale: 0.72, rotation: 0.4, phaseOffset: 2.1, swayRadians: 0.26, flutterX: 8, flutterY: 4 },
  { textureKey: LOOSE_LEAF_TEXTURE_KEY, originX: 0.5, originY: 0.5, offsetX: 14, offsetY: -64, scale: 0.66, rotation: -0.7, phaseOffset: 4.4, swayRadians: 0.34, flutterX: 5, flutterY: 6 }
];

const bladeNodeSpecs = (type: TerrainFeatureType): readonly NodeSpec[] => {
  const isReed = type === TerrainFeatureType.Reeds;
  const count = isReed ? 9 : 8;
  const textureKey = isReed ? REED_BLADE_TEXTURE_KEY : GRASS_BLADE_TEXTURE_KEY;
  const swayRadians = isReed ? REED_SWAY_RADIANS : HARVESTABLE_GRASS_SWAY_RADIANS;
  const spread = isReed ? 40 : 25;
  return Array.from({ length: count }, (_, index) => {
    const normalized = index / (count - 1) - 0.5;
    const phaseOffset = index * 0.89 + (isReed ? 0.3 : 0.7);
    return {
      textureKey,
      originX: 0.5,
      originY: isReed ? 84 / 88 : 48 / 52,
      offsetX: normalized * spread + Math.sin(index * 2.4) * 2.4,
      offsetY: Math.cos(index * 1.7) * 1.8,
      scale: (isReed ? 0.86 : 0.92) + (index % 3) * 0.075,
      rotation: normalized * (isReed ? 0.16 : 0.22),
      phaseOffset,
      swayRadians: swayRadians * (0.72 + (index % 4) * 0.1)
    };
  });
};

const nodeSpecsFor = (type: TerrainFeatureType): readonly NodeSpec[] | null => {
  switch (type) {
    case TerrainFeatureType.Tree:
      return treeNodeSpecs();
    case TerrainFeatureType.Reeds:
    case TerrainFeatureType.Grass:
      return bladeNodeSpecs(type);
    default:
      return null;
  }
};

export const isAnimatedFoliage = (type: TerrainFeatureType): boolean => nodeSpecsFor(type) !== null;

const applyTransform = (sprite: AnimatedFoliageSprite): void => {
  sprite.nodes.forEach((node) => {
    node.baseX = sprite.rootX + node.offsetX * sprite.scale * sprite.mirror;
    node.baseY = sprite.rootY + node.offsetY * sprite.scale;
    node.image
      .setPosition(node.baseX, node.baseY)
      .setScale(node.scale * sprite.scale * sprite.mirror, node.scale * sprite.scale);
  });
};

export const createAnimatedFoliageSprite = (
  scene: Phaser.Scene,
  type: TerrainFeatureType,
  rootX: number,
  rootY: number,
  scale: number,
  mirror: number,
  phase: number
): AnimatedFoliageSprite | null => {
  const specs = nodeSpecsFor(type);
  if (!specs) {
    return null;
  }

  ensureFoliageSpriteTextures(scene);
  const nodes = specs.map((spec) => ({
    image: scene.add.image(0, 0, spec.textureKey)
      .setOrigin(spec.originX, spec.originY)
      .setDepth(1.05),
    offsetX: spec.offsetX,
    offsetY: spec.offsetY,
    scale: spec.scale,
    baseRotation: spec.rotation,
    phase: phase + spec.phaseOffset,
    swayRadians: spec.swayRadians,
    flutterX: spec.flutterX ?? 0,
    flutterY: spec.flutterY ?? 0,
    baseX: 0,
    baseY: 0
  }));
  const sprite = { nodes, rootX, rootY, scale, mirror };
  applyTransform(sprite);
  return sprite;
};

export const setAnimatedFoliageSpriteTransform = (
  sprite: AnimatedFoliageSprite,
  rootX: number,
  rootY: number,
  scale: number,
  mirror: number
): void => {
  sprite.rootX = rootX;
  sprite.rootY = rootY;
  sprite.scale = scale;
  sprite.mirror = mirror;
  applyTransform(sprite);
};

export const setAnimatedFoliageSpriteVisible = (sprite: AnimatedFoliageSprite, visible: boolean): void => {
  sprite.nodes.forEach((node) => node.image.setVisible(visible));
};

export const destroyAnimatedFoliageSprite = (sprite: AnimatedFoliageSprite): void => {
  sprite.nodes.forEach((node) => node.image.destroy());
  sprite.nodes.length = 0;
};

export const updateAnimatedFoliageSprite = (sprite: AnimatedFoliageSprite, time: number): void => {
  const seconds = time / 1000;
  sprite.nodes.forEach((node) => {
    const gust = Math.sin(seconds * FEATURE_FOLIAGE_SWAY_SPEED + node.phase) * 0.71
      + Math.sin(seconds * FEATURE_FOLIAGE_SWAY_SPEED * 1.81 + node.phase * 1.57) * 0.29;
    const flutter = Math.sin(seconds * 2.7 + node.phase * 1.9);
    node.image
      .setPosition(
        node.baseX + gust * node.flutterX,
        node.baseY + flutter * node.flutterY + gust * node.flutterY * 0.34
      )
      .setRotation(node.baseRotation + gust * node.swayRadians);
  });
};

import Phaser from 'phaser';
import { Biome } from './generation/biomeGenerator';
import { randomAtTile } from './generation/noise';
import { landmarksIntersectingTiles } from './generation/landmarkGenerator';
import { LandmarkType, type ProceduralLandmark } from './landmarkConfig';
import {
  createLandmarkSurfacePlan,
  landmarkCollisionContainsWorldPoint,
  type LandmarkEntrance,
  type LandmarkGroundDetail,
  type LandmarkMaterialNode,
  type LandmarkOrientedBoxShape,
  type LandmarkSurfaceComponent,
  type LandmarkSurfacePlan,
  type LandmarkSurfaceShape
} from './landmarks/landmarkSurfaceGenerator';
import { SessionWorldState } from './SessionWorldState';
import { CHUNK_LOAD_RADIUS, CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from './worldConfig';

// Ground traces sit beneath the shared grass Blitters (.9), so vegetation remains rooted through
// open landmark terrain. Structures remain below the player (10); only genuine foreground roofs,
// canopy edges, and near stone faces use the occlusion layer above the avatar.
const LANDMARK_GROUND_DEPTH = 0.7;
const LANDMARK_SHADOW_DEPTH = 0.78;
const LANDMARK_STRUCTURE_DEPTH = 2.35;
const LANDMARK_ACCENT_DEPTH = 4.2;
const LANDMARK_DOOR_DEPTH = 4.35;
const LANDMARK_FOREGROUND_DEPTH = 11.2;
const LANDMARK_ANIMATION_INTERVAL_MS = 100;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface LandmarkPalette {
  readonly soil: number;
  readonly soilDark: number;
  readonly soilLight: number;
  readonly stone: number;
  readonly stoneDark: number;
  readonly stoneLight: number;
  readonly moss: number;
  readonly mossLight: number;
  readonly wood: number;
  readonly woodDark: number;
  readonly woodLight: number;
  readonly water: number;
  readonly waterLight: number;
  readonly bone: number;
}

interface LandmarkVisual {
  readonly landmark: ProceduralLandmark;
  readonly plan: LandmarkSurfacePlan;
  readonly ground: Phaser.GameObjects.Graphics;
  readonly shadow: Phaser.GameObjects.Graphics;
  readonly structure: Phaser.GameObjects.Graphics;
  readonly accent: Phaser.GameObjects.Graphics;
  readonly door: Phaser.GameObjects.Graphics;
  readonly foreground: Phaser.GameObjects.Graphics;
  doorProgress: number;
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const mixColor = (first: number, second: number, amount: number): number => {
  const mix = (shift: number): number => clampByte(
    ((first >> shift) & 0xff) + (((second >> shift) & 0xff) - ((first >> shift) & 0xff)) * amount
  );
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
};

const shadeColor = (color: number, amount: number): number => {
  const scale = 1 + amount;
  return (clampByte(((color >> 16) & 0xff) * scale) << 16)
    | (clampByte(((color >> 8) & 0xff) * scale) << 8)
    | clampByte((color & 0xff) * scale);
};

const paletteFor = (biome: Biome): LandmarkPalette => {
  const base: LandmarkPalette = {
    soil: 0x67523b,
    soilDark: 0x30291f,
    soilLight: 0x988064,
    stone: 0x65706c,
    stoneDark: 0x293331,
    stoneLight: 0xa2b0a7,
    moss: 0x375b39,
    mossLight: 0x75a35a,
    wood: 0x6e4328,
    woodDark: 0x281a12,
    woodLight: 0xb27a43,
    water: 0x277f99,
    waterLight: 0xa5f2ef,
    bone: 0xe4d9ad
  };
  switch (biome) {
    case Biome.Desert:
      return {
        ...base,
        soil: 0xa36e3f,
        soilDark: 0x4a3025,
        soilLight: 0xd4a267,
        stone: 0x8d735d,
        stoneDark: 0x493a32,
        stoneLight: 0xc2a685,
        moss: 0x6d6b39,
        wood: 0x79502f,
        bone: 0xf0dca9
      };
    case Biome.Snow:
      return {
        ...base,
        soil: 0x708087,
        soilDark: 0x334149,
        soilLight: 0xc0d1d5,
        stone: 0x77858b,
        stoneDark: 0x35444a,
        stoneLight: 0xd1e0df,
        moss: 0x47645a,
        mossLight: 0x8eb7a4,
        wood: 0x70513c,
        woodLight: 0xb99473,
        water: 0x3b8fac,
        waterLight: 0xd9ffff,
        bone: 0xf4edcf
      };
    case Biome.Mountains:
      return {
        ...base,
        soil: 0x555b58,
        soilDark: 0x252d2e,
        soilLight: 0x899392,
        stone: 0x59666a,
        stoneDark: 0x222d32,
        stoneLight: 0x9bacb0,
        moss: 0x304c40,
        water: 0x267e9c
      };
    case Biome.Hills:
      return {
        ...base,
        soil: 0x786046,
        soilDark: 0x352c22,
        stone: 0x706c61,
        stoneDark: 0x343530,
        stoneLight: 0xaaa595,
        moss: 0x4a613d
      };
    case Biome.Swamp:
      return {
        ...base,
        soil: 0x415044,
        soilDark: 0x1b2923,
        soilLight: 0x687764,
        stone: 0x53645d,
        stoneDark: 0x22322e,
        moss: 0x285c40,
        mossLight: 0x69a754,
        wood: 0x563b28,
        water: 0x2f6f68
      };
    case Biome.Forest:
      return {
        ...base,
        soil: 0x4f4933,
        soilDark: 0x20261a,
        moss: 0x28583a,
        mossLight: 0x6da557,
        wood: 0x654025,
        woodLight: 0xa97540
      };
    case Biome.Plains:
    case Biome.Beach:
    case Biome.Ocean:
      return base;
  }
};

const centerFor = (landmark: ProceduralLandmark): Point => ({
  x: (landmark.centerTileX + 0.5) * WORLD_TILE_SIZE,
  y: (landmark.centerTileY + 0.5) * WORLD_TILE_SIZE
});

const rotate = (x: number, y: number, rotation: number): Point => ({
  x: x * Math.cos(rotation) - y * Math.sin(rotation),
  y: x * Math.sin(rotation) + y * Math.cos(rotation)
});

const localToWorld = (landmark: ProceduralLandmark, x: number, y: number): Point => {
  const center = centerFor(landmark);
  const transformed = rotate(x, y, landmark.rotation);
  return { x: center.x + transformed.x, y: center.y + transformed.y };
};

const detailRandom = (
  seed: string,
  landmark: ProceduralLandmark,
  index: number,
  salt: number
): number => randomAtTile(
  `${seed}:${landmark.id}:visual`,
  landmark.centerTileX * 97 + index * 31,
  landmark.centerTileY * 101 - index * 37,
  salt
);

const fillPolygon = (
  graphics: Phaser.GameObjects.Graphics,
  points: readonly Point[],
  color: number,
  alpha = 1
): void => {
  if (points.length < 3) {
    return;
  }
  graphics.fillStyle(color, alpha);
  graphics.fillPoints(points as Point[], true);
};

const strokePolyline = (
  graphics: Phaser.GameObjects.Graphics,
  points: readonly Point[],
  color: number,
  width: number,
  alpha = 1,
  close = false
): void => {
  if (points.length < 2) {
    return;
  }
  graphics.lineStyle(width, color, alpha);
  graphics.strokePoints(points as Point[], close);
};

const irregularRing = (
  seed: string,
  landmark: ProceduralLandmark,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  count: number,
  salt: number,
  rotation = 0
): Point[] => Array.from({ length: count }, (_, index) => {
  const angle = rotation + index / count * Math.PI * 2;
  const variation = 0.82 + detailRandom(seed, landmark, index, salt) * 0.3;
  return {
    x: centerX + Math.cos(angle) * radiusX * variation,
    y: centerY + Math.sin(angle) * radiusY * variation
  };
});

const shapeCenterWorld = (landmark: ProceduralLandmark, shape: LandmarkSurfaceShape): Point => {
  if (shape.kind === 'circle' || shape.kind === 'oriented-box') {
    return localToWorld(landmark, shape.x, shape.y);
  }
  return localToWorld(
    landmark,
    (shape.startX + shape.endX) / 2,
    (shape.startY + shape.endY) / 2
  );
};

const boxCornersWorld = (landmark: ProceduralLandmark, shape: LandmarkOrientedBoxShape): Point[] => {
  const halfWidth = shape.width / 2;
  const halfHeight = shape.height / 2;
  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight]
  ].map(([x, y]) => {
    const offset = rotate(x, y, shape.rotation);
    return localToWorld(landmark, shape.x + offset.x, shape.y + offset.y);
  });
};

const drawPrism = (
  graphics: Phaser.GameObjects.Graphics,
  landmark: ProceduralLandmark,
  shape: LandmarkOrientedBoxShape,
  height: number,
  lean: number,
  dark: number,
  base: number,
  light: number,
  alpha = 1
): void => {
  const bottom = boxCornersWorld(landmark, shape);
  const worldRotation = shape.rotation + landmark.rotation;
  const leanX = Math.cos(worldRotation) * height * lean;
  const top = bottom.map((point) => ({ x: point.x + leanX, y: point.y - height }));
  fillPolygon(graphics, [bottom[0], bottom[1], top[1], top[0]], shadeColor(base, -0.08), alpha);
  fillPolygon(graphics, [bottom[1], bottom[2], top[2], top[1]], dark, alpha);
  fillPolygon(graphics, [bottom[2], bottom[3], top[3], top[2]], shadeColor(base, -0.18), alpha);
  fillPolygon(graphics, top, light, alpha);
  strokePolyline(graphics, top, shadeColor(dark, -0.12), Math.max(1.4, shape.width * 0.025), 0.88, true);
};

const drawRock = (
  graphics: Phaser.GameObjects.Graphics,
  seed: string,
  landmark: ProceduralLandmark,
  component: LandmarkSurfaceComponent,
  palette: LandmarkPalette,
  salt: number
): void => {
  const shape = component.shape;
  const center = shapeCenterWorld(landmark, shape);
  const radius = shape.kind === 'circle'
    ? shape.radius
    : shape.kind === 'oriented-box'
      ? Math.max(shape.width, shape.height) * 0.55
      : Math.hypot(shape.endX - shape.startX, shape.endY - shape.startY) * 0.24 + shape.radius;
  const outer = irregularRing(seed, landmark, center.x, center.y, radius * 1.08, radius * 0.72, 9, salt + component.variant * 10_000, component.rotation);
  const top = outer.map((point) => ({
    x: point.x + component.lean * component.height * 0.22,
    y: point.y - component.height * 0.2
  }));
  fillPolygon(graphics, outer, palette.stoneDark, 0.96);
  fillPolygon(graphics, top, mixColor(palette.stone, palette.stoneLight, 0.22 + component.variant * 0.22), 1);
  const facet = [top[0], top[1], top[4], top[5]].filter(Boolean) as Point[];
  fillPolygon(graphics, facet, palette.stoneLight, 0.18);
  strokePolyline(graphics, [top[1], top[4], top[7]], palette.stoneDark, Math.max(1.4, radius * 0.035), 0.5);
};

const drawGroundDetail = (
  graphics: Phaser.GameObjects.Graphics,
  seed: string,
  landmark: ProceduralLandmark,
  detail: LandmarkGroundDetail,
  palette: LandmarkPalette,
  index: number
): void => {
  const center = localToWorld(landmark, detail.x, detail.y);
  const angle = detail.rotation + landmark.rotation;
  const forward = { x: Math.cos(angle), y: Math.sin(angle) };
  const side = { x: -forward.y, y: forward.x };
  const halfLength = detail.length / 2;
  const halfWidth = detail.width / 2;
  const start = { x: center.x - forward.x * halfLength, y: center.y - forward.y * halfLength };
  const end = { x: center.x + forward.x * halfLength, y: center.y + forward.y * halfLength };
  const trace = [
    { x: start.x + side.x * halfWidth * 0.55, y: start.y + side.y * halfWidth * 0.55 },
    { x: center.x + side.x * halfWidth, y: center.y + side.y * halfWidth },
    { x: end.x + side.x * halfWidth * 0.18, y: end.y + side.y * halfWidth * 0.18 },
    { x: end.x - side.x * halfWidth * 0.18, y: end.y - side.y * halfWidth * 0.18 },
    { x: center.x - side.x * halfWidth, y: center.y - side.y * halfWidth },
    { x: start.x - side.x * halfWidth * 0.55, y: start.y - side.y * halfWidth * 0.55 }
  ];
  switch (detail.kind) {
    case 'pool':
      fillPolygon(graphics, irregularRing(seed, landmark, center.x, center.y, detail.length * 0.5, detail.width * 0.5, 24, 0x7610 + index, angle), palette.water, detail.opacity);
      fillPolygon(graphics, irregularRing(seed, landmark, center.x - detail.length * 0.06, center.y - detail.width * 0.06, detail.length * 0.37, detail.width * 0.3, 18, 0x7620 + index, angle), mixColor(palette.water, palette.waterLight, 0.22), detail.opacity * 0.66);
      return;
    case 'runoff':
      fillPolygon(graphics, trace, palette.water, detail.opacity);
      strokePolyline(graphics, [start, center, end], palette.waterLight, Math.max(1.4, detail.width * 0.08), detail.opacity * 0.55);
      return;
    case 'fracture':
      strokePolyline(graphics, [start, center, end], palette.soilDark, Math.max(1.2, detail.width), detail.opacity + 0.2);
      return;
    case 'rune-line':
      strokePolyline(graphics, [start, center, end], mixColor(palette.stoneLight, palette.mossLight, 0.35), Math.max(1.1, detail.width), detail.opacity + 0.08);
      return;
    case 'root-trace':
      fillPolygon(graphics, trace, palette.woodDark, detail.opacity);
      strokePolyline(graphics, [start, center, end], palette.woodLight, Math.max(1.1, detail.width * 0.08), detail.opacity * 0.78);
      return;
    case 'burial':
      fillPolygon(graphics, irregularRing(seed, landmark, center.x, center.y, detail.length * 0.5, detail.width * 0.5, 11, 0x7630 + index, angle), mixColor(palette.soil, palette.bone, 0.12), detail.opacity);
      return;
    case 'foundation-track':
      graphics.lineStyle(Math.max(4, detail.width * 0.07), palette.stoneDark, detail.opacity);
      graphics.strokeEllipse(center.x, center.y, detail.length, detail.width);
      graphics.lineStyle(Math.max(2, detail.width * 0.025), palette.stoneLight, detail.opacity * 0.5);
      graphics.strokeEllipse(center.x, center.y - 2, detail.length * 0.91, detail.width * 0.88);
      return;
    case 'ejecta':
      fillPolygon(graphics, trace, mixColor(palette.soil, 0x9d573b, 0.35), detail.opacity);
      return;
    case 'approach-path':
      fillPolygon(graphics, trace, palette.soil, detail.opacity);
      strokePolyline(graphics, [start, center, end], palette.soilLight, Math.max(1.2, detail.width * 0.04), detail.opacity * 0.45);
      return;
  }
};

const materialColor = (resource: string, palette: LandmarkPalette): number => {
  switch (resource) {
    case 'starstone': return 0x8589ff;
    case 'meteor iron': return 0xb96b55;
    case 'glowing fragments': return 0xff9d4d;
    case 'rune stone': return 0x69c9bc;
    case 'ancient fragments': return mixColor(palette.stoneLight, 0xcaaa72, 0.42);
    case 'relic materials': return 0xe6c85f;
    case 'bone fragments': return palette.bone;
    case 'fossil resin': return 0xe48b39;
    case 'ancient remains': return mixColor(palette.bone, palette.soil, 0.36);
    default: return palette.stoneLight;
  }
};

const drawMaterialNode = (
  graphics: Phaser.GameObjects.Graphics,
  seed: string,
  landmark: ProceduralLandmark,
  node: LandmarkMaterialNode,
  palette: LandmarkPalette,
  harvested: boolean,
  index: number
): void => {
  const radius = 24 * node.scale;
  const host = irregularRing(seed, landmark, node.worldX, node.worldY + 3, radius * 1.35, radius * 0.82, 10, 0x8a10 + index, node.rotation);
  fillPolygon(graphics, host, harvested ? palette.soilDark : mixColor(palette.stoneDark, palette.soil, 0.22), harvested ? 0.66 : 0.94);
  if (harvested) {
    const gouge = irregularRing(seed, landmark, node.worldX, node.worldY + 2, radius * 0.82, radius * 0.45, 9, 0x8a20 + index, node.rotation);
    fillPolygon(graphics, gouge, shadeColor(palette.soilDark, -0.28), 0.72);
    strokePolyline(graphics, [
      { x: node.worldX - radius * 0.7, y: node.worldY + radius * 0.22 },
      { x: node.worldX - radius * 0.1, y: node.worldY - radius * 0.12 },
      { x: node.worldX + radius * 0.56, y: node.worldY + radius * 0.15 }
    ], palette.stone, 1.8, 0.38);
    return;
  }
  const color = materialColor(String(node.resource), palette);
  const strands = node.style === 'glowing-shard-bed' ? 6 : node.style === 'bone-bed' ? 5 : 4;
  for (let strand = 0; strand < strands; strand += 1) {
    const angle = node.rotation + (strand - (strands - 1) / 2) * (0.28 + node.variant * 0.13);
    const length = radius * (0.8 + detailRandom(seed, landmark, index * 11 + strand, 0x8a31) * 0.72);
    const offset = (strand - (strands - 1) / 2) * radius * 0.18;
    const centerX = node.worldX - Math.sin(angle) * offset;
    const centerY = node.worldY + Math.cos(angle) * offset * 0.55;
    graphics.lineStyle(Math.max(2.2, radius * (0.11 + node.variant * 0.04)), shadeColor(color, -0.38), 0.9);
    graphics.lineBetween(centerX - Math.cos(angle) * length * 0.5, centerY - Math.sin(angle) * length * 0.3, centerX + Math.cos(angle) * length * 0.5, centerY + Math.sin(angle) * length * 0.3);
    graphics.lineStyle(Math.max(1.1, radius * 0.055), color, 0.94);
    graphics.lineBetween(centerX - Math.cos(angle) * length * 0.42, centerY - Math.sin(angle) * length * 0.25, centerX + Math.cos(angle) * length * 0.42, centerY + Math.sin(angle) * length * 0.25);
  }
  if (node.style === 'rune-slab' || node.style === 'relic-inlay' || node.style === 'fossil-impression') {
    graphics.lineStyle(Math.max(1.5, radius * 0.065), color, 0.82);
    graphics.strokeCircle(node.worldX, node.worldY, radius * 0.36);
    graphics.lineBetween(node.worldX - radius * 0.3, node.worldY, node.worldX + radius * 0.3, node.worldY);
  }
};

const drawAncientTreeLegacy = (
  seed: string,
  visual: LandmarkVisual,
  palette: LandmarkPalette
): void => {
  const { landmark, plan, ground, structure, shadow, foreground } = visual;
  const center = centerFor(landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const crownCenter = { x: center.x - r * 0.03, y: center.y - r * 0.34 };
  const ellipsePoints = (
    point: Point,
    radiusX: number,
    radiusY: number,
    count: number,
    rotation: number,
    salt: number,
    irregularity = 0.08
  ): Point[] => Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    const wobble = 1 - irregularity + detailRandom(seed, landmark, index, salt) * irregularity * 2;
    const localX = Math.cos(angle) * radiusX * wobble;
    const localY = Math.sin(angle) * radiusY * wobble;
    const rotated = rotate(localX, localY, rotation);
    return { x: point.x + rotated.x, y: point.y + rotated.y };
  });
  const curvedTaper = (
    start: Point,
    control: Point,
    end: Point,
    startWidth: number,
    endWidth: number,
    segments = 12
  ): Point[] => {
    const left: Point[] = [];
    const right: Point[] = [];
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const inverse = 1 - t;
      const point = {
        x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
        y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y
      };
      const tangentX = 2 * inverse * (control.x - start.x) + 2 * t * (end.x - control.x);
      const tangentY = 2 * inverse * (control.y - start.y) + 2 * t * (end.y - control.y);
      const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentY));
      const normalX = -tangentY / tangentLength;
      const normalY = tangentX / tangentLength;
      const width = startWidth + (endWidth - startWidth) * t;
      left.push({ x: point.x + normalX * width, y: point.y + normalY * width });
      right.push({ x: point.x - normalX * width, y: point.y - normalY * width });
    }
    return [...left, ...right.reverse()];
  };

  // A soft disturbed-soil footprint and moss islands dissolve the landmark edge into the biome.
  fillPolygon(
    ground,
    irregularRing(seed, landmark, center.x, center.y + r * 0.04, r * 0.76, r * 0.58, 32, 0x9800),
    mixColor(palette.soilDark, palette.moss, 0.34),
    0.2
  );
  for (let patch = 0; patch < 20; patch += 1) {
    const angle = detailRandom(seed, landmark, patch, 0x9801) * Math.PI * 2;
    const distance = r * (0.42 + detailRandom(seed, landmark, patch, 0x9802) * 0.64);
    const width = r * (0.035 + detailRandom(seed, landmark, patch, 0x9803) * 0.085);
    ground.fillStyle(patch % 3 === 0 ? palette.soilDark : palette.moss, 0.12 + detailRandom(seed, landmark, patch, 0x9804) * 0.16);
    ground.fillEllipse(
      center.x + Math.cos(angle) * distance,
      center.y + Math.sin(angle) * distance * 0.76,
      width * 2.4,
      width
    );
  }

  shadow.fillStyle(0x07140e, 0.38);
  shadow.fillEllipse(crownCenter.x + r * 0.08, crownCenter.y + r * 0.28, r * 1.82, r * 1.02);
  shadow.fillStyle(0x15130d, 0.28);
  shadow.fillEllipse(center.x + r * 0.08, center.y + r * 0.16, r * 1.12, r * 0.68);

  // Begin with one coherent crown silhouette. Seeded lobes refine its edge without becoming a
  // detached pile of circles, and the global upward offset preserves top-down depth at any
  // landmark rotation.
  structure.fillStyle(shadeColor(palette.moss, -0.48), 1);
  structure.fillEllipse(crownCenter.x + r * 0.04, crownCenter.y + r * 0.07, r * 1.8, r * 1.16);
  structure.fillStyle(shadeColor(palette.moss, -0.14), 1);
  structure.fillEllipse(crownCenter.x, crownCenter.y, r * 1.64, r);

  // Old primary limbs remain visible in a few canopy gaps and converge naturally into the trunk.
  for (let branch = 0; branch < 9; branch += 1) {
    const spread = -Math.PI * 0.93 + branch / 8 * Math.PI * 0.86;
    const angle = spread + (detailRandom(seed, landmark, branch, 0x9820) - 0.5) * 0.24;
    const reach = r * (0.46 + detailRandom(seed, landmark, branch, 0x9821) * 0.26);
    const start = {
      x: center.x + (detailRandom(seed, landmark, branch, 0x9822) - 0.5) * r * 0.12,
      y: center.y - r * 0.12
    };
    const end = {
      x: crownCenter.x + Math.cos(angle) * reach,
      y: crownCenter.y + Math.sin(angle) * reach * 0.55
    };
    const bend = (detailRandom(seed, landmark, branch, 0x9823) - 0.5) * r * 0.24;
    const control = {
      x: (start.x + end.x) * 0.5 - Math.sin(angle) * bend,
      y: (start.y + end.y) * 0.5 + Math.cos(angle) * bend
    };
    fillPolygon(structure, curvedTaper(start, control, end, r * 0.075, r * 0.018), palette.woodDark, 0.96);
    fillPolygon(structure, curvedTaper(start, control, end, r * 0.045, r * 0.009), shadeColor(palette.wood, -0.08), 0.98);
  }

  // Buttress roots are tapered, curved polygons whose broad ends disappear beneath the trunk.
  // This keeps every root continuous with the tree instead of reading as a detached timber beam.
  const roots = plan.components.filter((part) => part.role === 'ancient-root');
  roots.forEach((part, index) => {
    if (part.shape.kind !== 'capsule') return;
    const generatedStart = localToWorld(landmark, part.shape.startX, part.shape.startY);
    const generatedEnd = localToWorld(landmark, part.shape.endX, part.shape.endY);
    const end = Math.hypot(generatedEnd.x - center.x, generatedEnd.y - center.y)
      > Math.hypot(generatedStart.x - center.x, generatedStart.y - center.y)
      ? generatedEnd
      : generatedStart;
    const directionX = end.x - center.x;
    const directionY = end.y - center.y;
    const directionLength = Math.max(1, Math.hypot(directionX, directionY));
    const start = {
      x: center.x + directionX / directionLength * r * 0.18,
      y: center.y + directionY / directionLength * r * 0.14
    };
    const side = detailRandom(seed, landmark, index, 0x9830) > 0.5 ? 1 : -1;
    const bend = r * (0.05 + detailRandom(seed, landmark, index, 0x9831) * 0.1) * side;
    const control = {
      x: (start.x + end.x) * 0.5 - directionY / directionLength * bend,
      y: (start.y + end.y) * 0.5 + directionX / directionLength * bend
    };
    const darkRoot = curvedTaper(start, control, end, part.shape.radius * 1.62, part.shape.radius * 0.46, 14);
    const barkRoot = curvedTaper(start, control, end, part.shape.radius * 1.16, part.shape.radius * 0.26, 14);
    fillPolygon(structure, darkRoot, palette.woodDark, 1);
    fillPolygon(structure, barkRoot, mixColor(palette.wood, palette.moss, part.variant * 0.22), 1);
    structure.fillStyle(palette.woodDark, 0.98);
    structure.fillCircle(end.x, end.y, part.shape.radius * 0.43);
    structure.fillStyle(mixColor(palette.wood, palette.moss, part.variant * 0.28), 0.98);
    structure.fillCircle(end.x, end.y, part.shape.radius * 0.24);
    structure.fillStyle(index % 3 === 0 ? palette.mossLight : palette.moss, 0.3 + part.variant * 0.2);
    structure.fillEllipse(end.x - part.shape.radius * 0.16, end.y - part.shape.radius * 0.12, part.shape.radius * 0.68, part.shape.radius * 0.28);
    strokePolyline(
      structure,
      [start, control, end],
      mixColor(palette.woodLight, palette.mossLight, 0.18),
      Math.max(1.2, part.shape.radius * 0.12),
      0.38
    );
    if (index % 3 === 0) {
      const twigEnd = {
        x: end.x + directionY / directionLength * part.shape.radius * 1.7 * side,
        y: end.y - directionX / directionLength * part.shape.radius * 1.7 * side
      };
      structure.lineStyle(Math.max(2, part.shape.radius * 0.28), palette.woodDark, 0.88);
      structure.lineBetween(end.x, end.y, twigEnd.x, twigEnd.y);
    }
  });

  // One continuous, broad trunk base replaces the former pair of extruded rectangular halves.
  const trunkCenter = { x: center.x, y: center.y - r * 0.025 };
  fillPolygon(structure, ellipsePoints(trunkCenter, r * 0.49, r * 0.43, 34, 0, 0x9840, 0.09), palette.woodDark, 1);
  fillPolygon(
    structure,
    ellipsePoints(trunkCenter, r * 0.445, r * 0.39, 34, 0, 0x9841, 0.075),
    mixColor(palette.wood, palette.woodDark, 0.18),
    1
  );
  fillPolygon(
    structure,
    ellipsePoints({ x: center.x - r * 0.035, y: center.y - r * 0.065 }, r * 0.37, r * 0.31, 30, 0, 0x9842, 0.055),
    palette.wood,
    0.92
  );

  // Growth contours, bark fissures, moss, shelf fungi, and scars add close-range texture while
  // following the trunk curvature instead of forming another hard geometric layer.
  for (let ring = 0; ring < 4; ring += 1) {
    const scale = 0.2 + ring * 0.065;
    strokePolyline(
      structure,
      ellipsePoints(trunkCenter, r * scale * 1.22, r * scale, 28, 0, 0x9850 + ring, 0.035),
      ring % 2 ? palette.woodDark : palette.woodLight,
      Math.max(1.2, r * (0.0045 - ring * 0.0004)),
      0.24,
      true
    );
  }
  for (let fissure = 0; fissure < 21; fissure += 1) {
    const angle = detailRandom(seed, landmark, fissure, 0x9860) * Math.PI * 2;
    const innerRadius = r * (0.12 + detailRandom(seed, landmark, fissure, 0x9861) * 0.12);
    const outerRadius = r * (0.31 + detailRandom(seed, landmark, fissure, 0x9862) * 0.1);
    const tangent = (detailRandom(seed, landmark, fissure, 0x9863) - 0.5) * r * 0.07;
    const inner = { x: center.x + Math.cos(angle) * innerRadius, y: center.y + Math.sin(angle) * innerRadius * 0.82 };
    const outer = { x: center.x + Math.cos(angle) * outerRadius, y: center.y + Math.sin(angle) * outerRadius * 0.82 };
    const middle = {
      x: (inner.x + outer.x) * 0.5 - Math.sin(angle) * tangent,
      y: (inner.y + outer.y) * 0.5 + Math.cos(angle) * tangent
    };
    strokePolyline(
      structure,
      [inner, middle, outer],
      fissure % 4 === 0 ? palette.woodLight : palette.woodDark,
      Math.max(1.1, r * (fissure % 4 === 0 ? 0.004 : 0.006)),
      fissure % 4 === 0 ? 0.28 : 0.52
    );
  }
  for (let knot = 0; knot < 7; knot += 1) {
    const angle = detailRandom(seed, landmark, knot, 0x9868) * Math.PI * 2;
    const distance = r * (0.19 + detailRandom(seed, landmark, knot, 0x9869) * 0.16);
    const point = {
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance * 0.78
    };
    if (plan.entrance && Math.hypot(point.x - plan.entrance.worldX, point.y - plan.entrance.worldY) < r * 0.16) {
      continue;
    }
    const knotRadius = r * (0.018 + detailRandom(seed, landmark, knot, 0x986a) * 0.018);
    structure.fillStyle(palette.woodDark, 0.72);
    structure.fillEllipse(point.x, point.y, knotRadius * 2.2, knotRadius * 1.35);
    structure.lineStyle(Math.max(1, r * 0.003), palette.woodLight, 0.32);
    structure.strokeEllipse(point.x, point.y, knotRadius * 3.1, knotRadius * 2.1);
  }
  for (let mossPatch = 0; mossPatch < 11; mossPatch += 1) {
    const angle = Math.PI * (1.04 + detailRandom(seed, landmark, mossPatch, 0x9870) * 0.92);
    const distance = r * (0.27 + detailRandom(seed, landmark, mossPatch, 0x9871) * 0.13);
    const point = {
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance * 0.82
    };
    structure.fillStyle(mossPatch % 3 === 0 ? palette.mossLight : palette.moss, 0.48 + (mossPatch % 4) * 0.045);
    structure.fillEllipse(point.x, point.y, r * (0.045 + detailRandom(seed, landmark, mossPatch, 0x9872) * 0.055), r * 0.025);
  }
  for (let fungus = 0; fungus < 7; fungus += 1) {
    const angle = detailRandom(seed, landmark, fungus, 0x9880) * Math.PI * 2;
    const distance = r * (0.37 + detailRandom(seed, landmark, fungus, 0x9881) * 0.055);
    const point = { x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance * 0.78 };
    structure.fillStyle(fungus % 2 ? 0xc99655 : 0x9d6b40, 0.9);
    structure.fillEllipse(point.x, point.y, r * 0.045, r * 0.018);
    structure.lineStyle(Math.max(1, r * 0.003), 0xe0bd78, 0.45);
    structure.lineBetween(point.x - r * 0.016, point.y, point.x + r * 0.016, point.y);
  }

  const canopyCount = 28;
  for (let index = 0; index < canopyCount; index += 1) {
    const angle = detailRandom(seed, landmark, index, 0x9890) * 0.32 + index * 2.399963229728653;
    const distance = Math.sqrt((index + 0.65) / canopyCount);
    const point = {
      x: crownCenter.x + Math.cos(angle) * r * 0.66 * distance,
      y: crownCenter.y + Math.sin(angle) * r * 0.36 * distance
    };
    const size = r * (0.14 + detailRandom(seed, landmark, index, 0x9891) * 0.085);
    const lobeColor = mixColor(
      shadeColor(palette.moss, 0.02 + (point.y - crownCenter.y) / r * 0.1),
      palette.mossLight,
      0.15 + detailRandom(seed, landmark, index, 0x9892) * 0.24
    );
    const targetGraphics = point.y > center.y - r * 0.2 ? foreground : structure;
    const nearEntrance = plan.entrance
      ? Math.hypot(point.x - plan.entrance.worldX, point.y - plan.entrance.worldY) < size * 1.35
      : false;
    if (targetGraphics === foreground && nearEntrance) {
      continue;
    }
    fillPolygon(
      targetGraphics,
      ellipsePoints({ x: point.x + size * 0.06, y: point.y + size * 0.12 }, size, size * 0.72, 16, 0, 0x9893 + index, 0.09),
      shadeColor(lobeColor, -0.31),
      0.98
    );
    fillPolygon(
      targetGraphics,
      ellipsePoints(point, size * 0.9, size * 0.62, 16, 0, 0x98c0 + index, 0.075),
      lobeColor,
      1
    );
    targetGraphics.fillStyle(palette.mossLight, 0.22 + detailRandom(seed, landmark, index, 0x98f0) * 0.18);
    targetGraphics.fillEllipse(point.x - size * 0.2, point.y - size * 0.18, size * 0.5, size * 0.2);
    for (let leaf = 0; leaf < 3; leaf += 1) {
      const leafAngle = detailRandom(seed, landmark, index * 3 + leaf, 0x9900) * Math.PI * 2;
      const leafDistance = size * (0.24 + detailRandom(seed, landmark, index * 3 + leaf, 0x9901) * 0.38);
      const leafX = point.x + Math.cos(leafAngle) * leafDistance;
      const leafY = point.y + Math.sin(leafAngle) * leafDistance * 0.62;
      targetGraphics.fillStyle(leaf % 2 ? palette.mossLight : shadeColor(lobeColor, 0.12), 0.28 + detailRandom(seed, landmark, index * 3 + leaf, 0x9902) * 0.22);
      targetGraphics.fillEllipse(leafX, leafY, size * 0.12, size * 0.055);
    }
  }

  const entrance = plan.entrance;
  if (entrance) {
    const entranceAngle = Math.atan2(entrance.worldY - center.y, entrance.worldX - center.x);
    const entranceRotation = entranceAngle - Math.PI / 2;
    const lipCenter = {
      x: entrance.worldX - Math.cos(entranceAngle) * r * 0.025,
      y: entrance.worldY - Math.sin(entranceAngle) * r * 0.025
    };
    fillPolygon(
      structure,
      ellipsePoints(lipCenter, r * 0.14, r * 0.19, 26, entranceRotation, 0x9920, 0.075),
      shadeColor(palette.wood, -0.24),
      1
    );
    fillPolygon(
      structure,
      ellipsePoints(lipCenter, r * 0.115, r * 0.165, 24, entranceRotation, 0x9921, 0.055),
      palette.woodDark,
      1
    );
    fillPolygon(
      structure,
      ellipsePoints(lipCenter, r * 0.086, r * 0.132, 24, entranceRotation, 0x9930, 0.045),
      0x080b08,
      1
    );
    fillPolygon(
      structure,
      ellipsePoints(
        {
          x: lipCenter.x + Math.cos(entranceAngle) * r * 0.025,
          y: lipCenter.y + Math.sin(entranceAngle) * r * 0.025
        },
        r * 0.052,
        r * 0.094,
        20,
        entranceRotation,
        0x9931,
        0.02
      ),
      0x020403,
      1
    );
    for (let crack = 0; crack < 8; crack += 1) {
      const crackAngle = entranceAngle - Math.PI * 0.82 + crack / 7 * Math.PI * 1.64;
      const tangentRadius = r * (0.105 + detailRandom(seed, landmark, crack, 0x9932) * 0.025);
      const start = {
        x: lipCenter.x + Math.cos(crackAngle) * tangentRadius,
        y: lipCenter.y + Math.sin(crackAngle) * tangentRadius
      };
      const length = r * (0.035 + detailRandom(seed, landmark, crack, 0x9933) * 0.065);
      structure.lineStyle(Math.max(1.1, r * 0.004), palette.woodDark, 0.64);
      structure.lineBetween(start.x, start.y, start.x + Math.cos(crackAngle) * length, start.y + Math.sin(crackAngle) * length);
    }
    const tangentX = -Math.sin(entranceAngle);
    const tangentY = Math.cos(entranceAngle);
    const thresholdCenter = {
      x: entrance.worldX + Math.cos(entranceAngle) * r * 0.11,
      y: entrance.worldY + Math.sin(entranceAngle) * r * 0.11
    };
    structure.lineStyle(Math.max(3, r * 0.012), palette.woodLight, 0.72);
    structure.lineBetween(
      thresholdCenter.x - tangentX * r * 0.095,
      thresholdCenter.y - tangentY * r * 0.095,
      thresholdCenter.x + tangentX * r * 0.095,
      thresholdCenter.y + tangentY * r * 0.095
    );
    for (let step = 0; step < 3; step += 1) {
      const stepCenter = {
        x: entrance.worldX + Math.cos(entranceAngle) * r * (0.16 + step * 0.06),
        y: entrance.worldY + Math.sin(entranceAngle) * r * (0.16 + step * 0.06)
      };
      structure.lineStyle(Math.max(2, r * 0.008), shadeColor(palette.wood, -0.08 - step * 0.05), 0.82 - step * 0.12);
      structure.lineBetween(
        stepCenter.x - tangentX * r * (0.085 - step * 0.012),
        stepCenter.y - tangentY * r * (0.085 - step * 0.012),
        stepCenter.x + tangentX * r * (0.085 - step * 0.012),
        stepCenter.y + tangentY * r * (0.085 - step * 0.012)
      );
    }
  }

  // Fine hanging vines and leaf speckles tie the foreground crown into the surrounding grass.
  for (let vine = 0; vine < 8; vine += 1) {
    const x = crownCenter.x + (detailRandom(seed, landmark, vine, 0x9940) - 0.5) * r * 1.35;
    const y = crownCenter.y + r * (0.15 + detailRandom(seed, landmark, vine, 0x9941) * 0.42);
    const length = r * (0.08 + detailRandom(seed, landmark, vine, 0x9942) * 0.18);
    foreground.lineStyle(Math.max(1.2, r * 0.004), mixColor(palette.moss, palette.mossLight, 0.45), 0.58);
    foreground.lineBetween(x, y, x + (detailRandom(seed, landmark, vine, 0x9943) - 0.5) * r * 0.05, y + length);
    foreground.fillStyle(palette.mossLight, 0.46);
    foreground.fillEllipse(x + r * 0.012, y + length * 0.58, r * 0.026, r * 0.014);
  }
};

const ancientTreeFruitPositions = (
  seed: string,
  landmark: ProceduralLandmark,
  center: Point,
  radius: number
): readonly Point[] => {
  const count = 7 + Math.floor(detailRandom(seed, landmark, 0, 0xa710) * 5);
  return Array.from({ length: count }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const spread = 0.16 + detailRandom(seed, landmark, index, 0xa711) * 0.56;
    return {
      x: center.x + side * radius * spread,
      y: center.y - radius * (0.9 + detailRandom(seed, landmark, index, 0xa712) * 0.48)
    };
  });
};

const drawAncientTreeTall = (
  seed: string,
  visual: LandmarkVisual,
  palette: LandmarkPalette
): void => {
  const { landmark, plan, ground, structure, shadow, foreground } = visual;
  const center = centerFor(landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const crownCenter = { x: center.x - r * 0.02, y: center.y - r * 0.82 };
  const ellipsePoints = (
    point: Point,
    radiusX: number,
    radiusY: number,
    count: number,
    salt: number,
    irregularity = 0.08
  ): Point[] => Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    const wobble = 1 - irregularity + detailRandom(seed, landmark, index, salt) * irregularity * 2;
    return {
      x: point.x + Math.cos(angle) * radiusX * wobble,
      y: point.y + Math.sin(angle) * radiusY * wobble
    };
  });
  const curvedTaper = (
    start: Point,
    control: Point,
    end: Point,
    startWidth: number,
    endWidth: number,
    segments = 14
  ): Point[] => {
    const left: Point[] = [];
    const right: Point[] = [];
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const inverse = 1 - t;
      const point = {
        x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
        y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y
      };
      const tangentX = 2 * inverse * (control.x - start.x) + 2 * t * (end.x - control.x);
      const tangentY = 2 * inverse * (control.y - start.y) + 2 * t * (end.y - control.y);
      const length = Math.max(0.001, Math.hypot(tangentX, tangentY));
      const width = startWidth + (endWidth - startWidth) * t;
      left.push({ x: point.x - tangentY / length * width, y: point.y + tangentX / length * width });
      right.push({ x: point.x + tangentY / length * width, y: point.y - tangentX / length * width });
    }
    return [...left, ...right.reverse()];
  };

  // The root crown physically reshapes the terrain: a broad raised mound, paired shadow/highlight
  // ridges, exposed soil, moss, and fine root traces fade into the native biome.
  fillPolygon(
    ground,
    irregularRing(seed, landmark, center.x, center.y + r * 0.08, r * 0.93, r * 0.66, 38, 0xa720),
    mixColor(palette.soilDark, palette.moss, 0.26),
    0.3
  );
  ground.lineStyle(Math.max(2, r * 0.008), palette.soilLight, 0.18);
  ground.strokeEllipse(center.x - r * 0.05, center.y + r * 0.02, r * 1.55, r * 0.82);

  const roots = plan.components.filter((part) => part.role === 'ancient-root');
  roots.forEach((part, index) => {
    if (part.shape.kind !== 'capsule') return;
    const first = localToWorld(landmark, part.shape.startX, part.shape.startY);
    const second = localToWorld(landmark, part.shape.endX, part.shape.endY);
    const buriedEnd = Math.hypot(second.x - center.x, second.y - center.y) > Math.hypot(first.x - center.x, first.y - center.y)
      ? second
      : first;
    const dx = buriedEnd.x - center.x;
    const dy = buriedEnd.y - center.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const directionX = dx / distance;
    const directionY = dy / distance;
    const exposedDistance = Math.min(distance, r * (0.58 + detailRandom(seed, landmark, index, 0xa725) * 0.12));
    const end = {
      x: center.x + directionX * exposedDistance,
      y: center.y + directionY * exposedDistance
    };
    const start = { x: center.x + directionX * r * 0.12, y: center.y + directionY * r * 0.1 };
    const bendSide = detailRandom(seed, landmark, index, 0xa721) > 0.5 ? 1 : -1;
    const bend = r * (0.04 + detailRandom(seed, landmark, index, 0xa722) * 0.11) * bendSide;
    const control = {
      x: (start.x + end.x) * 0.5 - directionY * bend,
      y: (start.y + end.y) * 0.5 + directionX * bend
    };
    const buriedControl = {
      x: (start.x + buriedEnd.x) * 0.5 - directionY * bend,
      y: (start.y + buriedEnd.y) * 0.5 + directionX * bend
    };
    const baseWidth = r * (0.105 + detailRandom(seed, landmark, index, 0xa723) * 0.055);
    const tipWidth = r * (0.018 + detailRandom(seed, landmark, index, 0xa724) * 0.016);
    fillPolygon(ground, curvedTaper(start, buriedControl, buriedEnd, baseWidth * 1.34, tipWidth * 1.7), palette.soilDark, 0.31);
    fillPolygon(
      ground,
      curvedTaper(
        { x: start.x - directionY * baseWidth * 0.25, y: start.y + directionX * baseWidth * 0.25 },
        { x: buriedControl.x - directionY * baseWidth * 0.18, y: buriedControl.y + directionX * baseWidth * 0.18 },
        { x: buriedEnd.x - directionY * tipWidth * 0.25, y: buriedEnd.y + directionX * tipWidth * 0.25 },
        baseWidth * 0.98,
        tipWidth
      ),
      palette.soilLight,
      0.16
    );
    // Rear and alternating minor roots remain as raised soil traces. Limiting exposed timber to
    // the strongest front/lateral buttresses avoids the radial "spokes" silhouette of an icon.
    if (directionY < -0.18 || index % 2 === 1) {
      return;
    }
    fillPolygon(structure, curvedTaper(start, control, end, baseWidth, tipWidth), palette.woodDark, 1);
    fillPolygon(
      structure,
      curvedTaper(start, control, end, baseWidth * 0.77, tipWidth * 0.58),
      mixColor(palette.wood, palette.moss, part.variant * 0.22),
      1
    );
    strokePolyline(structure, [start, control, end], palette.woodLight, Math.max(1.5, r * 0.006), 0.34);
    structure.fillStyle(index % 3 === 0 ? palette.mossLight : palette.moss, 0.38);
    structure.fillEllipse(end.x, end.y - tipWidth * 0.2, tipWidth * 2.8, tipWidth * 0.85);
  });

  for (let patch = 0; patch < 24; patch += 1) {
    const angle = detailRandom(seed, landmark, patch, 0xa728) * Math.PI * 2;
    const distance = r * (0.42 + detailRandom(seed, landmark, patch, 0xa729) * 0.62);
    ground.fillStyle(patch % 4 === 0 ? palette.soilDark : palette.moss, 0.13 + detailRandom(seed, landmark, patch, 0xa72a) * 0.18);
    ground.fillEllipse(
      center.x + Math.cos(angle) * distance,
      center.y + Math.sin(angle) * distance * 0.73,
      r * (0.05 + detailRandom(seed, landmark, patch, 0xa72b) * 0.12),
      r * (0.018 + detailRandom(seed, landmark, patch, 0xa72c) * 0.04)
    );
  }

  shadow.fillStyle(0x07120c, 0.37);
  shadow.fillEllipse(center.x + r * 0.11, center.y + r * 0.15, r * 1.48, r * 0.72);
  shadow.fillStyle(0x06110b, 0.28);
  shadow.fillEllipse(crownCenter.x + r * 0.1, crownCenter.y + r * 0.18, r * 1.85, r * 0.84);

  // A single high crown establishes the scale before the branching and trunk are layered in.
  fillPolygon(
    structure,
    ellipsePoints({ x: crownCenter.x + r * 0.05, y: crownCenter.y + r * 0.06 }, r * 0.89, r * 0.43, 38, 0xa730, 0.11),
    shadeColor(palette.moss, -0.48),
    1
  );
  fillPolygon(structure, ellipsePoints(crownCenter, r * 0.82, r * 0.39, 38, 0xa731, 0.1), shadeColor(palette.moss, -0.13), 1);

  // Seeded limbs leave the upper shaft in distinct tiers, giving the tree a readable, branching
  // anatomy rather than a trunk pasted beneath a leaf blob.
  for (let branch = 0; branch < 10; branch += 1) {
    const side = branch % 2 === 0 ? -1 : 1;
    const tier = Math.floor(branch / 2);
    const start = {
      x: center.x + side * r * (0.03 + tier * 0.006),
      y: center.y - r * (0.58 + tier * 0.06)
    };
    const reach = r * (0.34 + detailRandom(seed, landmark, branch, 0xa732) * 0.3);
    const end = {
      x: crownCenter.x + side * reach,
      y: crownCenter.y + r * (-0.11 + tier * 0.06 + (detailRandom(seed, landmark, branch, 0xa733) - 0.5) * 0.12)
    };
    const control = {
      x: start.x + side * reach * (0.36 + detailRandom(seed, landmark, branch, 0xa734) * 0.18),
      y: (start.y + end.y) * 0.5 - r * (0.03 + detailRandom(seed, landmark, branch, 0xa735) * 0.1)
    };
    fillPolygon(structure, curvedTaper(start, control, end, r * (0.047 - tier * 0.003), r * 0.01), palette.woodDark, 1);
    fillPolygon(structure, curvedTaper(start, control, end, r * (0.03 - tier * 0.0018), r * 0.005), palette.wood, 0.98);
    strokePolyline(structure, [start, control, end], palette.woodLight, Math.max(1.2, r * 0.004), 0.3);
  }

  // Tall, continuously tapered trunk with a slightly asymmetric seeded outline.
  const left: Point[] = [];
  const right: Point[] = [];
  const trunkSegments = 18;
  for (let index = 0; index <= trunkSegments; index += 1) {
    const t = index / trunkSegments;
    const y = center.y + r * 0.08 - t * r * 0.96;
    const halfWidth = r * (0.39 * (1 - t) + 0.12 * t);
    const sway = Math.sin(t * Math.PI * 1.45 + landmark.variation * 2.4) * r * 0.035 * t;
    const leftWobble = (detailRandom(seed, landmark, index, 0xa740) - 0.5) * r * 0.022;
    const rightWobble = (detailRandom(seed, landmark, index, 0xa741) - 0.5) * r * 0.022;
    left.push({ x: center.x + sway - halfWidth + leftWobble, y });
    right.push({ x: center.x + sway + halfWidth + rightWobble, y });
  }
  const trunkOutline = [...left, ...right.reverse()];
  fillPolygon(structure, trunkOutline, palette.woodDark, 1);
  const innerTrunk = trunkOutline.map((point) => ({
    x: center.x + (point.x - center.x) * 0.91 - r * 0.012,
    y: center.y + (point.y - center.y) * 0.988
  }));
  fillPolygon(structure, innerTrunk, mixColor(palette.wood, palette.woodDark, 0.12), 1);

  // Re-layer the proximal buttresses over the trunk flare. This removes the flat cut at the base
  // and makes each root visibly grow from the trunk before sinking under the terrain mound.
  roots.forEach((part, index) => {
    if (part.shape.kind !== 'capsule') return;
    const candidate = localToWorld(landmark, part.shape.endX, part.shape.endY);
    const dx = candidate.x - center.x;
    const dy = candidate.y - center.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const directionX = dx / distance;
    const directionY = dy / distance;
    if (directionY < -0.18 || index % 2 === 1) return;
    const start = { x: center.x + directionX * r * 0.035, y: center.y - r * 0.015 + directionY * r * 0.035 };
    const endDistance = r * (0.32 + detailRandom(seed, landmark, index, 0xa746) * 0.1);
    const end = { x: center.x + directionX * endDistance, y: center.y + directionY * endDistance };
    const side = detailRandom(seed, landmark, index, 0xa747) > 0.5 ? 1 : -1;
    const control = {
      x: (start.x + end.x) * 0.5 - directionY * r * 0.04 * side,
      y: (start.y + end.y) * 0.5 + directionX * r * 0.04 * side
    };
    const width = r * (0.12 + detailRandom(seed, landmark, index, 0xa748) * 0.035);
    fillPolygon(structure, curvedTaper(start, control, end, width, width * 0.54), palette.woodDark, 1);
    fillPolygon(structure, curvedTaper(start, control, end, width * 0.76, width * 0.36), palette.wood, 0.96);
    strokePolyline(structure, [start, control, end], palette.woodLight, Math.max(1.2, r * 0.005), 0.28);
  });

  // Vertical bark plates, cross cracks, knot whorls, moss seams, and shelf fungus carry detail
  // all the way from the buttress flare into the crown.
  for (let fissure = 0; fissure < 28; fissure += 1) {
    const xBand = -0.29 + detailRandom(seed, landmark, fissure, 0xa750) * 0.58;
    const startT = detailRandom(seed, landmark, fissure, 0xa751) * 0.78;
    const lengthT = 0.12 + detailRandom(seed, landmark, fissure, 0xa752) * 0.3;
    const points: Point[] = [];
    for (let step = 0; step < 5; step += 1) {
      const t = Math.min(0.98, startT + lengthT * step / 4);
      const width = r * (0.37 * (1 - t) + 0.11 * t);
      points.push({
        x: center.x + xBand / 0.29 * width + Math.sin(step * 2.1 + fissure) * r * 0.008,
        y: center.y + r * 0.055 - t * r * 0.94
      });
    }
    strokePolyline(
      structure,
      points,
      fissure % 5 === 0 ? palette.woodLight : palette.woodDark,
      Math.max(1.2, r * (fissure % 5 === 0 ? 0.004 : 0.006)),
      fissure % 5 === 0 ? 0.34 : 0.58
    );
  }
  for (let knot = 0; knot < 9; knot += 1) {
    const t = 0.12 + detailRandom(seed, landmark, knot, 0xa760) * 0.73;
    const halfWidth = r * (0.37 * (1 - t) + 0.11 * t);
    const x = center.x + (detailRandom(seed, landmark, knot, 0xa761) - 0.5) * halfWidth * 1.55;
    const y = center.y + r * 0.05 - t * r * 0.94;
    if (plan.entrance && Math.hypot(x - plan.entrance.worldX, y - plan.entrance.worldY) < r * 0.18) continue;
    structure.fillStyle(palette.woodDark, 0.72);
    structure.fillEllipse(x, y, r * 0.055, r * 0.032);
    structure.lineStyle(Math.max(1, r * 0.003), palette.woodLight, 0.36);
    structure.strokeEllipse(x, y, r * 0.08, r * 0.052);
  }
  for (let growthBand = 0; growthBand < 7; growthBand += 1) {
    const y = center.y - r * (0.12 + growthBand * 0.17);
    const t = (center.y - y) / (r * 0.96);
    const width = r * (0.34 * (1 - t) + 0.1 * t);
    structure.lineStyle(Math.max(1, r * 0.0035), growthBand % 2 ? palette.woodLight : palette.woodDark, 0.2);
    structure.strokeEllipse(center.x, y, width * 1.7, r * 0.045);
  }
  for (let mossPatch = 0; mossPatch < 15; mossPatch += 1) {
    const t = detailRandom(seed, landmark, mossPatch, 0xa770) * 0.78;
    const side = mossPatch % 2 === 0 ? -1 : 1;
    const width = r * (0.36 * (1 - t) + 0.1 * t);
    const x = center.x + side * width * (0.62 + detailRandom(seed, landmark, mossPatch, 0xa771) * 0.24);
    const y = center.y - t * r * 0.92;
    structure.fillStyle(mossPatch % 4 === 0 ? palette.mossLight : palette.moss, 0.42);
    structure.fillEllipse(x, y, r * (0.035 + detailRandom(seed, landmark, mossPatch, 0xa772) * 0.045), r * 0.018);
  }
  for (let fungus = 0; fungus < 9; fungus += 1) {
    const side = fungus % 2 === 0 ? -1 : 1;
    const t = 0.08 + detailRandom(seed, landmark, fungus, 0xa780) * 0.63;
    const width = r * (0.36 * (1 - t) + 0.1 * t);
    const x = center.x + side * width * 0.93;
    const y = center.y - t * r * 0.92;
    structure.fillStyle(fungus % 2 ? 0xd2a361 : 0xa56c3d, 0.9);
    structure.fillEllipse(x, y, r * 0.05, r * 0.019);
  }

  // Irregular leaf clusters reveal enough negative space to see the limb network beneath them.
  const canopyCount = 42;
  for (let index = 0; index < canopyCount; index += 1) {
    const angle = index * 2.399963229728653 + detailRandom(seed, landmark, index, 0xa790) * 0.32;
    const distance = Math.sqrt((index + 0.7) / canopyCount);
    const point = {
      x: crownCenter.x + Math.cos(angle) * r * 0.76 * distance,
      y: crownCenter.y + Math.sin(angle) * r * 0.39 * distance
    };
    const size = r * (0.105 + detailRandom(seed, landmark, index, 0xa791) * 0.09);
    const target = point.y > crownCenter.y + r * 0.14 ? foreground : structure;
    const leafColor = mixColor(
      shadeColor(palette.moss, (point.x - crownCenter.x) / r * 0.1),
      palette.mossLight,
      0.13 + detailRandom(seed, landmark, index, 0xa792) * 0.31
    );
    fillPolygon(target, ellipsePoints({ x: point.x + size * 0.06, y: point.y + size * 0.1 }, size, size * 0.68, 14, 0xa793 + index, 0.1), shadeColor(leafColor, -0.32), 0.98);
    fillPolygon(target, ellipsePoints(point, size * 0.9, size * 0.57, 14, 0xa7d0 + index, 0.08), leafColor, 1);
    target.fillStyle(palette.mossLight, 0.26);
    target.fillEllipse(point.x - size * 0.2, point.y - size * 0.18, size * 0.46, size * 0.16);
    for (let leaf = 0; leaf < 4; leaf += 1) {
      const leafAngle = detailRandom(seed, landmark, index * 4 + leaf, 0xa810) * Math.PI * 2;
      const leafDistance = size * (0.18 + detailRandom(seed, landmark, index * 4 + leaf, 0xa811) * 0.5);
      target.fillStyle(leaf % 2 ? palette.mossLight : shadeColor(leafColor, 0.12), 0.34);
      target.fillEllipse(
        point.x + Math.cos(leafAngle) * leafDistance,
        point.y + Math.sin(leafAngle) * leafDistance * 0.58,
        size * 0.13,
        size * 0.055
      );
    }
  }

  const entrance = plan.entrance;
  if (entrance) {
    // The opening exists beneath the plug door. It is already dark before transition begins, so
    // pulling the door outward reveals a convincing hollow instead of swapping in a black decal.
    const doorway = { x: entrance.worldX, y: entrance.worldY - r * 0.035 };
    structure.fillStyle(shadeColor(palette.wood, -0.35), 1);
    structure.fillCircle(doorway.x, doorway.y, r * 0.153);
    structure.lineStyle(Math.max(3, r * 0.012), palette.woodLight, 0.46);
    structure.strokeCircle(doorway.x, doorway.y, r * 0.145);
    structure.fillStyle(0x030504, 1);
    structure.fillCircle(doorway.x, doorway.y, r * 0.116);
    structure.fillStyle(0x0b120d, 0.92);
    structure.fillEllipse(doorway.x, doorway.y + r * 0.036, r * 0.15, r * 0.07);
    for (let crack = 0; crack < 9; crack += 1) {
      const angle = crack / 9 * Math.PI * 2 + detailRandom(seed, landmark, crack, 0xa820) * 0.13;
      const inner = r * 0.15;
      const outer = r * (0.18 + detailRandom(seed, landmark, crack, 0xa821) * 0.055);
      structure.lineStyle(Math.max(1.2, r * 0.004), palette.woodDark, 0.62);
      structure.lineBetween(
        doorway.x + Math.cos(angle) * inner,
        doorway.y + Math.sin(angle) * inner,
        doorway.x + Math.cos(angle) * outer,
        doorway.y + Math.sin(angle) * outer
      );
    }
  }

  // Hanging vines and luminous fruit are sparse enough to feel discovered, not ornamental.
  for (let vine = 0; vine < 10; vine += 1) {
    const x = crownCenter.x + (detailRandom(seed, landmark, vine, 0xa830) - 0.5) * r * 1.45;
    const y = crownCenter.y + r * (0.08 + detailRandom(seed, landmark, vine, 0xa831) * 0.31);
    const length = r * (0.1 + detailRandom(seed, landmark, vine, 0xa832) * 0.25);
    foreground.lineStyle(Math.max(1.2, r * 0.004), mixColor(palette.moss, palette.mossLight, 0.45), 0.62);
    foreground.lineBetween(x, y, x + (detailRandom(seed, landmark, vine, 0xa833) - 0.5) * r * 0.06, y + length);
  }
  ancientTreeFruitPositions(seed, landmark, center, r).forEach((fruit, index) => {
    const stemY = fruit.y - r * (0.055 + detailRandom(seed, landmark, index, 0xa840) * 0.07);
    foreground.lineStyle(Math.max(1.2, r * 0.004), palette.mossLight, 0.72);
    foreground.lineBetween(fruit.x, stemY, fruit.x, fruit.y - r * 0.012);
    foreground.fillStyle(0xfffbe6, 1);
    foreground.fillEllipse(fruit.x, fruit.y, r * 0.024, r * 0.033);
    foreground.fillStyle(0xffffff, 0.92);
    foreground.fillCircle(fruit.x - r * 0.004, fruit.y - r * 0.007, Math.max(1.4, r * 0.004));
  });
};

const drawWaterfall = (seed: string, visual: LandmarkVisual, palette: LandmarkPalette): void => {
  const { landmark, plan, structure, shadow, foreground } = visual;
  const center = centerFor(landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  shadow.fillStyle(0x07161a, 0.34);
  shadow.fillEllipse(center.x, center.y + r * 0.18, r * 2.02, r * 0.84);
  const poolCenter = localToWorld(landmark, 0, r * 0.24);
  fillPolygon(structure, irregularRing(seed, landmark, poolCenter.x, poolCenter.y, r * 0.77, r * 0.42, 28, 0xa110, landmark.rotation), palette.water, 0.94);
  fillPolygon(structure, irregularRing(seed, landmark, poolCenter.x - r * 0.06, poolCenter.y - r * 0.07, r * 0.61, r * 0.28, 24, 0xa111, landmark.rotation), mixColor(palette.water, palette.waterLight, 0.2), 0.72);
  const rocks = plan.components.filter((part) => part.role === 'cliff-rock').sort((first, second) => first.order - second.order);
  rocks.forEach((part, index) => drawRock(structure, seed, landmark, part, palette, 0xa200 + index));
  const top = localToWorld(landmark, -r * 0.05, -r * 0.56);
  const leftBottom = localToWorld(landmark, -r * 0.23, r * 0.29);
  const rightBottom = localToWorld(landmark, r * 0.2, r * 0.29);
  fillPolygon(structure, [
    { x: top.x - r * 0.19, y: top.y },
    { x: top.x + r * 0.2, y: top.y + r * 0.02 },
    rightBottom,
    leftBottom
  ], mixColor(palette.water, palette.waterLight, 0.34), 0.91);
  for (let stream = 0; stream < 7; stream += 1) {
    const amount = stream / 6 - 0.5;
    const streamTop = localToWorld(landmark, amount * r * 0.3, -r * 0.52);
    const streamBottom = localToWorld(landmark, amount * r * 0.32, r * 0.26);
    structure.lineStyle(Math.max(2, r * (0.012 + (stream % 3) * 0.004)), stream % 2 ? palette.waterLight : 0xd9ffff, 0.55 + (stream % 2) * 0.2);
    structure.lineBetween(streamTop.x, streamTop.y, streamBottom.x, streamBottom.y);
  }
  if (plan.entrance) {
    const entrance = plan.entrance;
    structure.fillStyle(0x071013, 0.98);
    structure.fillEllipse(entrance.worldX, entrance.worldY - r * 0.04, r * 0.25, r * 0.33);
    structure.fillRect(entrance.worldX - r * 0.125, entrance.worldY - r * 0.03, r * 0.25, r * 0.13);
    structure.lineStyle(Math.max(3, r * 0.012), palette.stoneLight, 0.48);
    structure.strokeEllipse(entrance.worldX, entrance.worldY - r * 0.04, r * 0.29, r * 0.37);
  }
  foreground.fillStyle(palette.stoneDark, 0.98);
  foreground.fillEllipse(top.x, top.y - r * 0.03, r * 0.7, r * 0.2);
  foreground.fillStyle(palette.stoneLight, 0.5);
  foreground.fillEllipse(top.x - r * 0.04, top.y - r * 0.06, r * 0.52, r * 0.11);
};

const drawCrater = (seed: string, visual: LandmarkVisual, palette: LandmarkPalette): void => {
  const { landmark, plan, structure, shadow } = visual;
  const center = centerFor(landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  shadow.fillStyle(0x1b1110, 0.4);
  shadow.fillEllipse(center.x, center.y + r * 0.07, r * 1.83, r * 1.14);
  fillPolygon(structure, irregularRing(seed, landmark, center.x, center.y, r * 0.78, r * 0.53, 32, 0xb101, landmark.rotation), mixColor(palette.soil, 0x7a3e31, 0.46), 0.96);
  fillPolygon(structure, irregularRing(seed, landmark, center.x, center.y + r * 0.04, r * 0.61, r * 0.39, 29, 0xb102, landmark.rotation), shadeColor(palette.soilDark, -0.32), 1);
  fillPolygon(structure, irregularRing(seed, landmark, center.x - r * 0.05, center.y - r * 0.03, r * 0.42, r * 0.22, 22, 0xb103, landmark.rotation), 0x25292b, 0.94);
  plan.components.filter((part) => part.role === 'crater-rim').forEach((part, index) => drawRock(structure, seed, landmark, part, palette, 0xb200 + index));
  const core = plan.components.find((part) => part.role === 'impact-core');
  if (core) {
    const point = shapeCenterWorld(landmark, core.shape);
    const radius = core.shape.kind === 'circle' ? core.shape.radius : r * 0.1;
    fillPolygon(structure, irregularRing(seed, landmark, point.x, point.y, radius * 1.35, radius, 11, 0xb301, core.rotation), 0x20292f, 1);
    fillPolygon(structure, irregularRing(seed, landmark, point.x - radius * 0.12, point.y - radius * 0.16, radius, radius * 0.64, 9, 0xb302, core.rotation), 0x59616a, 0.88);
    strokePolyline(structure, [
      { x: point.x - radius * 0.72, y: point.y + radius * 0.13 },
      { x: point.x - radius * 0.08, y: point.y - radius * 0.22 },
      { x: point.x + radius * 0.6, y: point.y + radius * 0.08 }
    ], 0xd46f47, Math.max(2, radius * 0.09), 0.55);
  }
};

const drawStoneCircle = (seed: string, visual: LandmarkVisual, palette: LandmarkPalette): void => {
  const { landmark, plan, structure, shadow, foreground } = visual;
  const blocks = plan.components
    .filter((part) => part.role === 'stone-block' && part.shape.kind === 'oriented-box')
    .sort((first, second) => first.order - second.order);
  blocks.forEach((part) => {
    const shape = part.shape as LandmarkOrientedBoxShape;
    const center = shapeCenterWorld(landmark, shape);
    shadow.fillStyle(0x142019, 0.28);
    shadow.fillEllipse(center.x + part.lean * part.height, center.y + shape.height * 0.28, shape.width * 1.5, shape.height * 0.82);
    drawPrism(structure, landmark, shape, part.height, part.lean, palette.stoneDark, mixColor(palette.stone, palette.moss, part.variant * 0.18), mixColor(palette.stoneLight, palette.mossLight, part.variant * 0.12));
    const top = { x: center.x + part.lean * part.height, y: center.y - part.height };
    structure.lineStyle(Math.max(1.3, shape.width * 0.035), part.variant > 0.58 ? palette.mossLight : palette.stoneDark, 0.62);
    structure.lineBetween(top.x - shape.width * 0.18, top.y + part.height * 0.16, top.x + shape.width * 0.07, top.y + part.height * 0.47);
    structure.lineBetween(top.x + shape.width * 0.08, top.y + part.height * 0.48, top.x - shape.width * 0.04, top.y + part.height * 0.72);
    if (shape.y > 0) {
      const bottom = boxCornersWorld(landmark, shape);
      const topFace = bottom.map((point) => ({ x: point.x + part.lean * part.height, y: point.y - part.height }));
      fillPolygon(foreground, [bottom[2], bottom[3], topFace[3], topFace[2]], shadeColor(palette.stone, -0.19), 0.95);
      strokePolyline(foreground, [topFace[2], topFace[3]], palette.stoneLight, Math.max(1, shape.width * 0.018), 0.35);
    }
  });
  // The center is intentionally untouched: no opaque ground disk and no repeated central icon.
  const center = centerFor(landmark);
  structure.lineStyle(1.4, mixColor(palette.stoneLight, palette.mossLight, 0.45), 0.22);
  for (let ring = 0; ring < 3; ring += 1) {
    structure.strokeEllipse(center.x, center.y, 92 + ring * 39, 52 + ring * 22);
  }
};

const drawSkeleton = (seed: string, visual: LandmarkVisual, palette: LandmarkPalette): void => {
  const { landmark, plan, structure, shadow } = visual;
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const center = centerFor(landmark);
  shadow.fillStyle(0x241d16, 0.25);
  shadow.fillEllipse(center.x, center.y + r * 0.1, r * 1.85, r * 0.75);
  const drawBone = (part: LandmarkSurfaceComponent, index: number): void => {
    const shape = part.shape;
    if (shape.kind !== 'capsule') return;
    const start = localToWorld(landmark, shape.startX, shape.startY);
    const end = localToWorld(landmark, shape.endX, shape.endY);
    structure.lineStyle(shape.radius * 2.5, mixColor(palette.bone, palette.soilDark, 0.28), 1);
    structure.lineBetween(start.x, start.y + 3, end.x, end.y + 3);
    structure.lineStyle(shape.radius * 1.55, mixColor(palette.bone, palette.soil, part.variant * 0.18), 1);
    structure.lineBetween(start.x, start.y, end.x, end.y);
    structure.fillStyle(palette.bone, 0.92);
    structure.fillCircle(start.x, start.y, shape.radius * 0.9);
    structure.fillCircle(end.x, end.y, shape.radius * 0.82);
    if (index % 3 === 0) {
      structure.lineStyle(Math.max(1, shape.radius * 0.16), palette.soilDark, 0.46);
      structure.lineBetween(start.x + (end.x - start.x) * 0.36, start.y + (end.y - start.y) * 0.36, start.x + (end.x - start.x) * 0.48, start.y + (end.y - start.y) * 0.55);
    }
  };
  plan.components.filter((part) => part.role === 'skeleton-spine' || part.role === 'skeleton-rib').forEach(drawBone);
  const skull = plan.components.find((part) => part.role === 'skeleton-skull');
  if (skull) {
    const point = shapeCenterWorld(landmark, skull.shape);
    const width = skull.shape.kind === 'oriented-box' ? skull.shape.width : r * 0.3;
    const height = skull.shape.kind === 'oriented-box' ? skull.shape.height : r * 0.24;
    fillPolygon(structure, irregularRing(seed, landmark, point.x, point.y, width * 0.58, height * 0.61, 13, 0xc210, landmark.rotation), mixColor(palette.bone, palette.soil, 0.12), 1);
    structure.fillStyle(0x232522, 0.92);
    structure.fillEllipse(point.x - width * 0.17, point.y - height * 0.07, width * 0.16, height * 0.21);
    structure.fillEllipse(point.x + width * 0.17, point.y - height * 0.07, width * 0.16, height * 0.21);
    structure.fillTriangle(point.x, point.y, point.x - width * 0.055, point.y + height * 0.17, point.x + width * 0.055, point.y + height * 0.17);
    structure.lineStyle(Math.max(1.5, width * 0.018), palette.soilDark, 0.68);
    for (let tooth = -2; tooth <= 2; tooth += 1) {
      structure.lineBetween(point.x + tooth * width * 0.065, point.y + height * 0.28, point.x + tooth * width * 0.06, point.y + height * 0.4);
    }
  }
};

const drawTower = (seed: string, visual: LandmarkVisual, palette: LandmarkPalette): void => {
  const { landmark, plan, structure, shadow, foreground } = visual;
  const center = centerFor(landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  shadow.fillStyle(0x121912, 0.34);
  shadow.fillEllipse(center.x + r * 0.16, center.y + r * 0.22, r * 1.38, r * 0.62);
  const foundations = plan.components.filter((part) => part.role === 'tower-foundation' && part.shape.kind === 'oriented-box');
  foundations.forEach((part) => drawPrism(structure, landmark, part.shape as LandmarkOrientedBoxShape, part.height, 0, palette.stoneDark, palette.stone, palette.stoneLight));
  const legs = plan.components.filter((part) => part.role === 'tower-leg');
  const platformHeight = r * 0.83;
  legs.forEach((part, index) => {
    const base = shapeCenterWorld(landmark, part.shape);
    const top = { x: center.x + (base.x - center.x) * 0.62 + part.lean * r, y: center.y + (base.y - center.y) * 0.58 - platformHeight };
    structure.lineStyle(r * 0.09, palette.woodDark, 1);
    structure.lineBetween(base.x, base.y, top.x, top.y);
    structure.lineStyle(r * 0.045, mixColor(palette.wood, palette.woodLight, part.variant * 0.3), 1);
    structure.lineBetween(base.x - 2, base.y, top.x - 2, top.y);
    const opposite = legs[(index + 2) % legs.length];
    if (opposite) {
      const oppositeBase = shapeCenterWorld(landmark, opposite.shape);
      structure.lineStyle(r * 0.032, palette.wood, 0.92);
      structure.lineBetween(base.x, base.y - r * 0.12, oppositeBase.x, oppositeBase.y - platformHeight * 0.72);
    }
  });
  const platformCenter = { x: center.x, y: center.y - platformHeight };
  const platformWidth = r * 0.97;
  const platformDepth = r * 0.51;
  structure.fillStyle(palette.woodDark, 1);
  structure.fillRect(platformCenter.x - platformWidth * 0.54, platformCenter.y - platformDepth * 0.22, platformWidth * 1.08, platformDepth * 0.55);
  for (let plank = 0; plank < 9; plank += 1) {
    const x = platformCenter.x - platformWidth * 0.47 + plank / 8 * platformWidth * 0.94;
    structure.lineStyle(r * 0.04, plank % 2 ? palette.wood : palette.woodLight, 0.86);
    structure.lineBetween(x, platformCenter.y - platformDepth * 0.16, x, platformCenter.y + platformDepth * 0.22);
  }
  structure.lineStyle(r * 0.026, palette.woodLight, 0.72);
  for (let rung = 0; rung < 7; rung += 1) {
    const rungY = center.y + r * 0.19 - rung * r * 0.105;
    structure.lineBetween(center.x - r * 0.09, rungY, center.x + r * 0.09, rungY);
  }
  structure.lineStyle(r * 0.023, palette.woodDark, 1);
  structure.lineBetween(center.x - r * 0.11, center.y + r * 0.28, center.x - r * 0.11, center.y - r * 0.49);
  structure.lineBetween(center.x + r * 0.11, center.y + r * 0.28, center.x + r * 0.11, center.y - r * 0.49);
  if (plan.entrance) {
    structure.fillStyle(0x12100d, 0.94);
    structure.fillRoundedRect(plan.entrance.worldX - r * 0.1, plan.entrance.worldY - r * 0.17, r * 0.2, r * 0.24, r * 0.035);
    structure.lineStyle(Math.max(2, r * 0.012), palette.woodLight, 0.56);
    structure.strokeRoundedRect(plan.entrance.worldX - r * 0.1, plan.entrance.worldY - r * 0.17, r * 0.2, r * 0.24, r * 0.035);
  }
  const roofTop = platformCenter.y - r * 0.43;
  const roof = [
    { x: platformCenter.x - r * 0.63, y: platformCenter.y - r * 0.08 },
    { x: platformCenter.x, y: roofTop },
    { x: platformCenter.x + r * 0.63, y: platformCenter.y - r * 0.08 },
    { x: platformCenter.x + r * 0.5, y: platformCenter.y + r * 0.17 },
    { x: platformCenter.x - r * 0.5, y: platformCenter.y + r * 0.17 }
  ];
  fillPolygon(foreground, roof, shadeColor(palette.woodDark, -0.12), 1);
  fillPolygon(foreground, [roof[0], roof[1], roof[4]], mixColor(palette.wood, palette.moss, 0.22), 0.98);
  fillPolygon(foreground, [roof[1], roof[2], roof[3], roof[4]], mixColor(palette.wood, palette.stone, 0.18), 0.98);
  foreground.lineStyle(Math.max(2, r * 0.012), palette.woodLight, 0.45);
  for (let seam = 1; seam < 6; seam += 1) {
    const amount = seam / 6;
    foreground.lineBetween(platformCenter.x, roofTop, platformCenter.x - r * 0.57 * amount, platformCenter.y - r * 0.08 + r * 0.22 * amount);
    foreground.lineBetween(platformCenter.x, roofTop, platformCenter.x + r * 0.57 * amount, platformCenter.y - r * 0.08 + r * 0.22 * amount);
  }
};

const drawStaticVisual = (
  seed: string,
  visual: LandmarkVisual,
  state: SessionWorldState
): void => {
  const { landmark, plan, ground, shadow, structure, foreground } = visual;
  ground.clear();
  shadow.clear();
  structure.clear();
  foreground.clear();
  const palette = paletteFor(landmark.biome);
  plan.groundDetails.forEach((detail, index) => drawGroundDetail(ground, seed, landmark, detail, palette, index));
  switch (landmark.type) {
    case LandmarkType.GiantAncientTree:
      drawAncientTreeTall(seed, visual, palette);
      break;
    case LandmarkType.Waterfall:
      drawWaterfall(seed, visual, palette);
      break;
    case LandmarkType.MeteorCrater:
      drawCrater(seed, visual, palette);
      break;
    case LandmarkType.StoneCircle:
      drawStoneCircle(seed, visual, palette);
      break;
    case LandmarkType.GiantSkeleton:
      drawSkeleton(seed, visual, palette);
      break;
    case LandmarkType.Watchtower:
      drawTower(seed, visual, palette);
      break;
  }
  plan.materials.forEach((node, index) => drawMaterialNode(
    structure,
    seed,
    landmark,
    node,
    palette,
    state.isLandmarkMaterialHarvested(node.id),
    index
  ));
};

const drawAncientTreeDoor = (
  seed: string,
  visual: LandmarkVisual,
  palette: LandmarkPalette
): void => {
  const { door, landmark, plan } = visual;
  door.clear();
  const entrance = plan.entrance;
  if (landmark.type !== LandmarkType.GiantAncientTree || !entrance || visual.doorProgress >= 0.995) {
    return;
  }
  const center = centerFor(landmark);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const angle = Math.atan2(entrance.worldY - center.y, entrance.worldX - center.x);
  const eased = Phaser.Math.Easing.Sine.InOut(visual.doorProgress);
  const outward = r * 0.2 * eased;
  const doorX = entrance.worldX + Math.cos(angle) * outward;
  const doorY = entrance.worldY - r * 0.035 + Math.sin(angle) * outward - r * 0.015 * eased;
  const radius = r * 0.116 * (1 - eased * 0.08);
  const alpha = 1 - Math.max(0, eased - 0.76) / 0.24;
  const grainAngle = detailRandom(seed, landmark, 0, 0xa850) * Math.PI;

  door.fillStyle(0x050604, 0.34 * alpha);
  door.fillEllipse(doorX + r * 0.025, doorY + r * 0.035, radius * 2.25, radius * 0.9);
  door.fillStyle(palette.woodDark, alpha);
  door.fillCircle(doorX, doorY, radius * 1.13);
  door.lineStyle(Math.max(3, r * 0.011), palette.woodLight, 0.58 * alpha);
  door.strokeCircle(doorX, doorY, radius * 1.04);
  door.fillStyle(mixColor(palette.wood, palette.woodDark, 0.08), alpha);
  door.fillCircle(doorX, doorY, radius * 0.94);

  // A carved growth-ring plug with recessed radial grooves and a hand-sized wooden pull.
  for (let ring = 1; ring <= 4; ring += 1) {
    door.lineStyle(Math.max(1, r * 0.0035), ring % 2 ? palette.woodLight : palette.woodDark, (0.22 + ring * 0.045) * alpha);
    door.strokeCircle(doorX, doorY, radius * (0.18 + ring * 0.17));
  }
  const tangentX = Math.cos(grainAngle);
  const tangentY = Math.sin(grainAngle);
  for (let groove = -3; groove <= 3; groove += 1) {
    const offset = groove * radius * 0.2;
    const normalX = -tangentY;
    const normalY = tangentX;
    const extent = Math.sqrt(Math.max(0, radius * radius * 0.72 - offset * offset));
    door.lineStyle(Math.max(1, r * 0.003), groove === 0 ? palette.woodDark : palette.woodLight, (groove === 0 ? 0.47 : 0.18) * alpha);
    door.lineBetween(
      doorX + normalX * offset - tangentX * extent,
      doorY + normalY * offset - tangentY * extent,
      doorX + normalX * offset + tangentX * extent,
      doorY + normalY * offset + tangentY * extent
    );
  }
  door.lineStyle(Math.max(2, r * 0.007), shadeColor(palette.woodLight, 0.1), 0.7 * alpha);
  door.strokeCircle(doorX, doorY, radius * 0.39);
  for (let rune = 0; rune < 6; rune += 1) {
    const runeAngle = rune / 6 * Math.PI * 2 + landmark.variation * 0.4;
    const inner = radius * 0.3;
    const outer = radius * 0.48;
    door.lineBetween(
      doorX + Math.cos(runeAngle) * inner,
      doorY + Math.sin(runeAngle) * inner,
      doorX + Math.cos(runeAngle + 0.17) * outer,
      doorY + Math.sin(runeAngle + 0.17) * outer
    );
  }
  const handleX = doorX + Math.cos(angle) * radius * 0.36;
  const handleY = doorY + Math.sin(angle) * radius * 0.36;
  door.fillStyle(palette.woodDark, alpha);
  door.fillCircle(handleX, handleY, radius * 0.115);
  door.fillStyle(palette.woodLight, 0.9 * alpha);
  door.fillCircle(handleX - r * 0.003, handleY - r * 0.004, radius * 0.055);
};

const drawAnimatedVisual = (
  seed: string,
  visual: LandmarkVisual,
  state: SessionWorldState,
  time: number
): void => {
  const { accent, landmark, plan } = visual;
  accent.clear();
  const palette = paletteFor(landmark.biome);
  const r = landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  const pulse = 0.5 + Math.sin(time * 0.003 + landmark.variation * Math.PI * 2) * 0.5;
  if (landmark.type === LandmarkType.Waterfall) {
    const center = centerFor(landmark);
    for (let band = 0; band < 5; band += 1) {
      const localY = -r * 0.42 + ((time * (0.035 + band * 0.004) + band * r * 0.21) % (r * 0.73));
      const point = localToWorld(landmark, (band - 2) * r * 0.07, localY);
      accent.lineStyle(Math.max(2, r * 0.008), band % 2 ? palette.waterLight : 0xffffff, 0.38 + pulse * 0.32);
      accent.lineBetween(point.x - r * 0.035, point.y, point.x + r * 0.045, point.y + r * 0.06);
    }
    accent.fillStyle(palette.waterLight, 0.25 + pulse * 0.22);
    for (let foam = 0; foam < 7; foam += 1) {
      const angle = foam / 7 * Math.PI * 2 + time * 0.00035;
      accent.fillEllipse(center.x + Math.cos(angle) * r * 0.42, center.y + r * 0.28 + Math.sin(angle) * r * 0.12, r * 0.07, r * 0.025);
    }
  } else if (landmark.type === LandmarkType.GiantAncientTree) {
    const center = centerFor(landmark);
    for (let mote = 0; mote < 10; mote += 1) {
      const phase = time * (0.00032 + mote * 0.000017) + detailRandom(seed, landmark, mote, 0xdd10) * Math.PI * 2;
      const distance = r * (0.18 + detailRandom(seed, landmark, mote, 0xdd11) * 0.62);
      accent.fillStyle(mote % 3 ? 0xb9ef7d : 0xf2c86b, 0.24 + pulse * 0.42);
      accent.fillCircle(center.x + Math.cos(phase) * distance, center.y - r * 1.12 + Math.sin(phase * 1.3) * r * 0.42, 2 + (mote % 3));
    }
    ancientTreeFruitPositions(seed, landmark, center, r).forEach((fruit, index) => {
      const fruitPulse = 0.5 + Math.sin(time * 0.0024 + index * 1.73 + landmark.variation * 4) * 0.5;
      accent.fillStyle(0xeaffff, 0.055 + fruitPulse * 0.085);
      accent.fillCircle(fruit.x, fruit.y, r * (0.038 + fruitPulse * 0.012));
      accent.fillStyle(0xffffff, 0.44 + fruitPulse * 0.42);
      accent.fillCircle(fruit.x, fruit.y - r * 0.004, Math.max(2, r * (0.004 + fruitPulse * 0.002)));
    });
  } else if (landmark.type === LandmarkType.StoneCircle) {
    const center = centerFor(landmark);
    accent.lineStyle(2 + pulse * 1.2, mixColor(palette.mossLight, 0x8de3d5, 0.55), 0.1 + pulse * 0.22);
    accent.strokeEllipse(center.x, center.y, r * 0.68, r * 0.38);
    accent.strokeEllipse(center.x, center.y, r * 0.39, r * 0.21);
  } else if (landmark.type === LandmarkType.Watchtower) {
    const center = centerFor(landmark);
    const lensY = center.y - r * 1.18;
    accent.fillStyle(0xf3db8a, 0.34 + pulse * 0.42);
    accent.fillCircle(center.x + r * 0.2, lensY, 3.2 + pulse * 1.4);
    accent.lineStyle(2, 0xf5df9a, 0.08 + pulse * 0.11);
    accent.lineBetween(center.x + r * 0.2, lensY, center.x + r * (0.8 + pulse * 0.2), lensY + r * 0.2);
  }
  plan.materials.forEach((node) => {
    if (node.glowStrength <= 0 || state.isLandmarkMaterialHarvested(node.id)) {
      return;
    }
    const color = materialColor(String(node.resource), palette);
    accent.fillStyle(color, node.glowStrength * (0.08 + pulse * 0.12));
    accent.fillCircle(node.worldX, node.worldY, (18 + pulse * 6) * node.scale);
    accent.fillStyle(shadeColor(color, 0.35), node.glowStrength * (0.45 + pulse * 0.4));
    accent.fillCircle(node.worldX, node.worldY - 2, (2.2 + pulse * 1.4) * node.scale);
  });
};

const createVisual = (
  scene: Phaser.Scene,
  seed: string,
  landmark: ProceduralLandmark,
  state: SessionWorldState
): LandmarkVisual => {
  const visual: LandmarkVisual = {
    landmark,
    plan: createLandmarkSurfacePlan(seed, landmark),
    ground: scene.add.graphics().setDepth(LANDMARK_GROUND_DEPTH),
    shadow: scene.add.graphics().setDepth(LANDMARK_SHADOW_DEPTH),
    structure: scene.add.graphics().setDepth(LANDMARK_STRUCTURE_DEPTH),
    accent: scene.add.graphics().setDepth(LANDMARK_ACCENT_DEPTH),
    door: scene.add.graphics().setDepth(LANDMARK_DOOR_DEPTH),
    foreground: scene.add.graphics().setDepth(LANDMARK_FOREGROUND_DEPTH),
    doorProgress: 0
  };
  drawStaticVisual(seed, visual, state);
  drawAncientTreeDoor(seed, visual, paletteFor(landmark.biome));
  drawAnimatedVisual(seed, visual, state, 0);
  return visual;
};

const destroyVisual = (visual: LandmarkVisual): void => {
  visual.ground.destroy();
  visual.shadow.destroy();
  visual.structure.destroy();
  visual.accent.destroy();
  visual.door.destroy();
  visual.foreground.destroy();
};

export class LandmarkManager {
  private readonly visuals = new Map<string, LandmarkVisual>();
  private activeChunkX = Number.NaN;
  private activeChunkY = Number.NaN;
  private lastAnimationFrame = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly seed: string,
    private readonly state: SessionWorldState
  ) {}

  get loadedLandmarkCount(): number {
    return this.visuals.size;
  }

  update(activeChunkX: number, activeChunkY: number): void {
    if (!Number.isFinite(activeChunkX) || !Number.isFinite(activeChunkY)) {
      return;
    }
    const normalizedChunkX = Math.floor(activeChunkX);
    const normalizedChunkY = Math.floor(activeChunkY);
    if (normalizedChunkX === this.activeChunkX && normalizedChunkY === this.activeChunkY) {
      return;
    }
    this.activeChunkX = normalizedChunkX;
    this.activeChunkY = normalizedChunkY;
    const minTileX = (normalizedChunkX - CHUNK_LOAD_RADIUS) * CHUNK_SIZE_TILES;
    const minTileY = (normalizedChunkY - CHUNK_LOAD_RADIUS) * CHUNK_SIZE_TILES;
    const maxTileX = (normalizedChunkX + CHUNK_LOAD_RADIUS + 1) * CHUNK_SIZE_TILES - 1;
    const maxTileY = (normalizedChunkY + CHUNK_LOAD_RADIUS + 1) * CHUNK_SIZE_TILES - 1;
    const nextLandmarks = landmarksIntersectingTiles(this.seed, minTileX, minTileY, maxTileX, maxTileY);
    const nextIds = new Set(nextLandmarks.map((landmark) => landmark.id));
    this.visuals.forEach((visual, id) => {
      if (!nextIds.has(id)) {
        destroyVisual(visual);
        this.visuals.delete(id);
      }
    });
    nextLandmarks.forEach((landmark) => {
      if (!this.visuals.has(landmark.id)) {
        this.visuals.set(landmark.id, createVisual(this.scene, this.seed, landmark, this.state));
      }
    });
  }

  updateAnimation(time: number): void {
    const frame = Math.floor(time / LANDMARK_ANIMATION_INTERVAL_MS);
    if (frame === this.lastAnimationFrame) {
      return;
    }
    this.lastAnimationFrame = frame;
    this.visuals.forEach((visual) => drawAnimatedVisual(this.seed, visual, this.state, time));
  }

  animateAncientTreeDoorOpen(landmarkId: string): Promise<void> {
    const visual = this.visuals.get(landmarkId);
    if (!visual || visual.landmark.type !== LandmarkType.GiantAncientTree) {
      return Promise.resolve();
    }
    const palette = paletteFor(visual.landmark.biome);
    return new Promise((resolve) => {
      this.scene.tweens.addCounter({
        from: visual.doorProgress,
        to: 1,
        duration: 620,
        ease: 'Sine.easeInOut',
        onUpdate: (tween) => {
          visual.doorProgress = Number(tween.getValue());
          drawAncientTreeDoor(this.seed, visual, palette);
        },
        onComplete: () => {
          visual.doorProgress = 1;
          drawAncientTreeDoor(this.seed, visual, palette);
          resolve();
        }
      });
    });
  }

  resetAncientTreeDoor(landmarkId: string): void {
    const visual = this.visuals.get(landmarkId);
    if (!visual || visual.landmark.type !== LandmarkType.GiantAncientTree) {
      return;
    }
    visual.doorProgress = 0;
    drawAncientTreeDoor(this.seed, visual, paletteFor(visual.landmark.biome));
  }

  findNearbyEntrance(worldX: number, worldY: number, radiusPixels: number): LandmarkEntrance | null {
    let nearest: LandmarkEntrance | null = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    this.visuals.forEach((visual) => {
      const entrance = visual.plan.entrance;
      if (!entrance) {
        return;
      }
      const interactionRadius = Math.max(radiusPixels, entrance.interactionRadiusPixels);
      const distanceSquared = (entrance.worldX - worldX) ** 2 + (entrance.worldY - worldY) ** 2;
      if (distanceSquared < interactionRadius * interactionRadius && distanceSquared < nearestDistanceSquared) {
        nearest = entrance;
        nearestDistanceSquared = distanceSquared;
      }
    });
    return nearest;
  }

  findNearbyMaterial(worldX: number, worldY: number, radiusPixels: number): LandmarkMaterialNode | null {
    let nearest: LandmarkMaterialNode | null = null;
    let nearestDistanceSquared = radiusPixels * radiusPixels;
    this.visuals.forEach((visual) => {
      visual.plan.materials.forEach((material) => {
        if (this.state.isLandmarkMaterialHarvested(material.id)) {
          return;
        }
        const distanceSquared = (material.worldX - worldX) ** 2 + (material.worldY - worldY) ** 2;
        if (distanceSquared < nearestDistanceSquared) {
          nearest = material;
          nearestDistanceSquared = distanceSquared;
        }
      });
    });
    return nearest;
  }

  refreshMaterial(materialId: string): void {
    this.visuals.forEach((visual) => {
      if (visual.plan.materials.some((material) => material.id === materialId)) {
        drawStaticVisual(this.seed, visual, this.state);
        drawAncientTreeDoor(this.seed, visual, paletteFor(visual.landmark.biome));
        drawAnimatedVisual(this.seed, visual, this.state, this.lastAnimationFrame * LANDMARK_ANIMATION_INTERVAL_MS);
      }
    });
  }

  isStructureAtWorldPoint(worldX: number, worldY: number, paddingPixels = 23): boolean {
    for (const visual of this.visuals.values()) {
      if (landmarkCollisionContainsWorldPoint(visual.plan, worldX, worldY, paddingPixels)) {
        return true;
      }
    }
    return false;
  }

  destroy(): void {
    this.visuals.forEach((visual) => destroyVisual(visual));
    this.visuals.clear();
    this.activeChunkX = Number.NaN;
    this.activeChunkY = Number.NaN;
    this.lastAnimationFrame = Number.NEGATIVE_INFINITY;
  }
}

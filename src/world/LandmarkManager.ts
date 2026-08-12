import Phaser from 'phaser';
import { LandmarkType, type ProceduralLandmark } from './landmarkConfig';
import { landmarksIntersectingTiles } from './generation/landmarkGenerator';
import { CHUNK_LOAD_RADIUS, CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from './worldConfig';

// Landmark art is kept in a streamed world layer rather than in terrain chunks. This keeps
// macro landmarks independent from normal terrain generation while allowing their oversized
// silhouettes to stay visible whenever any part of the visual reaches the loaded area.
const LANDMARK_SHADOW_DEPTH = 1.4;
const LANDMARK_GROUND_DEPTH = 1.55;
const LANDMARK_STRUCTURE_DEPTH = 1.85;
const LANDMARK_ACCENT_DEPTH = 2.1;

interface LandmarkVisual {
  readonly shadow: Phaser.GameObjects.Graphics;
  readonly ground: Phaser.GameObjects.Graphics;
  readonly structure: Phaser.GameObjects.Graphics;
  readonly accent: Phaser.GameObjects.Graphics;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const makePoint = (x: number, y: number): Point => ({ x, y });

const rotatePoint = (centerX: number, centerY: number, offsetX: number, offsetY: number, rotation: number): Point => {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return makePoint(
    centerX + offsetX * cosine - offsetY * sine,
    centerY + offsetX * sine + offsetY * cosine
  );
};

const fillPolygon = (graphics: Phaser.GameObjects.Graphics, color: number, alpha: number, points: readonly Point[]): void => {
  if (points.length < 3) {
    return;
  }

  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo(points[index].x, points[index].y);
  }
  graphics.closePath();
  graphics.fillPath();
};

const strokePolyline = (
  graphics: Phaser.GameObjects.Graphics,
  color: number,
  alpha: number,
  width: number,
  points: readonly Point[],
  close = false
): void => {
  if (points.length < 2) {
    return;
  }

  graphics.lineStyle(width, color, alpha);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo(points[index].x, points[index].y);
  }
  if (close) {
    graphics.closePath();
  }
  graphics.strokePath();
};

const landmarkCenter = (landmark: ProceduralLandmark): Point => makePoint(
  (landmark.centerTileX + 0.5) * WORLD_TILE_SIZE,
  (landmark.centerTileY + 0.5) * WORLD_TILE_SIZE
);

const landmarkRadius = (landmark: ProceduralLandmark): number => landmark.footprintRadiusTiles * WORLD_TILE_SIZE;

const landmarkVisualRadius = (landmark: ProceduralLandmark): number => landmark.visualRadiusTiles * WORLD_TILE_SIZE;

const drawShadow = (
  graphics: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  alpha = 0.32
): void => {
  graphics.fillStyle(0x102019, alpha * 0.48);
  graphics.fillEllipse(centerX + width * 0.045, centerY + height * 0.12, width * 1.08, height * 0.82);
  graphics.fillStyle(0x162017, alpha);
  graphics.fillEllipse(centerX, centerY, width, height * 0.72);
};

const drawGroundRim = (
  graphics: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  radius: number,
  color: number,
  alpha = 0.64
): void => {
  graphics.fillStyle(0x172317, alpha * 0.44);
  graphics.fillEllipse(centerX, centerY + radius * 0.12, radius * 1.9, radius * 0.88);
  graphics.fillStyle(color, alpha);
  graphics.fillEllipse(centerX, centerY + radius * 0.06, radius * 1.64, radius * 0.7);
};

const drawAncientTree = (
  landmark: ProceduralLandmark,
  shadow: Phaser.GameObjects.Graphics,
  ground: Phaser.GameObjects.Graphics,
  structure: Phaser.GameObjects.Graphics,
  accent: Phaser.GameObjects.Graphics
): void => {
  const { x, y } = landmarkCenter(landmark);
  const radius = landmarkRadius(landmark);
  const visualRadius = landmarkVisualRadius(landmark);
  const sway = (landmark.variation - 0.5) * visualRadius * 0.08;
  drawShadow(shadow, x, y + visualRadius * 0.21, visualRadius * 1.62, visualRadius * 0.54, 0.52);
  drawGroundRim(ground, x, y + radius * 0.26, radius * 1.04, 0x3f522d, 0.76);

  structure.fillStyle(0x2b2018, 1);
  structure.fillRoundedRect(x - radius * 0.18, y - visualRadius * 0.21, radius * 0.36, visualRadius * 0.79, radius * 0.11);
  structure.fillStyle(0x6e4528, 1);
  structure.fillRoundedRect(x - radius * 0.075, y - visualRadius * 0.2, radius * 0.15, visualRadius * 0.76, radius * 0.07);
  structure.lineStyle(Math.max(3, radius * 0.035), 0x21170f, 0.9);
  structure.lineBetween(x - radius * 0.03, y + radius * 0.21, x - radius * 0.7, y + radius * 0.56);
  structure.lineBetween(x + radius * 0.04, y + radius * 0.25, x + radius * 0.67, y + radius * 0.54);
  structure.lineBetween(x - radius * 0.02, y + radius * 0.04, x + radius * 0.48, y - radius * 0.14);
  structure.lineBetween(x + radius * 0.02, y + radius * 0.02, x - radius * 0.52, y - radius * 0.08);
  structure.lineStyle(Math.max(2, radius * 0.018), 0xa06b38, 0.68);
  structure.lineBetween(x - radius * 0.02, y - visualRadius * 0.12, x - radius * 0.11, y + radius * 0.39);
  structure.lineBetween(x + radius * 0.1, y - visualRadius * 0.05, x + radius * 0.16, y + radius * 0.4);

  const canopy = [
    [-0.59, -0.21, 0.4, 0x0b3527],
    [-0.29, -0.54, 0.43, 0x0b3527],
    [0.13, -0.56, 0.4, 0x0b3527],
    [0.54, -0.29, 0.4, 0x0b3527],
    [0.05, -0.2, 0.54, 0x153f2d],
    [-0.4, -0.4, 0.35, 0x174d32],
    [0.35, -0.45, 0.4, 0x174d32],
    [-0.11, -0.7, 0.28, 0x174d32]
  ] as const;
  canopy.forEach(([offsetX, offsetY, scale, color]) => {
    structure.fillStyle(color, 1);
    structure.fillCircle(
      x + offsetX * visualRadius + sway * (0.55 + offsetY),
      y + offsetY * visualRadius,
      visualRadius * scale
    );
  });
  accent.fillStyle(0x4e9b4b, 0.9);
  accent.fillCircle(x - visualRadius * 0.34 + sway * 0.3, y - visualRadius * 0.49, visualRadius * 0.16);
  accent.fillCircle(x + visualRadius * 0.19 + sway * 0.45, y - visualRadius * 0.58, visualRadius * 0.14);
  accent.fillStyle(0x9acb5c, 0.68);
  accent.fillCircle(x - visualRadius * 0.15 + sway * 0.2, y - visualRadius * 0.7, visualRadius * 0.07);
  accent.fillCircle(x + visualRadius * 0.47 + sway * 0.55, y - visualRadius * 0.29, visualRadius * 0.06);
};

const drawWaterfall = (
  landmark: ProceduralLandmark,
  shadow: Phaser.GameObjects.Graphics,
  ground: Phaser.GameObjects.Graphics,
  structure: Phaser.GameObjects.Graphics,
  accent: Phaser.GameObjects.Graphics
): void => {
  const { x, y } = landmarkCenter(landmark);
  const radius = landmarkRadius(landmark);
  const visualRadius = landmarkVisualRadius(landmark);
  drawShadow(shadow, x, y + visualRadius * 0.34, visualRadius * 1.58, visualRadius * 0.44, 0.46);
  drawGroundRim(ground, x, y + visualRadius * 0.39, radius * 1.3, 0x405956, 0.7);
  ground.fillStyle(0x1d6381, 0.95);
  ground.fillEllipse(x, y + visualRadius * 0.41, visualRadius * 1.18, visualRadius * 0.47);
  ground.fillStyle(0x368fac, 0.78);
  ground.fillEllipse(x - visualRadius * 0.06, y + visualRadius * 0.37, visualRadius * 0.94, visualRadius * 0.31);

  const cliffPoints = [
    makePoint(x - visualRadius * 0.72, y + visualRadius * 0.27),
    makePoint(x - visualRadius * 0.58, y - visualRadius * 0.59),
    makePoint(x - visualRadius * 0.22, y - visualRadius * 0.76),
    makePoint(x + visualRadius * 0.28, y - visualRadius * 0.68),
    makePoint(x + visualRadius * 0.66, y - visualRadius * 0.34),
    makePoint(x + visualRadius * 0.72, y + visualRadius * 0.29)
  ];
  fillPolygon(structure, 0x2d3d42, 1, cliffPoints);
  fillPolygon(structure, 0x51636a, 0.94, [
    makePoint(x - visualRadius * 0.52, y + visualRadius * 0.18),
    makePoint(x - visualRadius * 0.4, y - visualRadius * 0.49),
    makePoint(x - visualRadius * 0.1, y - visualRadius * 0.65),
    makePoint(x - visualRadius * 0.14, y + visualRadius * 0.2)
  ]);
  fillPolygon(structure, 0x758992, 0.84, [
    makePoint(x + visualRadius * 0.03, y + visualRadius * 0.19),
    makePoint(x + visualRadius * 0.21, y - visualRadius * 0.58),
    makePoint(x + visualRadius * 0.51, y - visualRadius * 0.35),
    makePoint(x + visualRadius * 0.57, y + visualRadius * 0.22)
  ]);
  structure.lineStyle(Math.max(3, radius * 0.022), 0x1c2b31, 0.72);
  structure.lineBetween(x - visualRadius * 0.35, y - visualRadius * 0.42, x - visualRadius * 0.55, y + visualRadius * 0.14);
  structure.lineBetween(x + visualRadius * 0.35, y - visualRadius * 0.39, x + visualRadius * 0.54, y + visualRadius * 0.12);

  fillPolygon(accent, 0x8ee9f5, 0.94, [
    makePoint(x - visualRadius * 0.18, y - visualRadius * 0.61),
    makePoint(x + visualRadius * 0.19, y - visualRadius * 0.57),
    makePoint(x + visualRadius * 0.25, y + visualRadius * 0.28),
    makePoint(x - visualRadius * 0.2, y + visualRadius * 0.3)
  ]);
  accent.fillStyle(0xc9fbff, 0.82);
  accent.fillRect(x - visualRadius * 0.1, y - visualRadius * 0.54, visualRadius * 0.1, visualRadius * 0.76);
  accent.fillRect(x + visualRadius * 0.08, y - visualRadius * 0.49, visualRadius * 0.06, visualRadius * 0.61);
  accent.lineStyle(Math.max(2, radius * 0.016), 0xd8fcff, 0.82);
  accent.lineBetween(x - visualRadius * 0.42, y + visualRadius * 0.4, x - visualRadius * 0.17, y + visualRadius * 0.43);
  accent.lineBetween(x + visualRadius * 0.12, y + visualRadius * 0.45, x + visualRadius * 0.43, y + visualRadius * 0.42);
};

const drawCrystalFormation = (
  landmark: ProceduralLandmark,
  shadow: Phaser.GameObjects.Graphics,
  ground: Phaser.GameObjects.Graphics,
  structure: Phaser.GameObjects.Graphics,
  accent: Phaser.GameObjects.Graphics
): void => {
  const { x, y } = landmarkCenter(landmark);
  const radius = landmarkRadius(landmark);
  const visualRadius = landmarkVisualRadius(landmark);
  const rotation = landmark.rotation;
  drawShadow(shadow, x, y + radius * 0.33, visualRadius * 1.3, visualRadius * 0.42, 0.5);
  drawGroundRim(ground, x, y + radius * 0.28, radius * 0.95, 0x453c58, 0.76);

  const shards = [
    [-0.43, 0.3, -0.86, 0.38, 0x5c3eaa],
    [-0.16, 0.24, -1.22, 0.48, 0x7954d3],
    [0.16, 0.25, -1.04, 0.56, 0x8a5ce4],
    [0.47, 0.34, -0.72, 0.36, 0x5a3a9a],
    [0.02, 0.16, -1.54, 0.5, 0x9b72ef]
  ] as const;
  shards.forEach(([offsetX, offsetY, heightMultiplier, widthMultiplier, color], index) => {
    const base = rotatePoint(x, y, offsetX * radius, offsetY * radius, rotation);
    // Keep every shard within the generator's visual radius so streaming never removes an
    // overhanging crystal while it is still on screen.
    const height = visualRadius * Math.abs(heightMultiplier) * 0.46;
    const width = radius * widthMultiplier;
    const top = rotatePoint(base.x, base.y, 0, -height, rotation + (index - 2) * 0.08);
    const left = rotatePoint(base.x, base.y, -width, height * 0.11, rotation + (index - 2) * 0.08);
    const right = rotatePoint(base.x, base.y, width, height * 0.11, rotation + (index - 2) * 0.08);
    fillPolygon(structure, 0x332456, 1, [left, top, right]);
    fillPolygon(structure, color, 1, [
      makePoint((left.x + top.x) / 2, (left.y + top.y) / 2),
      top,
      makePoint((right.x + top.x) / 2, (right.y + top.y) / 2),
      base
    ]);
    strokePolyline(accent, 0xd9caff, 0.76, Math.max(2, radius * 0.015), [left, top, base]);
  });
  accent.fillStyle(0xe8d9ff, 0.92);
  accent.fillCircle(x + visualRadius * 0.05, y - visualRadius * 0.36, visualRadius * 0.055);
  accent.fillCircle(x - visualRadius * 0.23, y - visualRadius * 0.12, visualRadius * 0.035);
};

const drawLargeLake = (
  landmark: ProceduralLandmark,
  shadow: Phaser.GameObjects.Graphics,
  ground: Phaser.GameObjects.Graphics,
  structure: Phaser.GameObjects.Graphics,
  accent: Phaser.GameObjects.Graphics
): void => {
  const { x, y } = landmarkCenter(landmark);
  const radius = landmarkRadius(landmark);
  const visualRadius = landmarkVisualRadius(landmark);
  drawShadow(shadow, x, y + visualRadius * 0.16, visualRadius * 1.72, visualRadius * 0.88, 0.34);
  ground.fillStyle(0x53663e, 0.8);
  ground.fillEllipse(x, y, visualRadius * 1.82, visualRadius * 1.07);
  ground.fillStyle(0x9db866, 0.68);
  ground.fillEllipse(x - visualRadius * 0.02, y - visualRadius * 0.02, visualRadius * 1.67, visualRadius * 0.94);
  structure.fillStyle(0x1c6593, 1);
  structure.fillEllipse(x, y - visualRadius * 0.015, visualRadius * 1.53, visualRadius * 0.83);
  structure.fillStyle(0x2d87b8, 0.94);
  structure.fillEllipse(x - visualRadius * 0.06, y - visualRadius * 0.04, visualRadius * 1.29, visualRadius * 0.66);
  structure.fillStyle(0x4cb2ce, 0.78);
  structure.fillEllipse(x - visualRadius * 0.16, y - visualRadius * 0.13, visualRadius * 0.72, visualRadius * 0.23);
  structure.fillStyle(0x365d3a, 1);
  structure.fillEllipse(x - visualRadius * 0.62, y + visualRadius * 0.1, radius * 0.44, radius * 0.25);
  structure.fillEllipse(x + visualRadius * 0.59, y - visualRadius * 0.17, radius * 0.34, radius * 0.18);
  accent.lineStyle(Math.max(2, radius * 0.018), 0xc7f6f4, 0.76);
  accent.lineBetween(x - visualRadius * 0.46, y - visualRadius * 0.05, x - visualRadius * 0.11, y - visualRadius * 0.05);
  accent.lineBetween(x + visualRadius * 0.08, y + visualRadius * 0.17, x + visualRadius * 0.41, y + visualRadius * 0.17);
  accent.lineStyle(Math.max(1.5, radius * 0.012), 0xefffff, 0.6);
  accent.lineBetween(x - visualRadius * 0.1, y - visualRadius * 0.25, x + visualRadius * 0.16, y - visualRadius * 0.25);
};

const drawMeteorCrater = (
  landmark: ProceduralLandmark,
  shadow: Phaser.GameObjects.Graphics,
  ground: Phaser.GameObjects.Graphics,
  structure: Phaser.GameObjects.Graphics,
  accent: Phaser.GameObjects.Graphics
): void => {
  const { x, y } = landmarkCenter(landmark);
  const radius = landmarkRadius(landmark);
  const visualRadius = landmarkVisualRadius(landmark);
  drawShadow(shadow, x, y + visualRadius * 0.13, visualRadius * 1.66, visualRadius * 0.92, 0.42);
  ground.fillStyle(0x6d5443, 1);
  ground.fillEllipse(x, y, visualRadius * 1.72, visualRadius * 1.03);
  ground.fillStyle(0xa77952, 0.92);
  ground.fillEllipse(x - visualRadius * 0.02, y - visualRadius * 0.05, visualRadius * 1.46, visualRadius * 0.83);
  structure.fillStyle(0x3d3737, 1);
  structure.fillEllipse(x, y + visualRadius * 0.04, visualRadius * 1.19, visualRadius * 0.65);
  structure.fillStyle(0x252c31, 0.98);
  structure.fillEllipse(x - visualRadius * 0.03, y + visualRadius * 0.06, visualRadius * 0.92, visualRadius * 0.47);
  structure.fillStyle(0x554543, 0.9);
  structure.fillEllipse(x - visualRadius * 0.1, y - visualRadius * 0.04, visualRadius * 0.49, visualRadius * 0.18);
  const impactLines = [
    [-0.72, 0.11, -0.38, 0.05],
    [0.69, -0.15, 0.34, -0.09],
    [-0.23, -0.47, -0.1, -0.24],
    [0.32, 0.43, 0.14, 0.24]
  ] as const;
  impactLines.forEach(([startX, startY, endX, endY]) => {
    accent.lineStyle(Math.max(2, radius * 0.02), 0xd0a170, 0.6);
    accent.lineBetween(
      x + startX * visualRadius,
      y + startY * visualRadius,
      x + endX * visualRadius,
      y + endY * visualRadius
    );
  });
  accent.fillStyle(0xd87d47, 0.62);
  accent.fillCircle(x + visualRadius * 0.13, y - visualRadius * 0.06, visualRadius * 0.065);
};

const drawVolcano = (
  landmark: ProceduralLandmark,
  shadow: Phaser.GameObjects.Graphics,
  ground: Phaser.GameObjects.Graphics,
  structure: Phaser.GameObjects.Graphics,
  accent: Phaser.GameObjects.Graphics
): void => {
  const { x, y } = landmarkCenter(landmark);
  const radius = landmarkRadius(landmark);
  const visualRadius = landmarkVisualRadius(landmark);
  const rotation = landmark.rotation;
  drawShadow(shadow, x, y + visualRadius * 0.38, visualRadius * 1.58, visualRadius * 0.48, 0.56);
  drawGroundRim(ground, x, y + visualRadius * 0.3, radius * 1.28, 0x504233, 0.84);
  const peak = rotatePoint(x, y, 0, -visualRadius * 0.78, rotation);
  const left = rotatePoint(x, y, -visualRadius * 0.67, visualRadius * 0.43, rotation);
  const right = rotatePoint(x, y, visualRadius * 0.67, visualRadius * 0.43, rotation);
  fillPolygon(structure, 0x303137, 1, [left, peak, right]);
  const leftSlope = rotatePoint(x, y, -visualRadius * 0.25, visualRadius * 0.35, rotation);
  const centerSlope = rotatePoint(x, y, -visualRadius * 0.04, -visualRadius * 0.51, rotation);
  const bottomSlope = rotatePoint(x, y, visualRadius * 0.06, visualRadius * 0.42, rotation);
  fillPolygon(structure, 0x5b4d48, 1, [left, centerSlope, bottomSlope, leftSlope]);
  const rightSlope = rotatePoint(x, y, visualRadius * 0.5, visualRadius * 0.37, rotation);
  fillPolygon(structure, 0x765842, 0.92, [centerSlope, right, rightSlope, bottomSlope]);
  const craterCenter = rotatePoint(x, y, 0, -visualRadius * 0.62, rotation);
  structure.fillStyle(0x191a20, 1);
  structure.fillEllipse(craterCenter.x, craterCenter.y, visualRadius * 0.38, visualRadius * 0.16);
  structure.fillStyle(0xc44a25, 0.98);
  structure.fillEllipse(craterCenter.x, craterCenter.y + visualRadius * 0.012, visualRadius * 0.22, visualRadius * 0.075);
  const lavaStart = rotatePoint(x, y, visualRadius * 0.03, -visualRadius * 0.47, rotation);
  const lavaMid = rotatePoint(x, y, -visualRadius * 0.12, -visualRadius * 0.05, rotation);
  const lavaEnd = rotatePoint(x, y, visualRadius * 0.14, visualRadius * 0.35, rotation);
  strokePolyline(accent, 0xef6728, 0.98, Math.max(4, radius * 0.04), [lavaStart, lavaMid, lavaEnd]);
  strokePolyline(accent, 0xffba52, 0.94, Math.max(2, radius * 0.016), [lavaStart, lavaMid, lavaEnd]);
  accent.fillStyle(0x5f656d, 0.28);
  accent.fillCircle(craterCenter.x - visualRadius * 0.12, craterCenter.y - visualRadius * 0.28, visualRadius * 0.13);
  accent.fillCircle(craterCenter.x + visualRadius * 0.13, craterCenter.y - visualRadius * 0.43, visualRadius * 0.18);
};

const drawStoneCircle = (
  landmark: ProceduralLandmark,
  shadow: Phaser.GameObjects.Graphics,
  ground: Phaser.GameObjects.Graphics,
  structure: Phaser.GameObjects.Graphics,
  accent: Phaser.GameObjects.Graphics
): void => {
  const { x, y } = landmarkCenter(landmark);
  const radius = landmarkRadius(landmark);
  const visualRadius = landmarkVisualRadius(landmark);
  drawShadow(shadow, x, y + radius * 0.21, visualRadius * 1.32, visualRadius * 0.63, 0.43);
  drawGroundRim(ground, x, y + radius * 0.11, radius * 1.08, 0x675a47, 0.72);
  ground.fillStyle(0x3a4939, 0.75);
  ground.fillEllipse(x, y, radius * 1.39, radius * 0.68);
  const stoneCount = 9;
  for (let index = 0; index < stoneCount; index += 1) {
    const angle = landmark.rotation + (Math.PI * 2 * index) / stoneCount;
    const stoneX = x + Math.cos(angle) * radius * 0.69;
    const stoneY = y + Math.sin(angle) * radius * 0.37;
    const stoneHeight = radius * (0.29 + ((index + Math.floor(landmark.variation * 11)) % 3) * 0.038);
    const stoneWidth = radius * 0.17;
    structure.fillStyle(0x384146, 1);
    structure.fillRoundedRect(stoneX - stoneWidth / 2, stoneY - stoneHeight, stoneWidth, stoneHeight, stoneWidth * 0.23);
    structure.fillStyle(0x6f7a78, 0.98);
    structure.fillRoundedRect(stoneX - stoneWidth * 0.28, stoneY - stoneHeight * 0.92, stoneWidth * 0.34, stoneHeight * 0.82, stoneWidth * 0.12);
    accent.lineStyle(Math.max(1.5, radius * 0.012), 0x9eb6a5, 0.55);
    accent.lineBetween(stoneX - stoneWidth * 0.12, stoneY - stoneHeight * 0.72, stoneX + stoneWidth * 0.04, stoneY - stoneHeight * 0.24);
  }
  accent.fillStyle(0x91c879, 0.42);
  accent.fillCircle(x, y - radius * 0.02, radius * 0.19);
};

const drawGiantSkeleton = (
  landmark: ProceduralLandmark,
  shadow: Phaser.GameObjects.Graphics,
  ground: Phaser.GameObjects.Graphics,
  structure: Phaser.GameObjects.Graphics,
  accent: Phaser.GameObjects.Graphics
): void => {
  const { x, y } = landmarkCenter(landmark);
  const radius = landmarkRadius(landmark);
  const visualRadius = landmarkVisualRadius(landmark);
  const rotation = landmark.rotation;
  drawShadow(shadow, x, y + visualRadius * 0.2, visualRadius * 1.72, visualRadius * 0.63, 0.52);
  drawGroundRim(ground, x, y + radius * 0.19, radius * 1.21, 0x77644c, 0.66);
  const spine: Point[] = [];
  for (let index = 0; index < 8; index += 1) {
    spine.push(rotatePoint(
      x,
      y,
      (-0.58 + index * 0.15) * visualRadius,
      Math.sin(index * 1.16 + landmark.variation * Math.PI) * radius * 0.15,
      rotation
    ));
  }
  strokePolyline(structure, 0x81775c, 1, Math.max(9, radius * 0.12), spine);
  strokePolyline(accent, 0xe6dbb3, 1, Math.max(5, radius * 0.064), spine);
  spine.forEach((vertebra, index) => {
    structure.fillStyle(0x5a5142, 1);
    structure.fillCircle(vertebra.x, vertebra.y, radius * 0.11);
    accent.fillStyle(0xf4eac5, 0.88);
    accent.fillCircle(vertebra.x - radius * 0.018, vertebra.y - radius * 0.023, radius * 0.06);
    if (index > 1 && index < spine.length - 1) {
      const ribAngle = rotation + Math.PI / 2;
      const ribLength = radius * (0.31 + (index % 2) * 0.055);
      const leftRib = rotatePoint(vertebra.x, vertebra.y, 0, -ribLength, ribAngle);
      const rightRib = rotatePoint(vertebra.x, vertebra.y, 0, ribLength, ribAngle);
      structure.lineStyle(Math.max(4, radius * 0.045), 0x82765f, 1);
      structure.lineBetween(vertebra.x, vertebra.y, leftRib.x, leftRib.y);
      structure.lineBetween(vertebra.x, vertebra.y, rightRib.x, rightRib.y);
      accent.lineStyle(Math.max(2, radius * 0.021), 0xf0e4bc, 0.86);
      accent.lineBetween(vertebra.x, vertebra.y, leftRib.x, leftRib.y);
      accent.lineBetween(vertebra.x, vertebra.y, rightRib.x, rightRib.y);
    }
  });
  const skull = rotatePoint(x, y, visualRadius * 0.67, -radius * 0.04, rotation);
  structure.fillStyle(0x766d59, 1);
  structure.fillEllipse(skull.x, skull.y, radius * 0.58, radius * 0.45);
  accent.fillStyle(0xf0e5be, 1);
  accent.fillEllipse(skull.x - radius * 0.025, skull.y - radius * 0.025, radius * 0.46, radius * 0.34);
  structure.fillStyle(0x242426, 0.9);
  structure.fillCircle(skull.x - radius * 0.1, skull.y - radius * 0.045, radius * 0.065);
  structure.fillCircle(skull.x + radius * 0.1, skull.y - radius * 0.045, radius * 0.065);
  accent.lineStyle(Math.max(1.5, radius * 0.012), 0x82775e, 0.78);
  accent.lineBetween(skull.x - radius * 0.11, skull.y + radius * 0.12, skull.x + radius * 0.12, skull.y + radius * 0.12);
};

const drawAbandonedCampsite = (
  landmark: ProceduralLandmark,
  shadow: Phaser.GameObjects.Graphics,
  ground: Phaser.GameObjects.Graphics,
  structure: Phaser.GameObjects.Graphics,
  accent: Phaser.GameObjects.Graphics
): void => {
  const { x, y } = landmarkCenter(landmark);
  const radius = landmarkRadius(landmark);
  const visualRadius = landmarkVisualRadius(landmark);
  drawShadow(shadow, x, y + radius * 0.28, visualRadius * 1.48, visualRadius * 0.48, 0.42);
  drawGroundRim(ground, x, y + radius * 0.1, radius * 1.1, 0x6f603f, 0.68);
  ground.fillStyle(0x8c7c52, 0.76);
  ground.fillEllipse(x, y, radius * 1.5, radius * 0.72);
  const tentPoints = [
    makePoint(x - visualRadius * 0.45, y + radius * 0.28),
    makePoint(x - visualRadius * 0.08, y - visualRadius * 0.46),
    makePoint(x + visualRadius * 0.3, y + radius * 0.28)
  ];
  fillPolygon(structure, 0x4d493d, 1, tentPoints);
  fillPolygon(structure, 0x75835b, 1, [
    tentPoints[0],
    tentPoints[1],
    makePoint(x - visualRadius * 0.05, y + radius * 0.28)
  ]);
  fillPolygon(structure, 0x465b46, 1, [
    tentPoints[1],
    tentPoints[2],
    makePoint(x - visualRadius * 0.05, y + radius * 0.28)
  ]);
  structure.fillStyle(0x1d2422, 0.94);
  structure.fillTriangle(
    x - visualRadius * 0.11,
    y + radius * 0.24,
    x - visualRadius * 0.02,
    y - radius * 0.1,
    x + visualRadius * 0.09,
    y + radius * 0.24
  );
  structure.lineStyle(Math.max(4, radius * 0.045), 0x4a3020, 1);
  structure.lineBetween(x + visualRadius * 0.31, y + radius * 0.24, x + visualRadius * 0.58, y + radius * 0.38);
  structure.lineBetween(x + visualRadius * 0.34, y + radius * 0.13, x + visualRadius * 0.63, y - radius * 0.02);
  structure.fillStyle(0x453c31, 1);
  structure.fillCircle(x + visualRadius * 0.35, y + radius * 0.04, radius * 0.17);
  accent.fillStyle(0xe77732, 0.88);
  accent.fillCircle(x + visualRadius * 0.35, y - radius * 0.025, radius * 0.08);
  accent.fillStyle(0xffd56d, 0.92);
  accent.fillCircle(x + visualRadius * 0.35, y - radius * 0.055, radius * 0.038);
  accent.lineStyle(Math.max(2, radius * 0.018), 0xc4b477, 0.82);
  accent.lineBetween(x - visualRadius * 0.6, y + radius * 0.26, x - visualRadius * 0.44, y + radius * 0.12);
};

const drawWatchtower = (
  landmark: ProceduralLandmark,
  shadow: Phaser.GameObjects.Graphics,
  ground: Phaser.GameObjects.Graphics,
  structure: Phaser.GameObjects.Graphics,
  accent: Phaser.GameObjects.Graphics
): void => {
  const { x, y } = landmarkCenter(landmark);
  const radius = landmarkRadius(landmark);
  const visualRadius = landmarkVisualRadius(landmark);
  drawShadow(shadow, x, y + visualRadius * 0.38, visualRadius * 1.08, visualRadius * 0.42, 0.48);
  drawGroundRim(ground, x, y + radius * 0.33, radius * 0.95, 0x53533a, 0.72);
  const towerWidth = radius * 0.72;
  const towerHeight = visualRadius * 1.23;
  const topY = y - visualRadius * 0.67;
  const bottomY = y + radius * 0.35;
  structure.lineStyle(Math.max(7, radius * 0.076), 0x37271c, 1);
  structure.lineBetween(x - towerWidth / 2, bottomY, x - towerWidth * 0.34, topY + towerHeight * 0.2);
  structure.lineBetween(x + towerWidth / 2, bottomY, x + towerWidth * 0.34, topY + towerHeight * 0.2);
  structure.lineStyle(Math.max(4, radius * 0.045), 0x805232, 1);
  structure.lineBetween(x - towerWidth / 2, bottomY, x + towerWidth * 0.34, topY + towerHeight * 0.2);
  structure.lineBetween(x + towerWidth / 2, bottomY, x - towerWidth * 0.34, topY + towerHeight * 0.2);
  structure.fillStyle(0x4d3525, 1);
  structure.fillRect(x - towerWidth * 0.65, topY + towerHeight * 0.16, towerWidth * 1.3, radius * 0.31);
  structure.fillStyle(0x9b7044, 1);
  structure.fillRect(x - towerWidth * 0.54, topY + towerHeight * 0.2, towerWidth * 1.08, radius * 0.17);
  const roof = [
    makePoint(x - towerWidth * 0.82, topY + radius * 0.06),
    makePoint(x, topY - radius * 0.4),
    makePoint(x + towerWidth * 0.82, topY + radius * 0.06)
  ];
  fillPolygon(structure, 0x2d3431, 1, roof);
  fillPolygon(accent, 0x627a5c, 0.92, [roof[0], roof[1], makePoint(x, topY + radius * 0.07)]);
  const ladderX = x - towerWidth * 0.08;
  structure.lineStyle(Math.max(2.5, radius * 0.024), 0x4c321f, 1);
  structure.lineBetween(ladderX - radius * 0.09, bottomY, ladderX - radius * 0.09, topY + towerHeight * 0.38);
  structure.lineBetween(ladderX + radius * 0.09, bottomY, ladderX + radius * 0.09, topY + towerHeight * 0.38);
  for (let rung = 0; rung < 5; rung += 1) {
    const rungY = bottomY - rung * towerHeight * 0.12;
    structure.lineBetween(ladderX - radius * 0.09, rungY, ladderX + radius * 0.09, rungY);
  }
  accent.fillStyle(0xf7d787, 0.62);
  accent.fillCircle(x + towerWidth * 0.26, topY + towerHeight * 0.27, radius * 0.045);
};

const drawLandmark = (landmark: ProceduralLandmark, visual: LandmarkVisual): void => {
  switch (landmark.type) {
    case LandmarkType.GiantAncientTree:
      drawAncientTree(landmark, visual.shadow, visual.ground, visual.structure, visual.accent);
      return;
    case LandmarkType.Waterfall:
      drawWaterfall(landmark, visual.shadow, visual.ground, visual.structure, visual.accent);
      return;
    case LandmarkType.CrystalFormation:
      drawCrystalFormation(landmark, visual.shadow, visual.ground, visual.structure, visual.accent);
      return;
    case LandmarkType.LargeLake:
      drawLargeLake(landmark, visual.shadow, visual.ground, visual.structure, visual.accent);
      return;
    case LandmarkType.MeteorCrater:
      drawMeteorCrater(landmark, visual.shadow, visual.ground, visual.structure, visual.accent);
      return;
    case LandmarkType.Volcano:
      drawVolcano(landmark, visual.shadow, visual.ground, visual.structure, visual.accent);
      return;
    case LandmarkType.StoneCircle:
      drawStoneCircle(landmark, visual.shadow, visual.ground, visual.structure, visual.accent);
      return;
    case LandmarkType.GiantSkeleton:
      drawGiantSkeleton(landmark, visual.shadow, visual.ground, visual.structure, visual.accent);
      return;
    case LandmarkType.AbandonedCampsite:
      drawAbandonedCampsite(landmark, visual.shadow, visual.ground, visual.structure, visual.accent);
      return;
    case LandmarkType.Watchtower:
      drawWatchtower(landmark, visual.shadow, visual.ground, visual.structure, visual.accent);
      return;
  }
};

const createVisual = (scene: Phaser.Scene, landmark: ProceduralLandmark): LandmarkVisual => {
  const visual: LandmarkVisual = {
    shadow: scene.add.graphics().setDepth(LANDMARK_SHADOW_DEPTH),
    ground: scene.add.graphics().setDepth(LANDMARK_GROUND_DEPTH),
    structure: scene.add.graphics().setDepth(LANDMARK_STRUCTURE_DEPTH),
    accent: scene.add.graphics().setDepth(LANDMARK_ACCENT_DEPTH)
  };
  drawLandmark(landmark, visual);
  return visual;
};

const destroyVisual = (visual: LandmarkVisual): void => {
  visual.shadow.destroy();
  visual.ground.destroy();
  visual.structure.destroy();
  visual.accent.destroy();
};

export class LandmarkManager {
  private readonly visuals = new Map<string, LandmarkVisual>();
  private activeChunkX = Number.NaN;
  private activeChunkY = Number.NaN;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly seed: string
  ) {}

  get loadedLandmarkCount(): number {
    return this.visuals.size;
  }

  // Query the currently streamed chunk rectangle. landmarksIntersectingTiles expands the query
  // by each landmark's visual radius, so a tall tree or volcano can appear before its center
  // reaches the terrain-chunk load radius.
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
    const nextLandmarkIds = new Set(nextLandmarks.map((landmark) => landmark.id));

    this.visuals.forEach((visual, id) => {
      if (!nextLandmarkIds.has(id)) {
        destroyVisual(visual);
        this.visuals.delete(id);
      }
    });

    nextLandmarks.forEach((landmark) => {
      if (!this.visuals.has(landmark.id)) {
        this.visuals.set(landmark.id, createVisual(this.scene, landmark));
      }
    });
  }

  destroy(): void {
    this.visuals.forEach((visual) => destroyVisual(visual));
    this.visuals.clear();
    this.activeChunkX = Number.NaN;
    this.activeChunkY = Number.NaN;
  }
}

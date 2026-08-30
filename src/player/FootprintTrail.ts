import Phaser from 'phaser';
import { Biome } from '../world/generation/biomeGenerator';
import { surfaceAtTile } from '../world/generation/terrainGenerator';
import { WORLD_TILE_SIZE } from '../world/worldConfig';
import {
  FOOTPRINT_FADE_MS,
  FOOTPRINT_LINGER_MS,
  FOOTPRINT_MAX_VISIBLE,
  FOOTPRINT_REDRAW_INTERVAL_MS,
  FOOTPRINT_SPACING_PIXELS
} from './footprintVisualConfig';

interface FootprintPalette {
  readonly depression: number;
  readonly depressionAlpha: number;
  readonly packed: number;
  readonly packedAlpha: number;
  readonly rim: number;
  readonly rimAlpha: number;
  readonly tread: number;
  readonly treadAlpha: number;
}

interface FootprintMark {
  readonly createdAt: number;
  readonly palette: FootprintPalette;
  readonly outer: Phaser.Geom.Point[];
  readonly inner: Phaser.Geom.Point[];
  readonly heel: Phaser.Geom.Point[];
  readonly tread: readonly [number, number, number, number][];
  readonly grassScuffs: readonly [number, number, number, number][];
  readonly opacity: number;
}

const SURFACE_PALETTES: Readonly<Record<Exclude<Biome, Biome.Ocean>, FootprintPalette>> = {
  [Biome.Beach]: {
    depression: 0x70572f, depressionAlpha: 0.27,
    packed: 0x9a7843, packedAlpha: 0.2,
    rim: 0xf0d993, rimAlpha: 0.2,
    tread: 0x5c4528, treadAlpha: 0.19
  },
  [Biome.Plains]: {
    depression: 0x263b20, depressionAlpha: 0.18,
    packed: 0x4b6035, packedAlpha: 0.13,
    rim: 0x8db878, rimAlpha: 0.1,
    tread: 0x1d2c1b, treadAlpha: 0.14
  },
  [Biome.Forest]: {
    depression: 0x142319, depressionAlpha: 0.24,
    packed: 0x33452b, packedAlpha: 0.18,
    rim: 0x5f7c4f, rimAlpha: 0.11,
    tread: 0x101b12, treadAlpha: 0.2
  },
  [Biome.Desert]: {
    depression: 0x76502b, depressionAlpha: 0.28,
    packed: 0x9c6b36, packedAlpha: 0.2,
    rim: 0xe0ad61, rimAlpha: 0.2,
    tread: 0x5f3d22, treadAlpha: 0.19
  },
  [Biome.Swamp]: {
    depression: 0x101d1a, depressionAlpha: 0.39,
    packed: 0x263b31, packedAlpha: 0.3,
    rim: 0x6b8774, rimAlpha: 0.14,
    tread: 0x09110f, treadAlpha: 0.32
  },
  [Biome.Hills]: {
    depression: 0x40372c, depressionAlpha: 0.21,
    packed: 0x625443, packedAlpha: 0.15,
    rim: 0xa28b6e, rimAlpha: 0.11,
    tread: 0x2c261f, treadAlpha: 0.17
  },
  [Biome.Mountains]: {
    depression: 0x303640, depressionAlpha: 0.19,
    packed: 0x535d69, packedAlpha: 0.12,
    rim: 0x98a3ad, rimAlpha: 0.09,
    tread: 0x242932, treadAlpha: 0.15
  },
  [Biome.Snow]: {
    depression: 0x526b7b, depressionAlpha: 0.36,
    packed: 0x8fa9b8, packedAlpha: 0.29,
    rim: 0xf4fbff, rimAlpha: 0.3,
    tread: 0x405968, treadAlpha: 0.24
  }
};

const CAVE_PALETTE: FootprintPalette = {
  depression: 0x050708, depressionAlpha: 0.42,
  packed: 0x24292b, packedAlpha: 0.28,
  rim: 0x687174, rimAlpha: 0.11,
  tread: 0x020303, treadAlpha: 0.34
};

const OUTER_SHAPE = [
  [-3.2, 8], [-4.8, 4.2], [-4.5, -1.5], [-3.4, -7.4],
  [-1.5, -10], [1.5, -10], [3.4, -7.4], [4.5, -1.5], [4.8, 4.2], [3.2, 8]
] as const;
const INNER_SHAPE = [
  [-2.2, 5.7], [-3.1, 2], [-2.8, -5.4], [-1.1, -7.8],
  [1.1, -7.8], [2.8, -5.4], [3.1, 2], [2.2, 5.7]
] as const;
const HEEL_SHAPE = [[-2.9, 4.1], [-2.5, 8.3], [2.5, 8.3], [2.9, 4.1]] as const;

const variation = (index: number, salt: number): number => {
  const value = Math.sin((index + 1) * 91.731 + salt * 37.119) * 21374.183;
  return value - Math.floor(value);
};

const transformedPoints = (
  shape: readonly (readonly [number, number])[],
  x: number,
  y: number,
  angle: number,
  widthScale: number,
  lengthScale: number
): Phaser.Geom.Point[] => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return shape.map(([localX, localY]) => new Phaser.Geom.Point(
    x + localX * widthScale * cosine - localY * lengthScale * sine,
    y + localX * widthScale * sine + localY * lengthScale * cosine
  ));
};

const transformedLine = (
  x: number,
  y: number,
  angle: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): [number, number, number, number] => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    x + x1 * cosine - y1 * sine,
    y + x1 * sine + y1 * cosine,
    x + x2 * cosine - y2 * sine,
    y + x2 * sine + y2 * cosine
  ];
};

export class FootprintTrail {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly marks: FootprintMark[] = [];
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private distanceSincePrint = 0;
  private printCount = 0;
  private caveMode = false;
  private dirty = false;
  private lastRedrawTime = Number.NEGATIVE_INFINITY;

  constructor(
    scene: Phaser.Scene,
    private readonly seed: string
  ) {
    this.graphics = scene.add.graphics().setDepth(0.82);
  }

  update(time: number, caveMode: boolean): void {
    if (caveMode !== this.caveMode) {
      this.caveMode = caveMode;
      this.clear();
      this.graphics.setDepth(caveMode ? 2.35 : 0.82);
    }
    const maximumAge = FOOTPRINT_LINGER_MS + FOOTPRINT_FADE_MS;
    let removed = false;
    while (this.marks.length > 0 && time - this.marks[0].createdAt >= maximumAge) {
      this.marks.shift();
      removed = true;
    }
    if (removed) {
      this.dirty = true;
    }
    if (this.marks.length > 0 && time - this.lastRedrawTime >= FOOTPRINT_REDRAW_INTERVAL_MS) {
      this.redraw(time);
    } else if (this.dirty) {
      this.redraw(time);
    }
  }

  recordMovement(time: number, worldX: number, worldY: number, leavesPrints: boolean): void {
    if (!leavesPrints || !Number.isFinite(this.lastX) || !Number.isFinite(this.lastY)) {
      this.lastX = worldX;
      this.lastY = worldY;
      if (!leavesPrints) {
        this.distanceSincePrint = 0;
      }
      return;
    }
    const deltaX = worldX - this.lastX;
    const deltaY = worldY - this.lastY;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= 0.01 || distance > WORLD_TILE_SIZE * 2) {
      this.lastX = worldX;
      this.lastY = worldY;
      this.distanceSincePrint = 0;
      return;
    }

    const directionX = deltaX / distance;
    const directionY = deltaY / distance;
    let travelled = 0;
    let remainingUntilPrint = FOOTPRINT_SPACING_PIXELS - this.distanceSincePrint;
    let emitted = 0;
    while (travelled + remainingUntilPrint <= distance && emitted < 3) {
      travelled += remainingUntilPrint;
      this.addPrint(
        time,
        this.lastX + directionX * travelled,
        this.lastY + directionY * travelled,
        directionX,
        directionY
      );
      this.distanceSincePrint = 0;
      remainingUntilPrint = FOOTPRINT_SPACING_PIXELS;
      emitted += 1;
    }
    this.distanceSincePrint += Math.max(0, distance - travelled);
    this.lastX = worldX;
    this.lastY = worldY;
  }

  clear(): void {
    this.marks.length = 0;
    this.lastX = Number.NaN;
    this.lastY = Number.NaN;
    this.distanceSincePrint = 0;
    this.graphics.clear();
    this.dirty = false;
  }

  destroy(): void {
    this.marks.length = 0;
    this.graphics.destroy();
  }

  private addPrint(
    time: number,
    worldX: number,
    worldY: number,
    directionX: number,
    directionY: number
  ): void {
    let palette = CAVE_PALETTE;
    if (!this.caveMode) {
      const surface = surfaceAtTile(this.seed, worldX / WORLD_TILE_SIZE, worldY / WORLD_TILE_SIZE);
      if (surface.isWater || surface.biome === Biome.Ocean) {
        return;
      }
      palette = SURFACE_PALETTES[surface.biome];
    }

    const index = this.printCount;
    this.printCount += 1;
    const leftFoot = index % 2 === 0;
    const side = leftFoot ? -1 : 1;
    const sideX = -directionY;
    const sideY = directionX;
    const x = worldX - directionX * 8 + sideX * side * 5.2;
    const y = worldY + 9 - directionY * 8 + sideY * side * 5.2;
    const angle = Math.atan2(directionY, directionX) + Math.PI / 2
      + side * (0.075 + variation(index, 2) * 0.045);
    const widthScale = 0.9 + variation(index, 3) * 0.14;
    const lengthScale = 0.92 + variation(index, 5) * 0.13;
    const tread = [-4.2, 0.2, 4.1].map((localY) => transformedLine(
      x, y, angle,
      -2.65 * widthScale, localY * lengthScale,
      2.65 * widthScale, (localY - 0.7) * lengthScale
    ));
    const grassScuffs = (this.caveMode ? [] : [-1, 1]).map((scuffSide, scuffIndex) => transformedLine(
      x, y, angle,
      scuffSide * (4.2 + variation(index, 11 + scuffIndex) * 1.5), 3,
      scuffSide * (5.2 + variation(index, 17 + scuffIndex) * 1.8), -3.5
    ));
    this.marks.push({
      createdAt: time,
      palette,
      outer: transformedPoints(OUTER_SHAPE, x, y, angle, widthScale, lengthScale),
      inner: transformedPoints(INNER_SHAPE, x, y, angle, widthScale, lengthScale),
      heel: transformedPoints(HEEL_SHAPE, x, y, angle, widthScale, lengthScale),
      tread,
      grassScuffs,
      opacity: 0.88 + variation(index, 23) * 0.12
    });
    if (this.marks.length > FOOTPRINT_MAX_VISIBLE) {
      this.marks.shift();
    }
    this.dirty = true;
  }

  private redraw(time: number): void {
    this.lastRedrawTime = time;
    this.dirty = false;
    this.graphics.clear();
    this.marks.forEach((mark) => {
      const fadeProgress = Math.max(0, Math.min(1, (time - mark.createdAt - FOOTPRINT_LINGER_MS) / FOOTPRINT_FADE_MS));
      const opacity = mark.opacity * (1 - fadeProgress * fadeProgress * (3 - 2 * fadeProgress));
      const palette = mark.palette;
      this.graphics.fillStyle(palette.rim, palette.rimAlpha * opacity);
      this.graphics.fillPoints(mark.outer, true);
      this.graphics.fillStyle(palette.depression, palette.depressionAlpha * opacity);
      this.graphics.fillPoints(mark.inner, true);
      this.graphics.fillStyle(palette.packed, palette.packedAlpha * opacity);
      this.graphics.fillPoints(mark.heel, true);
      this.graphics.lineStyle(0.85, palette.tread, palette.treadAlpha * opacity);
      mark.tread.forEach(([x1, y1, x2, y2]) => this.graphics.lineBetween(x1, y1, x2, y2));
      this.graphics.lineStyle(0.65, palette.rim, palette.rimAlpha * opacity * 0.72);
      mark.grassScuffs.forEach(([x1, y1, x2, y2]) => this.graphics.lineBetween(x1, y1, x2, y2));
    });
  }
}

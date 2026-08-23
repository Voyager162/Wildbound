import Phaser from 'phaser';
import {
  PLACEABLE_DEFINITIONS,
  PlaceableId,
  FURNACE_LIGHT_CLARITY,
  FURNACE_LIGHT_COLOR,
  FURNACE_LIGHT_RADIUS_PIXELS,
  FURNACE_LIGHT_WARMTH,
  TRAIL_LANTERN_LIGHT_OFFSET_X,
  TRAIL_LANTERN_LIGHT_OFFSET_Y
} from '../crafting/placeableConfig';
import type { NightAmbientLight } from './AmbientParticleManager';
import { type PlacedObject, SessionWorldState } from './SessionWorldState';
import { CHUNK_SIZE_PIXELS, WORLD_TILE_SIZE } from './worldConfig';

const INTERACTION_RADIUS = 86;
const INTERACTION_RADIUS_SQUARED = INTERACTION_RADIUS * INTERACTION_RADIUS;
const RENDER_RADIUS = 1780;
const FURNACE_FLAME_FRAME_MS = 75;

// This is the precise bright flame point within drawTrailLantern, measured from the placed
// object's visual center. Rendering and projected light both use it; never duplicate these
// offsets at a call site.
export const TRAIL_LANTERN_FLAME_OFFSET = { x: -1.5, y: -12 } as const;

export const trailLanternFlamePosition = (centerX: number, centerY: number): readonly [number, number] => [
  centerX + TRAIL_LANTERN_FLAME_OFFSET.x,
  centerY + TRAIL_LANTERN_FLAME_OFFSET.y
];

const objectCenter = (object: Pick<PlacedObject, 'placeable' | 'tileX' | 'tileY'>): readonly [number, number] => {
  const [width, height] = PLACEABLE_DEFINITIONS[object.placeable].footprint;
  return [(object.tileX + width / 2) * WORLD_TILE_SIZE, (object.tileY + height / 2) * WORLD_TILE_SIZE];
};

export class PlaceableManager {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly furnaceFlameGraphics: Phaser.GameObjects.Graphics;
  private lastWindowX = Number.NaN;
  private lastWindowY = Number.NaN;
  private lastFurnaceFlameFrame = Number.NEGATIVE_INFINITY;
  private hasVisualChanges = true;
  private hasFurnaceFlames = false;
  private visibleObjects: PlacedObject[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly session: SessionWorldState) {
    this.graphics = scene.add.graphics().setDepth(7);
    // The stone bodies are baked only when the nearby-object window changes. The small flame
    // layer is independent and capped at 13 FPS, which keeps refining readable without adding
    // meaningful per-frame rendering work.
    this.furnaceFlameGraphics = scene.add.graphics().setDepth(7.15);
  }

  refresh(playerWorldX: number, playerWorldY: number): void {
    this.hasVisualChanges = true;
    this.update(playerWorldX, playerWorldY);
  }

  update(playerWorldX: number, playerWorldY: number): void {
    const windowX = Math.floor(playerWorldX / 640);
    const windowY = Math.floor(playerWorldY / 640);
    if (this.hasVisualChanges || windowX !== this.lastWindowX || windowY !== this.lastWindowY) {
      this.lastWindowX = windowX;
      this.lastWindowY = windowY;
      this.hasVisualChanges = false;
      const radiusSquared = RENDER_RADIUS * RENDER_RADIUS;
      this.visibleObjects = this.session.getPlacedObjects().filter((object) => {
        const [x, y] = objectCenter(object);
        return (x - playerWorldX) ** 2 + (y - playerWorldY) ** 2 <= radiusSquared;
      });
      this.graphics.clear();
      this.visibleObjects.forEach((object) => this.drawObject(object));
    }
    this.updateFurnaceFlames(this.scene.time.now);
  }

  place(placeable: PlaceableId, tileX: number, tileY: number, playerWorldX: number, playerWorldY: number): PlacedObject | null {
    if (!this.canPlace(placeable, tileX, tileY)) {
      return null;
    }
    const object = this.session.placeObject(placeable, tileX, tileY);
    if (object) {
      this.refresh(playerWorldX, playerWorldY);
    }
    return object;
  }

  remove(objectId: string, playerWorldX: number, playerWorldY: number): PlacedObject | null {
    const removed = this.session.removeObject(objectId);
    if (removed) {
      this.refresh(playerWorldX, playerWorldY);
    }
    return removed;
  }

  canPlace(placeable: PlaceableId, tileX: number, tileY: number): boolean {
    if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) {
      return false;
    }
    const [width, height] = PLACEABLE_DEFINITIONS[placeable].footprint;
    return this.session.getPlacedObjects().every((object) => {
      const [otherWidth, otherHeight] = PLACEABLE_DEFINITIONS[object.placeable].footprint;
      return tileX + width <= object.tileX
        || object.tileX + otherWidth <= tileX
        || tileY + height <= object.tileY
        || object.tileY + otherHeight <= tileY;
    });
  }

  nearest(playerWorldX: number, playerWorldY: number): PlacedObject | null {
    let nearest: PlacedObject | null = null;
    let nearestDistance = Infinity;
    this.session.getPlacedObjects().forEach((object) => {
      const [x, y] = objectCenter(object);
      const distance = (x - playerWorldX) ** 2 + (y - playerWorldY) ** 2;
      if (distance <= INTERACTION_RADIUS_SQUARED && distance < nearestDistance) {
        nearest = object;
        nearestDistance = distance;
      }
    });
    return nearest;
  }

  getNightLights(): readonly NightAmbientLight[] {
    return this.visibleObjects.flatMap((object) => {
      const definition = PLACEABLE_DEFINITIONS[object.placeable];
      const [worldX, worldY] = objectCenter(object);
      if (object.placeable === PlaceableId.Furnace && this.session.furnaceIsRefining(object.id)) {
        return [{
          worldX: worldX - TRAIL_LANTERN_LIGHT_OFFSET_X,
          worldY: worldY + 7 - TRAIL_LANTERN_LIGHT_OFFSET_Y,
          radius: FURNACE_LIGHT_RADIUS_PIXELS,
          // Furnace light is a fixed world source, so keep its authored radius rather than
          // inheriting the larger atmospheric-particle multiplier.
          radiusMultiplier: 1,
          color: FURNACE_LIGHT_COLOR,
          intensity: 0.48,
          warmth: FURNACE_LIGHT_WARMTH,
          clarity: FURNACE_LIGHT_CLARITY,
          alwaysOn: true
        }];
      }
      if (definition.interaction !== 'light' && definition.interaction !== 'rest') {
        return [];
      }
      if (definition.light) {
        const [flameX, flameY] = trailLanternFlamePosition(worldX, worldY);
        return [{
          worldX: flameX - TRAIL_LANTERN_LIGHT_OFFSET_X,
          worldY: flameY - TRAIL_LANTERN_LIGHT_OFFSET_Y,
          radius: definition.light.radiusChunks * CHUNK_SIZE_PIXELS,
          // The lantern radius is configured in actual chunks, rather than being inflated by
          // the generic small-particle glow multiplier.
          radiusMultiplier: 1,
          color: definition.light.color,
          intensity: definition.light.intensity,
          warmth: definition.light.warmth,
          clarity: definition.light.clarity,
          alwaysOn: definition.light.alwaysOn
        }];
      }
      return [{
        worldX,
        worldY: worldY - 11,
        radius: definition.interaction === 'rest' ? 205 : 155,
        color: definition.interaction === 'rest' ? 0xffa64d : 0xffd873,
        intensity: definition.interaction === 'rest' ? 0.95 : 0.78
      }];
    });
  }

  destroy(): void {
    this.graphics.destroy();
    this.furnaceFlameGraphics.destroy();
    this.visibleObjects = [];
  }

  private updateFurnaceFlames(time: number): void {
    const activeFurnaces = this.visibleObjects.filter((object) => (
      object.placeable === PlaceableId.Furnace && this.session.furnaceIsRefining(object.id)
    ));
    if (activeFurnaces.length === 0) {
      if (this.hasFurnaceFlames) {
        this.furnaceFlameGraphics.clear();
        this.hasFurnaceFlames = false;
      }
      return;
    }
    if (time - this.lastFurnaceFlameFrame < FURNACE_FLAME_FRAME_MS) {
      return;
    }
    this.lastFurnaceFlameFrame = time;
    this.hasFurnaceFlames = true;
    const graphics = this.furnaceFlameGraphics;
    graphics.clear();
    activeFurnaces.forEach((furnace) => {
      const [x, y] = objectCenter(furnace);
      const phase = time / 165 + furnace.tileX * 1.73 + furnace.tileY * 2.41;
      const sway = Math.sin(phase) * 1.7;
      const height = 9 + Math.sin(phase * 1.37) * 2.1;
      // A low orange bloom first makes the flame read as light inside the stone throat, while
      // the three irregular tongues keep it from looking like a static icon.
      graphics.fillStyle(0xff7b38, 0.16);
      graphics.fillEllipse(x, y + 7, 21, 14);
      graphics.fillStyle(0xe84822, 0.96);
      graphics.fillTriangle(x - 6, y + 10, x + sway - 2, y + 10 - height, x + 6, y + 10);
      graphics.fillStyle(0xffad46, 0.95);
      graphics.fillTriangle(x - 3.8, y + 10, x + sway * 0.65, y + 8 - height * 0.64, x + 4.6, y + 10);
      graphics.fillStyle(0xffed9d, 0.9);
      graphics.fillTriangle(x - 1.6, y + 9, x + sway * 0.35, y + 8 - height * 0.34, x + 2.4, y + 9);
    });
  }

  private drawObject(object: PlacedObject): void {
    const definition = PLACEABLE_DEFINITIONS[object.placeable];
    const [centerX, centerY] = objectCenter(object);
    const width = definition.footprint[0] * WORLD_TILE_SIZE;
    const height = definition.footprint[1] * WORLD_TILE_SIZE;
    const g = this.graphics;
    g.fillStyle(0x081310, 0.32);
    g.fillEllipse(centerX, centerY + height * 0.28, width * 0.84, Math.max(12, height * 0.26));

    switch (object.placeable) {
      case PlaceableId.TrailLantern:
        this.drawTrailLantern(centerX, centerY);
        return;
      case PlaceableId.Waypoint:
        this.drawWaypoint(centerX, centerY);
        return;
      case PlaceableId.Workbench:
        this.drawWorkbench(centerX, centerY);
        return;
      case PlaceableId.Furnace:
        this.drawFurnace(centerX, centerY);
        return;
      case PlaceableId.UpgradeTable:
        this.drawUpgradeTable(centerX, centerY);
        return;
      case PlaceableId.BrewingStation:
        this.drawBrewingStation(centerX, centerY);
        return;
      case PlaceableId.Anvil:
        this.drawAnvil(centerX, centerY);
        return;
      case PlaceableId.SmallChest:
        this.drawChest(centerX, centerY, false, false);
        return;
      case PlaceableId.ReinforcedChest:
        this.drawChest(centerX, centerY, true, false);
        return;
      case PlaceableId.DiamondVault:
        this.drawChest(centerX, centerY, true, true);
        return;
      case PlaceableId.Campfire:
        this.drawCampfire(centerX, centerY);
        return;
      case PlaceableId.WoodenShelter:
        this.drawShelter(centerX, centerY, false);
        return;
      case PlaceableId.StoneShelter:
        this.drawShelter(centerX, centerY, true);
        return;
    }
  }

  private drawTrailLantern(x: number, y: number): void {
    const g = this.graphics;
    const [flameX, flameY] = trailLanternFlamePosition(x, y);
    g.fillStyle(0x352218, 1);
    g.fillRoundedRect(x - 3, y - 14, 6, 27, 2);
    g.lineStyle(1.2, 0xd49a50, 0.92);
    g.lineBetween(x - 1, y - 13, x - 1, y + 12);
    g.fillStyle(0x182a2d, 1);
    g.fillRoundedRect(x - 9, y - 19, 18, 15, 4);
    g.fillStyle(0xffc861, 0.95);
    g.fillRoundedRect(x - 5.5, y - 15.5, 11, 8, 2);
    g.fillStyle(0xfff0ae, 0.86);
    g.fillCircle(flameX, flameY, 2.5);
    g.lineStyle(2, 0x697d78, 1);
    g.strokeRoundedRect(x - 9, y - 19, 18, 15, 4);
    g.lineBetween(x - 4, y - 21, x + 4, y - 21);
  }

  private drawWaypoint(x: number, y: number): void {
    const g = this.graphics;
    // A compact blue trail marker: a planted stake and pennant read clearly at distance without
    // pretending to be a survey device. The world map carries the adjustable name.
    g.fillStyle(0x27383f, 1);
    g.fillTriangle(x - 11, y + 13, x, y + 6, x + 11, y + 13);
    g.fillStyle(0x657b7d, 1);
    g.fillTriangle(x - 7, y + 10, x, y + 6, x + 7, y + 10);
    g.lineStyle(3.2, 0x2d4950, 1);
    g.lineBetween(x, y + 7, x, y - 18);
    g.lineStyle(1.1, 0xa4dff2, 0.8);
    g.lineBetween(x + 1.25, y + 6, x + 1.25, y - 17);
    g.fillStyle(0x338fc5, 1);
    g.fillTriangle(x + 1, y - 18, x + 12, y - 14, x + 1, y - 7);
    g.lineStyle(1.2, 0xc4efff, 0.9);
    g.strokeTriangle(x + 1, y - 18, x + 12, y - 14, x + 1, y - 7);
    g.fillStyle(0x7edbff, 0.9);
    g.fillCircle(x, y - 20, 2.4);
  }

  private drawWorkbench(x: number, y: number): void {
    const g = this.graphics;
    g.fillStyle(0x5a321f, 1);
    g.fillRoundedRect(x - 26, y - 6, 52, 11, 3);
    g.fillStyle(0xb47944, 1);
    g.fillRoundedRect(x - 24, y - 10, 48, 9, 2);
    g.lineStyle(1.4, 0xe0ad69, 0.76);
    [-15, -2, 12].forEach((offset) => g.lineBetween(x + offset, y - 9, x + offset + 4, y - 2));
    g.fillStyle(0x51301f, 1);
    g.fillRect(x - 20, y + 3, 7, 20);
    g.fillRect(x + 13, y + 3, 7, 20);
    g.fillStyle(0xd6a25b, 0.72);
    g.fillRect(x - 19, y + 4, 2, 17);
    g.fillRect(x + 14, y + 4, 2, 17);
    g.fillStyle(0x657077, 1);
    g.fillCircle(x + 8, y - 15, 4);
    g.lineStyle(2, 0xaab8b8, 0.85);
    g.lineBetween(x + 8, y - 11, x + 15, y - 4);
  }

  private drawFurnace(x: number, y: number): void {
    const g = this.graphics;
    g.fillStyle(0x293337, 1);
    g.fillRoundedRect(x - 15, y - 17, 30, 34, 5);
    g.fillStyle(0x697778, 1);
    g.fillRoundedRect(x - 13, y - 15, 26, 28, 4);
    g.lineStyle(2, 0x374348, 1);
    g.lineBetween(x - 12, y - 5, x + 12, y - 5);
    g.lineBetween(x - 4, y - 15, x - 4, y - 6);
    g.lineBetween(x + 7, y - 5, x + 7, y + 13);
    g.fillStyle(0x152022, 1);
    g.fillRoundedRect(x - 9, y + 1, 18, 11, 4);
    // The moving flame is painted on its own throttled layer only while this furnace is
    // refining. These dim coals keep an idle furnace readable without falsely appearing lit.
    g.fillStyle(0x4e2c24, 0.75);
    g.fillEllipse(x, y + 9, 12, 4);
  }

  private drawUpgradeTable(x: number, y: number): void {
    const g = this.graphics;
    g.fillStyle(0x473122, 1);
    g.fillRoundedRect(x - 23, y - 3, 46, 12, 3);
    g.fillStyle(0x91613b, 1);
    g.fillRoundedRect(x - 21, y - 9, 42, 9, 2);
    g.fillStyle(0x3b2922, 1);
    g.fillRect(x - 17, y + 7, 6, 16);
    g.fillRect(x + 11, y + 7, 6, 16);
    g.fillStyle(0x6ccfd6, 1);
    g.fillTriangle(x, y - 22, x + 8, y - 12, x, y - 4);
    g.fillTriangle(x, y - 22, x - 8, y - 12, x, y - 4);
    g.lineStyle(1.5, 0xedffff, 0.88);
    g.strokeTriangle(x, y - 22, x + 8, y - 12, x, y - 4);
    g.strokeTriangle(x, y - 22, x - 8, y - 12, x, y - 4);
  }

  private drawBrewingStation(x: number, y: number): void {
    const g = this.graphics;
    g.fillStyle(0x4b3323, 1);
    g.fillRoundedRect(x - 21, y + 6, 42, 9, 3);
    g.fillStyle(0x805238, 1);
    g.fillRect(x - 19, y + 4, 38, 5);
    g.lineStyle(3, 0x39474b, 1);
    g.lineBetween(x, y + 4, x, y - 18);
    g.lineBetween(x - 14, y + 5, x - 10, y - 10);
    g.lineBetween(x + 14, y + 5, x + 10, y - 10);
    [-11, 0, 11].forEach((offset, index) => {
      g.fillStyle(index === 1 ? 0x79cbd4 : 0xb481d2, 0.94);
      g.fillRoundedRect(x + offset - 4, y - 8, 8, 14, 3);
      g.fillStyle(0xd6ffff, 0.65);
      g.fillRect(x + offset - 2, y - 6, 2, 7);
    });
  }

  private drawAnvil(x: number, y: number): void {
    const g = this.graphics;
    g.fillStyle(0x303a3f, 1);
    g.fillTriangle(x - 18, y - 7, x + 17, y - 7, x + 7, y + 1);
    g.fillRoundedRect(x - 8, y - 7, 16, 17, 3);
    g.fillTriangle(x - 11, y + 11, x + 11, y + 11, x + 15, y + 19);
    g.fillStyle(0x8b999c, 1);
    g.fillTriangle(x - 15, y - 9, x + 15, y - 9, x + 5, y - 4);
    g.fillStyle(0x242c30, 1);
    g.fillRoundedRect(x - 6, y + 9, 12, 9, 2);
  }

  private drawChest(x: number, y: number, reinforced: boolean, vault: boolean): void {
    const g = this.graphics;
    const width = vault ? 42 : 28;
    const height = vault ? 31 : 22;
    const edge = vault ? 0x256879 : reinforced ? 0x667777 : 0x613d24;
    const body = vault ? 0x4aafbd : reinforced ? 0x6a7f7f : 0xa56839;
    g.fillStyle(edge, 1);
    g.fillRoundedRect(x - width / 2, y - height / 2, width, height, 5);
    g.fillStyle(body, 1);
    g.fillRoundedRect(x - width / 2 + 3, y - height / 2 + 3, width - 6, height - 6, 3);
    g.fillStyle(0x2c241b, 1);
    g.fillRect(x - width / 2 + 2, y - 1, width - 4, 3);
    if (reinforced) {
      g.lineStyle(2, vault ? 0xd6ffff : 0xb8c5be, 0.92);
      g.lineBetween(x - width / 2 + 7, y - height / 2 + 3, x - width / 2 + 7, y + height / 2 - 3);
      g.lineBetween(x + width / 2 - 7, y - height / 2 + 3, x + width / 2 - 7, y + height / 2 - 3);
    }
    g.fillStyle(vault ? 0xe8ffff : 0xf0c95a, 1);
    g.fillRoundedRect(x - 4, y - 1, 8, 8, 2);
  }

  private drawCampfire(x: number, y: number): void {
    const g = this.graphics;
    g.fillStyle(0x7a817c, 1);
    [-10, 0, 10].forEach((offset) => g.fillCircle(x + offset, y + 9, 7));
    g.lineStyle(5, 0x643920, 1);
    g.lineBetween(x - 12, y + 7, x + 12, y - 2);
    g.lineBetween(x - 12, y - 2, x + 12, y + 7);
    g.fillStyle(0xef7135, 1);
    g.fillTriangle(x, y - 18, x - 8, y + 7, x + 7, y + 7);
    g.fillStyle(0xffd45f, 1);
    g.fillTriangle(x, y - 12, x - 4, y + 6, x + 4, y + 6);
    g.fillStyle(0xffffba, 1);
    g.fillTriangle(x - 1, y - 7, x - 2, y + 4, x + 3, y + 4);
  }

  private drawShelter(x: number, y: number, stone: boolean): void {
    const g = this.graphics;
    const roof = stone ? 0x586b70 : 0x7d4b30;
    const roofEdge = stone ? 0x334247 : 0x4e2d20;
    const wall = stone ? 0x77898a : 0xa66b42;
    g.fillStyle(0x18201e, 0.58);
    g.fillRoundedRect(x - 26, y - 4, 52, 30, 5);
    g.fillStyle(wall, 1);
    g.fillRoundedRect(x - 22, y - 11, 44, 32, 4);
    g.fillStyle(roofEdge, 1);
    g.fillTriangle(x - 30, y - 10, x, y - 34, x + 30, y - 10);
    g.fillStyle(roof, 1);
    g.fillTriangle(x - 26, y - 11, x, y - 30, x + 26, y - 11);
    g.fillStyle(0x2b211b, 1);
    g.fillRoundedRect(x - 7, y + 2, 14, 19, 3);
    g.fillStyle(stone ? 0xc7d8d6 : 0xe6bd82, 0.74);
    g.fillRect(x - 3, y + 5, 2, 12);
    if (stone) {
      g.lineStyle(1.3, 0x46565a, 0.88);
      g.lineBetween(x - 20, y - 1, x + 20, y - 1);
      g.lineBetween(x - 12, y + 8, x + 18, y + 8);
      g.lineBetween(x - 12, y - 10, x - 12, y - 1);
      g.lineBetween(x + 10, y - 1, x + 10, y + 8);
    } else {
      g.lineStyle(1.2, 0x5a3524, 0.9);
      [-14, -4, 8, 17].forEach((offset) => g.lineBetween(x + offset, y - 8, x + offset, y + 17));
    }
  }
}

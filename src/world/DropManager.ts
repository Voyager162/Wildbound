import Phaser from 'phaser';
import { PLACEABLE_DEFINITIONS, PlaceableId, isPlaceableId } from '../crafting/placeableConfig';
import { POTION_DEFINITIONS, isPotionId, type PotionId } from '../crafting/potionConfig';
import { TOOL_DEFINITIONS, TOOL_HEAD_PALETTES, isToolId, type ToolId } from '../crafting/toolConfig';
import { RESOURCE_COLORS, ResourceType } from './resources';
import { SessionWorldState } from './SessionWorldState';
import type { DroppedItem } from './SessionWorldState';

export const PICKUP_RADIUS_PIXELS = 48;
const PICKUP_RADIUS_SQUARED = PICKUP_RADIUS_PIXELS * PICKUP_RADIUS_PIXELS;
// Rendering scale only: the drop's pickup range and deterministic saved position stay unchanged.
const DROP_VISUAL_SCALE = 1.6;
const TWO_PI = Math.PI * 2;

export class DropManager {
  private readonly dropGraphics = new Map<string, Phaser.GameObjects.Graphics>();

  constructor(private readonly scene: Phaser.Scene, private readonly sessionState: SessionWorldState) {
    this.sessionState.getDrops().forEach((drop) => this.renderDrop(drop));
  }

  add(drop: DroppedItem): void {
    this.renderDrop(drop);
  }

  findNearest(worldX: number, worldY: number): DroppedItem | null {
    let nearestDrop: DroppedItem | null = null;
    let nearestDistanceSquared = Infinity;

    for (const drop of this.sessionState.getDrops()) {
      const distanceX = drop.worldX - worldX;
      const distanceY = drop.worldY - worldY;
      const distanceSquared = distanceX * distanceX + distanceY * distanceY;

      if (distanceSquared <= PICKUP_RADIUS_SQUARED && distanceSquared < nearestDistanceSquared) {
        nearestDrop = drop;
        nearestDistanceSquared = distanceSquared;
      }
    }

    return nearestDrop;
  }

  collect(id: string): DroppedItem | null {
    const drop = this.sessionState.removeDrop(id);
    if (!drop) {
      return null;
    }

    this.dropGraphics.get(drop.id)?.destroy();
    this.dropGraphics.delete(drop.id);
    return drop;
  }

  destroy(): void {
    this.dropGraphics.forEach((graphics) => graphics.destroy());
    this.dropGraphics.clear();
  }

  private renderDrop(drop: DroppedItem): void {
    const graphics = this.scene.add.graphics().setDepth(9);
    const scale = DROP_VISUAL_SCALE;
    const x = drop.worldX;
    const y = drop.worldY;
    graphics.fillStyle(0x0d1b1a, 0.35);
    graphics.fillEllipse(x, y + 8 * scale, 18 * scale, 7 * scale);
    if (isToolId(drop.item)) {
      this.drawToolDrop(graphics, x, y, scale, drop.item);
    } else if (isPlaceableId(drop.item)) {
      this.drawPlaceableDrop(graphics, x, y, scale, drop.item);
    } else if (isPotionId(drop.item)) {
      this.drawPotionDrop(graphics, x, y, scale, drop.item);
    } else {
      graphics.fillStyle(RESOURCE_COLORS[drop.item], 1);

      switch (drop.item) {
      case ResourceType.Wood:
        graphics.fillRoundedRect(x - 8 * scale, y - 4 * scale, 16 * scale, 8 * scale, 3 * scale);
        graphics.lineStyle(1.2 * scale, 0xf1c58b, 0.85);
        graphics.strokeCircle(x - 5 * scale, y, 2 * scale);
        break;
      case ResourceType.Stone:
        graphics.fillTriangle(x - 7 * scale, y + 5 * scale, x - 2 * scale, y - 7 * scale, x + 8 * scale, y + 5 * scale);
        break;
      case ResourceType.Fiber:
        graphics.lineStyle(2 * scale, RESOURCE_COLORS[drop.item], 1);
        graphics.lineBetween(x - 5 * scale, y + 6 * scale, x - 2 * scale, y - 7 * scale);
        graphics.lineBetween(x, y + 6 * scale, x + scale, y - 8 * scale);
        graphics.lineBetween(x + 5 * scale, y + 6 * scale, x + 4 * scale, y - 6 * scale);
        break;
      case ResourceType.Cactus:
        graphics.fillRoundedRect(x - 4 * scale, y - 8 * scale, 8 * scale, 16 * scale, 3 * scale);
        graphics.fillRect(x - 8 * scale, y - scale, 4 * scale, 5 * scale);
        graphics.fillRect(x + 4 * scale, y - 4 * scale, 4 * scale, 5 * scale);
        break;
      case ResourceType.Coal:
        graphics.fillCircle(x - 4 * scale, y + 2 * scale, 4.5 * scale);
        graphics.fillCircle(x + 3 * scale, y, 5.5 * scale);
        graphics.fillStyle(0x9ba8ad, 0.72);
        graphics.fillCircle(x + scale, y - 2 * scale, 1.4 * scale);
        break;
      case ResourceType.Iron:
        graphics.fillTriangle(x - 8 * scale, y + 5 * scale, x - 3 * scale, y - 7 * scale, x + 8 * scale, y + 4 * scale);
        graphics.fillStyle(0xf0b182, 0.8);
        graphics.fillCircle(x - scale, y, 2 * scale);
        break;
      case ResourceType.Gold:
        graphics.fillTriangle(x - 8 * scale, y + 4 * scale, x - 2 * scale, y - 8 * scale, x + 8 * scale, y + 3 * scale);
        graphics.fillStyle(0xffef9d, 0.9);
        graphics.fillCircle(x - scale, y - 2 * scale, 1.8 * scale);
        break;
      case ResourceType.IronIngot:
      case ResourceType.GoldIngot:
        graphics.fillRoundedRect(x - 8 * scale, y - 5 * scale, 16 * scale, 10 * scale, 2 * scale);
        graphics.fillStyle(drop.item === ResourceType.IronIngot ? 0xffdfcb : 0xfff1a2, 0.75);
        graphics.fillRect(x - 5 * scale, y - 3 * scale, 10 * scale, 2 * scale);
        break;
      case ResourceType.Diamond:
        graphics.fillTriangle(x, y - 9 * scale, x - 7 * scale, y, x, y + 8 * scale);
        graphics.fillTriangle(x, y - 9 * scale, x + 7 * scale, y, x, y + 8 * scale);
        graphics.lineStyle(1.15 * scale, 0xe8ffff, 0.92);
        graphics.lineBetween(x - 7 * scale, y, x + 7 * scale, y);
        break;
      case ResourceType.AncientWood:
      case ResourceType.AmberSap:
      case ResourceType.GlowSpores:
      case ResourceType.VineFiber:
      case ResourceType.Heartwood:
      case ResourceType.DampCrystal:
      case ResourceType.MossFiber:
      case ResourceType.SpringStone:
      case ResourceType.LuminousMushrooms:
      case ResourceType.MapFragments:
      case ResourceType.MechanicalParts:
      case ResourceType.LensGlass:
      case ResourceType.Starstone:
      case ResourceType.MeteorIron:
      case ResourceType.GlowingFragments:
      case ResourceType.RuneStone:
      case ResourceType.AncientFragments:
      case ResourceType.RelicMaterials:
      case ResourceType.BoneFragments:
      case ResourceType.FossilResin:
      case ResourceType.AncientRemains:
        this.drawRareResourceDrop(graphics, x, y, scale, drop.item);
        break;
      }
    }

    graphics.lineStyle(1.2 * scale, 0xffffff, 0.7);
    graphics.strokeCircle(x, y, 10 * scale);
    this.dropGraphics.set(drop.id, graphics);
  }

  private drawRareResourceDrop(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    resource: ResourceType
  ): void {
    const color = RESOURCE_COLORS[resource];
    switch (resource) {
      case ResourceType.AncientWood:
      case ResourceType.Heartwood: {
        const heartwood = resource === ResourceType.Heartwood;
        graphics.fillStyle(heartwood ? 0x492319 : 0x35271c, 1);
        graphics.fillRoundedRect(x - 9 * scale, y - 5 * scale, 18 * scale, 10 * scale, 4 * scale);
        graphics.fillStyle(color, 1);
        graphics.fillRoundedRect(x - 7.5 * scale, y - 3.8 * scale, 15 * scale, 7.6 * scale, 3 * scale);
        graphics.lineStyle(1.1 * scale, heartwood ? 0xffa36b : 0xc89a58, 0.86);
        graphics.strokeCircle(x - 4.7 * scale, y, 2.2 * scale);
        graphics.lineBetween(x - scale, y - 2.2 * scale, x + 6 * scale, y - 2.2 * scale);
        graphics.lineBetween(x, y + 1.6 * scale, x + 5 * scale, y + 1.6 * scale);
        break;
      }
      case ResourceType.AmberSap:
      case ResourceType.FossilResin: {
        const sap = resource === ResourceType.AmberSap;
        graphics.fillStyle(sap ? 0x7d4216 : 0x68401d, 0.95);
        graphics.fillCircle(x, y + 2 * scale, 7.4 * scale);
        graphics.fillTriangle(x, y - 10 * scale, x - 5.5 * scale, y + 1.5 * scale, x + 5.5 * scale, y + 1.5 * scale);
        graphics.fillStyle(color, 1);
        graphics.fillCircle(x, y + 1.5 * scale, 5.7 * scale);
        graphics.fillTriangle(x, y - 8 * scale, x - 4.1 * scale, y + 1.5 * scale, x + 4.1 * scale, y + 1.5 * scale);
        graphics.fillStyle(0xfff0a3, 0.78);
        graphics.fillEllipse(x - 2 * scale, y - 1.8 * scale, 2.2 * scale, 4.5 * scale);
        break;
      }
      case ResourceType.GlowSpores: {
        graphics.fillStyle(0x29472e, 0.95);
        graphics.fillEllipse(x, y + 4 * scale, 16 * scale, 7 * scale);
        graphics.fillStyle(color, 0.3);
        graphics.fillCircle(x, y, 10 * scale);
        graphics.fillStyle(color, 1);
        graphics.fillCircle(x - 5 * scale, y + scale, 2.3 * scale);
        graphics.fillCircle(x, y - 4 * scale, 2.7 * scale);
        graphics.fillCircle(x + 5 * scale, y, 2 * scale);
        graphics.fillStyle(0xf2ffd4, 0.95);
        graphics.fillCircle(x - 4.5 * scale, y + 0.5 * scale, 0.7 * scale);
        graphics.fillCircle(x + 0.5 * scale, y - 4.5 * scale, 0.8 * scale);
        break;
      }
      case ResourceType.VineFiber:
      case ResourceType.MossFiber: {
        const moss = resource === ResourceType.MossFiber;
        graphics.lineStyle(3.7 * scale, 0x223c29, 1);
        for (let strand = -2; strand <= 2; strand += 1) {
          const offset = strand * 2.4 * scale;
          graphics.lineBetween(x + offset, y + 7 * scale, x + offset * 0.45, y - 7 * scale);
        }
        graphics.lineStyle(2 * scale, color, 1);
        for (let strand = -2; strand <= 2; strand += 1) {
          const offset = strand * 2.4 * scale;
          graphics.lineBetween(x + offset, y + 7 * scale, x + offset * 0.45, y - 7 * scale);
        }
        if (moss) {
          graphics.fillStyle(0x9abe65, 0.9);
          graphics.fillCircle(x - 4 * scale, y - 3 * scale, 1.6 * scale);
          graphics.fillCircle(x + 3 * scale, y + 2 * scale, 1.8 * scale);
        }
        break;
      }
      case ResourceType.DampCrystal:
      case ResourceType.Starstone:
      case ResourceType.GlowingFragments: {
        const glow = resource !== ResourceType.Starstone ? 0.32 : 0.24;
        graphics.fillStyle(color, glow);
        graphics.fillCircle(x, y, 11 * scale);
        graphics.fillStyle(0x17232b, 0.92);
        graphics.fillTriangle(x - 9 * scale, y + 7 * scale, x - 4 * scale, y - 6 * scale, x, y + 6 * scale);
        graphics.fillTriangle(x - scale, y + 7 * scale, x + 4 * scale, y - 10 * scale, x + 9 * scale, y + 7 * scale);
        graphics.fillStyle(color, 1);
        graphics.fillTriangle(x - 7 * scale, y + 5 * scale, x - 4 * scale, y - 5 * scale, x - scale, y + 5 * scale);
        graphics.fillTriangle(x, y + 5 * scale, x + 4 * scale, y - 8 * scale, x + 7 * scale, y + 5 * scale);
        graphics.lineStyle(1.05 * scale, 0xe9ffff, 0.86);
        graphics.lineBetween(x + 4 * scale, y - 7 * scale, x + 2 * scale, y + 3 * scale);
        break;
      }
      case ResourceType.SpringStone:
      case ResourceType.RuneStone:
      case ResourceType.MeteorIron: {
        graphics.fillStyle(0x273337, 1);
        graphics.fillPoints([
          new Phaser.Geom.Point(x - 8 * scale, y + 5 * scale),
          new Phaser.Geom.Point(x - 5 * scale, y - 5 * scale),
          new Phaser.Geom.Point(x + scale, y - 8 * scale),
          new Phaser.Geom.Point(x + 8 * scale, y - 2 * scale),
          new Phaser.Geom.Point(x + 6 * scale, y + 6 * scale)
        ], true);
        graphics.fillStyle(color, 1);
        graphics.fillPoints([
          new Phaser.Geom.Point(x - 6.3 * scale, y + 3.8 * scale),
          new Phaser.Geom.Point(x - 3.8 * scale, y - 3.8 * scale),
          new Phaser.Geom.Point(x + scale, y - 6 * scale),
          new Phaser.Geom.Point(x + 6 * scale, y - 1.2 * scale),
          new Phaser.Geom.Point(x + 4.5 * scale, y + 4.5 * scale)
        ], true);
        graphics.lineStyle(1.2 * scale, resource === ResourceType.RuneStone ? 0xd9c9ff : 0xd6efea, 0.86);
        if (resource === ResourceType.RuneStone) {
          graphics.lineBetween(x - 2 * scale, y - 4 * scale, x + 2 * scale, y + 3 * scale);
          graphics.lineBetween(x - 3 * scale, y + scale, x + 3 * scale, y - scale);
        } else {
          graphics.lineBetween(x - 3 * scale, y - 2 * scale, x + 3 * scale, y + 2 * scale);
        }
        break;
      }
      case ResourceType.LuminousMushrooms: {
        graphics.fillStyle(0x27363a, 1);
        graphics.fillRect(x - 5.5 * scale, y, 2.8 * scale, 7 * scale);
        graphics.fillRect(x + 2.5 * scale, y - 2 * scale, 2.6 * scale, 9 * scale);
        graphics.fillStyle(color, 0.34);
        graphics.fillCircle(x, y - 2 * scale, 11 * scale);
        graphics.fillStyle(color, 1);
        graphics.fillEllipse(x - 4 * scale, y - scale, 9 * scale, 5.5 * scale);
        graphics.fillEllipse(x + 4 * scale, y - 3 * scale, 10 * scale, 6 * scale);
        graphics.fillStyle(0xf4dcff, 0.9);
        graphics.fillCircle(x + 2.5 * scale, y - 4 * scale, 1.1 * scale);
        break;
      }
      case ResourceType.MapFragments: {
        graphics.fillStyle(0x3c3022, 1);
        graphics.fillRoundedRect(x - 9 * scale, y - 7 * scale, 18 * scale, 14 * scale, 2 * scale);
        graphics.fillStyle(color, 1);
        graphics.fillPoints([
          new Phaser.Geom.Point(x - 7.5 * scale, y - 5.5 * scale),
          new Phaser.Geom.Point(x - scale, y - 4 * scale),
          new Phaser.Geom.Point(x + 7 * scale, y - 6 * scale),
          new Phaser.Geom.Point(x + 6 * scale, y + 5.5 * scale),
          new Phaser.Geom.Point(x - 6.5 * scale, y + 5 * scale)
        ], true);
        graphics.lineStyle(1 * scale, 0x806b45, 0.9);
        graphics.lineBetween(x - 4 * scale, y - 2 * scale, x + 4 * scale, y + 2 * scale);
        graphics.strokeCircle(x + 2 * scale, y - scale, 2 * scale);
        break;
      }
      case ResourceType.MechanicalParts: {
        graphics.fillStyle(0x263034, 1);
        graphics.fillCircle(x, y, 8.5 * scale);
        graphics.fillStyle(color, 1);
        graphics.fillCircle(x, y, 6.5 * scale);
        graphics.fillStyle(0x273338, 1);
        graphics.fillCircle(x, y, 2.5 * scale);
        graphics.lineStyle(2 * scale, 0xd5e0da, 0.68);
        for (let spoke = 0; spoke < 6; spoke += 1) {
          const angle = spoke / 6 * TWO_PI;
          graphics.lineBetween(
            x + Math.cos(angle) * 3 * scale,
            y + Math.sin(angle) * 3 * scale,
            x + Math.cos(angle) * 8 * scale,
            y + Math.sin(angle) * 8 * scale
          );
        }
        break;
      }
      case ResourceType.LensGlass: {
        graphics.fillStyle(0x263638, 1);
        graphics.fillCircle(x, y - scale, 8.5 * scale);
        graphics.fillStyle(color, 0.72);
        graphics.fillCircle(x, y - scale, 6.5 * scale);
        graphics.fillStyle(0xeaffff, 0.82);
        graphics.fillEllipse(x - 2.3 * scale, y - 3.2 * scale, 2.2 * scale, 4.2 * scale);
        graphics.lineStyle(2.2 * scale, 0xb58c55, 1);
        graphics.lineBetween(x + 5.5 * scale, y + 4.5 * scale, x + 10 * scale, y + 9 * scale);
        break;
      }
      case ResourceType.AncientFragments:
      case ResourceType.RelicMaterials: {
        const relic = resource === ResourceType.RelicMaterials;
        graphics.fillStyle(0x302a24, 1);
        graphics.fillTriangle(x - 9 * scale, y + 6 * scale, x - 4 * scale, y - 7 * scale, x + scale, y + 5 * scale);
        graphics.fillTriangle(x - scale, y + 6 * scale, x + 5 * scale, y - 5 * scale, x + 9 * scale, y + 5 * scale);
        graphics.fillStyle(color, 1);
        graphics.fillTriangle(x - 7 * scale, y + 4 * scale, x - 4 * scale, y - 5 * scale, x - scale, y + 3 * scale);
        graphics.fillTriangle(x + scale, y + 4 * scale, x + 5 * scale, y - 3 * scale, x + 7 * scale, y + 3 * scale);
        if (relic) {
          graphics.lineStyle(1.1 * scale, 0xffefa4, 0.92);
          graphics.strokeCircle(x, y, 3 * scale);
        }
        break;
      }
      case ResourceType.BoneFragments:
      case ResourceType.AncientRemains: {
        graphics.lineStyle(5.2 * scale, 0x5b5143, 1);
        graphics.lineBetween(x - 7 * scale, y + 6 * scale, x + 7 * scale, y - 6 * scale);
        graphics.lineStyle(3.4 * scale, color, 1);
        graphics.lineBetween(x - 7 * scale, y + 6 * scale, x + 7 * scale, y - 6 * scale);
        graphics.fillStyle(color, 1);
        graphics.fillCircle(x - 7 * scale, y + 6 * scale, 3.2 * scale);
        graphics.fillCircle(x + 7 * scale, y - 6 * scale, 3.2 * scale);
        if (resource === ResourceType.AncientRemains) {
          graphics.fillStyle(0x574d40, 0.9);
          graphics.fillCircle(x + 2 * scale, y + 4 * scale, 3.2 * scale);
        }
        break;
      }
      default:
        graphics.fillStyle(color, 1);
        graphics.fillCircle(x, y, 6 * scale);
        graphics.lineStyle(1.1 * scale, 0xffffff, 0.72);
        graphics.strokeCircle(x, y, 4 * scale);
        break;
    }
  }

  private drawToolDrop(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    toolId: ToolId
  ): void {
    const tool = TOOL_DEFINITIONS[toolId];
    const palette = TOOL_HEAD_PALETTES[tool.headMaterial];
    const handleStartX = x - 7 * scale;
    const handleStartY = y + 8 * scale;
    const handleEndX = x + 5 * scale;
    const handleEndY = y - 8 * scale;
    graphics.lineStyle(4 * scale, 0x452c20, 1);
    graphics.lineBetween(handleStartX, handleStartY, handleEndX, handleEndY);
    graphics.lineStyle(2.2 * scale, 0xb97843, 1);
    graphics.lineBetween(handleStartX, handleStartY, handleEndX, handleEndY);
    graphics.fillStyle(palette.fill, 1);
    graphics.lineStyle(1.1 * scale, palette.edge, 1);

    switch (tool.kind) {
      case 'pickaxe':
        graphics.fillTriangle(x - 8 * scale, y - 8 * scale, x + 11 * scale, y - 8 * scale, x + 5 * scale, y - 3 * scale);
        graphics.strokeTriangle(x - 8 * scale, y - 8 * scale, x + 11 * scale, y - 8 * scale, x + 5 * scale, y - 3 * scale);
        break;
      case 'axe':
        graphics.fillTriangle(x - 3 * scale, y - 11 * scale, x + 10 * scale, y - 8 * scale, x + 2 * scale, y - 2 * scale);
        graphics.strokeTriangle(x - 3 * scale, y - 11 * scale, x + 10 * scale, y - 8 * scale, x + 2 * scale, y - 2 * scale);
        break;
      case 'hoe':
        graphics.fillTriangle(x - 4 * scale, y - 10 * scale, x + 10 * scale, y - 9 * scale, x + 8 * scale, y - 4 * scale);
        graphics.strokeTriangle(x - 4 * scale, y - 10 * scale, x + 10 * scale, y - 9 * scale, x + 8 * scale, y - 4 * scale);
        break;
      case 'sword':
        graphics.fillTriangle(x + 2 * scale, y - 15 * scale, x + 8 * scale, y - 5 * scale, x - 1 * scale, y - 7 * scale);
        graphics.strokeTriangle(x + 2 * scale, y - 15 * scale, x + 8 * scale, y - 5 * scale, x - 1 * scale, y - 7 * scale);
        graphics.lineStyle(2.2 * scale, 0xe2ba56, 1);
        graphics.lineBetween(x - 5 * scale, y - 2 * scale, x + 5 * scale, y + 3 * scale);
        break;
    }
  }

  private drawPlaceableDrop(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    placeable: PlaceableId
  ): void {
    const definition = PLACEABLE_DEFINITIONS[placeable];
    if (placeable === PlaceableId.Waypoint) {
      graphics.lineStyle(2.5 * scale, 0x4a676a, 1);
      graphics.lineBetween(x - 3 * scale, y + 9 * scale, x - 3 * scale, y - 10 * scale);
      graphics.fillStyle(0x3f9bcd, 1);
      graphics.fillTriangle(x - 2 * scale, y - 10 * scale, x + 10 * scale, y - 7 * scale, x - 2 * scale, y - 3 * scale);
      return;
    }
    if (definition.interaction === 'light') {
      graphics.fillStyle(0x513824, 1);
      graphics.fillRect(x - 2 * scale, y - 9 * scale, 4 * scale, 19 * scale);
      graphics.fillStyle(0xffc861, 1);
      graphics.fillRoundedRect(x - 7 * scale, y - 11 * scale, 14 * scale, 10 * scale, 2 * scale);
      graphics.fillStyle(0xffffbf, 0.9);
      graphics.fillCircle(x, y - 6 * scale, 2.2 * scale);
      return;
    }
    if (definition.interaction === 'storage') {
      graphics.fillStyle(placeable === PlaceableId.DiamondVault ? 0x52b9c5 : 0x8b5734, 1);
      graphics.fillRoundedRect(x - 10 * scale, y - 6 * scale, 20 * scale, 14 * scale, 3 * scale);
      graphics.lineStyle(1.4 * scale, 0xe7d078, 0.9);
      graphics.lineBetween(x - 10 * scale, y - scale, x + 10 * scale, y - scale);
      return;
    }
    if (definition.interaction === 'rest') {
      graphics.fillStyle(placeable === PlaceableId.StoneShelter ? 0x778e91 : 0xaa7044, 1);
      graphics.fillTriangle(x - 11 * scale, y + 8 * scale, x, y - 11 * scale, x + 11 * scale, y + 8 * scale);
      return;
    }
    graphics.fillStyle(placeable === PlaceableId.Furnace || placeable === PlaceableId.Anvil ? 0x78878a : 0x9d6a43, 1);
    graphics.fillRoundedRect(x - 10 * scale, y - 7 * scale, 20 * scale, 14 * scale, 3 * scale);
    if (placeable === PlaceableId.Furnace) {
      graphics.fillStyle(0xff9146, 1);
      graphics.fillCircle(x, y + 2 * scale, 3 * scale);
    }
  }

  private drawPotionDrop(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    potion: PotionId
  ): void {
    graphics.fillStyle(0xddd9c7, 1);
    graphics.fillRoundedRect(x - 3 * scale, y - 11 * scale, 6 * scale, 5 * scale, 1.5 * scale);
    graphics.fillStyle(POTION_DEFINITIONS[potion].color, 1);
    graphics.fillRoundedRect(x - 7 * scale, y - 7 * scale, 14 * scale, 14 * scale, 5 * scale);
    graphics.lineStyle(1.15 * scale, 0xecfff6, 0.85);
    graphics.strokeRoundedRect(x - 7 * scale, y - 7 * scale, 14 * scale, 14 * scale, 5 * scale);
  }
}

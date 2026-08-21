import Phaser from 'phaser';
import { RESOURCE_COLORS, ResourceType } from './resources';
import { SessionWorldState } from './SessionWorldState';
import type { DroppedItem } from './SessionWorldState';

export const PICKUP_RADIUS_PIXELS = 48;
const PICKUP_RADIUS_SQUARED = PICKUP_RADIUS_PIXELS * PICKUP_RADIUS_PIXELS;
// Rendering scale only: the drop's pickup range and deterministic saved position stay unchanged.
const DROP_VISUAL_SCALE = 1.6;

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
    graphics.fillStyle(RESOURCE_COLORS[drop.resource], 1);

    switch (drop.resource) {
      case ResourceType.Wood:
        graphics.fillRoundedRect(x - 8 * scale, y - 4 * scale, 16 * scale, 8 * scale, 3 * scale);
        graphics.lineStyle(1.2 * scale, 0xf1c58b, 0.85);
        graphics.strokeCircle(x - 5 * scale, y, 2 * scale);
        break;
      case ResourceType.Stone:
        graphics.fillTriangle(x - 7 * scale, y + 5 * scale, x - 2 * scale, y - 7 * scale, x + 8 * scale, y + 5 * scale);
        break;
      case ResourceType.Fiber:
        graphics.lineStyle(2 * scale, RESOURCE_COLORS[drop.resource], 1);
        graphics.lineBetween(x - 5 * scale, y + 6 * scale, x - 2 * scale, y - 7 * scale);
        graphics.lineBetween(x, y + 6 * scale, x + scale, y - 8 * scale);
        graphics.lineBetween(x + 5 * scale, y + 6 * scale, x + 4 * scale, y - 6 * scale);
        break;
      case ResourceType.Cactus:
        graphics.fillRoundedRect(x - 4 * scale, y - 8 * scale, 8 * scale, 16 * scale, 3 * scale);
        graphics.fillRect(x - 8 * scale, y - scale, 4 * scale, 5 * scale);
        graphics.fillRect(x + 4 * scale, y - 4 * scale, 4 * scale, 5 * scale);
        break;
      case ResourceType.IceShard:
        graphics.fillTriangle(x, y - 9 * scale, x - 7 * scale, y + 7 * scale, x + 7 * scale, y + 7 * scale);
        graphics.lineStyle(1.2 * scale, 0xffffff, 0.9);
        graphics.lineBetween(x, y - 6 * scale, x, y + 4 * scale);
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
      case ResourceType.Diamond:
        graphics.fillTriangle(x, y - 9 * scale, x - 7 * scale, y, x, y + 8 * scale);
        graphics.fillTriangle(x, y - 9 * scale, x + 7 * scale, y, x, y + 8 * scale);
        graphics.lineStyle(1.15 * scale, 0xe8ffff, 0.92);
        graphics.lineBetween(x - 7 * scale, y, x + 7 * scale, y);
        break;
    }

    graphics.lineStyle(1.2 * scale, 0xffffff, 0.7);
    graphics.strokeCircle(x, y, 10 * scale);
    this.dropGraphics.set(drop.id, graphics);
  }
}

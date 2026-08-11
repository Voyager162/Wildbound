import Phaser from 'phaser';
import { RESOURCE_COLORS, ResourceType } from './resources';
import { SessionWorldState } from './SessionWorldState';
import type { DroppedItem } from './SessionWorldState';

export const PICKUP_RADIUS_PIXELS = 48;
const PICKUP_RADIUS_SQUARED = PICKUP_RADIUS_PIXELS * PICKUP_RADIUS_PIXELS;

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
    graphics.fillStyle(0x0d1b1a, 0.35);
    graphics.fillEllipse(drop.worldX, drop.worldY + 8, 18, 7);
    graphics.fillStyle(RESOURCE_COLORS[drop.resource], 1);

    switch (drop.resource) {
      case ResourceType.Wood:
        graphics.fillRoundedRect(drop.worldX - 8, drop.worldY - 4, 16, 8, 3);
        graphics.lineStyle(1, 0xf1c58b, 0.85);
        graphics.strokeCircle(drop.worldX - 5, drop.worldY, 2);
        break;
      case ResourceType.Stone:
        graphics.fillTriangle(drop.worldX - 7, drop.worldY + 5, drop.worldX - 2, drop.worldY - 7, drop.worldX + 8, drop.worldY + 5);
        break;
      case ResourceType.Fiber:
        graphics.lineStyle(2, RESOURCE_COLORS[drop.resource], 1);
        graphics.lineBetween(drop.worldX - 5, drop.worldY + 6, drop.worldX - 2, drop.worldY - 7);
        graphics.lineBetween(drop.worldX, drop.worldY + 6, drop.worldX + 1, drop.worldY - 8);
        graphics.lineBetween(drop.worldX + 5, drop.worldY + 6, drop.worldX + 4, drop.worldY - 6);
        break;
      case ResourceType.Cactus:
        graphics.fillRoundedRect(drop.worldX - 4, drop.worldY - 8, 8, 16, 3);
        graphics.fillRect(drop.worldX - 8, drop.worldY - 1, 4, 5);
        graphics.fillRect(drop.worldX + 4, drop.worldY - 4, 4, 5);
        break;
      case ResourceType.IceShard:
        graphics.fillTriangle(drop.worldX, drop.worldY - 9, drop.worldX - 7, drop.worldY + 7, drop.worldX + 7, drop.worldY + 7);
        graphics.lineStyle(1, 0xffffff, 0.9);
        graphics.lineBetween(drop.worldX, drop.worldY - 6, drop.worldX, drop.worldY + 4);
        break;
    }

    graphics.lineStyle(1, 0xffffff, 0.7);
    graphics.strokeCircle(drop.worldX, drop.worldY, 10);
    this.dropGraphics.set(drop.id, graphics);
  }
}

import Phaser from 'phaser';
import { RESOURCE_COLORS } from './resources';
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

  collectNearest(worldX: number, worldY: number): DroppedItem | null {
    const drop = this.findNearest(worldX, worldY);
    return drop ? this.collect(drop.id) : null;
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
    graphics.fillStyle(RESOURCE_COLORS[drop.resource], 1);
    graphics.fillCircle(drop.worldX, drop.worldY, 5);
    graphics.lineStyle(1, 0xffffff, 0.85);
    graphics.strokeCircle(drop.worldX, drop.worldY, 5);
    this.dropGraphics.set(drop.id, graphics);
  }
}
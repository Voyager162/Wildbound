import Phaser from 'phaser';
import { ResourceType } from './resources';
import { SessionWorldState } from './SessionWorldState';
import type { DroppedItem } from './SessionWorldState';

export const PICKUP_RADIUS_PIXELS = 48;
const PICKUP_RADIUS_SQUARED = PICKUP_RADIUS_PIXELS * PICKUP_RADIUS_PIXELS;

const DROP_COLORS: Record<ResourceType, number> = {
  [ResourceType.Wood]: 0xa66d3b,
  [ResourceType.Stone]: 0x9aa2aa,
  [ResourceType.Fiber]: 0x8fc45b,
  [ResourceType.Cactus]: 0x55aa5b,
  [ResourceType.IceShard]: 0xaee7f5
};

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

    if (!drop) {
      return null;
    }

    this.sessionState.removeDrop(drop.id);
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
    graphics.fillStyle(DROP_COLORS[drop.resource], 1);
    graphics.fillCircle(drop.worldX, drop.worldY, 5);
    graphics.lineStyle(1, 0xffffff, 0.85);
    graphics.strokeCircle(drop.worldX, drop.worldY, 5);
    this.dropGraphics.set(drop.id, graphics);
  }
}
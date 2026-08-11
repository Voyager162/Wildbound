import { BIOME_COLORS, biomeAtTile } from '../world/generation/biomeGenerator';

const MINIMAP_SIZE = 144;
const MINIMAP_CELL_SIZE = 3;

export class MinimapOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap-overlay';
    this.canvas.setAttribute('aria-label', 'World minimap');
    const context = this.canvas.getContext('2d');

    if (!context) {
      throw new Error('Wildbound could not create the minimap canvas.');
    }

    this.context = context;
    parent.append(this.canvas);
  }

  draw(seed: string, playerTileX: number, playerTileY: number, tilesPerCell: number): void {
    const deviceScale = Math.max(1, window.devicePixelRatio || 1);
    const pixelSize = Math.round(MINIMAP_SIZE * deviceScale);

    if (this.canvas.width !== pixelSize || this.canvas.height !== pixelSize) {
      this.canvas.width = pixelSize;
      this.canvas.height = pixelSize;
    }

    const context = this.context;
    const radius = MINIMAP_SIZE / 2 - 5;
    const cellsPerRadius = Math.ceil(radius / MINIMAP_CELL_SIZE) + 1;
    const anchorTileX = Math.floor(playerTileX / tilesPerCell) * tilesPerCell;
    const anchorTileY = Math.floor(playerTileY / tilesPerCell) * tilesPerCell;

    context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    context.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    context.save();
    context.beginPath();
    context.arc(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = '#102019';
    context.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    for (let cellY = -cellsPerRadius; cellY <= cellsPerRadius; cellY += 1) {
      for (let cellX = -cellsPerRadius; cellX <= cellsPerRadius; cellX += 1) {
        const sampleTileX = anchorTileX + cellX * tilesPerCell;
        const sampleTileY = anchorTileY + cellY * tilesPerCell;
        const offsetX = ((sampleTileX - playerTileX) / tilesPerCell) * MINIMAP_CELL_SIZE;
        const offsetY = ((sampleTileY - playerTileY) / tilesPerCell) * MINIMAP_CELL_SIZE;

        if (offsetX * offsetX + offsetY * offsetY > radius * radius) {
          continue;
        }

        context.fillStyle = this.colorToCss(BIOME_COLORS[biomeAtTile(seed, sampleTileX, sampleTileY)]);
        context.fillRect(
          MINIMAP_SIZE / 2 + offsetX - MINIMAP_CELL_SIZE / 2,
          MINIMAP_SIZE / 2 + offsetY - MINIMAP_CELL_SIZE / 2,
          MINIMAP_CELL_SIZE + 0.35,
          MINIMAP_CELL_SIZE + 0.35
        );
      }
    }

    context.restore();
    context.beginPath();
    context.arc(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, radius, 0, Math.PI * 2);
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(232, 240, 247, 0.94)';
    context.stroke();
    context.beginPath();
    context.arc(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, 5, 0, Math.PI * 2);
    context.fillStyle = '#65d6ff';
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = '#ffffff';
    context.stroke();
  }

  destroy(): void {
    this.canvas.remove();
  }

  private colorToCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
  }
}

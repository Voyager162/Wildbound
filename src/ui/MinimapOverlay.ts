import { minimapColorAtTile } from '../world/generation/biomeGenerator';
import { MINIMAP_BORDER_SMOOTHNESS_SCALE } from './uiConfig';

const MINIMAP_SIZE = 144;
const MAP_CACHE_SIZE = 360;
const REFERENCE_CELL_SIZE = 3;
const COLOR_CACHE_LIMIT = 64000;
const RENDER_TIME_BUDGET_MS = 1.4;
const CACHE_REBUILD_MARGIN = 0.36;

const clampScale = (value: number): number => Math.max(1, Math.min(100, value));

interface MinimapDrawRequest {
  seed: string;
  playerTileX: number;
  playerTileY: number;
  tilesPerReferenceCell: number;
}

interface MinimapRenderJob {
  request: MinimapDrawRequest;
  image: ImageData;
  data: Uint8ClampedArray;
  pixelSize: number;
  renderScale: number;
  center: number;
  worldTilesPerCssPixel: number;
  sampleBlockSize: number;
  nextY: number;
}

interface MinimapCacheState {
  seed: string;
  anchorTileX: number;
  anchorTileY: number;
  tilesPerReferenceCell: number;
  worldTilesPerCssPixel: number;
  renderScale: number;
  pixelSize: number;
  smoothness: number;
}

export class MinimapOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly mapCanvas: HTMLCanvasElement;
  private readonly mapContext: CanvasRenderingContext2D;
  private readonly colorCache = new Map<string, number>();
  private renderJob: MinimapRenderJob | null = null;
  private cacheState: MinimapCacheState | null = null;
  private latestRequest: MinimapDrawRequest | null = null;
  private animationFrameId: number | null = null;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap-overlay';
    this.canvas.setAttribute('aria-label', 'World minimap');
    const context = this.canvas.getContext('2d');

    this.mapCanvas = document.createElement('canvas');
    const mapContext = this.mapCanvas.getContext('2d');

    if (!context || !mapContext) {
      throw new Error('Wildbound could not create the minimap canvas.');
    }

    this.context = context;
    this.mapContext = mapContext;
    parent.append(this.canvas);
  }

  draw(seed: string, playerTileX: number, playerTileY: number, tilesPerReferenceCell: number): void {
    const request = { seed, playerTileX, playerTileY, tilesPerReferenceCell };
    this.latestRequest = request;
    this.ensureVisibleCanvasSize();

    if (!this.cacheState && !this.renderJob) {
      this.startRenderJob(request);
    } else if (!this.renderJob && this.needsNewCache(request)) {
      this.startRenderJob(request);
    }

    this.drawVisibleMap(request);
  }

  destroy(): void {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
    }

    this.renderJob = null;
    this.cacheState = null;
    this.latestRequest = null;
    this.colorCache.clear();
    this.canvas.remove();
  }

  private ensureVisibleCanvasSize(): number {
    const deviceScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const pixelSize = Math.round(MINIMAP_SIZE * deviceScale);

    if (this.canvas.width !== pixelSize || this.canvas.height !== pixelSize) {
      this.canvas.width = pixelSize;
      this.canvas.height = pixelSize;
    }

    return deviceScale;
  }

  private startRenderJob(request: MinimapDrawRequest): void {
    const smoothness = clampScale(MINIMAP_BORDER_SMOOTHNESS_SCALE);
    const deviceScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const extraSmoothScale = 1 + smoothness / 100;
    const renderScale = Math.min(2.4, deviceScale * extraSmoothScale);
    const pixelSize = Math.round(MAP_CACHE_SIZE * renderScale);
    const sampleBlockSize = Math.max(1, Math.round(4 - ((smoothness - 1) / 99) * 3));
    const image = this.mapContext.createImageData(pixelSize, pixelSize);

    if (this.mapCanvas.width !== pixelSize || this.mapCanvas.height !== pixelSize) {
      this.mapCanvas.width = pixelSize;
      this.mapCanvas.height = pixelSize;
    }

    this.renderJob = {
      request,
      image,
      data: image.data,
      pixelSize,
      renderScale,
      center: pixelSize / 2,
      worldTilesPerCssPixel: request.tilesPerReferenceCell / REFERENCE_CELL_SIZE,
      sampleBlockSize,
      nextY: 0
    };

    if (this.animationFrameId === null) {
      this.animationFrameId = window.requestAnimationFrame(this.processRenderJob);
    }
  }

  private readonly processRenderJob = (): void => {
    this.animationFrameId = null;
    const job = this.renderJob;
    if (!job) {
      return;
    }

    const startedAt = performance.now();
    while (job.nextY < job.pixelSize && performance.now() - startedAt < RENDER_TIME_BUDGET_MS) {
      this.renderRow(job, job.nextY);
      job.nextY += job.sampleBlockSize;
    }

    if (job.nextY < job.pixelSize) {
      this.animationFrameId = window.requestAnimationFrame(this.processRenderJob);
      return;
    }

    this.mapContext.setTransform(1, 0, 0, 1, 0, 0);
    this.mapContext.putImageData(job.image, 0, 0);
    this.cacheState = {
      seed: job.request.seed,
      anchorTileX: job.request.playerTileX,
      anchorTileY: job.request.playerTileY,
      tilesPerReferenceCell: job.request.tilesPerReferenceCell,
      worldTilesPerCssPixel: job.worldTilesPerCssPixel,
      renderScale: job.renderScale,
      pixelSize: job.pixelSize,
      smoothness: clampScale(MINIMAP_BORDER_SMOOTHNESS_SCALE)
    };
    this.renderJob = null;

    if (this.latestRequest) {
      this.drawVisibleMap(this.latestRequest);
      if (this.needsNewCache(this.latestRequest)) {
        this.startRenderJob(this.latestRequest);
      }
    }
  };

  private needsNewCache(request: MinimapDrawRequest): boolean {
    const cache = this.cacheState;
    if (!cache) {
      return true;
    }

    if (
      cache.seed !== request.seed
      || cache.tilesPerReferenceCell !== request.tilesPerReferenceCell
      || cache.smoothness !== clampScale(MINIMAP_BORDER_SMOOTHNESS_SCALE)
    ) {
      return true;
    }

    const distanceX = Math.abs(request.playerTileX - cache.anchorTileX) / cache.worldTilesPerCssPixel;
    const distanceY = Math.abs(request.playerTileY - cache.anchorTileY) / cache.worldTilesPerCssPixel;
    const maxPanBeforeRebuild = (MAP_CACHE_SIZE - MINIMAP_SIZE) * CACHE_REBUILD_MARGIN;
    return distanceX > maxPanBeforeRebuild || distanceY > maxPanBeforeRebuild;
  }

  private renderRow(job: MinimapRenderJob, y: number): void {
    const { request, pixelSize, renderScale, center, worldTilesPerCssPixel, sampleBlockSize } = job;
    const sampleY = y + sampleBlockSize / 2;
    const offsetY = sampleY - center;

    for (let x = 0; x < pixelSize; x += sampleBlockSize) {
      const sampleX = x + sampleBlockSize / 2;
      const offsetX = sampleX - center;
      const color = this.colorForWorldSample(
        request.seed,
        request.playerTileX + (offsetX / renderScale) * worldTilesPerCssPixel,
        request.playerTileY + (offsetY / renderScale) * worldTilesPerCssPixel
      );

      this.writeBlock(job.data, pixelSize, x, y, sampleBlockSize, color, 255);
    }
  }

  private drawVisibleMap(request: MinimapDrawRequest): void {
    const deviceScale = this.ensureVisibleCanvasSize();
    const context = this.context;
    const center = MINIMAP_SIZE / 2;
    const radius = center - 5;

    context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    context.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    context.save();
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.clip();

    const cache = this.cacheState;
    if (cache) {
      const panCssX = (request.playerTileX - cache.anchorTileX) / cache.worldTilesPerCssPixel;
      const panCssY = (request.playerTileY - cache.anchorTileY) / cache.worldTilesPerCssPixel;
      const sourceSize = MINIMAP_SIZE * cache.renderScale;
      const sourceX = (MAP_CACHE_SIZE / 2 + panCssX - MINIMAP_SIZE / 2) * cache.renderScale;
      const sourceY = (MAP_CACHE_SIZE / 2 + panCssY - MINIMAP_SIZE / 2) * cache.renderScale;

      context.imageSmoothingEnabled = true;
      context.drawImage(this.mapCanvas, sourceX, sourceY, sourceSize, sourceSize, 0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    } else {
      context.fillStyle = '#102019';
      context.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    }

    context.restore();
    this.drawFrame(context);
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawFrame(context: CanvasRenderingContext2D): void {
    const center = MINIMAP_SIZE / 2;
    const radius = center - 5;

    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(232, 240, 247, 0.94)';
    context.stroke();
    context.beginPath();
    context.arc(center, center, 5, 0, Math.PI * 2);
    context.fillStyle = '#65d6ff';
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = '#ffffff';
    context.stroke();
  }

  private writeBlock(
    data: Uint8ClampedArray,
    imageWidth: number,
    startX: number,
    startY: number,
    size: number,
    color: number,
    alpha: number
  ): void {
    const red = (color >> 16) & 0xff;
    const green = (color >> 8) & 0xff;
    const blue = color & 0xff;
    const endX = Math.min(imageWidth, startX + size);
    const endY = Math.min(imageWidth, startY + size);

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const index = (y * imageWidth + x) * 4;
        data[index] = red;
        data[index + 1] = green;
        data[index + 2] = blue;
        data[index + 3] = alpha;
      }
    }
  }

  private colorForWorldSample(seed: string, tileX: number, tileY: number): number {
    const key = `${seed}:${Math.round(tileX * 2)},${Math.round(tileY * 2)}`;
    const cached = this.colorCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const color = minimapColorAtTile(seed, tileX, tileY);
    this.colorCache.set(key, color);
    if (this.colorCache.size > COLOR_CACHE_LIMIT) {
      this.colorCache.clear();
    }
    return color;
  }
}
import { BIOME_COLORS, Biome } from '../world/generation/biomeGenerator';
import { surfaceAtTile } from '../world/generation/terrainGenerator';

/**
 * A permanently revealed, square world-space area. `tileX` and `tileY` are the
 * upper-left tile of the area; `sizeTiles` is its edge length in world tiles.
 */
export interface ExploredMapRegion {
  tileX: number;
  tileY: number;
  sizeTiles: number;
}

/**
 * The small, already-discovered slice of a procedural landmark needed by the
 * map. Landmark generation remains independent from this UI layer.
 */
export interface WorldMapLandmarkMarker {
  id: string;
  type: string;
  centerTileX: number;
  centerTileY: number;
  label: string;
  mapColor: number;
}

export interface WorldMapDrawRequest {
  seed: string;
  playerTileX: number;
  playerTileY: number;
  regions: readonly ExploredMapRegion[];
  landmarks: readonly WorldMapLandmarkMarker[];
}

interface CanvasDimensions {
  cssWidth: number;
  cssHeight: number;
  renderScale: number;
  key: string;
}

interface MapGeometry extends CanvasDimensions {
  left: number;
  top: number;
  width: number;
  height: number;
  minTileX: number;
  minTileY: number;
  tilesPerCssPixel: number;
}

interface TerrainMapSample {
  biome: Biome;
  color: string;
}

interface NormalizedRegions {
  regions: ExploredMapRegion[];
  signature: string;
  truncated: boolean;
}

interface NormalizedLandmarks {
  landmarks: WorldMapLandmarkMarker[];
  truncated: boolean;
}

interface NormalizedRequest {
  seed: string;
  playerTileX: number;
  playerTileY: number;
  regions: ExploredMapRegion[];
  landmarks: WorldMapLandmarkMarker[];
  contentSignature: string;
  regionsTruncated: boolean;
  landmarksTruncated: boolean;
}

interface RenderJob {
  request: NormalizedRequest;
  geometry: MapGeometry;
  regions: ExploredMapRegion[];
  nextRegionIndex: number;
  discoveredBiomes: Set<Biome>;
}

interface LabelBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const BIOME_ORDER: readonly Biome[] = [
  Biome.Ocean,
  Biome.Beach,
  Biome.Plains,
  Biome.Forest,
  Biome.Desert,
  Biome.Swamp,
  Biome.Hills,
  Biome.Mountains,
  Biome.Snow
];

const MAX_RENDER_DEVICE_SCALE = 2;
const MAX_CANVAS_PIXELS = 1_600_000;
const MIN_VIEWPORT_SIZE = 48;
const MAP_INNER_PADDING = 14;
const MAX_REGION_INPUT = 60_000;
const MAX_LANDMARK_INPUT = 1_500;
const MAX_ABSOLUTE_TILE_COORDINATE = 10_000_000;
const MAX_REGION_SIZE_TILES = 4_096;
const COLOR_CACHE_LIMIT = 360_000;
const RENDER_TIME_BUDGET_MS = 3.5;
// Samples use the exact continuous terrain palette from world chunks rather than a
// single biome swatch for each fog-of-war region.
const TERRAIN_SAMPLE_STEP_PIXELS = 1;
const DEFAULT_TILES_PER_CSS_PIXEL = 0.32;
const MIN_TILES_PER_CSS_PIXEL = 0.045;
const MAX_TILES_PER_CSS_PIXEL = 8;
const MAX_LANDMARK_LABELS = 16;
const MAX_LANDMARK_LABEL_LENGTH = 32;
const DEFAULT_LANDMARK_COLOR = 0xf6ca63;

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count.toLocaleString()} ${count === 1 ? singular : plural}`;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const toColor = (color: number): string => `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;

const biomeLabel = (biome: Biome): string => biome.charAt(0).toUpperCase() + biome.slice(1);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

// A compact, deterministic integer mixer used only to identify unchanged map data.
const mixInteger = (value: number): number => {
  let mixed = Math.round(value) | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
};

const regionHash = (region: ExploredMapRegion): number => {
  const x = mixInteger(region.tileX);
  const y = mixInteger(region.tileY);
  const size = mixInteger(region.sizeTiles);
  return (Math.imul(x ^ 0x9e3779b9, 31) ^ Math.imul(y, 17) ^ size) >>> 0;
};

/**
 * DOM/canvas world map UI. It deliberately knows nothing about saves, chunk
 * loading, or landmark generation: AdventureScene owns those systems and feeds
 * this overlay a compact snapshot whenever the map should refresh.
 */
export class WorldMapOverlay {
  private readonly element: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly terrainCanvas: HTMLCanvasElement;
  private readonly terrainContext: CanvasRenderingContext2D;
  private readonly annotationCanvas: HTMLCanvasElement;
  private readonly annotationContext: CanvasRenderingContext2D;
  private readonly emptyState: HTMLDivElement;
  private readonly status: HTMLSpanElement;
  private readonly legendList: HTMLUListElement;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly colorCache = new Map<string, TerrainMapSample>();

  private open = false;
  private destroyed = false;
  private latestRequest: NormalizedRequest | null = null;
  private canvasDimensions: CanvasDimensions | null = null;
  private renderedContentSignature: string | null = null;
  private renderedGeometry: MapGeometry | null = null;
  private renderJob: RenderJob | null = null;
  private renderFrameId: number | null = null;
  private layoutFrameId: number | null = null;
  private mapCenterTileX: number | null = null;
  private mapCenterTileY: number | null = null;
  private tilesPerCssPixel = DEFAULT_TILES_PER_CSS_PIXEL;
  private dragStart: { clientX: number; clientY: number; centerTileX: number; centerTileY: number } | null = null;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'world-map-overlay';
    this.element.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('section');
    panel.className = 'world-map-panel';
    panel.setAttribute('aria-label', 'World map');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    const header = document.createElement('header');
    header.className = 'world-map-header';
    const heading = document.createElement('h2');
    heading.className = 'world-map-title';
    heading.textContent = 'World Map';
    this.status = document.createElement('span');
    this.status.className = 'world-map-status';
    this.status.textContent = 'No regions charted';
    header.append(heading, this.status);

    const controls = document.createElement('p');
    controls.className = 'world-map-controls';
    controls.textContent = 'Drag to pan | Scroll to zoom | F to close | Cyan ring: you | Diamond: discovered landmark';

    this.viewport = document.createElement('div');
    this.viewport.className = 'world-map-viewport';
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.className = 'world-map-canvas world-map-canvas--terrain';
    this.terrainCanvas.setAttribute('aria-hidden', 'true');
    this.annotationCanvas = document.createElement('canvas');
    this.annotationCanvas.className = 'world-map-canvas world-map-canvas--annotations';
    this.annotationCanvas.setAttribute('aria-hidden', 'true');
    this.emptyState = document.createElement('div');
    this.emptyState.className = 'world-map-empty-state is-visible';
    this.emptyState.setAttribute('aria-live', 'polite');
    const emptyHeading = document.createElement('strong');
    emptyHeading.textContent = 'No territory charted yet';
    const emptyCopy = document.createElement('span');
    emptyCopy.textContent = 'Travel into the wild to permanently reveal terrain, biomes, and landmarks.';
    this.emptyState.append(emptyHeading, emptyCopy);
    this.viewport.append(this.terrainCanvas, this.annotationCanvas, this.emptyState);
    this.viewport.addEventListener('wheel', this.handleWheel, { passive: false });
    this.viewport.addEventListener('pointerdown', this.handlePointerDown);
    this.viewport.addEventListener('pointermove', this.handlePointerMove);
    this.viewport.addEventListener('pointerup', this.handlePointerUp);
    this.viewport.addEventListener('pointercancel', this.handlePointerUp);

    const legend = document.createElement('section');
    legend.className = 'world-map-legend';
    const legendHeading = document.createElement('h3');
    legendHeading.textContent = 'Discovered biomes';
    this.legendList = document.createElement('ul');
    this.legendList.className = 'world-map-legend-list';
    legend.append(legendHeading, this.legendList);

    panel.append(header, controls, this.viewport, legend);
    this.element.append(panel);
    parent.append(this.element);

    const terrainContext = this.terrainCanvas.getContext('2d');
    const annotationContext = this.annotationCanvas.getContext('2d');
    if (!terrainContext || !annotationContext) {
      this.element.remove();
      throw new Error('Wildbound could not create the world map canvas.');
    }

    this.terrainContext = terrainContext;
    this.annotationContext = annotationContext;
    this.updateLegend(new Set());

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.viewport);
    } else {
      this.resizeObserver = null;
      window.addEventListener('resize', this.handleResize);
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (this.destroyed) {
      return;
    }

    this.open = open;
    this.element.classList.toggle('is-open', open);
    this.element.setAttribute('aria-hidden', String(!open));

    if (!open) {
      this.cancelRenderFrame();
      this.renderJob = null;
      this.renderedContentSignature = null;
      this.renderedGeometry = null;
      return;
    }

    this.scheduleLayoutRefresh();
  }

  draw(request: WorldMapDrawRequest): void {
    if (this.destroyed) {
      return;
    }

    const normalized = this.normalizeRequest(request);
    if (this.mapCenterTileX === null || this.mapCenterTileY === null) {
      this.mapCenterTileX = normalized.playerTileX;
      this.mapCenterTileY = normalized.playerTileY;
    }
    const contentChanged = normalized.contentSignature !== this.latestRequest?.contentSignature;
    this.latestRequest = normalized;
    this.updateStatus(normalized);

    if (!this.open) {
      return;
    }

    if (!this.ensureCanvasSize()) {
      this.scheduleLayoutRefresh();
      return;
    }

    if (contentChanged || this.renderedContentSignature !== normalized.contentSignature || !this.renderedGeometry) {
      this.startRenderJob();
      return;
    }

    this.drawAnnotations(this.renderedGeometry, normalized);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.cancelRenderFrame();
    if (this.layoutFrameId !== null) {
      window.cancelAnimationFrame(this.layoutFrameId);
      this.layoutFrameId = null;
    }

    this.resizeObserver?.disconnect();
    this.viewport.removeEventListener('wheel', this.handleWheel);
    this.viewport.removeEventListener('pointerdown', this.handlePointerDown);
    this.viewport.removeEventListener('pointermove', this.handlePointerMove);
    this.viewport.removeEventListener('pointerup', this.handlePointerUp);
    this.viewport.removeEventListener('pointercancel', this.handlePointerUp);
    if (!this.resizeObserver) {
      window.removeEventListener('resize', this.handleResize);
    }

    this.renderJob = null;
    this.latestRequest = null;
    this.renderedGeometry = null;
    this.colorCache.clear();
    this.element.remove();
  }

  private normalizeRequest(request: WorldMapDrawRequest): NormalizedRequest {
    const normalizedRegions = this.normalizeRegions(request.regions);
    const normalizedLandmarks = this.normalizeLandmarks(request.landmarks);
    const seed = typeof request.seed === 'string' ? request.seed : '';

    return {
      seed,
      playerTileX: isFiniteNumber(request.playerTileX) ? request.playerTileX : 0,
      playerTileY: isFiniteNumber(request.playerTileY) ? request.playerTileY : 0,
      regions: normalizedRegions.regions,
      landmarks: normalizedLandmarks.landmarks,
      contentSignature: `${seed}\u0000${normalizedRegions.signature}`,
      regionsTruncated: normalizedRegions.truncated,
      landmarksTruncated: normalizedLandmarks.truncated
    };
  }

  private normalizeRegions(input: readonly ExploredMapRegion[]): NormalizedRegions {
    const regions: ExploredMapRegion[] = [];
    const uniqueKeys = new Set<string>();
    let sum = 0;
    let xor = 0;
    const inputLength = Array.isArray(input) ? input.length : 0;
    const limit = Math.min(inputLength, MAX_REGION_INPUT);

    for (let index = 0; index < limit; index += 1) {
      const region = input[index];
      if (!region || !isFiniteNumber(region.tileX) || !isFiniteNumber(region.tileY) || !isFiniteNumber(region.sizeTiles)) {
        continue;
      }

      const tileX = Math.floor(region.tileX);
      const tileY = Math.floor(region.tileY);
      const sizeTiles = Math.floor(region.sizeTiles);
      if (
        sizeTiles < 1
        || sizeTiles > MAX_REGION_SIZE_TILES
        || Math.abs(tileX) > MAX_ABSOLUTE_TILE_COORDINATE
        || Math.abs(tileY) > MAX_ABSOLUTE_TILE_COORDINATE
      ) {
        continue;
      }

      const key = `${tileX},${tileY},${sizeTiles}`;
      if (uniqueKeys.has(key)) {
        continue;
      }

      uniqueKeys.add(key);
      const normalized = { tileX, tileY, sizeTiles };
      regions.push(normalized);
      const hash = regionHash(normalized);
      sum = (sum + hash) >>> 0;
      xor = (xor ^ hash) >>> 0;
    }

    return {
      regions,
      signature: `${regions.length}:${sum.toString(36)}:${xor.toString(36)}`,
      truncated: inputLength > limit
    };
  }

  private normalizeLandmarks(input: readonly WorldMapLandmarkMarker[]): NormalizedLandmarks {
    const landmarks: WorldMapLandmarkMarker[] = [];
    const uniqueIds = new Set<string>();
    const inputLength = Array.isArray(input) ? input.length : 0;
    const limit = Math.min(inputLength, MAX_LANDMARK_INPUT);

    for (let index = 0; index < limit; index += 1) {
      const marker = input[index];
      if (
        !marker
        || typeof marker.id !== 'string'
        || typeof marker.type !== 'string'
        || typeof marker.label !== 'string'
        || !isFiniteNumber(marker.centerTileX)
        || !isFiniteNumber(marker.centerTileY)
      ) {
        continue;
      }

      if (
        Math.abs(marker.centerTileX) > MAX_ABSOLUTE_TILE_COORDINATE
        || Math.abs(marker.centerTileY) > MAX_ABSOLUTE_TILE_COORDINATE
        || uniqueIds.has(marker.id)
      ) {
        continue;
      }

      uniqueIds.add(marker.id);
      landmarks.push({
        id: marker.id,
        type: marker.type,
        label: marker.label,
        centerTileX: marker.centerTileX,
        centerTileY: marker.centerTileY,
        mapColor: isFiniteNumber(marker.mapColor) ? marker.mapColor : DEFAULT_LANDMARK_COLOR
      });
    }

    return { landmarks, truncated: inputLength > limit };
  }

  private startRenderJob(): void {
    const request = this.latestRequest;
    if (!request || !this.open || !this.ensureCanvasSize()) {
      return;
    }

    const dimensions = this.canvasDimensions;
    if (!dimensions) {
      return;
    }

    this.cancelRenderFrame();
    this.renderedContentSignature = null;
    this.renderedGeometry = null;
    this.clearAnnotations(dimensions);

    const geometry = this.createGeometry(request, dimensions);
    if (!geometry) {
      this.renderJob = null;
      this.drawBlankMap(dimensions);
      this.emptyState.classList.add('is-visible');
      this.updateLegend(new Set());
      this.renderedContentSignature = request.contentSignature;
      return;
    }

    this.emptyState.classList.remove('is-visible');
    this.drawMapBackground(geometry);
    this.terrainContext.setTransform(geometry.renderScale, 0, 0, geometry.renderScale, 0, 0);
    this.renderJob = {
      request,
      geometry,
      regions: request.regions.filter((region) => this.regionIntersectsGeometry(region, geometry)),
      nextRegionIndex: 0,
      discoveredBiomes: new Set<Biome>()
    };
    this.scheduleRenderFrame();
  }

  private createGeometry(request: NormalizedRequest, dimensions: CanvasDimensions): MapGeometry | null {
    if (request.regions.length === 0 || this.mapCenterTileX === null || this.mapCenterTileY === null) {
      return null;
    }
    const left = MAP_INNER_PADDING;
    const top = MAP_INNER_PADDING;
    const width = Math.max(1, dimensions.cssWidth - MAP_INNER_PADDING * 2);
    const height = Math.max(1, dimensions.cssHeight - MAP_INNER_PADDING * 2);

    return {
      ...dimensions,
      left,
      top,
      width,
      height,
      minTileX: this.mapCenterTileX - width * this.tilesPerCssPixel / 2,
      minTileY: this.mapCenterTileY - height * this.tilesPerCssPixel / 2,
      tilesPerCssPixel: this.tilesPerCssPixel
    };
  }

  private scheduleRenderFrame(): void {
    if (this.renderFrameId === null && this.renderJob && this.open) {
      this.renderFrameId = window.requestAnimationFrame(this.processRenderJob);
    }
  }

  private readonly processRenderJob = (): void => {
    this.renderFrameId = null;
    const job = this.renderJob;
    if (!job || !this.open || this.destroyed) {
      return;
    }

    const startedAt = performance.now();
    while (
      job.nextRegionIndex < job.regions.length
      && performance.now() - startedAt < RENDER_TIME_BUDGET_MS
    ) {
      this.paintExploredRegion(job.geometry, job.request.seed, job.regions[job.nextRegionIndex], job.discoveredBiomes);
      job.nextRegionIndex += 1;
    }

    if (job.nextRegionIndex < job.regions.length) {
      this.scheduleRenderFrame();
      return;
    }

    this.renderJob = null;
    this.terrainContext.setTransform(1, 0, 0, 1, 0, 0);
    const latest = this.latestRequest;
    if (!latest || latest.contentSignature !== job.request.contentSignature || !this.open) {
      this.startRenderJob();
      return;
    }

    this.renderedContentSignature = job.request.contentSignature;
    this.renderedGeometry = job.geometry;
    this.updateLegend(job.discoveredBiomes);
    this.drawAnnotations(job.geometry, latest);
  };

  private paintExploredRegion(
    geometry: MapGeometry,
    seed: string,
    region: ExploredMapRegion,
    discoveredBiomes: Set<Biome>
  ): void {
    const projected = this.projectRegion(geometry, region);
    const left = Math.floor(clamp(projected.left, geometry.left, geometry.left + geometry.width));
    const top = Math.floor(clamp(projected.top, geometry.top, geometry.top + geometry.height));
    const right = Math.ceil(clamp(projected.right, geometry.left, geometry.left + geometry.width));
    const bottom = Math.ceil(clamp(projected.bottom, geometry.top, geometry.top + geometry.height));
    if (right <= left || bottom <= top) {
      return;
    }

    const context = this.terrainContext;
    // Exploration is stored as compact regions, but revealed terrain itself is painted from
    // dense deterministic surface samples. The world map therefore shows the same soft
    // shoreline and climate transitions as the terrain under the player.
    for (let y = top; y < bottom; y += TERRAIN_SAMPLE_STEP_PIXELS) {
      for (let x = left; x < right; x += TERRAIN_SAMPLE_STEP_PIXELS) {
        const tileX = geometry.minTileX + (x + TERRAIN_SAMPLE_STEP_PIXELS * 0.5 - geometry.left) * geometry.tilesPerCssPixel;
        const tileY = geometry.minTileY + (y + TERRAIN_SAMPLE_STEP_PIXELS * 0.5 - geometry.top) * geometry.tilesPerCssPixel;
        const sample = this.terrainSampleAt(seed, tileX, tileY);
        discoveredBiomes.add(sample.biome);
        context.fillStyle = sample.color;
        context.fillRect(x, y, Math.min(TERRAIN_SAMPLE_STEP_PIXELS, right - x), Math.min(TERRAIN_SAMPLE_STEP_PIXELS, bottom - y));
      }
    }
  }

  private terrainSampleAt(seed: string, tileX: number, tileY: number): TerrainMapSample {
    const sampleTileX = Math.round(tileX * 4) / 4;
    const sampleTileY = Math.round(tileY * 4) / 4;
    const key = `${seed}:${sampleTileX},${sampleTileY}`;
    const cached = this.colorCache.get(key);
    if (cached) {
      return cached;
    }

    const surface = surfaceAtTile(seed, sampleTileX, sampleTileY);
    const sample = { biome: surface.biome, color: toColor(surface.color) };
    if (this.colorCache.size >= COLOR_CACHE_LIMIT) {
      this.colorCache.clear();
    }
    this.colorCache.set(key, sample);
    return sample;
  }

  private drawMapBackground(geometry: MapGeometry): void {
    const context = this.terrainContext;
    context.setTransform(geometry.renderScale, 0, 0, geometry.renderScale, 0, 0);
    context.clearRect(0, 0, geometry.cssWidth, geometry.cssHeight);
    context.fillStyle = '#071410';
    context.fillRect(0, 0, geometry.cssWidth, geometry.cssHeight);
    context.fillStyle = '#0b1d17';
    context.fillRect(geometry.left, geometry.top, geometry.width, geometry.height);

    const spacing = Math.max(44, Math.min(92, Math.round(Math.min(geometry.width, geometry.height) / 7)));
    context.strokeStyle = 'rgba(160, 211, 184, 0.08)';
    context.lineWidth = 1;
    context.beginPath();
    for (let x = geometry.left; x <= geometry.left + geometry.width; x += spacing) {
      context.moveTo(Math.round(x) + 0.5, geometry.top);
      context.lineTo(Math.round(x) + 0.5, geometry.top + geometry.height);
    }
    for (let y = geometry.top; y <= geometry.top + geometry.height; y += spacing) {
      context.moveTo(geometry.left, Math.round(y) + 0.5);
      context.lineTo(geometry.left + geometry.width, Math.round(y) + 0.5);
    }
    context.stroke();
    context.lineWidth = 1.25;
    context.strokeStyle = 'rgba(192, 239, 210, 0.42)';
    context.strokeRect(geometry.left + 0.5, geometry.top + 0.5, geometry.width - 1, geometry.height - 1);
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawBlankMap(dimensions: CanvasDimensions): void {
    const context = this.terrainContext;
    context.setTransform(dimensions.renderScale, 0, 0, dimensions.renderScale, 0, 0);
    context.clearRect(0, 0, dimensions.cssWidth, dimensions.cssHeight);
    context.fillStyle = '#071410';
    context.fillRect(0, 0, dimensions.cssWidth, dimensions.cssHeight);
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawAnnotations(geometry: MapGeometry, request: NormalizedRequest): void {
    const dimensions = this.canvasDimensions;
    if (!dimensions || dimensions.key !== geometry.key) {
      return;
    }

    const context = this.annotationContext;
    context.setTransform(dimensions.renderScale, 0, 0, dimensions.renderScale, 0, 0);
    context.clearRect(0, 0, dimensions.cssWidth, dimensions.cssHeight);
    context.save();
    context.beginPath();
    context.rect(geometry.left, geometry.top, geometry.width, geometry.height);
    context.clip();

    const occupiedLabels: LabelBounds[] = [];
    let labelsDrawn = 0;
    request.landmarks.forEach((marker) => {
      const point = this.projectTile(geometry, marker.centerTileX, marker.centerTileY);
      if (!this.isInsideGeometry(geometry, point.x, point.y)) {
        return;
      }

      const showLabel = labelsDrawn < MAX_LANDMARK_LABELS
        && this.drawLandmarkMarker(context, geometry, marker, point.x, point.y, occupiedLabels);
      if (showLabel) {
        labelsDrawn += 1;
      }
    });

    const player = this.projectTile(geometry, request.playerTileX, request.playerTileY);
    if (this.isInsideGeometry(geometry, player.x, player.y)) {
      this.drawPlayerMarker(context, player.x, player.y);
    }

    context.restore();
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawLandmarkMarker(
    context: CanvasRenderingContext2D,
    geometry: MapGeometry,
    marker: WorldMapLandmarkMarker,
    x: number,
    y: number,
    occupiedLabels: LabelBounds[]
  ): boolean {
    const color = toColor(marker.mapColor);
    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.7)';
    context.shadowBlur = 5;
    context.shadowOffsetY = 1;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y - 5.5);
    context.lineTo(x + 5.5, y);
    context.lineTo(x, y + 5.5);
    context.lineTo(x - 5.5, y);
    context.closePath();
    context.fill();
    context.shadowColor = 'transparent';
    context.lineWidth = 1.25;
    context.strokeStyle = '#fff6d8';
    context.stroke();
    context.restore();

    const label = marker.label.trim().slice(0, MAX_LANDMARK_LABEL_LENGTH);
    if (!label) {
      return false;
    }

    context.save();
    context.font = '600 12px system-ui, sans-serif';
    const textWidth = Math.ceil(context.measureText(label).width);
    const labelWidth = textWidth + 12;
    const labelHeight = 21;
    const labelLeft = clamp(x + 9, geometry.left + 2, geometry.left + geometry.width - labelWidth - 2);
    const labelTop = clamp(y - labelHeight - 7, geometry.top + 2, geometry.top + geometry.height - labelHeight - 2);
    const bounds: LabelBounds = {
      left: labelLeft,
      top: labelTop,
      right: labelLeft + labelWidth,
      bottom: labelTop + labelHeight
    };
    const overlaps = occupiedLabels.some((occupied) => this.boundsOverlap(occupied, bounds));
    if (overlaps) {
      context.restore();
      return false;
    }

    occupiedLabels.push(bounds);
    context.fillStyle = 'rgba(4, 17, 13, 0.9)';
    context.fillRect(labelLeft, labelTop, labelWidth, labelHeight);
    context.lineWidth = 1;
    context.strokeStyle = color;
    context.strokeRect(labelLeft + 0.5, labelTop + 0.5, labelWidth - 1, labelHeight - 1);
    context.fillStyle = '#f3fff4';
    context.textBaseline = 'middle';
    context.fillText(label, labelLeft + 6, labelTop + labelHeight / 2 + 0.5);
    context.restore();
    return true;
  }

  private drawPlayerMarker(context: CanvasRenderingContext2D, x: number, y: number): void {
    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.76)';
    context.shadowBlur = 6;
    context.fillStyle = '#55d8ff';
    context.beginPath();
    context.arc(x, y, 5.25, 0, Math.PI * 2);
    context.fill();
    context.shadowColor = 'transparent';
    context.lineWidth = 2;
    context.strokeStyle = '#ffffff';
    context.stroke();
    context.lineWidth = 1.5;
    context.strokeStyle = 'rgba(85, 216, 255, 0.9)';
    context.beginPath();
    context.arc(x, y, 9, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  private updateLegend(discoveredBiomes: ReadonlySet<Biome>): void {
    this.legendList.replaceChildren();
    const biomes = BIOME_ORDER.filter((biome) => discoveredBiomes.has(biome));
    if (biomes.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'world-map-legend-empty';
      empty.textContent = 'Explore terrain to catalog biomes.';
      this.legendList.append(empty);
      return;
    }

    biomes.forEach((biome) => {
      const item = document.createElement('li');
      item.className = 'world-map-legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'world-map-legend-swatch';
      swatch.style.setProperty('--world-map-biome-color', toColor(BIOME_COLORS[biome]));
      swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = biomeLabel(biome);
      item.append(swatch, label);
      this.legendList.append(item);
    });
  }

  private updateStatus(request: NormalizedRequest): void {
    if (request.regions.length === 0) {
      this.status.textContent = 'No regions charted';
      return;
    }

    const regions = pluralize(request.regions.length, 'region');
    const landmarks = pluralize(request.landmarks.length, 'landmark');
    const capped = request.regionsTruncated || request.landmarksTruncated ? ' | view capped for performance' : '';
    this.status.textContent = `${regions} | ${landmarks}${capped}`;
  }

  private ensureCanvasSize(): boolean {
    const rect = this.viewport.getBoundingClientRect();
    const cssWidth = Math.floor(rect.width);
    const cssHeight = Math.floor(rect.height);
    if (cssWidth < MIN_VIEWPORT_SIZE || cssHeight < MIN_VIEWPORT_SIZE) {
      return false;
    }

    const deviceScale = Math.min(MAX_RENDER_DEVICE_SCALE, Math.max(1, window.devicePixelRatio || 1));
    const pixelBudgetScale = Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight));
    const renderScale = Math.min(deviceScale, Math.max(0.5, pixelBudgetScale));
    const pixelWidth = Math.max(1, Math.round(cssWidth * renderScale));
    const pixelHeight = Math.max(1, Math.round(cssHeight * renderScale));
    const key = `${cssWidth}x${cssHeight}@${pixelWidth}x${pixelHeight}`;
    if (this.canvasDimensions?.key === key) {
      return true;
    }

    this.terrainCanvas.width = pixelWidth;
    this.terrainCanvas.height = pixelHeight;
    this.annotationCanvas.width = pixelWidth;
    this.annotationCanvas.height = pixelHeight;
    this.canvasDimensions = { cssWidth, cssHeight, renderScale: pixelWidth / cssWidth, key };
    this.renderedContentSignature = null;
    this.renderedGeometry = null;
    this.renderJob = null;
    return true;
  }

  private projectRegion(geometry: MapGeometry, region: ExploredMapRegion): LabelBounds {
    const topLeft = this.projectTile(geometry, region.tileX, region.tileY);
    const bottomRight = this.projectTile(geometry, region.tileX + region.sizeTiles, region.tileY + region.sizeTiles);
    return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
  }

  private regionIntersectsGeometry(region: ExploredMapRegion, geometry: MapGeometry): boolean {
    const maxTileX = geometry.minTileX + geometry.width * geometry.tilesPerCssPixel;
    const maxTileY = geometry.minTileY + geometry.height * geometry.tilesPerCssPixel;
    return region.tileX < maxTileX
      && region.tileX + region.sizeTiles > geometry.minTileX
      && region.tileY < maxTileY
      && region.tileY + region.sizeTiles > geometry.minTileY;
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.open || !this.latestRequest || !this.canvasDimensions) {
      return;
    }

    event.preventDefault();
    const geometry = this.createGeometry(this.latestRequest, this.canvasDimensions);
    if (!geometry) {
      return;
    }

    const rect = this.viewport.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, geometry.left, geometry.left + geometry.width);
    const y = clamp(event.clientY - rect.top, geometry.top, geometry.top + geometry.height);
    const focusTileX = geometry.minTileX + (x - geometry.left) * geometry.tilesPerCssPixel;
    const focusTileY = geometry.minTileY + (y - geometry.top) * geometry.tilesPerCssPixel;
    const zoomMultiplier = event.deltaY < 0 ? 0.82 : 1.22;
    this.tilesPerCssPixel = clamp(this.tilesPerCssPixel * zoomMultiplier, MIN_TILES_PER_CSS_PIXEL, MAX_TILES_PER_CSS_PIXEL);
    this.mapCenterTileX = focusTileX - (x - geometry.left - geometry.width / 2) * this.tilesPerCssPixel;
    this.mapCenterTileY = focusTileY - (y - geometry.top - geometry.height / 2) * this.tilesPerCssPixel;
    this.startRenderJob();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.open || this.mapCenterTileX === null || this.mapCenterTileY === null) {
      return;
    }

    this.dragStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      centerTileX: this.mapCenterTileX,
      centerTileY: this.mapCenterTileY
    };
    this.viewport.setPointerCapture?.(event.pointerId);
    this.viewport.classList.add('is-dragging');
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragStart || !this.open) {
      return;
    }

    this.mapCenterTileX = this.dragStart.centerTileX - (event.clientX - this.dragStart.clientX) * this.tilesPerCssPixel;
    this.mapCenterTileY = this.dragStart.centerTileY - (event.clientY - this.dragStart.clientY) * this.tilesPerCssPixel;
    this.startRenderJob();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.dragStart = null;
    this.viewport.releasePointerCapture?.(event.pointerId);
    this.viewport.classList.remove('is-dragging');
  };

  private projectTile(geometry: MapGeometry, tileX: number, tileY: number): { x: number; y: number } {
    return {
      x: geometry.left + (tileX - geometry.minTileX) / geometry.tilesPerCssPixel,
      y: geometry.top + (tileY - geometry.minTileY) / geometry.tilesPerCssPixel
    };
  }

  private isInsideGeometry(geometry: MapGeometry, x: number, y: number): boolean {
    return x >= geometry.left && x <= geometry.left + geometry.width && y >= geometry.top && y <= geometry.top + geometry.height;
  }

  private boundsOverlap(first: LabelBounds, second: LabelBounds): boolean {
    return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
  }

  private clearAnnotations(dimensions: CanvasDimensions): void {
    this.annotationContext.setTransform(dimensions.renderScale, 0, 0, dimensions.renderScale, 0, 0);
    this.annotationContext.clearRect(0, 0, dimensions.cssWidth, dimensions.cssHeight);
    this.annotationContext.setTransform(1, 0, 0, 1, 0, 0);
  }

  private scheduleLayoutRefresh(): void {
    if (this.layoutFrameId !== null || this.destroyed) {
      return;
    }

    this.layoutFrameId = window.requestAnimationFrame(() => {
      this.layoutFrameId = null;
      if (!this.open || this.destroyed || !this.latestRequest) {
        return;
      }

      if (!this.ensureCanvasSize()) {
        return;
      }

      this.startRenderJob();
    });
  }

  private readonly handleResize = (): void => {
    this.canvasDimensions = null;
    this.renderedContentSignature = null;
    this.renderedGeometry = null;
    this.renderJob = null;
    if (this.open) {
      this.scheduleLayoutRefresh();
    }
  };

  private cancelRenderFrame(): void {
    if (this.renderFrameId !== null) {
      window.cancelAnimationFrame(this.renderFrameId);
      this.renderFrameId = null;
    }
  }
}

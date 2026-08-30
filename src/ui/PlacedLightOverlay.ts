import Phaser from 'phaser';
import type { NightAmbientLight } from '../world/AmbientParticleManager';

// Permanent placed lights are interaction landmarks, not an atmospheric background effect.
// Unlike the intentionally low-resolution ambient canvas, this canvas uses the display's native
// pixel density. Otherwise a high-DPI screen enlarges a low-resolution gradient and makes the
// ground beneath a torch look soft even when its alpha falloff is correct.
const PLACED_LIGHT_RENDER_SCALE = 1;
// A minimum makes small sources readable. There is intentionally no maximum: the data-driven
// lantern radius is measured in chunks and must visibly enlarge the illuminated field.
const CLEAR_LIGHT_CORE_MIN_RADIUS = 42;

const colorChannels = (color: number): readonly [number, number, number] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff
];

const clampUnit = (value: number | undefined, fallback: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value! : fallback));

const blendChannels = (
  neutral: readonly [number, number, number],
  warm: readonly [number, number, number],
  warmth: number
): readonly [number, number, number] => [
  Math.round(neutral[0] + (warm[0] - neutral[0]) * warmth),
  Math.round(neutral[1] + (warm[1] - neutral[1]) * warmth),
  Math.round(neutral[2] + (warm[2] - neutral[2]) * warmth)
];

const rgba = (channels: readonly [number, number, number], alpha: number): string =>
  `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha.toFixed(3)})`;

// Placed lights are intentionally isolated from the throttled ambient-light canvas. A lantern
// is a fixed world object the player uses for navigation, so it is reprojected directly from the
// active camera each frame and can never inherit a stale camera-follow transform. Their configured
// radius and intensity are used directly: ambient-effect multipliers make large permanent lights
// look milky and obscure terrain texture.
export class PlacedLightOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private pixelWidth = 0;
  private pixelHeight = 0;
  private hasDrawnLight = false;
  private enabled = true;

  constructor(private readonly parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'placed-light-overlay';
    this.canvas.setAttribute('aria-hidden', 'true');
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Wildbound could not create the placed-light overlay.');
    }
    this.context = context;
    parent.append(this.canvas);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    this.canvas.classList.toggle('is-hidden', !enabled);
    this.canvas.style.display = enabled ? '' : 'none';
    if (!enabled) {
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      this.context.clearRect(0, 0, this.pixelWidth, this.pixelHeight);
      this.hasDrawnLight = false;
    }
  }

  update(camera: Phaser.Cameras.Scene2D.Camera, lights: readonly NightAmbientLight[]): void {
    if (!this.enabled) {
      return;
    }
    const scale = PLACED_LIGHT_RENDER_SCALE * Math.max(1, window.devicePixelRatio || 1);
    const cssWidth = Math.max(1, this.parent.clientWidth);
    const cssHeight = Math.max(1, this.parent.clientHeight);
    const nextPixelWidth = Math.round(cssWidth * scale);
    const nextPixelHeight = Math.round(cssHeight * scale);
    if (nextPixelWidth !== this.pixelWidth || nextPixelHeight !== this.pixelHeight) {
      this.pixelWidth = nextPixelWidth;
      this.pixelHeight = nextPixelHeight;
      this.canvas.width = nextPixelWidth;
      this.canvas.height = nextPixelHeight;
    }

    const context = this.context;
    if (lights.length === 0) {
      if (this.hasDrawnLight) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, this.pixelWidth, this.pixelHeight);
        this.hasDrawnLight = false;
      }
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.pixelWidth, this.pixelHeight);

    const scrollX = camera.roundPixels ? Math.round(camera.scrollX) : camera.scrollX;
    const scrollY = camera.roundPixels ? Math.round(camera.scrollY) : camera.scrollY;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.globalCompositeOperation = 'source-over';
    lights.forEach((light) => {
      const screenX = (light.worldX - scrollX) * camera.zoom
        + camera.x + camera.width * camera.originX * (1 - camera.zoom);
      const screenY = (light.worldY - scrollY) * camera.zoom
        + camera.y + camera.height * camera.originY * (1 - camera.zoom);
      const radius = Math.max(14, light.radius * camera.zoom * (light.radiusMultiplier ?? 1));
      const [red, green, blue] = colorChannels(light.color);
      const warmth = clampUnit(light.warmth, 0.8);
      const clarity = clampUnit(light.clarity, 0.82);
      // The authored source color drives the flame palette itself, not only its outer halo.
      // That lets a furnace read as a deep ember-red source while a lantern retains its gold.
      const flameCenter = [red, Math.max(28, Math.round(green * 0.78)), Math.max(14, Math.round(blue * 0.7))] as const;
      const flameInner = [red, Math.max(24, Math.round(green * 0.92)), Math.max(12, Math.round(blue * 0.9))] as const;
      const flameOuter = [red, Math.max(20, Math.round(green * 0.68)), Math.max(8, Math.round(blue * 0.62))] as const;
      const coreRadiusRatio = 0.16 + (1 - clarity) * 0.1;
      const coreRadius = Math.max(CLEAR_LIGHT_CORE_MIN_RADIUS, radius * coreRadiusRatio);
      const coreAlpha = Math.min(0.32, 0.1 + light.intensity * 0.4) * (0.78 + clarity * 0.22);
      const outerAlpha = Math.min(0.045, 0.01 + light.intensity * 0.065) * (0.48 + (1 - clarity) * 0.52);
      const centerColor = blendChannels([255, 252, 235], flameCenter, warmth);
      const innerColor = blendChannels([255, 248, 220], flameInner, warmth);
      const outerColor = blendChannels([255, 242, 200], flameOuter, warmth);
      const haloColor = blendChannels([255, 248, 226], [red, green, blue], warmth);

      // A compact, warm flame pool reveals the ground without putting a milky layer over it.
      // The sharp drop before the edge is intentional: transparency spread over hundreds of
      // pixels reads as haze, whereas this keeps the terrain's own texture and contrast clear.
      const core = context.createRadialGradient(screenX, screenY, 0, screenX, screenY, coreRadius);
      core.addColorStop(0, rgba(centerColor, coreAlpha));
      core.addColorStop(0.12, rgba(centerColor, coreAlpha * 0.86));
      core.addColorStop(0.3, rgba(innerColor, coreAlpha * 0.42));
      core.addColorStop(0.52, rgba(outerColor, coreAlpha * 0.12));
      core.addColorStop(0.72, rgba(outerColor, coreAlpha * 0.018));
      core.addColorStop(1, rgba(outerColor, 0));
      context.fillStyle = core;
      context.beginPath();
      context.arc(screenX, screenY, coreRadius, 0, Math.PI * 2);
      context.fill();

      // This is the radius-controlled field. Its alpha stays low enough to retain terrain detail,
      // but it remains visible all the way to the configured chunk reach instead of becoming an
      // almost-invisible decorative halo.
      const halo = context.createRadialGradient(screenX, screenY, coreRadius * 0.64, screenX, screenY, radius);
      halo.addColorStop(0, rgba(haloColor, outerAlpha * 0.68));
      halo.addColorStop(0.18, rgba(haloColor, outerAlpha * 0.48));
      halo.addColorStop(0.46, rgba(haloColor, outerAlpha * 0.22));
      halo.addColorStop(0.72, rgba(haloColor, outerAlpha * 0.055));
      halo.addColorStop(1, rgba(haloColor, 0));
      context.fillStyle = halo;
      context.beginPath();
      context.arc(screenX, screenY, radius, 0, Math.PI * 2);
      context.fill();
    });
    this.hasDrawnLight = true;
  }

  destroy(): void {
    this.canvas.remove();
  }
}

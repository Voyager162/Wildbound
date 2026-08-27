import Phaser from 'phaser';
import type { NightAmbientLight } from '../world/AmbientParticleManager';
import {
  NIGHT_AMBIENT_LIGHT_INTENSITY_MULTIPLIER,
  NIGHT_AMBIENT_LIGHT_RADIUS_MULTIPLIER
} from '../world/explorationConfig';
import { NIGHT_AMBIENT_LIGHT_RENDER_SCALE } from '../world/ambientPerformanceConfig';
import { NIGHT_AMBIENT_LIGHT_VIEWPORT_FADE_PIXELS } from '../world/ambientLightMotionConfig';

const colorChannels = (color: number): readonly [number, number, number] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff
];

// This canvas lives just above the darkening layer. World particles stay in Phaser's scene, and
// their screen-space glows are composited here so they can genuinely illuminate a dark night.
export class NightAmbientOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private pixelWidth = 0;
  private pixelHeight = 0;
  private enabled = true;
  private renderScale = NIGHT_AMBIENT_LIGHT_RENDER_SCALE;
  // Gradient fills are deliberately throttled, but a player-follow camera can move every
  // rendered frame. Keep the camera used for the most recent fill so the already-composited
  // glow canvas can follow it on the compositor instead of visibly snapping at the fill rate.
  private renderedScrollX = 0;
  private renderedScrollY = 0;
  private renderedZoom = 1;
  private renderedCameraX = 0;
  private renderedCameraY = 0;
  private hasRenderedFrame = false;
  private appliedOffsetX = Number.NaN;
  private appliedOffsetY = Number.NaN;

  constructor(private readonly parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'night-ambient-overlay';
    this.canvas.setAttribute('aria-hidden', 'true');
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Wildbound could not create the night ambient lighting overlay.');
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
    // The main Phaser canvas rule deliberately forces direct canvas children to display. Mirror
    // the state inline as well so that rule can never resurrect a surface-only light canvas in a
    // cave, even if future stylesheet ordering changes.
    this.canvas.style.display = enabled ? '' : 'none';
    if (!enabled) {
      // Night lights render through a low-resolution scale transform. Clear in backing-store
      // coordinates or only a fraction of the old frame is erased, leaving a hard vertical or
      // horizontal edge of stale surface glow behind.
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      this.context.clearRect(0, 0, this.pixelWidth, this.pixelHeight);
      this.hasRenderedFrame = false;
      this.setCameraOffset(0, 0);
    }
  }

  setRenderScale(scale: number): void {
    const nextScale = Math.max(0.25, Math.min(1, scale));
    if (this.renderScale === nextScale) {
      return;
    }
    this.renderScale = nextScale;
    // Force a resize on the next lighting update so the canvas never briefly stretches an old
    // resolution after the player changes this quality setting.
    this.pixelWidth = 0;
    this.pixelHeight = 0;
  }

  update(lightAmount: number, camera: Phaser.Cameras.Scene2D.Camera, lights: readonly NightAmbientLight[]): void {
    if (!this.enabled) {
      return;
    }
    const deviceScale = this.renderScale;
    const cssWidth = Math.max(1, this.parent.clientWidth);
    const cssHeight = Math.max(1, this.parent.clientHeight);
    const nextPixelWidth = Math.round(cssWidth * deviceScale);
    const nextPixelHeight = Math.round(cssHeight * deviceScale);
    if (nextPixelWidth !== this.pixelWidth || nextPixelHeight !== this.pixelHeight) {
      this.pixelWidth = nextPixelWidth;
      this.pixelHeight = nextPixelHeight;
      this.canvas.width = nextPixelWidth;
      this.canvas.height = nextPixelHeight;
    }

    const scrollX = this.cameraScrollX(camera);
    const scrollY = this.cameraScrollY(camera);
    // A fresh fill is already projected against this camera, so remove any compositor offset
    // left by the previous in-between-frame follow.
    this.setCameraOffset(0, 0);
    this.renderedScrollX = scrollX;
    this.renderedScrollY = scrollY;
    this.renderedZoom = camera.zoom;
    this.renderedCameraX = camera.x;
    this.renderedCameraY = camera.y;
    this.hasRenderedFrame = true;

    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.pixelWidth, this.pixelHeight);
    // Do not introduce a small-alpha cutoff here: it is visible as an abrupt final frame at
    // dawn and dusk. A permanent source such as a trail lantern can retain a tiny daylight
    // presence, so only an empty source list can skip the gradient work completely.
    if (lights.length === 0) {
      return;
    }

    context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    context.globalCompositeOperation = 'lighter';
    const nightStrength = Math.pow(Math.max(0, lightAmount), 0.72);
    // Phaser rounds the rendered camera when roundPixels is enabled. Projecting with the same
    // scroll removes the sub-pixel disagreement that made DOM lights slide and snap over a moving
    // world, especially at the game's low exploration zoom.
    lights.forEach((light) => {
      const screenX = (light.worldX - scrollX) * camera.zoom + camera.x;
      const screenY = (light.worldY - scrollY) * camera.zoom + camera.y;
      const radius = Math.max(14, light.radius * camera.zoom * (light.radiusMultiplier ?? NIGHT_AMBIENT_LIGHT_RADIUS_MULTIPLIER));
      const edgeDistance = Math.min(
        screenX + radius,
        cssWidth + radius - screenX,
        screenY + radius,
        cssHeight + radius - screenY
      );
      if (edgeDistance <= 0) {
        return;
      }

      const [red, green, blue] = colorChannels(light.color);
      // A trail lantern is a physical, always-burning source: its intensity remains fixed. It
      // naturally looks subtler in daylight because the terrain behind the screen blend is much
      // brighter, rather than because its glow suddenly turns on at dusk.
      const sourceStrength = light.alwaysOn ? 1 : nightStrength;
      if (sourceStrength <= 0) {
        return;
      }
      const edgeFade = Math.min(1, edgeDistance / NIGHT_AMBIENT_LIGHT_VIEWPORT_FADE_PIXELS);
      const alpha = Math.min(0.98, light.intensity * sourceStrength * NIGHT_AMBIENT_LIGHT_INTENSITY_MULTIPLIER) * edgeFade;
      const glow = context.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius);
      glow.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${(alpha * 0.94).toFixed(3)})`);
      glow.addColorStop(0.1, `rgba(${red}, ${green}, ${blue}, ${(alpha * 0.66).toFixed(3)})`);
      glow.addColorStop(0.32, `rgba(${red}, ${green}, ${blue}, ${(alpha * 0.27).toFixed(3)})`);
      glow.addColorStop(0.66, `rgba(${red}, ${green}, ${blue}, ${(alpha * 0.075).toFixed(3)})`);
      glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(screenX, screenY, radius, 0, Math.PI * 2);
      context.fill();
    });

    context.globalCompositeOperation = 'source-over';
  }

  // Keep lights visually locked to the camera at the display cadence without asking Canvas 2D
  // to clear and rebuild every radial gradient on every movement frame. This is especially
  // important during nighttime streaming, where a full glow redraw is much more expensive than
  // a compositor transform.
  followCamera(camera: Phaser.Cameras.Scene2D.Camera): void {
    if (!this.enabled || !this.hasRenderedFrame) {
      return;
    }

    const zoomChanged = Math.abs(camera.zoom - this.renderedZoom) > 0.0001;
    const originChanged = camera.x !== this.renderedCameraX || camera.y !== this.renderedCameraY;
    if (zoomChanged || originChanged) {
      // Resizes and camera zooms are uncommon; leave the previous image in place for this one
      // frame and let the normal scheduled fill reproject it exactly.
      this.setCameraOffset(0, 0);
      return;
    }

    const offsetX = (this.renderedScrollX - this.cameraScrollX(camera)) * this.renderedZoom;
    const offsetY = (this.renderedScrollY - this.cameraScrollY(camera)) * this.renderedZoom;
    this.setCameraOffset(offsetX, offsetY);
  }

  private cameraScrollX(camera: Phaser.Cameras.Scene2D.Camera): number {
    return camera.roundPixels ? Math.round(camera.scrollX) : camera.scrollX;
  }

  private cameraScrollY(camera: Phaser.Cameras.Scene2D.Camera): number {
    return camera.roundPixels ? Math.round(camera.scrollY) : camera.scrollY;
  }

  private setCameraOffset(offsetX: number, offsetY: number): void {
    if (Math.abs(offsetX - this.appliedOffsetX) < 0.001 && Math.abs(offsetY - this.appliedOffsetY) < 0.001) {
      return;
    }
    this.appliedOffsetX = offsetX;
    this.appliedOffsetY = offsetY;
    this.canvas.style.transform = `translate3d(${offsetX.toFixed(3)}px, ${offsetY.toFixed(3)}px, 0)`;
  }

  destroy(): void {
    this.canvas.remove();
  }
}

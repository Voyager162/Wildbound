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

  update(lightAmount: number, camera: Phaser.Cameras.Scene2D.Camera, lights: readonly NightAmbientLight[]): void {
    const deviceScale = NIGHT_AMBIENT_LIGHT_RENDER_SCALE;
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

    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.pixelWidth, this.pixelHeight);
    // Do not introduce a small-alpha cutoff here: it is visible as an abrupt final frame at
    // dawn and dusk. The schedule already approaches zero smoothly, so only exact daytime
    // darkness can skip the gradient work.
    if (lightAmount <= 0 || lights.length === 0) {
      return;
    }

    context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    context.globalCompositeOperation = 'lighter';
    const nightStrength = Math.pow(lightAmount, 0.72);
    // Phaser rounds the rendered camera when roundPixels is enabled. Projecting with the same
    // scroll removes the sub-pixel disagreement that made DOM lights slide and snap over a moving
    // world, especially at the game's low exploration zoom.
    const scrollX = camera.roundPixels ? Math.round(camera.scrollX) : camera.scrollX;
    const scrollY = camera.roundPixels ? Math.round(camera.scrollY) : camera.scrollY;

    lights.forEach((light) => {
      const screenX = (light.worldX - scrollX) * camera.zoom + camera.x;
      const screenY = (light.worldY - scrollY) * camera.zoom + camera.y;
      const radius = Math.max(14, light.radius * camera.zoom * NIGHT_AMBIENT_LIGHT_RADIUS_MULTIPLIER);
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
      const edgeFade = Math.min(1, edgeDistance / NIGHT_AMBIENT_LIGHT_VIEWPORT_FADE_PIXELS);
      const alpha = Math.min(0.98, light.intensity * nightStrength * NIGHT_AMBIENT_LIGHT_INTENSITY_MULTIPLIER) * edgeFade;
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

  destroy(): void {
    this.canvas.remove();
  }
}

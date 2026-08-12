import Phaser from 'phaser';
import type { NightAmbientLight } from '../world/AmbientParticleManager';

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

  update(nightAmount: number, camera: Phaser.Cameras.Scene2D.Camera, lights: readonly NightAmbientLight[]): void {
    const deviceScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
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
    if (nightAmount < 0.035 || lights.length === 0) {
      return;
    }

    context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    context.globalCompositeOperation = 'lighter';
    const nightStrength = Math.pow(nightAmount, 0.78);

    lights.forEach((light) => {
      const screenX = (light.worldX - camera.scrollX) * camera.zoom + camera.x;
      const screenY = (light.worldY - camera.scrollY) * camera.zoom + camera.y;
      const radius = Math.max(11, light.radius * camera.zoom);
      if (screenX < -radius || screenX > cssWidth + radius || screenY < -radius || screenY > cssHeight + radius) {
        return;
      }

      const [red, green, blue] = colorChannels(light.color);
      const alpha = Math.min(0.92, light.intensity * nightStrength);
      const glow = context.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius);
      glow.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${(alpha * 0.52).toFixed(3)})`);
      glow.addColorStop(0.2, `rgba(${red}, ${green}, ${blue}, ${(alpha * 0.2).toFixed(3)})`);
      glow.addColorStop(0.58, `rgba(${red}, ${green}, ${blue}, ${(alpha * 0.055).toFixed(3)})`);
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

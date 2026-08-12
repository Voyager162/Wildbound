import { sampleDayNight } from '../world/dayNight';

const blendChannel = (first: number, second: number, amount: number): number => Math.round(first + (second - first) * amount);

const DAY_TINT = [255, 255, 255] as const;
const TWILIGHT_TINT = [255, 163, 96] as const;
const NIGHT_TINT = [10, 24, 56] as const;

export class DayNightOverlay {
  private readonly element: HTMLDivElement;
  private lastStyle = '';

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'day-night-overlay';
    this.element.setAttribute('aria-hidden', 'true');
    parent.append(this.element);
  }

  update(worldTimeMs: number): void {
    const sample = sampleDayNight(worldTimeMs);
    const { nightAmount, dawnDuskAmount } = sample;
    // Lighting is intentionally uniform across the viewport. A directional CSS gradient made a
    // visible horizontal seam and looked like a world artifact rather than changing sunlight.
    const twilightAmount = dawnDuskAmount * (1 - nightAmount * 0.6);
    const baseRed = blendChannel(DAY_TINT[0], TWILIGHT_TINT[0], twilightAmount);
    const baseGreen = blendChannel(DAY_TINT[1], TWILIGHT_TINT[1], twilightAmount);
    const baseBlue = blendChannel(DAY_TINT[2], TWILIGHT_TINT[2], twilightAmount);
    const tintRed = blendChannel(baseRed, NIGHT_TINT[0], nightAmount);
    const tintGreen = blendChannel(baseGreen, NIGHT_TINT[1], nightAmount);
    const tintBlue = blendChannel(baseBlue, NIGHT_TINT[2], nightAmount);
    const tintAlpha = nightAmount * 0.56 + twilightAmount * 0.14;
    const style = `rgba(${tintRed}, ${tintGreen}, ${tintBlue}, ${tintAlpha.toFixed(3)})`;

    if (style !== this.lastStyle) {
      this.lastStyle = style;
      this.element.style.backgroundColor = style;
    }
  }

  destroy(): void {
    this.element.remove();
  }
}

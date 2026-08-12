import { sampleDayNight } from '../world/dayNight';

const blendChannel = (day: number, night: number, amount: number): number => Math.round(day + (night - day) * amount);

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
    const tintRed = blendChannel(26, 7, nightAmount);
    const tintGreen = blendChannel(40, 19, nightAmount);
    const tintBlue = blendChannel(42, 53, nightAmount);
    const tintAlpha = 0.03 + nightAmount * 0.48;
    const glowAlpha = dawnDuskAmount * 0.17;
    const style = `linear-gradient(180deg, rgba(255, 166, 93, ${glowAlpha.toFixed(3)}) 0%, rgba(${tintRed}, ${tintGreen}, ${tintBlue}, ${tintAlpha.toFixed(3)}) 64%, rgba(3, 12, 28, ${(nightAmount * 0.16).toFixed(3)}) 100%)`;

    if (style !== this.lastStyle) {
      this.lastStyle = style;
      this.element.style.background = style;
    }
  }

  destroy(): void {
    this.element.remove();
  }
}

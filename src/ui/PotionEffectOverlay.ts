import { POTION_DEFINITIONS, POTION_IDS, type PotionEffect, type PotionId } from '../crafting/potionConfig';

interface EffectBadge {
  readonly element: HTMLDivElement;
  readonly fill: HTMLSpanElement;
  readonly remaining: HTMLSpanElement;
  lastShownSeconds: number;
}

const definitionForEffect = (effect: PotionEffect) => POTION_IDS
  .map((id) => POTION_DEFINITIONS[id])
  .find((definition) => definition.effect === effect) ?? null;

const colorCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

const durationLabel = (remainingMs: number): string => {
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`;
};

// Active effects are deliberately a small DOM overlay rather than a Phaser scene object. Their
// progress is screen-relative, requires no camera work, and updates only four compact badges.
export class PotionEffectOverlay {
  private readonly element: HTMLDivElement;
  private readonly badges = new Map<PotionEffect, EffectBadge>();

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'potion-effects-overlay';
    this.element.setAttribute('aria-label', 'Active tonic effects');
    this.element.setAttribute('aria-live', 'polite');
    parent.append(this.element);
  }

  update(activeEffects: ReadonlyMap<PotionEffect, number>, now: number): void {
    this.badges.forEach((badge, effect) => {
      if (!activeEffects.has(effect)) {
        badge.element.remove();
        this.badges.delete(effect);
      }
    });

    activeEffects.forEach((expiresAtMs, effect) => {
      const definition = definitionForEffect(effect);
      if (!definition) {
        return;
      }
      const badge = this.badges.get(effect) ?? this.createBadge(definition.id);
      const remainingMs = Math.max(0, expiresAtMs - now);
      badge.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, remainingMs / definition.durationMs)).toFixed(4)})`;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      if (remainingSeconds !== badge.lastShownSeconds) {
        badge.lastShownSeconds = remainingSeconds;
        badge.remaining.textContent = durationLabel(remainingMs);
        badge.element.setAttribute('aria-label', `${definition.label}, ${durationLabel(remainingMs)} remaining`);
      }
    });
  }

  destroy(): void {
    this.badges.clear();
    this.element.remove();
  }

  private createBadge(id: PotionId): EffectBadge {
    const definition = POTION_DEFINITIONS[id];
    const badge = document.createElement('div');
    badge.className = 'potion-effect-badge';
    badge.style.setProperty('--effect-color', colorCss(definition.color));
    const icon = document.createElement('span');
    icon.className = `potion-icon potion-icon--${id.replaceAll(' ', '-')}`;
    icon.setAttribute('aria-hidden', 'true');
    const bottleLabel = document.createElement('span');
    bottleLabel.className = 'potion-icon__label';
    bottleLabel.textContent = definition.shortLabel;
    const detail = document.createElement('span');
    detail.className = 'resource-icon__detail';
    icon.append(bottleLabel, detail);
    const copy = document.createElement('div');
    copy.className = 'potion-effect-badge__copy';
    const label = document.createElement('strong');
    label.textContent = definition.shortLabel;
    const remaining = document.createElement('span');
    remaining.className = 'potion-effect-badge__remaining';
    copy.append(label, remaining);
    const progress = document.createElement('span');
    progress.className = 'potion-effect-badge__progress';
    const fill = document.createElement('span');
    fill.className = 'potion-effect-badge__fill';
    progress.append(fill);
    badge.append(icon, copy, progress);
    this.element.append(badge);
    const result: EffectBadge = { element: badge, fill, remaining, lastShownSeconds: Number.NaN };
    this.badges.set(definition.effect, result);
    return result;
  }
}

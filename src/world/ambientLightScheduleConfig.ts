import { DAY_NIGHT_CYCLE_DURATION_MS } from './explorationConfig';

// Edit these two hours to choose when ambient light particles are visible. The default schedule
// spans the night, crossing midnight: 18 means 18:00 and 6 means 06:00.
export const AMBIENT_LIGHT_APPEAR_START_HOUR = 18;
export const AMBIENT_LIGHT_DISAPPEAR_END_HOUR = 6;

// These independently control how long lights take to fade in after the start hour and fade out
// before the end hour. Set either to 0 for an instant transition.
export const AMBIENT_LIGHT_APPEAR_FADE_HOURS = 0.5;
export const AMBIENT_LIGHT_DISAPPEAR_FADE_HOURS = 0.5;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (value: number): number => value * value * (3 - 2 * value);
const wrappedHours = (from: number, to: number): number => (to - from + 24) % 24;

// Returns 0 outside the configured window and smoothly fades at both configured edges. Equal
// start/end hours intentionally mean a full 24-hour schedule, which is useful for art testing.
export const ambientLightScheduleAmount = (worldTimeMs: number): number => {
  const hour = ((worldTimeMs / DAY_NIGHT_CYCLE_DURATION_MS) * 24) % 24;
  const duration = wrappedHours(AMBIENT_LIGHT_APPEAR_START_HOUR, AMBIENT_LIGHT_DISAPPEAR_END_HOUR) || 24;
  const elapsed = wrappedHours(AMBIENT_LIGHT_APPEAR_START_HOUR, hour);
  if (elapsed > duration) {
    return 0;
  }

  const appearFade = Math.min(Math.max(0, AMBIENT_LIGHT_APPEAR_FADE_HOURS), duration);
  const disappearFade = Math.min(Math.max(0, AMBIENT_LIGHT_DISAPPEAR_FADE_HOURS), duration);
  const fadeIn = appearFade === 0 ? 1 : smoothstep(clamp01(elapsed / appearFade));
  const fadeOut = disappearFade === 0 ? 1 : smoothstep(clamp01((duration - elapsed) / disappearFade));
  return Math.min(fadeIn, fadeOut);
};

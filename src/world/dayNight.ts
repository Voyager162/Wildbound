import { DAY_NIGHT_CYCLE_DURATION_MS } from './explorationConfig';

export interface DayNightSample {
  normalizedTime: number;
  hour: number;
  minute: number;
  label: string;
  lightLevel: number;
  nightAmount: number;
  dawnDuskAmount: number;
}

const clamp = (value: number, minimum = 0, maximum = 1): number => Math.max(minimum, Math.min(maximum, value));

export const normalizeWorldTime = (worldTimeMs: number): number => {
  const wrapped = worldTimeMs % DAY_NIGHT_CYCLE_DURATION_MS;
  return wrapped < 0 ? wrapped + DAY_NIGHT_CYCLE_DURATION_MS : wrapped;
};

export const worldTimeForHour = (hour: number): number =>
  normalizeWorldTime(DAY_NIGHT_CYCLE_DURATION_MS * (Math.max(0, Math.min(24, hour)) / 24));

// World time starts at midnight. Sunrise is 06:00, noon is 12:00, and sunset is 18:00.
export const sampleDayNight = (worldTimeMs: number): DayNightSample => {
  const normalizedMs = normalizeWorldTime(worldTimeMs);
  const normalizedTime = normalizedMs / DAY_NIGHT_CYCLE_DURATION_MS;
  const solarHeight = Math.sin((normalizedTime - 0.25) * Math.PI * 2);
  const lightLevel = clamp((solarHeight + 0.22) / 1.22);
  const nightAmount = 1 - lightLevel;
  const dawnDuskAmount = clamp(1 - Math.abs(solarHeight) / 0.58) * (1 - nightAmount * 0.64);
  const totalMinutes = Math.floor(normalizedTime * 24 * 60) % (24 * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const phaseLabel = hour < 5 ? 'Night' : hour < 7 ? 'Dawn' : hour < 17 ? 'Day' : hour < 20 ? 'Dusk' : 'Night';

  return {
    normalizedTime,
    hour,
    minute,
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${phaseLabel}`,
    lightLevel,
    nightAmount,
    dawnDuskAmount
  };
};

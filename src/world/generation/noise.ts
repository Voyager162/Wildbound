const seedCache = new Map<string, number>();

export const seedFromString = (seed: string): number => {
  const cached = seedCache.get(seed);

  if (cached !== undefined) {
    return cached;
  }

  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const result = hash >>> 0;
  seedCache.set(seed, result);
  return result;
};

const hashGridPoint = (gridX: number, gridY: number, seed: number): number => {
  let hash = (seed ^ Math.imul(gridX, 374761393) ^ Math.imul(gridY, 668265263)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);

  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
};

const smoothStep = (value: number): number => value * value * (3 - 2 * value);

const interpolate = (start: number, end: number, amount: number): number => start + (end - start) * amount;

const valueNoise = (x: number, y: number, seed: number): number => {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const horizontalProgress = smoothStep(x - left);
  const verticalProgress = smoothStep(y - top);
  const topEdge = interpolate(
    hashGridPoint(left, top, seed),
    hashGridPoint(left + 1, top, seed),
    horizontalProgress
  );
  const bottomEdge = interpolate(
    hashGridPoint(left, top + 1, seed),
    hashGridPoint(left + 1, top + 1, seed),
    horizontalProgress
  );

  return interpolate(topEdge, bottomEdge, verticalProgress);
};

export const coherentNoise = (
  seed: string,
  tileX: number,
  tileY: number,
  scale: number,
  salt: number
): number => {
  const seedValue = seedFromString(seed) ^ salt;
  const broadRegion = valueNoise(tileX / scale, tileY / scale, seedValue);
  const localVariation = valueNoise(tileX / (scale / 4), tileY / (scale / 4), seedValue ^ 0x9e3779b9);

  return broadRegion * 0.88 + localVariation * 0.12;
};

export const randomAtTile = (seed: string, tileX: number, tileY: number, salt: number): number =>
  hashGridPoint(tileX, tileY, seedFromString(seed) ^ salt);

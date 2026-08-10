import { coherentNoise } from './noise';

export enum Biome {
  Ocean = 'ocean',
  Beach = 'beach',
  Plains = 'plains',
  Forest = 'forest',
  Desert = 'desert',
  Swamp = 'swamp',
  Hills = 'hills',
  Mountains = 'mountains',
  Snow = 'snow'
}

export interface ClimateSample {
  elevation: number;
  moisture: number;
  temperature: number;
}

export const climateAtTile = (seed: string, tileX: number, tileY: number): ClimateSample => ({
  elevation: coherentNoise(seed, tileX, tileY, 96, 0x63d83595),
  moisture: coherentNoise(seed, tileX, tileY, 72, 0xa511e9b3),
  temperature: coherentNoise(seed, tileX, tileY, 120, 0x4f1bbcdc)
});

export const biomeAtTile = (seed: string, tileX: number, tileY: number): Biome => {
  const { elevation, moisture, temperature } = climateAtTile(seed, tileX, tileY);

  if (elevation < 0.22) {
    return Biome.Ocean;
  }

  if (elevation < 0.3) {
    return Biome.Beach;
  }

  if (temperature < 0.2 || (elevation > 0.83 && temperature < 0.58)) {
    return Biome.Snow;
  }

  if (elevation > 0.84) {
    return Biome.Mountains;
  }

  if (elevation > 0.7) {
    return Biome.Hills;
  }

  if (moisture > 0.76 && temperature > 0.42) {
    return Biome.Swamp;
  }

  if (temperature > 0.67 && moisture < 0.36) {
    return Biome.Desert;
  }

  if (moisture > 0.57) {
    return Biome.Forest;
  }

  return Biome.Plains;
};
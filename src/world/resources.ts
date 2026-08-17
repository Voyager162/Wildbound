import { TerrainFeatureType } from './generation/featureGenerator';

export enum ResourceType {
  Wood = 'wood',
  Stone = 'stone',
  Fiber = 'fiber',
  Cactus = 'cactus',
  IceShard = 'ice shard',
  Coal = 'coal',
  Iron = 'iron',
  Gold = 'gold',
  Diamond = 'diamond'
}

export const RESOURCE_COLORS: Record<ResourceType, number> = {
  [ResourceType.Wood]: 0xa66d3b,
  [ResourceType.Stone]: 0x9aa2aa,
  [ResourceType.Fiber]: 0x8fc45b,
  [ResourceType.Cactus]: 0x55aa5b,
  [ResourceType.IceShard]: 0xaee7f5,
  [ResourceType.Coal]: 0x48525d,
  [ResourceType.Iron]: 0xc48462,
  [ResourceType.Gold]: 0xe7bd4e,
  [ResourceType.Diamond]: 0x71dce0
};

export const RESOURCE_TYPES = [
  ResourceType.Wood,
  ResourceType.Stone,
  ResourceType.Fiber,
  ResourceType.Cactus,
  ResourceType.IceShard,
  ResourceType.Coal,
  ResourceType.Iron,
  ResourceType.Gold,
  ResourceType.Diamond
] as const;

export const resourceForFeature = (feature: TerrainFeatureType): ResourceType => {
  switch (feature) {
    case TerrainFeatureType.Tree:
      return ResourceType.Wood;
    case TerrainFeatureType.Cactus:
      return ResourceType.Cactus;
    case TerrainFeatureType.Rock:
    case TerrainFeatureType.SnowyRock:
      return ResourceType.Stone;
    case TerrainFeatureType.Reeds:
    case TerrainFeatureType.WaterReeds:
    case TerrainFeatureType.Grass:
      return ResourceType.Fiber;
    case TerrainFeatureType.IcePatch:
      return ResourceType.IceShard;
  }
};

export const resourceLabel = (resource: ResourceType): string =>
  resource.replace(/\b\w/g, (letter) => letter.toUpperCase());

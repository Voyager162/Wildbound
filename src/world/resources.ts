import { TerrainFeatureType } from './generation/featureGenerator';

export enum ResourceType {
  Wood = 'wood',
  Stone = 'stone',
  Fiber = 'fiber',
  Cactus = 'cactus',
  IceShard = 'ice shard'
}

export const RESOURCE_COLORS: Record<ResourceType, number> = {
  [ResourceType.Wood]: 0xa66d3b,
  [ResourceType.Stone]: 0x9aa2aa,
  [ResourceType.Fiber]: 0x8fc45b,
  [ResourceType.Cactus]: 0x55aa5b,
  [ResourceType.IceShard]: 0xaee7f5
};

export const RESOURCE_TYPES = [
  ResourceType.Wood,
  ResourceType.Stone,
  ResourceType.Fiber,
  ResourceType.Cactus,
  ResourceType.IceShard
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
    case TerrainFeatureType.Grass:
      return ResourceType.Fiber;
    case TerrainFeatureType.IcePatch:
      return ResourceType.IceShard;
  }
};

export const resourceLabel = (resource: ResourceType): string =>
  resource.replace(/\b\w/g, (letter) => letter.toUpperCase());

import { TerrainFeatureType } from './generation/featureGenerator';

export enum ResourceType {
  Wood = 'wood',
  Stone = 'stone',
  Fiber = 'fiber',
  Cactus = 'cactus',
  Coal = 'coal',
  Iron = 'iron',
  Gold = 'gold',
  Diamond = 'diamond',
  IronIngot = 'iron ingot',
  GoldIngot = 'gold ingot',
  AncientWood = 'ancient wood',
  AmberSap = 'amber sap',
  GlowSpores = 'glow spores',
  VineFiber = 'vine fiber',
  Heartwood = 'heartwood',
  DampCrystal = 'damp crystal',
  MossFiber = 'moss fiber',
  SpringStone = 'spring stone',
  LuminousMushrooms = 'luminous mushrooms',
  MapFragments = 'map fragments',
  MechanicalParts = 'mechanical parts',
  LensGlass = 'lens glass',
  Starstone = 'starstone',
  MeteorIron = 'meteor iron',
  GlowingFragments = 'glowing fragments',
  RuneStone = 'rune stone',
  AncientFragments = 'ancient fragments',
  RelicMaterials = 'relic materials',
  BoneFragments = 'bone fragments',
  FossilResin = 'fossil resin',
  AncientRemains = 'ancient remains'
}

export const RESOURCE_COLORS: Record<ResourceType, number> = {
  [ResourceType.Wood]: 0xa66d3b,
  [ResourceType.Stone]: 0x9aa2aa,
  [ResourceType.Fiber]: 0x8fc45b,
  [ResourceType.Cactus]: 0x55aa5b,
  [ResourceType.Coal]: 0x48525d,
  [ResourceType.Iron]: 0xc48462,
  [ResourceType.Gold]: 0xe7bd4e,
  [ResourceType.Diamond]: 0x71dce0,
  [ResourceType.IronIngot]: 0xe39b7b,
  [ResourceType.GoldIngot]: 0xf1ca55,
  [ResourceType.AncientWood]: 0x79512f,
  [ResourceType.AmberSap]: 0xf6ad32,
  [ResourceType.GlowSpores]: 0xb6f68a,
  [ResourceType.VineFiber]: 0x58a66b,
  [ResourceType.Heartwood]: 0xbd6546,
  [ResourceType.DampCrystal]: 0x65d3e6,
  [ResourceType.MossFiber]: 0x6f934d,
  [ResourceType.SpringStone]: 0x75aaa6,
  [ResourceType.LuminousMushrooms]: 0xb77ee9,
  [ResourceType.MapFragments]: 0xd5c08c,
  [ResourceType.MechanicalParts]: 0x87959a,
  [ResourceType.LensGlass]: 0x91e6e8,
  [ResourceType.Starstone]: 0x6b70d8,
  [ResourceType.MeteorIron]: 0x925d52,
  [ResourceType.GlowingFragments]: 0xf46f63,
  [ResourceType.RuneStone]: 0x8377bb,
  [ResourceType.AncientFragments]: 0xba9975,
  [ResourceType.RelicMaterials]: 0xd3aa50,
  [ResourceType.BoneFragments]: 0xe2d8b8,
  [ResourceType.FossilResin]: 0xcf8738,
  [ResourceType.AncientRemains]: 0x9a8b77
};

export const RESOURCE_TYPES = [
  ResourceType.Wood,
  ResourceType.Stone,
  ResourceType.Fiber,
  ResourceType.Cactus,
  ResourceType.Coal,
  ResourceType.Iron,
  ResourceType.Gold,
  ResourceType.Diamond,
  ResourceType.IronIngot,
  ResourceType.GoldIngot,
  ResourceType.AncientWood,
  ResourceType.AmberSap,
  ResourceType.GlowSpores,
  ResourceType.VineFiber,
  ResourceType.Heartwood,
  ResourceType.DampCrystal,
  ResourceType.MossFiber,
  ResourceType.SpringStone,
  ResourceType.LuminousMushrooms,
  ResourceType.MapFragments,
  ResourceType.MechanicalParts,
  ResourceType.LensGlass,
  ResourceType.Starstone,
  ResourceType.MeteorIron,
  ResourceType.GlowingFragments,
  ResourceType.RuneStone,
  ResourceType.AncientFragments,
  ResourceType.RelicMaterials,
  ResourceType.BoneFragments,
  ResourceType.FossilResin,
  ResourceType.AncientRemains
] as const;

const RESOURCE_LABELS: Readonly<Record<ResourceType, string>> = {
  [ResourceType.Wood]: 'Wood',
  [ResourceType.Stone]: 'Stone',
  [ResourceType.Fiber]: 'Fiber',
  [ResourceType.Cactus]: 'Cactus',
  [ResourceType.Coal]: 'Coal',
  [ResourceType.Iron]: 'Iron',
  [ResourceType.Gold]: 'Gold',
  [ResourceType.Diamond]: 'Diamond',
  [ResourceType.IronIngot]: 'Iron Ingot',
  [ResourceType.GoldIngot]: 'Gold Ingot',
  [ResourceType.AncientWood]: 'Ancient Wood',
  [ResourceType.AmberSap]: 'Amber Sap',
  [ResourceType.GlowSpores]: 'Glow Spores',
  [ResourceType.VineFiber]: 'Vine Fiber',
  [ResourceType.Heartwood]: 'Heartwood',
  [ResourceType.DampCrystal]: 'Damp Crystal',
  [ResourceType.MossFiber]: 'Moss Fiber',
  [ResourceType.SpringStone]: 'Spring Stone',
  [ResourceType.LuminousMushrooms]: 'Luminous Mushrooms',
  [ResourceType.MapFragments]: 'Map Fragments',
  [ResourceType.MechanicalParts]: 'Mechanical Parts',
  [ResourceType.LensGlass]: 'Lens / Glass Materials',
  [ResourceType.Starstone]: 'Starstone',
  [ResourceType.MeteorIron]: 'Meteor Iron',
  [ResourceType.GlowingFragments]: 'Glowing Fragments',
  [ResourceType.RuneStone]: 'Rune Stone',
  [ResourceType.AncientFragments]: 'Ancient Fragments',
  [ResourceType.RelicMaterials]: 'Relic Materials',
  [ResourceType.BoneFragments]: 'Bone Fragments',
  [ResourceType.FossilResin]: 'Fossil Resin',
  [ResourceType.AncientRemains]: 'Ancient Remains'
};

export const resourceForFeature = (feature: TerrainFeatureType): ResourceType => {
  switch (feature) {
    case TerrainFeatureType.Tree:
      return ResourceType.Wood;
    case TerrainFeatureType.Cactus:
      // Cacti are harvested as tough plant fiber, matching the other fibrous world vegetation.
      // Keep the legacy Cactus inventory resource defined for existing saves and potion recipes.
      return ResourceType.Fiber;
    case TerrainFeatureType.Rock:
    case TerrainFeatureType.SnowyRock:
      return ResourceType.Stone;
    case TerrainFeatureType.Reeds:
    case TerrainFeatureType.WaterReeds:
    case TerrainFeatureType.Grass:
      return ResourceType.Fiber;
  }
};

export const resourceLabel = (resource: ResourceType): string => RESOURCE_LABELS[resource];

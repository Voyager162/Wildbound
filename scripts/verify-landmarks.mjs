import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const temporaryDirectory = await mkdtemp(path.join(scriptDirectory, '.landmark-verification-'));
const verificationEntryPath = path.join(temporaryDirectory, 'verify-landmarks-entry.ts');
const compiledDirectory = path.join(temporaryDirectory, 'compiled');
const compiledVerificationPath = path.join(
  compiledDirectory,
  path.relative(projectRoot, verificationEntryPath)
).replace(/\.ts$/, '.js');

// Compile the TypeScript generation modules into an isolated temporary Node entry point. This
// uses the project's existing TypeScript dependency, exercises the source that ships in the
// renderer, and works identically from PowerShell, cmd, and POSIX shells.
const verificationSource = String.raw`
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Biome } from '../../src/world/generation/biomeGenerator';
import {
  ANCIENT_TREE_FEATURE_REGROWTH_MAX_DAYS,
  ANCIENT_TREE_FEATURE_REGROWTH_MIN_DAYS,
  ANCIENT_TREE_FRUIT_COUNT,
  ancientTreeFeatureRegrowthDelayMs
} from '../../src/world/landmarks/ancientTreeConfig';
import {
  STONE_CIRCLE_RUNE_RESTORE_MIGRATION_VERSION,
  STONE_CIRCLE_RUNE_REGROWTH_MAX_DAYS,
  STONE_CIRCLE_RUNE_REGROWTH_MIN_DAYS,
  stoneCircleRuneRegrowthDelayMs
} from '../../src/world/landmarks/stoneCircleConfig';
import {
  LANDMARK_DEFINITIONS,
  LandmarkType,
  type ProceduralLandmark
} from '../../src/world/landmarkConfig';
import {
  landmarkAtTile,
  landmarksIntersectingTiles,
  nearestLandmarkToTile
} from '../../src/world/generation/landmarkGenerator';
import {
  createLandmarkSurfacePlan,
  ancientTreeOccludesWorldPoint,
  findNearestLandmarkCollisionFreeWorldPoint,
  findLandmarkEntrance,
  findLandmarkEntranceNearWorldPoint,
  landmarkEntranceVisualPosition,
  landmarkPlanBlocksFeatureTile,
  landmarkPlanBlocksGroundGrassTile,
  landmarkStructureContainsWorldPoint,
  stoneCircleOccludesWorldPoint,
  watchtowerOccludesWorldPoint,
  type LandmarkSurfacePlan
} from '../../src/world/landmarks/landmarkSurfaceGenerator';

import {
  LANDMARK_INTERIOR_THEMES,
  LANDMARK_INTERIOR_TYPES,
  generateLandmarkInterior,
  isLandmarkInteriorType,
  landmarkInteriorContainsPoint,
  landmarkInteriorContainsWorldPoint,
  landmarkInteriorWorldOrigin,
  landmarkInteriorWorldTilePosition,
  type LandmarkInteriorLayout
} from '../../src/world/landmarks/landmarkInteriorGenerator';
import { ResourceType } from '../../src/world/resources';
import { SessionWorldState } from '../../src/world/SessionWorldState';
import { SAVEABLE_LANDMARK_TYPES, isSaveGameData } from '../../src/save/SaveGameData';
import { WORLD_TILE_SIZE } from '../../src/world/worldConfig';
import { DAY_NIGHT_CYCLE_DURATION_MS } from '../../src/world/explorationConfig';

assert.ok(
  Number.isInteger(ANCIENT_TREE_FRUIT_COUNT) && ANCIENT_TREE_FRUIT_COUNT >= 0,
  'Ancient-tree fruit count tuning must be a non-negative integer'
);

const EXPECTED_LANDMARK_TYPES = [
  LandmarkType.GiantAncientTree,
  LandmarkType.Waterfall,
  LandmarkType.MeteorCrater,
  LandmarkType.StoneCircle,
  LandmarkType.GiantSkeleton,
  LandmarkType.Watchtower
] as const;

const EXPECTED_ENTERABLE_TYPES = [
  LandmarkType.GiantAncientTree,
  LandmarkType.Waterfall,
  LandmarkType.Watchtower
] as const;

const EXPECTED_SURFACE_MATERIALS = new Map<LandmarkType, readonly ResourceType[]>([
  [LandmarkType.MeteorCrater, [
    ResourceType.Starstone,
    ResourceType.MeteorIron,
    ResourceType.GlowingFragments
  ]],
  [LandmarkType.StoneCircle, [
    ResourceType.RuneStone,
    ResourceType.AncientFragments,
    ResourceType.RelicMaterials
  ]],
  [LandmarkType.GiantSkeleton, [
    ResourceType.BoneFragments,
    ResourceType.FossilResin,
    ResourceType.AncientRemains
  ]]
]);

const EXPECTED_INTERIOR_MATERIALS = new Map<LandmarkType, readonly ResourceType[]>([
  [LandmarkType.GiantAncientTree, [
    ResourceType.AncientWood,
    ResourceType.AmberSap,
    ResourceType.GlowSpores,
    ResourceType.VineFiber
  ]],
  [LandmarkType.Waterfall, [
    ResourceType.DampCrystal,
    ResourceType.MossFiber,
    ResourceType.SpringStone,
    ResourceType.LuminousMushrooms
  ]],
  [LandmarkType.Watchtower, [
    ResourceType.MapFragments,
    ResourceType.MechanicalParts,
    ResourceType.LensGlass
  ]]
]);

const sorted = <Value extends string>(values: Iterable<Value>): Value[] => [...values].sort();
const setValues = <Value extends string>(values: Iterable<Value>): Value[] => sorted(new Set(values));
const round = (value: number): number => Math.round(value * 10_000) / 10_000;

const assertExactValues = <Value extends string>(
  actual: Iterable<Value>,
  expected: readonly Value[],
  label: string
): void => {
  assert.deepEqual(setValues(actual), sorted(expected), label);
};

assert.deepEqual(Object.values(LandmarkType), EXPECTED_LANDMARK_TYPES, 'LandmarkType must contain exactly six supported types');
assert.deepEqual(
  LANDMARK_DEFINITIONS.map((definition) => definition.type),
  EXPECTED_LANDMARK_TYPES,
  'Landmark definitions must contain each supported type once and no legacy extras'
);
assert.equal(new Set(LANDMARK_DEFINITIONS.map((definition) => definition.type)).size, 6, 'Landmark definitions must be unique');
assert.deepEqual(LANDMARK_INTERIOR_TYPES, EXPECTED_ENTERABLE_TYPES, 'Only tree, waterfall, and watchtower may be enterable');
assert.deepEqual(SAVEABLE_LANDMARK_TYPES, EXPECTED_ENTERABLE_TYPES, 'Only enterable landmarks may be saved as an active interior');
EXPECTED_LANDMARK_TYPES.forEach((type) => {
  assert.equal(isLandmarkInteriorType(type), EXPECTED_ENTERABLE_TYPES.includes(type as never), 'Interior type guard disagrees with the enterable set');
});

const biomeForType = (type: LandmarkType): Biome => {
  switch (type) {
    case LandmarkType.GiantAncientTree: return Biome.Forest;
    case LandmarkType.Waterfall: return Biome.Mountains;
    case LandmarkType.MeteorCrater: return Biome.Desert;
    case LandmarkType.StoneCircle: return Biome.Plains;
    case LandmarkType.GiantSkeleton: return Biome.Hills;
    case LandmarkType.Watchtower: return Biome.Snow;
  }
};

const fixtureFor = (type: LandmarkType, identity = 'primary'): ProceduralLandmark => {
  const index = EXPECTED_LANDMARK_TYPES.indexOf(type);
  const definition = LANDMARK_DEFINITIONS[index];
  const centerTileX = 12_000 + index * 137;
  const centerTileY = -9_000 + index * 113;
  return {
    id: 'verification:' + identity + ':' + type + ':' + centerTileX + ':' + centerTileY,
    type,
    label: definition.label,
    biome: biomeForType(type),
    centerTileX,
    centerTileY,
    footprintRadiusTiles: definition.footprintRadiusTiles,
    visualRadiusTiles: definition.visualRadiusTiles,
    reservationRadiusTiles: definition.footprintRadiusTiles + definition.reservationPaddingTiles,
    rotation: 0.19 + index * 0.43,
    variation: 0.17 + index * 0.11,
    mapColor: definition.mapColor
  };
};

const surfaceSignature = (plan: LandmarkSurfacePlan): unknown => ({
  components: plan.components.map((component) => ({
    role: component.role,
    shape: component.shape,
    height: round(component.height),
    lean: round(component.lean),
    rotation: round(component.rotation),
    scale: round(component.scale),
    variant: round(component.variant)
  })),
  details: plan.groundDetails.map((detail) => ({
    kind: detail.kind,
    x: round(detail.x),
    y: round(detail.y),
    length: round(detail.length),
    width: round(detail.width),
    rotation: round(detail.rotation),
    variant: round(detail.variant)
  })),
  entrance: plan.entrance && {
    tileX: plan.entrance.tileX,
    tileY: plan.entrance.tileY,
    facingAngle: round(plan.entrance.facingAngle)
  },
  materials: plan.materials.map((material) => ({
    resource: material.resource,
    tileX: material.tileX,
    tileY: material.tileY,
    scale: round(material.scale),
    rotation: round(material.rotation),
    style: material.style,
    yieldAmount: material.yieldAmount,
    variant: round(material.variant)
  }))
});

const generationStartedAt = performance.now();
const generationSeed = 'landmark-verification-world';
const generationBounds = [-4_608, -4_608, 4_608, 4_608] as const;
const generatedLandmarks = landmarksIntersectingTiles(generationSeed, ...generationBounds);
const firstGenerationMs = performance.now() - generationStartedAt;
assert.ok(generatedLandmarks.length > 0, 'World landmark scan must produce landmarks');
const generatedSampleByType = new Map<LandmarkType, ProceduralLandmark>();
generatedLandmarks.forEach((landmark) => {
  if (!generatedSampleByType.has(landmark.type)) {
    generatedSampleByType.set(landmark.type, landmark);
  }
});
assertExactValues(generatedSampleByType.keys(), EXPECTED_LANDMARK_TYPES, 'Verification scan must find a visual sample of every landmark type');
assert.deepEqual(
  landmarksIntersectingTiles(generationSeed, ...generationBounds),
  generatedLandmarks,
  'Repeated world generation must be byte-for-byte deterministic'
);
assert.deepEqual(
  landmarksIntersectingTiles(
    generationSeed,
    generationBounds[2],
    generationBounds[3],
    generationBounds[0],
    generationBounds[1]
  ),
  generatedLandmarks,
  'Reversed bounds and cache access order must not change landmark generation'
);
generatedLandmarks.slice().reverse().forEach((landmark) => {
  assert.equal(
    landmarkAtTile(generationSeed, landmark.centerTileX, landmark.centerTileY)?.id,
    landmark.id,
    'Center lookup must remain stable regardless of lookup order'
  );
  const nearestAtCenter = nearestLandmarkToTile(generationSeed, landmark.centerTileX, landmark.centerTileY);
  assert.equal(nearestAtCenter?.landmark.id, landmark.id, 'F3 nearest-landmark lookup must identify a landmark at its center');
  assert.equal(nearestAtCenter?.edgeDistanceTiles, 0, 'F3 nearest-landmark distance must be zero inside its footprint');
});
const bruteForceNearestAtOrigin = generatedLandmarks.reduce((nearest, landmark) => {
  const centerDistance = Math.hypot(landmark.centerTileX, landmark.centerTileY);
  const edgeDistance = Math.max(0, centerDistance - landmark.footprintRadiusTiles);
  return !nearest || edgeDistance < nearest.edgeDistance
    ? { landmark, edgeDistance }
    : nearest;
}, null as { landmark: ProceduralLandmark; edgeDistance: number } | null);
const generatedNearestAtOrigin = nearestLandmarkToTile(generationSeed, 0, 0);
assert.equal(
  generatedNearestAtOrigin?.landmark.id,
  bruteForceNearestAtOrigin?.landmark.id,
  'F3 nearest-landmark lookup must match a wide brute-force world scan'
);
assert.ok(
  Math.abs((generatedNearestAtOrigin?.edgeDistanceTiles ?? -1) - (bruteForceNearestAtOrigin?.edgeDistance ?? -2)) < 1e-9,
  'F3 nearest-landmark distance must match the physical footprint edge distance'
);
assert.deepEqual(
  landmarksIntersectingTiles(generationSeed, ...generationBounds),
  generatedLandmarks,
  'Out-of-order center lookups must not mutate generated output'
);
const alternateWorldLandmarks = landmarksIntersectingTiles('landmark-verification-world-alternate', ...generationBounds);
assert.notDeepEqual(alternateWorldLandmarks, generatedLandmarks, 'Different world seeds must generate different landmarks');
assert.ok(firstGenerationMs < 8_000, 'Initial landmark world scan exceeded the 8 second verification budget');

const surfaceStartedAt = performance.now();
const fixtures = EXPECTED_LANDMARK_TYPES.map((type) => fixtureFor(type));
const plans = fixtures.map((landmark) => createLandmarkSurfacePlan('surface-verification-seed', landmark));
const reversePlans = fixtures.slice().reverse().map((landmark) => createLandmarkSurfacePlan('surface-verification-seed', landmark));
plans.forEach((plan) => {
  const regenerated = reversePlans.find((candidate) => candidate.landmark.id === plan.landmark.id);
  assert.deepEqual(regenerated, plan, 'Surface plans must not depend on generation order');
});

const allSurfaceMaterialIds = new Set<string>();
let entranceCount = 0;
plans.forEach((plan) => {
  const shouldEnter = EXPECTED_ENTERABLE_TYPES.includes(plan.landmark.type as never);
  const entrance = findLandmarkEntrance(plan);
  assert.equal(Boolean(entrance), shouldEnter, plan.landmark.type + ' entrance availability is incorrect');
  if (entrance) {
    entranceCount += 1;
    assert.equal(
      findLandmarkEntranceNearWorldPoint(plan, entrance.worldX, entrance.worldY, entrance.interactionRadiusPixels)?.id,
      entrance.id,
      'An entrance must be discoverable at its interaction point'
    );
    assert.equal(
      findLandmarkEntranceNearWorldPoint(plan, entrance.worldX + entrance.interactionRadiusPixels * 4, entrance.worldY, entrance.interactionRadiusPixels),
      null,
      'An entrance must not activate from far away'
    );
  }

  if (shouldEnter) {
    assert.equal(plan.materials.length, 0, plan.landmark.type + ' rare materials belong inside its interior');
  } else {
    const expected = EXPECTED_SURFACE_MATERIALS.get(plan.landmark.type);
    assert.ok(expected, 'Non-enterable landmark is missing a material contract');
    assertExactValues(plan.materials.map((material) => material.resource), expected, plan.landmark.type + ' surface materials are incorrect');
  }

  plan.materials.forEach((material) => {
    assert.ok(!allSurfaceMaterialIds.has(material.id), 'Surface material IDs must be globally unique');
    allSurfaceMaterialIds.add(material.id);
    assert.ok(Number.isFinite(material.worldX) && Number.isFinite(material.worldY), 'Surface material coordinates must be finite');
    assert.ok(material.yieldAmount >= 1 && material.yieldAmount <= 3, 'Surface material yield is outside its authored range');
    const isCentralStoneCircleRune = plan.landmark.type === LandmarkType.StoneCircle
      && material.resource === ResourceType.RuneStone
      && material.style === 'rune-slab';
    assert.equal(
      landmarkStructureContainsWorldPoint(
        plan,
        material.worldX,
        material.worldY,
        Math.min(32, material.clearanceRadiusPixels)
      ),
      isCentralStoneCircleRune,
      material.id + ' clearance does not match its authored structural host'
    );
  });
});
assert.equal(entranceCount, 3, 'Exactly three landmark surface plans must expose entrances');

const ancientTreePlan = plans.find((plan) => plan.landmark.type === LandmarkType.GiantAncientTree)!;
const ancientTreeEntrance = ancientTreePlan.entrance!;
const ancientTreeEntranceVisual = landmarkEntranceVisualPosition(ancientTreeEntrance);
const ancientTreeCenterWorldX = (ancientTreePlan.landmark.centerTileX + 0.5) * WORLD_TILE_SIZE;
const ancientTreeCenterWorldY = (ancientTreePlan.landmark.centerTileY + 0.5) * WORLD_TILE_SIZE;
assert.ok(
  Math.abs(ancientTreeEntrance.worldX - ancientTreeCenterWorldX) < 0.001
    && ancientTreeEntrance.worldY > ancientTreeCenterWorldY,
  'The ancient-tree door must remain centered on the visible southern trunk face'
);
assert.ok(
  ancientTreeEntranceVisual.worldY < ancientTreeEntrance.worldY,
  'The ancient-tree entrance marker must be raised from the ground interaction point onto the carved door'
);
plans
  .filter((plan) => plan.entrance && plan.landmark.type === LandmarkType.Waterfall)
  .forEach((plan) => {
    const entrance = plan.entrance!;
    assert.deepEqual(
      landmarkEntranceVisualPosition(entrance),
      { worldX: entrance.worldX, worldY: entrance.worldY },
      plan.landmark.type + ' entrance marker must remain on its authored entrance position'
    );
  });
const watchtowerPlan = plans.find((plan) => plan.landmark.type === LandmarkType.Watchtower)!;
const watchtowerEntrance = watchtowerPlan.entrance!;
const watchtowerEntranceVisual = landmarkEntranceVisualPosition(watchtowerEntrance);
assert.ok(
  Math.abs(watchtowerEntranceVisual.worldX - watchtowerEntrance.worldX) < 0.001
    && watchtowerEntranceVisual.worldY < watchtowerEntrance.worldY,
  'The watchtower entrance marker must sit on the visible arched door instead of its ground interaction point'
);
assert.ok(
  Math.abs(watchtowerEntrance.facingAngle - Math.PI / 2) < 0.001,
  'The watchtower doorway must face world south regardless of landmark rotation'
);
assert.ok(
  Math.abs(ancientTreeEntrance.facingAngle - Math.PI / 2) < 0.001,
  'The ancient-tree doorway must face world south regardless of landmark rotation'
);
assert.ok(
  ancientTreeEntrance.interactionRadiusPixels >= 150,
  'The ancient-tree interaction reach must account for its oversized circular door'
);
assert.ok(
  ancientTreePlan.components.filter((component) => component.role === 'ancient-root').length >= 8,
  'Ancient trees must retain a substantial deterministic buttress-root network while leaving the door lane open'
);
assert.equal(
  ancientTreePlan.structuralShapes.length,
  2,
  'Only the compact split trunk core may block movement around an ancient tree'
);
assert.ok(
  ancientTreePlan.structuralShapes.every((shape) => shape.kind === 'oriented-box'),
  'Ancient-tree roots and canopy must remain visual rather than invisible movement barriers'
);
const ancientTreeRadius = ancientTreePlan.landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
assert.equal(
  landmarkStructureContainsWorldPoint(
    ancientTreePlan,
    ancientTreeCenterWorldX,
    ancientTreeCenterWorldY - ancientTreeRadius * 0.48,
    23
  ),
  false,
  'The walkable area behind an ancient-tree trunk must not contain an invisible barrier'
);
assert.equal(
  ancientTreeOccludesWorldPoint(
    ancientTreePlan.landmark,
    ancientTreePlan.entrance!.worldX,
    ancientTreePlan.entrance!.worldY
  ),
  false,
  'The ancient-tree doorway must render in front of the tree without hiding the player'
);
assert.equal(
  ancientTreeOccludesWorldPoint(
    ancientTreePlan.landmark,
    ancientTreeCenterWorldX,
    ancientTreeCenterWorldY - ancientTreeRadius * 0.55
  ),
  true,
  'The ancient-tree trunk must hide a player walking behind it'
);
assert.equal(
  ancientTreeOccludesWorldPoint(
    ancientTreePlan.landmark,
    ancientTreeCenterWorldX + ancientTreeRadius * 0.9,
    ancientTreeCenterWorldY - ancientTreeRadius * 0.55
  ),
  false,
  'The ancient-tree occlusion must end when the player clears the crown horizontally'
);
for (let offsetY = -1.35; offsetY <= 0.55; offsetY += 0.19) {
  for (let offsetX = -0.7; offsetX <= 0.7; offsetX += 0.2) {
    const normalizedX = offsetX / 0.84;
    const normalizedY = (offsetY + 0.34) / 1.18;
    if (normalizedX * normalizedX + normalizedY * normalizedY > 0.82) continue;
    const tileX = Math.floor(ancientTreeCenterWorldX / WORLD_TILE_SIZE + offsetX * ancientTreePlan.landmark.footprintRadiusTiles);
    const tileY = Math.floor(ancientTreeCenterWorldY / WORLD_TILE_SIZE + offsetY * ancientTreePlan.landmark.footprintRadiusTiles);
    assert.equal(
      landmarkPlanBlocksFeatureTile(ancientTreePlan, tileX, tileY),
      true,
      'Ancient-tree occlusion footprint must suppress hidden terrain features'
    );
  }
}

const watchtowerWalls = watchtowerPlan.components.filter((component) => component.role === 'tower-foundation');
const watchtowerButtresses = watchtowerPlan.components.filter((component) => component.role === 'tower-leg');
const watchtowerDoors = watchtowerPlan.components.filter((component) => component.role === 'tower-door');
assert.equal(watchtowerWalls.length, 5, 'Watchtowers must use a solid U-shaped masonry wall plan with a doorway gap');
assert.equal(watchtowerButtresses.length, 4, 'Watchtowers must retain four seeded corner buttresses');
assert.equal(watchtowerDoors.length, 1, 'Watchtowers must expose one closed structural door');
assert.equal(
  watchtowerPlan.components.filter((component) => component.role === 'tower-platform').length,
  1,
  'Watchtowers must expose one integrated battlement crown'
);
assert.ok(
  watchtowerWalls.every((component) => component.shape.kind === 'oriented-box'),
  'Watchtower masonry walls must use clean connected oriented boxes'
);
const watchtowerRadius = watchtowerPlan.landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
assert.ok(
  watchtowerWalls.every((component) => (
    component.height >= watchtowerRadius * 1.16 && component.height <= watchtowerRadius * 1.32
  )),
  'Watchtower masonry must retain its tall seeded defensive-tower proportions'
);
assert.equal(
  landmarkStructureContainsWorldPoint(
    watchtowerPlan,
    watchtowerEntrance.worldX,
    watchtowerEntrance.worldY,
    WORLD_TILE_SIZE * 0.06
  ),
  false,
  'The watchtower exterior interaction point must remain outside the closed door collision'
);
const watchtowerCenterX = (watchtowerPlan.landmark.centerTileX + 0.5) * WORLD_TILE_SIZE;
const watchtowerCenterY = (watchtowerPlan.landmark.centerTileY + 0.5) * WORLD_TILE_SIZE;
const watchtowerDoor = watchtowerDoors[0]!;
assert.equal(watchtowerDoor.shape.kind, 'oriented-box');
const watchtowerDoorCenterX = watchtowerCenterX
  + watchtowerDoor.shape.x * Math.cos(watchtowerPlan.landmark.rotation)
  - watchtowerDoor.shape.y * Math.sin(watchtowerPlan.landmark.rotation);
const watchtowerDoorCenterY = watchtowerCenterY
  + watchtowerDoor.shape.x * Math.sin(watchtowerPlan.landmark.rotation)
  + watchtowerDoor.shape.y * Math.cos(watchtowerPlan.landmark.rotation);
assert.equal(
  landmarkStructureContainsWorldPoint(watchtowerPlan, watchtowerDoorCenterX, watchtowerDoorCenterY),
  true,
  'The closed watchtower door must stop normal player movement through the entrance'
);
assert.equal(
  watchtowerOccludesWorldPoint(watchtowerPlan, watchtowerCenterX, watchtowerCenterY),
  true,
  'A player crossing behind the watchtower masonry must be occluded'
);
assert.equal(
  watchtowerOccludesWorldPoint(watchtowerPlan, watchtowerEntrance.worldX, watchtowerEntrance.worldY),
  false,
  'A player standing at the watchtower door must remain visible in front'
);
const watchtowerWallBoxes = watchtowerWalls.map((component) => {
  assert.equal(component.shape.kind, 'oriented-box');
  const rotation = component.shape.rotation + watchtowerPlan.landmark.rotation;
  const centerX = watchtowerCenterX
    + component.shape.x * Math.cos(watchtowerPlan.landmark.rotation)
    - component.shape.y * Math.sin(watchtowerPlan.landmark.rotation);
  const screenWidth = Math.abs(Math.cos(rotation)) * component.shape.width
    + Math.abs(Math.sin(rotation)) * component.shape.height;
  const screenDepth = Math.abs(Math.sin(rotation)) * component.shape.width
    + Math.abs(Math.cos(rotation)) * component.shape.height;
  return { centerX, screenWidth, screenDepth };
});
const watchtowerRightEdge = Math.max(...watchtowerWallBoxes.map((wall) => wall.centerX + wall.screenWidth * 0.5));
const watchtowerBodyDepth = Math.max(...watchtowerWallBoxes.map((wall) => wall.screenDepth));
assert.equal(
  watchtowerOccludesWorldPoint(
    watchtowerPlan,
    watchtowerRightEdge + watchtowerBodyDepth * 0.07,
    watchtowerCenterY
  ),
  true,
  'The watchtower east return must begin occluding before a right-side approach reaches the front facade'
);
assert.equal(
  watchtowerOccludesWorldPoint(
    watchtowerPlan,
    watchtowerCenterX + watchtowerPlan.landmark.footprintRadiusTiles * WORLD_TILE_SIZE,
    watchtowerCenterY
  ),
  false,
  'Watchtower occlusion must end beyond the masonry silhouette'
);

const stonePlan = plans.find((plan) => plan.landmark.type === LandmarkType.StoneCircle)!;
const stoneCenterWorldX = (stonePlan.landmark.centerTileX + 0.5) * WORLD_TILE_SIZE;
const stoneCenterWorldY = (stonePlan.landmark.centerTileY + 0.5) * WORLD_TILE_SIZE;
assert.equal(
  landmarkStructureContainsWorldPoint(stonePlan, stoneCenterWorldX, stoneCenterWorldY),
  true,
  'The stone-circle center must contain the ancient rune altar'
);
assert.equal(
  landmarkPlanBlocksFeatureTile(stonePlan, stonePlan.landmark.centerTileX, stonePlan.landmark.centerTileY),
  true,
  'The rune altar must keep ordinary harvestable features out of its center'
);
const stoneBlocks = stonePlan.components.filter((component) => component.role === 'stone-block');
assert.ok(
  stoneBlocks.length >= 10 && stoneBlocks.length <= 12,
  'Stone circles must use a substantial ring with slightly fewer monoliths'
);
assert.ok(stoneBlocks.every((component) => component.shape.kind === 'oriented-box'), 'Stone-circle stones must be protruding square blocks');
const occlusionStone = stoneBlocks[0]!;
assert.equal(occlusionStone.shape.kind, 'oriented-box');
const occlusionRotation = occlusionStone.shape.rotation + stonePlan.landmark.rotation;
const occlusionCenterOffsetX = occlusionStone.shape.x * Math.cos(stonePlan.landmark.rotation)
  - occlusionStone.shape.y * Math.sin(stonePlan.landmark.rotation);
const occlusionCenterOffsetY = occlusionStone.shape.x * Math.sin(stonePlan.landmark.rotation)
  + occlusionStone.shape.y * Math.cos(stonePlan.landmark.rotation);
const occlusionCenterX = stoneCenterWorldX + occlusionCenterOffsetX;
const occlusionCenterY = stoneCenterWorldY + occlusionCenterOffsetY;
const occlusionScreenDepth = Math.abs(Math.sin(occlusionRotation)) * occlusionStone.shape.width
  + Math.abs(Math.cos(occlusionRotation)) * occlusionStone.shape.height;
const occlusionGroundLineY = occlusionCenterY + occlusionScreenDepth * 0.13;
assert.equal(
  stoneCircleOccludesWorldPoint(stonePlan, occlusionCenterX, occlusionGroundLineY - WORLD_TILE_SIZE * 0.12),
  true,
  'A player overlapping the back of a stone-circle pillar must be occluded'
);
assert.equal(
  stoneCircleOccludesWorldPoint(stonePlan, occlusionCenterX, occlusionGroundLineY + WORLD_TILE_SIZE * 0.18),
  false,
  'A player standing in front of a stone-circle pillar must remain visible'
);
assert.ok(
  stoneBlocks.every((component) => component.height <= stonePlan.landmark.footprintRadiusTiles * WORLD_TILE_SIZE * 0.3),
  'Stone-circle monoliths must remain broad and moderately tall instead of needle-like'
);
for (let firstIndex = 0; firstIndex < stoneBlocks.length; firstIndex += 1) {
  const first = stoneBlocks[firstIndex]!;
  assert.equal(first.shape.kind, 'oriented-box');
  assert.ok(Math.abs(first.lean) <= 0.013, 'Stone-circle monolith lean must remain clean and restrained');
  const rotatedStoneX = first.shape.x * Math.cos(stonePlan.landmark.rotation)
    - first.shape.y * Math.sin(stonePlan.landmark.rotation);
  const rotatedStoneY = first.shape.x * Math.sin(stonePlan.landmark.rotation)
    + first.shape.y * Math.cos(stonePlan.landmark.rotation);
  assert.equal(
    landmarkPlanBlocksFeatureTile(
      stonePlan,
      Math.floor((stoneCenterWorldX + rotatedStoneX) / WORLD_TILE_SIZE),
      Math.floor((stoneCenterWorldY + rotatedStoneY) / WORLD_TILE_SIZE)
    ),
    true,
    'Every monolith must suppress overlapping terrain features'
  );
  for (let secondIndex = firstIndex + 1; secondIndex < stoneBlocks.length; secondIndex += 1) {
    const second = stoneBlocks[secondIndex]!;
    assert.equal(second.shape.kind, 'oriented-box');
    const separation = Math.hypot(first.shape.x - second.shape.x, first.shape.y - second.shape.y);
    const firstRadius: number = Math.hypot(first.shape.width, first.shape.height) * 0.5;
    const secondRadius: number = Math.hypot(second.shape.width, second.shape.height) * 0.5;
    assert.ok(
      separation > firstRadius + secondRadius + WORLD_TILE_SIZE * 0.4,
      'Stone-circle monolith footprints must not overlap'
    );
  }
}
assert.ok(
  new Set(stoneBlocks.map((component) => {
    const shape = component.shape;
    assert.equal(shape.kind, 'oriented-box');
    return [round(shape.width), round(shape.height), round(shape.rotation), round(component.height), round(component.lean)].join(':');
  })).size >= Math.ceil(stoneBlocks.length * 0.7),
  'Stone-circle blocks must vary in dimensions, angle, height, and lean'
);
let openLayerGrassTileFound = false;
const stoneRadiusTiles = stonePlan.landmark.footprintRadiusTiles;
for (let tileY = Math.floor(stonePlan.landmark.centerTileY - stoneRadiusTiles * 0.45);
  tileY <= Math.ceil(stonePlan.landmark.centerTileY + stoneRadiusTiles * 0.45) && !openLayerGrassTileFound;
  tileY += 1) {
  for (let tileX = Math.floor(stonePlan.landmark.centerTileX - stoneRadiusTiles * 0.58);
    tileX <= Math.ceil(stonePlan.landmark.centerTileX + stoneRadiusTiles * 0.58);
    tileX += 1) {
    if (landmarkPlanBlocksFeatureTile(stonePlan, tileX, tileY)
      && !landmarkPlanBlocksGroundGrassTile(stonePlan, tileX, tileY)) {
      openLayerGrassTileFound = true;
      break;
    }
  }
}
assert.equal(
  openLayerGrassTileFound,
  true,
  'Open ground inside the ring must keep harvestable features out while allowing biome layer grass'
);
const runeAltars = stonePlan.components.filter((component) => component.role === 'rune-altar');
assert.equal(runeAltars.length, 1, 'A stone circle must have exactly one central ancient altar');
const centralRunes = stonePlan.materials.filter((material) => material.resource === ResourceType.RuneStone);
assert.equal(centralRunes.length, 1, 'A stone circle must have exactly one takeable central rune');
const centralRune = centralRunes[0]!;
assert.equal(centralRune.style, 'rune-slab');
assert.equal(centralRune.yieldAmount, 1, 'Taking the altar rune must yield exactly one item');
assert.ok(centralRune.glowStrength >= 0.9, 'The central rune must have a strong purple glow');
assert.ok(Math.abs(centralRune.worldX - stoneCenterWorldX) < 0.001, 'The takeable rune must be centered on its altar');
assert.ok(
  centralRune.worldY < stoneCenterWorldY
    && centralRune.worldY > stoneCenterWorldY - stonePlan.landmark.footprintRadiusTiles * WORLD_TILE_SIZE * 0.15,
  'The takeable rune must sit on the raised top face of its altar'
);
stonePlan.materials.filter((material) => material.resource !== ResourceType.RuneStone).forEach((material) => {
  const offsetX = material.worldX - stoneCenterWorldX;
  const offsetY = material.worldY - stoneCenterWorldY;
  const localX = offsetX * Math.cos(-stonePlan.landmark.rotation) - offsetY * Math.sin(-stonePlan.landmark.rotation);
  const localY = offsetX * Math.sin(-stonePlan.landmark.rotation) + offsetY * Math.cos(-stonePlan.landmark.rotation);
  const radius = stonePlan.landmark.footprintRadiusTiles * WORLD_TILE_SIZE;
  assert.ok(
    (localX / (radius * 0.86)) ** 2 + (localY / (radius * 0.64)) ** 2 > 1,
    'Only the purple rune may generate inside the stone circle'
  );
});
const pushedFromAltar = findNearestLandmarkCollisionFreeWorldPoint(
  [stonePlan],
  stoneCenterWorldX,
  stoneCenterWorldY,
  23
);
assert.ok(pushedFromAltar, 'A player loaded inside the rune altar must have a recovery point');
assert.equal(
  landmarkStructureContainsWorldPoint(stonePlan, pushedFromAltar.worldX, pushedFromAltar.worldY, 23),
  false,
  'The recovered player point must be outside solid landmark collision'
);
assert.deepEqual(
  findNearestLandmarkCollisionFreeWorldPoint([stonePlan], stoneCenterWorldX, stoneCenterWorldY, 23),
  pushedFromAltar,
  'Landmark collision recovery must be deterministic'
);
const alternateStonePlan = createLandmarkSurfacePlan('surface-verification-seed-alternate', fixtureFor(LandmarkType.StoneCircle));
assert.notDeepEqual(surfaceSignature(alternateStonePlan), surfaceSignature(stonePlan), 'Stone-circle geometry must vary with the seed');
for (let index = 0; index < 64; index += 1) {
  const stressLandmark = fixtureFor(LandmarkType.StoneCircle, 'center-stress-' + index);
  const stressPlan = createLandmarkSurfacePlan('stone-center-stress-seed-' + index, stressLandmark);
  const centerX = (stressLandmark.centerTileX + 0.5) * WORLD_TILE_SIZE;
  const centerY = (stressLandmark.centerTileY + 0.5) * WORLD_TILE_SIZE;
  assert.equal(
    landmarkStructureContainsWorldPoint(stressPlan, centerX, centerY),
    true,
    'Stone-circle stress sample ' + index + ' is missing its central altar'
  );
  assert.equal(
    landmarkPlanBlocksFeatureTile(stressPlan, stressLandmark.centerTileX, stressLandmark.centerTileY),
    true,
    'Stone-circle stress sample ' + index + ' does not protect its central altar'
  );
}

fixtures.forEach((landmark) => {
  const first = createLandmarkSurfacePlan('surface-repeatability', landmark);
  const second = createLandmarkSurfacePlan('surface-repeatability', landmark);
  assert.deepEqual(second, first, landmark.type + ' surface generation must be deterministic');
  const alternateIdentity = createLandmarkSurfacePlan('surface-repeatability', fixtureFor(landmark.type, 'alternate-id'));
  assert.notDeepEqual(surfaceSignature(alternateIdentity), surfaceSignature(first), landmark.type + ' surface layout must vary by landmark ID');
});
const surfaceGenerationMs = performance.now() - surfaceStartedAt;
assert.ok(surfaceGenerationMs < 3_000, 'Surface-plan verification exceeded the 3 second budget');

const reachableFloorKeys = (layout: LandmarkInteriorLayout): Set<string> => {
  const key = (tileX: number, tileY: number): string => tileX + ',' + tileY;
  const start = { tileX: layout.spawnTileX, tileY: layout.spawnTileY };
  const pending = [start];
  const visited = new Set<string>([key(start.tileX, start.tileY)]);
  while (pending.length > 0) {
    const current = pending.shift()!;
    const neighbors = [
      [current.tileX + 1, current.tileY],
      [current.tileX - 1, current.tileY],
      [current.tileX, current.tileY + 1],
      [current.tileX, current.tileY - 1]
    ] as const;
    neighbors.forEach(([tileX, tileY]) => {
      if (!layout.floorTiles[tileY]?.[tileX]) {
        return;
      }
      const neighborKey = key(tileX, tileY);
      if (!visited.has(neighborKey)) {
        visited.add(neighborKey);
        pending.push({ tileX, tileY });
      }
    });
  }
  return visited;
};

const interiorSignature = (layout: LandmarkInteriorLayout): unknown => ({
  width: layout.width,
  height: layout.height,
  floorNumber: layout.floorNumber,
  spawn: [layout.spawnTileX, layout.spawnTileY],
  exit: layout.exit ? [layout.exit.tileX, layout.exit.tileY, layout.exit.facing] : null,
  stairs: layout.stairs,
  terrain: layout.terrain,
  materialNodes: layout.materialNodes.map((node) => ({
    resource: node.resource,
    tileX: node.tileX,
    tileY: node.tileY,
    scale: round(node.scale),
    rotation: round(node.rotation),
    style: node.style,
    variant: node.variant,
    yieldAmount: node.yieldAmount
  })),
  decorations: layout.decorations.map((decoration) => ({
    kind: decoration.kind,
    tileX: decoration.tileX,
    tileY: decoration.tileY,
    scale: round(decoration.scale),
    rotation: round(decoration.rotation),
    variant: decoration.variant,
    layer: decoration.layer
  }))
});

const interiorStartedAt = performance.now();
const allInteriorMaterialIds = new Set<string>();
EXPECTED_ENTERABLE_TYPES.forEach((type) => {
  const landmark = fixtureFor(type);
  const first = generateLandmarkInterior('interior-verification-seed', landmark);
  const second = generateLandmarkInterior('interior-verification-seed', landmark);
  assert.deepEqual(second, first, type + ' interior must regenerate identically');
  const layouts = type === LandmarkType.Watchtower
    ? [first, generateLandmarkInterior('interior-verification-seed', landmark, 2), generateLandmarkInterior('interior-verification-seed', landmark, 3)]
    : [first];
  layouts.forEach((layout) => {
    assert.deepEqual(
      generateLandmarkInterior('interior-verification-seed', landmark, layout.floorNumber),
      layout,
      type + ' floor ' + layout.floorNumber + ' must regenerate identically'
    );
  });
  assert.equal(first.landmarkType, type);
  assert.equal(first.themeId, LANDMARK_INTERIOR_THEMES[type].id);
  assertExactValues(
    layouts.flatMap((layout) => layout.materialNodes.map((material) => material.resource)),
    EXPECTED_INTERIOR_MATERIALS.get(type)!,
    type + ' interior materials are incorrect'
  );
  assertExactValues(
    LANDMARK_INTERIOR_THEMES[type].materialResources,
    EXPECTED_INTERIOR_MATERIALS.get(type)!,
    type + ' theme material contract is incorrect'
  );
  layouts.forEach((layout) => {
    assert.ok(layout.decorations.length >= 20, type + ' interior floor must include dense environmental decoration');
  });
  if (type === LandmarkType.GiantAncientTree) {
    assert.equal(first.terrain.rooms.length, 1, 'Ancient tree interior must be a single room');
    assert.equal(first.terrain.passages.length, 0, 'Ancient tree interior must not generate corridors');
    assert.ok(first.decorations.length >= 52, 'Ancient tree sanctuary must have dense organic detail');
    assert.ok(
      first.decorations.filter((decoration) => decoration.kind === 'moss-carpet').length >= 10,
      'Ancient tree sanctuary must have moss distributed around the room'
    );
    assert.ok(
      first.decorations.filter((decoration) => decoration.kind === 'glowing-berry-cluster').length >= 8,
      'Ancient tree sanctuary must have glowing berry clusters around the room'
    );
    assert.ok(
      first.materialNodes.every((material) => material.resource !== ResourceType.Heartwood),
      'Heartwood must not generate in the ancient tree interior'
    );
  }
  layouts.forEach((layout) => {
    assert.ok(layout.floorTiles[layout.spawnTileY]?.[layout.spawnTileX], type + ' spawn must be on a floor tile');
    assert.ok(landmarkInteriorContainsPoint(layout, layout.spawnTileX + 0.5, layout.spawnTileY + 0.5), type + ' spawn is outside terrain');
    const reachable = reachableFloorKeys(layout);
    if (layout.exit) {
      assert.ok(layout.floorTiles[layout.exit.tileY]?.[layout.exit.tileX], type + ' exit must be on a floor tile');
      assert.ok(landmarkInteriorContainsPoint(layout, layout.exit.tileX + 0.5, layout.exit.tileY + 0.5), type + ' exit is outside terrain');
      assert.ok(reachable.has(layout.exit.tileX + ',' + layout.exit.tileY), type + ' exit must be reachable from spawn');
    }
    layout.stairs.forEach((stair) => {
      assert.ok(reachable.has(stair.tileX + ',' + stair.tileY), stair.id + ' must be reachable from spawn');
      assert.ok(landmarkInteriorContainsPoint(layout, stair.tileX + 0.5, stair.tileY + 0.5, -0.45), stair.id + ' is outside navigable terrain');
    });
    layout.materialNodes.forEach((material) => {
      assert.ok(!allInteriorMaterialIds.has(material.id), 'Interior material IDs must be globally unique');
      allInteriorMaterialIds.add(material.id);
      assert.ok(landmarkInteriorContainsPoint(layout, material.tileX + 0.5, material.tileY + 0.5, -0.45), material.id + ' is outside navigable terrain');
      assert.ok(reachable.has(material.tileX + ',' + material.tileY), material.id + ' is not reachable from spawn');
    });
  });

  if (type === LandmarkType.Watchtower) {
    assert.deepEqual(layouts.map((layout) => layout.floorNumber), [1, 2, 3], 'Watchtower must generate exactly three floors');
    assert.ok(layouts.every((layout) => layout.terrain.rooms.length === 1 && layout.terrain.passages.length === 0), 'Every watchtower floor must be one circular room');
    assert.ok(layouts[0].exit, 'Watchtower floor one must retain the wilderness exit');
    assert.equal(layouts[1].exit, null, 'Watchtower floor two must not have a wilderness exit');
    assert.equal(layouts[2].exit, null, 'Watchtower floor three must not have a wilderness exit');
    assert.deepEqual(layouts.map((layout) => layout.stairs.length), [1, 2, 1], 'Watchtower floors must have a complete up/down stair chain');
    assert.equal(layouts[2].materialNodes.filter((node) => node.resource === ResourceType.MapFragments).length, 1, 'Cartography floor must have one map pickup');
  }

  const origin = landmarkInteriorWorldOrigin('interior-verification-seed', landmark);
  assert.deepEqual(landmarkInteriorWorldOrigin('interior-verification-seed', landmark), origin, 'Interior origin must be deterministic');
  const spawnWorld = landmarkInteriorWorldTilePosition(origin, first.spawnTileX, first.spawnTileY);
  assert.ok(
    landmarkInteriorContainsWorldPoint(first, origin, spawnWorld.x, spawnWorld.y),
    type + ' world-space spawn mapping is not inside its interior'
  );
  if (type === LandmarkType.Watchtower) {
    const floorOrigins = layouts.map((layout) => landmarkInteriorWorldOrigin('interior-verification-seed', landmark, layout.floorNumber));
    assert.equal(new Set(floorOrigins.map((value) => value.x + ',' + value.y)).size, 3, 'Watchtower floors must occupy distinct world-space lanes');
    floorOrigins.forEach((value) => {
      assert.ok(Math.abs(value.x) < 8_000_000 && Math.abs(value.y) < 8_000_000, 'Watchtower origin must stay within smooth WebGL precision range');
    });
  }

  const alternateIdLandmark = fixtureFor(type, 'alternate-interior-id');
  const alternateIdLayout = generateLandmarkInterior('interior-verification-seed', alternateIdLandmark);
  const alternateSeedLayout = generateLandmarkInterior('interior-verification-seed-alternate', landmark);
  assert.notDeepEqual(interiorSignature(alternateIdLayout), interiorSignature(first), type + ' interior must vary by landmark ID');
  assert.notDeepEqual(interiorSignature(alternateSeedLayout), interiorSignature(first), type + ' interior must vary by world seed');
  assert.notDeepEqual(
    landmarkInteriorWorldOrigin('interior-verification-seed', alternateIdLandmark),
    origin,
    type + ' interior world origin must vary by landmark ID'
  );
});
const interiorGenerationMs = performance.now() - interiorStartedAt;
assert.ok(interiorGenerationMs < 4_000, 'Interior verification exceeded the 4 second budget');

const session = new SessionWorldState();
const persistedMaterialIds = [
  plans.find((plan) => plan.landmark.type === LandmarkType.MeteorCrater)!.materials[0].id,
  generateLandmarkInterior('interior-verification-seed', fixtureFor(LandmarkType.GiantAncientTree)).materialNodes[0].id
];
persistedMaterialIds.forEach((id) => {
  assert.equal(session.harvestLandmarkMaterial(id), true, 'A new landmark material must be harvestable');
  assert.equal(session.harvestLandmarkMaterial(id), false, 'A harvested landmark material must not be harvested twice');
});
const serializedSession = session.toSaveData();
const restoredSession = new SessionWorldState();
restoredSession.restore(serializedSession);
assert.deepEqual(
  restoredSession.toSaveData().harvestedLandmarkMaterialKeys,
  persistedMaterialIds,
  'Harvested landmark materials must survive a state round trip'
);
persistedMaterialIds.forEach((id) => assert.equal(restoredSession.isLandmarkMaterialHarvested(id), true));

const regrowingTreeMaterialId = generateLandmarkInterior(
  'interior-verification-seed',
  fixtureFor(LandmarkType.GiantAncientTree)
).materialNodes[0].id;
const harvestedAtWorldAgeMs = 12_345;
const regrowthDelayMs = ancientTreeFeatureRegrowthDelayMs(
  'interior-verification-seed',
  regrowingTreeMaterialId,
  harvestedAtWorldAgeMs
);
assert.equal(
  ancientTreeFeatureRegrowthDelayMs('interior-verification-seed', regrowingTreeMaterialId, harvestedAtWorldAgeMs),
  regrowthDelayMs,
  'Ancient-tree material regrowth delay must be deterministic'
);
assert.ok(
  regrowthDelayMs >= ANCIENT_TREE_FEATURE_REGROWTH_MIN_DAYS * DAY_NIGHT_CYCLE_DURATION_MS
    && regrowthDelayMs <= ANCIENT_TREE_FEATURE_REGROWTH_MAX_DAYS * DAY_NIGHT_CYCLE_DURATION_MS,
  'Ancient-tree material regrowth must remain between two and three in-game days'
);
assert.ok(
  new Set(Array.from({ length: 24 }, (_, index) => ancientTreeFeatureRegrowthDelayMs(
    'interior-verification-seed',
    regrowingTreeMaterialId + ':' + index,
    harvestedAtWorldAgeMs + index * 137
  ))).size > 1,
  'Ancient-tree material regrowth delays must vary between features and harvests'
);

const regrowthSession = new SessionWorldState();
regrowthSession.advanceWorldAge(harvestedAtWorldAgeMs);
assert.equal(
  regrowthSession.harvestLandmarkMaterial(regrowingTreeMaterialId, regrowthDelayMs),
  true,
  'Ancient-tree material must accept a regrowth deadline'
);
const savedRegrowthSession = regrowthSession.toSaveData();
assert.equal(savedRegrowthSession.worldAgeMs, harvestedAtWorldAgeMs, 'World age must persist without wrapping');
assert.equal(savedRegrowthSession.landmarkMaterialRegrowth?.length, 1, 'Regrowth deadline must be serialized');
const restoredRegrowthSession = new SessionWorldState();
restoredRegrowthSession.restore(savedRegrowthSession);
assert.equal(restoredRegrowthSession.isLandmarkMaterialHarvested(regrowingTreeMaterialId), true);
assert.deepEqual(restoredRegrowthSession.advanceWorldAge(regrowthDelayMs - 1), []);
assert.equal(restoredRegrowthSession.isLandmarkMaterialHarvested(regrowingTreeMaterialId), true);
assert.deepEqual(
  restoredRegrowthSession.advanceWorldAge(1),
  [regrowingTreeMaterialId],
  'Ancient-tree material must return at its saved deterministic deadline'
);
assert.equal(restoredRegrowthSession.isLandmarkMaterialHarvested(regrowingTreeMaterialId), false);
assert.equal(restoredRegrowthSession.toSaveData().landmarkMaterialRegrowth?.length, 0);

const stoneRuneMaterialId = centralRune.id;
const runeRegrowthDelayMs = stoneCircleRuneRegrowthDelayMs(
  'surface-verification-seed',
  stoneRuneMaterialId,
  harvestedAtWorldAgeMs
);
assert.equal(
  stoneCircleRuneRegrowthDelayMs('surface-verification-seed', stoneRuneMaterialId, harvestedAtWorldAgeMs),
  runeRegrowthDelayMs,
  'Stone-circle rune regrowth delay must be deterministic'
);
assert.ok(
  runeRegrowthDelayMs >= STONE_CIRCLE_RUNE_REGROWTH_MIN_DAYS * DAY_NIGHT_CYCLE_DURATION_MS
    && runeRegrowthDelayMs <= STONE_CIRCLE_RUNE_REGROWTH_MAX_DAYS * DAY_NIGHT_CYCLE_DURATION_MS,
  'Stone-circle rune regrowth must remain between two and three in-game days'
);
assert.ok(
  new Set(Array.from({ length: 24 }, (_, index) => stoneCircleRuneRegrowthDelayMs(
    'surface-verification-seed',
    stoneRuneMaterialId,
    harvestedAtWorldAgeMs + index * 181
  ))).size > 1,
  'Stone-circle rune return times must vary between harvests'
);
const runeRegrowthSession = new SessionWorldState();
assert.equal(runeRegrowthSession.harvestLandmarkMaterial(stoneRuneMaterialId, runeRegrowthDelayMs), true);
const restoredRuneRegrowthSession = new SessionWorldState();
restoredRuneRegrowthSession.restore(runeRegrowthSession.toSaveData());
assert.deepEqual(restoredRuneRegrowthSession.advanceWorldAge(runeRegrowthDelayMs - 1), []);
assert.deepEqual(restoredRuneRegrowthSession.advanceWorldAge(1), [stoneRuneMaterialId]);
assert.equal(restoredRuneRegrowthSession.isLandmarkMaterialHarvested(stoneRuneMaterialId), false);

const runeRestoreMigrationSession = new SessionWorldState();
assert.equal(runeRestoreMigrationSession.harvestLandmarkMaterial(stoneRuneMaterialId, runeRegrowthDelayMs), true);
assert.equal(runeRestoreMigrationSession.restoreLandmarkMaterial(stoneRuneMaterialId), true);
assert.equal(runeRestoreMigrationSession.isLandmarkMaterialHarvested(stoneRuneMaterialId), false);
assert.equal(
  runeRestoreMigrationSession.setLandmarkMaterialMigrationVersion(STONE_CIRCLE_RUNE_RESTORE_MIGRATION_VERSION),
  true,
  'The one-time rune restoration migration must record its version'
);
assert.equal(
  runeRestoreMigrationSession.setLandmarkMaterialMigrationVersion(STONE_CIRCLE_RUNE_RESTORE_MIGRATION_VERSION),
  false,
  'The rune restoration migration must not apply twice'
);
const restoredRuneMigrationSession = new SessionWorldState();
restoredRuneMigrationSession.restore(runeRestoreMigrationSession.toSaveData());
assert.equal(
  restoredRuneMigrationSession.landmarkMaterialMigrationVersion,
  STONE_CIRCLE_RUNE_RESTORE_MIGRATION_VERSION,
  'The one-time rune restoration marker must survive save/load'
);
assert.equal(restoredRuneMigrationSession.restoreLandmarkMaterial(stoneRuneMaterialId), false);

const legacyTreeRegrowthSession = new SessionWorldState();
legacyTreeRegrowthSession.restore({
  harvestedFeatureKeys: [],
  harvestedLandmarkMaterialKeys: [regrowingTreeMaterialId],
  drops: [],
  nextDropId: 0
});
assert.equal(
  legacyTreeRegrowthSession.scheduleLandmarkMaterialRegrowth(regrowingTreeMaterialId, regrowthDelayMs),
  true,
  'A tree material harvested by an older save must accept a migration deadline'
);
assert.equal(
  legacyTreeRegrowthSession.scheduleLandmarkMaterialRegrowth(regrowingTreeMaterialId, regrowthDelayMs),
  false,
  'Loading an already-migrated tree material must not reroll its deadline'
);

const legacySession = new SessionWorldState();
legacySession.restore({ harvestedFeatureKeys: [], drops: [], nextDropId: 0 });
assert.equal(legacySession.harvestedLandmarkMaterialCount, 0, 'A pre-landmark save must restore with an empty material set');

const legacySave = {
  version: 1,
  seed: 'legacy-landmark-verification',
  player: { x: 32, y: 64 },
  inventory: [],
  world: { harvestedFeatureKeys: [], drops: [], nextDropId: 0 }
};
assert.equal(isSaveGameData(legacySave), true, 'Pre-interior saves must remain valid');
const activeLandmarkSave = {
  ...legacySave,
  activeLandmarkInterior: {
    landmarkId: fixtureFor(LandmarkType.GiantAncientTree).id,
    landmarkType: LandmarkType.GiantAncientTree,
    centerTileX: fixtureFor(LandmarkType.GiantAncientTree).centerTileX,
    centerTileY: fixtureFor(LandmarkType.GiantAncientTree).centerTileY,
    returnWorldX: 400.5,
    returnWorldY: -800.25
  }
};
assert.equal(isSaveGameData(activeLandmarkSave), true, 'A valid active landmark interior save must be accepted');
const activeWatchtowerFloorSave = {
  ...legacySave,
  activeLandmarkInterior: {
    landmarkId: fixtureFor(LandmarkType.Watchtower).id,
    landmarkType: LandmarkType.Watchtower,
    centerTileX: fixtureFor(LandmarkType.Watchtower).centerTileX,
    centerTileY: fixtureFor(LandmarkType.Watchtower).centerTileY,
    returnWorldX: 400.5,
    returnWorldY: -800.25,
    floorNumber: 3
  }
};
assert.equal(isSaveGameData(activeWatchtowerFloorSave), true, 'A watchtower save must preserve floors one through three');
assert.equal(
  isSaveGameData({
    ...activeWatchtowerFloorSave,
    activeLandmarkInterior: { ...activeWatchtowerFloorSave.activeLandmarkInterior, floorNumber: 4 }
  }),
  false,
  'A watchtower save must reject an unknown floor'
);
assert.equal(
  isSaveGameData({
    ...activeLandmarkSave,
    activeLandmarkInterior: { ...activeLandmarkSave.activeLandmarkInterior, floorNumber: 2 }
  }),
  false,
  'Single-room landmark interiors must reject watchtower floor state'
);
assert.equal(
  isSaveGameData({
    ...activeLandmarkSave,
    activeLandmarkInterior: {
      ...activeLandmarkSave.activeLandmarkInterior,
      landmarkType: LandmarkType.MeteorCrater
    }
  }),
  false,
  'Non-enterable landmarks must be rejected as active interiors'
);
assert.equal(
  isSaveGameData({
    ...activeLandmarkSave,
    activeCave: { entranceTileX: 2, entranceTileY: 3, returnWorldX: 32, returnWorldY: 64 }
  }),
  false,
  'A save cannot be inside a cave and a landmark interior simultaneously'
);

const totalGenerationMs = firstGenerationMs + surfaceGenerationMs + interiorGenerationMs;
assert.ok(totalGenerationMs < 12_000, 'Combined landmark generation verification exceeded the 12 second budget');

console.log('Landmark verification passed: 6 surface landmarks, 3 enterable interiors, rare materials, and deterministic landmark regrowth.');
console.log('World scan: ' + generatedLandmarks.length + ' landmarks in ' + firstGenerationMs.toFixed(1) + ' ms.');
console.log('Surface plans: ' + surfaceGenerationMs.toFixed(1) + ' ms; interiors: ' + interiorGenerationMs.toFixed(1) + ' ms.');
console.log('Determinism, variation, F3 nearest lookup, entrances, reachability, collision, save compatibility, and state round trips passed.');
console.log('Electron visual samples use seed "' + generationSeed + '":');
EXPECTED_LANDMARK_TYPES.forEach((type) => {
  const sample = generatedSampleByType.get(type)!;
  const entrance = createLandmarkSurfacePlan(generationSeed, sample).entrance;
  console.log(
    '- ' + type + ': center tile (' + sample.centerTileX + ', ' + sample.centerTileY + ')'
    + (entrance ? '; entrance tile (' + entrance.tileX + ', ' + entrance.tileY + ')' : '; not enterable')
  );
});
`;

try {
  await writeFile(verificationEntryPath, verificationSource, 'utf8');
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    rootDir: projectRoot,
    outDir: compiledDirectory,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strict: true,
    skipLibCheck: true,
    noEmitOnError: true,
    forceConsistentCasingInFileNames: true
  };
  const program = ts.createProgram({
    rootNames: [verificationEntryPath],
    options: compilerOptions
  });
  const emitResult = program.emit();
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics]
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    const formatHost = {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => projectRoot,
      getNewLine: () => '\n'
    };
    throw new Error('\n' + ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
  }
  await import(pathToFileURL(compiledVerificationPath).href + '?run=' + Date.now());
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

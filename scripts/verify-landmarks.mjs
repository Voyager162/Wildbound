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
  findLandmarkEntrance,
  findLandmarkEntranceNearWorldPoint,
  landmarkPlanBlocksFeatureTile,
  landmarkStructureContainsWorldPoint,
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
    ResourceType.VineFiber,
    ResourceType.Heartwood
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
    assert.equal(
      landmarkStructureContainsWorldPoint(
        plan,
        material.worldX,
        material.worldY,
        Math.min(32, material.clearanceRadiusPixels)
      ),
      false,
      material.id + ' clearance area collides with a landmark structure'
    );
  });
});
assert.equal(entranceCount, 3, 'Exactly three landmark surface plans must expose entrances');

const stonePlan = plans.find((plan) => plan.landmark.type === LandmarkType.StoneCircle)!;
const stoneCenterWorldX = (stonePlan.landmark.centerTileX + 0.5) * WORLD_TILE_SIZE;
const stoneCenterWorldY = (stonePlan.landmark.centerTileY + 0.5) * WORLD_TILE_SIZE;
assert.equal(
  landmarkStructureContainsWorldPoint(stonePlan, stoneCenterWorldX, stoneCenterWorldY),
  false,
  'The stone-circle center must remain structurally open'
);
assert.equal(
  landmarkPlanBlocksFeatureTile(stonePlan, stonePlan.landmark.centerTileX, stonePlan.landmark.centerTileY),
  false,
  'The stone-circle center must not be blanket-blocked from ordinary features or layered grass'
);
const stoneBlocks = stonePlan.components.filter((component) => component.role === 'stone-block');
assert.ok(stoneBlocks.length >= 9, 'Stone circles must use a substantial ring of blocks');
assert.ok(stoneBlocks.every((component) => component.shape.kind === 'oriented-box'), 'Stone-circle stones must be protruding square blocks');
assert.ok(
  new Set(stoneBlocks.map((component) => {
    const shape = component.shape;
    assert.equal(shape.kind, 'oriented-box');
    return [round(shape.width), round(shape.height), round(shape.rotation), round(component.height), round(component.lean)].join(':');
  })).size >= Math.ceil(stoneBlocks.length * 0.7),
  'Stone-circle blocks must vary in dimensions, angle, height, and lean'
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
    false,
    'Stone-circle stress sample ' + index + ' structurally blocks its center'
  );
  assert.equal(
    landmarkPlanBlocksFeatureTile(stressPlan, stressLandmark.centerTileX, stressLandmark.centerTileY),
    false,
    'Stone-circle stress sample ' + index + ' blanket-blocks its center terrain'
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
  spawn: [layout.spawnTileX, layout.spawnTileY],
  exit: [layout.exit.tileX, layout.exit.tileY, layout.exit.facing],
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
  assert.equal(first.landmarkType, type);
  assert.equal(first.themeId, LANDMARK_INTERIOR_THEMES[type].id);
  assertExactValues(
    first.materialNodes.map((material) => material.resource),
    EXPECTED_INTERIOR_MATERIALS.get(type)!,
    type + ' interior materials are incorrect'
  );
  assertExactValues(
    LANDMARK_INTERIOR_THEMES[type].materialResources,
    EXPECTED_INTERIOR_MATERIALS.get(type)!,
    type + ' theme material contract is incorrect'
  );
  assert.ok(first.decorations.length >= 20, type + ' interior must include dense environmental decoration');
  assert.ok(first.floorTiles[first.spawnTileY]?.[first.spawnTileX], type + ' spawn must be on a floor tile');
  assert.ok(first.floorTiles[first.exit.tileY]?.[first.exit.tileX], type + ' exit must be on a floor tile');
  assert.ok(landmarkInteriorContainsPoint(first, first.spawnTileX + 0.5, first.spawnTileY + 0.5), type + ' spawn is outside terrain');
  assert.ok(landmarkInteriorContainsPoint(first, first.exit.tileX + 0.5, first.exit.tileY + 0.5), type + ' exit is outside terrain');

  const reachable = reachableFloorKeys(first);
  assert.ok(reachable.has(first.exit.tileX + ',' + first.exit.tileY), type + ' exit must be reachable from spawn');
  first.materialNodes.forEach((material) => {
    assert.ok(!allInteriorMaterialIds.has(material.id), 'Interior material IDs must be globally unique');
    allInteriorMaterialIds.add(material.id);
    assert.ok(landmarkInteriorContainsPoint(first, material.tileX + 0.5, material.tileY + 0.5, -0.45), material.id + ' is outside navigable terrain');
    assert.ok(reachable.has(material.tileX + ',' + material.tileY), material.id + ' is not reachable from spawn');
  });

  const origin = landmarkInteriorWorldOrigin('interior-verification-seed', landmark);
  assert.deepEqual(landmarkInteriorWorldOrigin('interior-verification-seed', landmark), origin, 'Interior origin must be deterministic');
  const spawnWorld = landmarkInteriorWorldTilePosition(origin, first.spawnTileX, first.spawnTileY);
  assert.ok(
    landmarkInteriorContainsWorldPoint(first, origin, spawnWorld.x, spawnWorld.y),
    type + ' world-space spawn mapping is not inside its interior'
  );

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

console.log('Landmark verification passed: 6 surface landmarks, 3 enterable interiors, and 21 rare materials.');
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

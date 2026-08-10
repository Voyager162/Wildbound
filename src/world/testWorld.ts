import Phaser from 'phaser';

export const WORLD_TILE_SIZE = 32;
export const TEST_WORLD_TILES_WIDE = 128;
export const TEST_WORLD_TILES_HIGH = 128;
export const TEST_WORLD_WIDTH = TEST_WORLD_TILES_WIDE * WORLD_TILE_SIZE;
export const TEST_WORLD_HEIGHT = TEST_WORLD_TILES_HIGH * WORLD_TILE_SIZE;

export const worldToTile = (worldCoordinate: number): number => Math.floor(worldCoordinate / WORLD_TILE_SIZE);

export const drawTestWorld = (scene: Phaser.Scene): void => {
  const grid = scene.add.graphics();

  grid.fillStyle(0x1d342b, 1);
  grid.fillRect(0, 0, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);

  grid.lineStyle(1, 0x315846, 0.6);
  for (let x = 0; x <= TEST_WORLD_WIDTH; x += WORLD_TILE_SIZE) {
    grid.lineBetween(x, 0, x, TEST_WORLD_HEIGHT);
  }

  for (let y = 0; y <= TEST_WORLD_HEIGHT; y += WORLD_TILE_SIZE) {
    grid.lineBetween(0, y, TEST_WORLD_WIDTH, y);
  }

  const majorGridSize = WORLD_TILE_SIZE * 8;
  grid.lineStyle(2, 0x4b765d, 0.75);
  for (let x = 0; x <= TEST_WORLD_WIDTH; x += majorGridSize) {
    grid.lineBetween(x, 0, x, TEST_WORLD_HEIGHT);
  }

  for (let y = 0; y <= TEST_WORLD_HEIGHT; y += majorGridSize) {
    grid.lineBetween(0, y, TEST_WORLD_WIDTH, y);
  }
};

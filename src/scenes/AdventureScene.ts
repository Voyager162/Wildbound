import Phaser from 'phaser';
import {
  drawTestWorld,
  TEST_WORLD_HEIGHT,
  TEST_WORLD_WIDTH,
  WORLD_TILE_SIZE,
  worldToTile
} from '../world/testWorld';

const PLAYER_SPEED = 220;
const PLAYER_SIZE = 32;

type MovementKeys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

export class AdventureScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys!: MovementKeys;
  private debugText!: Phaser.GameObjects.Text;
  private isDebugVisible = false;

  constructor() {
    super('adventure');
  }

  create(): void {
    this.physics.world.setBounds(0, 0, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
    drawTestWorld(this);

    this.player = this.add.rectangle(TEST_WORLD_WIDTH / 2, TEST_WORLD_HEIGHT / 2, PLAYER_SIZE, PLAYER_SIZE, 0x65d6ff);
    this.physics.add.existing(this.player);

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setCollideWorldBounds(true);

    this.configureCamera();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.movementKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    }) as MovementKeys;
    this.input.keyboard!.on('keydown-F3', this.toggleDebug, this);

    this.add
      .text(16, 16, 'Move with WASD or arrow keys · F3: Debug', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#e8f0f7'
      })
      .setScrollFactor(0);

    this.debugText = this.add
      .text(16, 48, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#cfe8d8',
        backgroundColor: '#102019cc',
        padding: { x: 8, y: 6 }
      })
      .setScrollFactor(0)
      .setVisible(false);
  }

  update(): void {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const horizontal = Number(this.isDown('right')) - Number(this.isDown('left'));
    const vertical = Number(this.isDown('down')) - Number(this.isDown('up'));

    const direction = new Phaser.Math.Vector2(horizontal, vertical).normalize().scale(PLAYER_SPEED);
    playerBody.setVelocity(direction.x, direction.y);

    if (this.isDebugVisible) {
      this.updateDebugText();
    }
  }

  private isDown(direction: keyof MovementKeys): boolean {
    return Boolean(this.cursors[direction]?.isDown || this.movementKeys[direction].isDown);
  }

  private configureCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
    camera.setRoundPixels(true);
    camera.startFollow(this.player, true, 0.1, 0.1);
  }

  private toggleDebug(): void {
    this.isDebugVisible = !this.isDebugVisible;
    this.debugText.setVisible(this.isDebugVisible);

    if (this.isDebugVisible) {
      this.updateDebugText();
    }
  }

  private updateDebugText(): void {
    this.debugText.setText([
      `World: ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`,
      `Tile: ${worldToTile(this.player.x)}, ${worldToTile(this.player.y)} (${WORLD_TILE_SIZE}px)`,
      `FPS: ${this.game.loop.actualFps.toFixed(0)}`
    ]);
  }
}

import Phaser from 'phaser';
import { AdventureScene } from './scenes/AdventureScene';
import './styles.css';

const config: Phaser.Types.Core.GameConfig = {
  // Wildbound's terrain, foliage shaders, and texture compositing are designed for WebGL. Ask
  // Chromium for its high-performance adapter, while AUTO retains Phaser's safe Canvas fallback
  // if a device genuinely cannot create a WebGL context.
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#17222e',
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    powerPreference: 'high-performance',
    roundPixels: false
  },
  scene: [AdventureScene]
};

const game = new Phaser.Game(config);
const gameElement = document.getElementById('game');

// Electron's fullscreen transition does not reliably trigger Phaser's automatic parent-size
// measurement on every Windows display setup. Observing the actual container keeps the canvas
// backing size and CSS display size in sync for regular, maximized, and fullscreen windows.
if (gameElement && typeof ResizeObserver !== 'undefined') {
  const resizeGame = (): void => {
    const bounds = gameElement.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width));
    const height = Math.max(1, Math.floor(bounds.height));
    if (game.scale.width !== width || game.scale.height !== height) {
      game.scale.resize(width, height);
    }
  };
  new ResizeObserver(resizeGame).observe(gameElement);
  window.addEventListener('resize', resizeGame);
  window.addEventListener('fullscreenchange', resizeGame);
  resizeGame();
}

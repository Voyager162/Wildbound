import Phaser from 'phaser';
import { AdventureScene } from './scenes/AdventureScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { installMenuClickAudio } from './ui/MenuClickAudio';
import './styles.css';

installMenuClickAudio();

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
  // Phaser's built-in FPS limiter skips requestAnimationFrame callbacks. That creates uneven
  // 2/3-refresh-frame gaps on 120 / 144 Hz displays, which makes camera movement look jerky.
  // Start a regular, 60 Hz timer-paced loop instead; AdventureScene switches this scheduler when
  // the player changes the frame-rate preference (and returns to RAF for Unlimited).
  fps: {
    target: 60,
    limit: 0,
    forceSetTimeOut: true,
    smoothStep: false
  },
  render: {
    powerPreference: 'high-performance',
    roundPixels: false
  },
  scene: [MainMenuScene, AdventureScene]
};

const game = new Phaser.Game(config);
const gameElement = document.getElementById('game');

// The wilderness uses a small, CSS-rendered crosshair instead of an operating-system pointer.
// It keeps the interaction point unambiguous without competing with the terrain. Item drags
// temporarily hide it so the item itself is the cursor.
if (gameElement) {
  const gameCursor = document.createElement('div');
  gameCursor.className = 'wildbound-game-cursor is-hidden';
  gameCursor.setAttribute('aria-hidden', 'true');
  gameElement.append(gameCursor);

  const updateGameCursor = (event: PointerEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    const isTextEntry = Boolean(target?.closest('input, textarea, [contenteditable="true"]'));
    gameCursor.classList.toggle('is-hidden', event.pointerType !== 'mouse' || isTextEntry);
    gameCursor.style.transform = `translate3d(${Math.round(event.clientX - 7)}px, ${Math.round(event.clientY - 7)}px, 0)`;
  };

  gameElement.addEventListener('pointerenter', updateGameCursor);
  gameElement.addEventListener('pointermove', updateGameCursor);
  gameElement.addEventListener('pointerleave', () => gameCursor.classList.add('is-hidden'));
}

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

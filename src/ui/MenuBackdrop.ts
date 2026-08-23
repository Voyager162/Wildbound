type BackdropKind = 'meadow' | 'coast' | 'frost' | 'dunes' | 'marsh';

interface BackdropTheme {
  readonly kind: BackdropKind;
  readonly sky: readonly [string, string];
  readonly ground: string;
  readonly accent: string;
  readonly shadow: string;
  readonly seed: number;
}

const BACKDROP_WIDTH = 1600;
const BACKDROP_HEIGHT = 900;
const BACKDROP_ROTATION_MS = 8_000;
const BACKDROP_FADE_MS = 1_400;

const THEMES: readonly BackdropTheme[] = [
  { kind: 'meadow', sky: ['#5ed0ee', '#ffd889'], ground: '#6dab50', accent: '#d1e981', shadow: '#315c44', seed: 0x21b4d13 },
  { kind: 'coast', sky: ['#4faad3', '#f7c976'], ground: '#e5c578', accent: '#8bd9d8', shadow: '#2e6070', seed: 0x7f642ab },
  { kind: 'frost', sky: ['#6ca6d6', '#ece6d0'], ground: '#d9e8dd', accent: '#faffff', shadow: '#4c7080', seed: 0xb6c8031 },
  { kind: 'dunes', sky: ['#43a8c8', '#ffd477'], ground: '#d8a957', accent: '#ffe0a0', shadow: '#865237', seed: 0x347b921 },
  { kind: 'marsh', sky: ['#638ca6', '#d5bc78'], ground: '#597457', accent: '#a9cf91', shadow: '#294e4d', seed: 0x6c2e9f1 }
];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const smoothstep = (value: number): number => {
  const amount = clamp01(value);
  return amount * amount * (3 - amount * 2);
};

class SeededRandom {
  constructor(private state: number) {}

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  between(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }
}

const fillRidge = (
  context: CanvasRenderingContext2D,
  random: SeededRandom,
  baseY: number,
  amplitude: number,
  color: string,
  alpha: number
): void => {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(-80, BACKDROP_HEIGHT);
  context.lineTo(-80, baseY);
  for (let x = -80; x <= BACKDROP_WIDTH + 120; x += 75) {
    const crest = baseY - random.between(amplitude * 0.25, amplitude);
    context.quadraticCurveTo(x + 34, crest, x + 75, baseY - random.between(0, amplitude * 0.42));
  }
  context.lineTo(BACKDROP_WIDTH + 120, BACKDROP_HEIGHT);
  context.closePath();
  context.fill();
  context.restore();
};

const drawTree = (
  context: CanvasRenderingContext2D,
  random: SeededRandom,
  x: number,
  y: number,
  scale: number,
  foliage: string,
  shadow: string
): void => {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.fillStyle = shadow;
  context.globalAlpha = 0.35;
  context.beginPath();
  context.ellipse(4, 21, 28, 8, -0.18, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = '#5b3a27';
  context.fillRect(-3, -2, 7, 27);
  context.fillStyle = '#8b5a37';
  context.fillRect(-1, 0, 2, 24);
  for (let cluster = 0; cluster < 5; cluster += 1) {
    const leafX = random.between(-17, 17);
    const leafY = random.between(-28, -5);
    const radius = random.between(11, 19);
    context.fillStyle = shadow;
    context.beginPath();
    context.arc(leafX + 2, leafY + 3, radius + 2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = foliage;
    context.beginPath();
    context.arc(leafX, leafY, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
};

const drawTreeOnGround = (
  context: CanvasRenderingContext2D,
  random: SeededRandom,
  x: number,
  groundY: number,
  scale: number,
  foliage: string,
  shadow: string
): void => {
  // drawTree's local trunk and shadow end at y=25. Aligning that point to the scene's ground
  // keeps trees visually rooted instead of letting distant scenery read as their terrain.
  drawTree(context, random, x, groundY - 25 * scale, scale, foliage, shadow);
};

const drawCactus = (
  context: CanvasRenderingContext2D,
  random: SeededRandom,
  x: number,
  groundY: number,
  scale: number
): void => {
  const outline = '#24613b';
  const body = '#58aa57';
  const highlight = '#90d46d';
  context.save();
  context.translate(x, groundY);
  context.scale(scale, scale);
  context.fillStyle = 'rgba(84, 51, 28, 0.28)';
  context.beginPath();
  context.ellipse(4, 3, 21, 5.5, -0.16, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = outline;
  context.fillRect(-8, -52, 16, 52);
  context.fillRect(-20, -34, 12, 10);
  context.fillRect(-24, -45, 9, 21);
  context.fillRect(8, -26, 13, 10);
  context.fillRect(16, -40, 9, 24);
  context.fillStyle = body;
  context.fillRect(-5.5, -49, 11, 46);
  context.fillRect(-17.5, -31, 9.5, 4);
  context.fillRect(-21, -42, 4, 14);
  context.fillRect(8, -23, 10, 4);
  context.fillRect(18, -37, 4, 16);
  context.fillStyle = highlight;
  context.fillRect(-2.5, -45, 2.5, 33);
  context.fillRect(-19.5, -39, 1.5, 8);
  context.fillRect(19, -34, 1.5, 9);
  context.fillStyle = '#dbe98c';
  for (let spine = 0; spine < 6; spine += 1) {
    const y = -9 - spine * 6;
    context.fillRect(-8.5, y, 2, 1.4);
    if (spine % 2 === 0) {
      context.fillRect(6.5, y - 2, 2, 1.4);
    }
  }
  if (random.next() > 0.47) {
    context.fillStyle = '#efb45f';
    context.beginPath();
    context.arc(-1, -49, 3, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
};

// The menu remains lightweight by rendering a few richly layered, deterministic illustrations
// once, then panning those canvas snapshots. It deliberately does not create streamed chunks or
// run the terrain worker before the player has selected a world.
export class MenuBackdrop {
  private readonly canvas: HTMLCanvasElement;
  private readonly scenes = THEMES.map((theme) => this.createScene(theme));
  private frameId: number | null = null;
  private activeScene = Math.floor(Math.random() * THEMES.length);
  private upcomingScene = this.nextSceneIndex(this.activeScene);
  private sceneStartedAt = performance.now();
  private viewportWidth = 1;
  private viewportHeight = 1;
  private pixelRatio = 1;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'menu-backdrop';
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.append(this.canvas);
    this.resize();
    window.addEventListener('resize', this.handleResize);
    this.frameId = requestAnimationFrame(this.render);
  }

  destroy(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
    }
    window.removeEventListener('resize', this.handleResize);
    this.canvas.remove();
  }

  private readonly handleResize = (): void => this.resize();

  private resize(): void {
    const parent = this.canvas.parentElement;
    const bounds = parent?.getBoundingClientRect();
    this.viewportWidth = Math.max(1, Math.round(bounds?.width ?? window.innerWidth));
    this.viewportHeight = Math.max(1, Math.round(bounds?.height ?? window.innerHeight));
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.max(1, Math.round(this.viewportWidth * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.round(this.viewportHeight * this.pixelRatio));
  }

  private readonly render = (time: number): void => {
    let elapsed = time - this.sceneStartedAt;
    if (elapsed >= BACKDROP_ROTATION_MS) {
      const rotations = Math.floor(elapsed / BACKDROP_ROTATION_MS);
      for (let index = 0; index < rotations; index += 1) {
        this.activeScene = this.upcomingScene;
        this.upcomingScene = this.nextSceneIndex(this.activeScene);
      }
      this.sceneStartedAt += rotations * BACKDROP_ROTATION_MS;
      elapsed -= rotations * BACKDROP_ROTATION_MS;
    }

    const transitionStart = BACKDROP_ROTATION_MS - BACKDROP_FADE_MS;
    const transitionAmount = elapsed <= transitionStart ? 0 : smoothstep((elapsed - transitionStart) / BACKDROP_FADE_MS);
    const context = this.canvas.getContext('2d');
    if (context) {
      context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      context.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
      // Each illustration owns a stable, smooth pan position. Reusing that same position before
      // and after it becomes active avoids the one-frame jump that occurred at a cross-fade seam.
      this.drawScene(context, this.scenes[this.activeScene], this.scenePanPosition(this.activeScene, time), 1);
      if (transitionAmount > 0) {
        this.drawScene(
          context,
          this.scenes[this.upcomingScene],
          this.scenePanPosition(this.upcomingScene, time),
          transitionAmount
        );
      }
      const vignette = context.createLinearGradient(0, 0, 0, this.viewportHeight);
      vignette.addColorStop(0, 'rgba(5, 15, 20, 0.08)');
      vignette.addColorStop(0.58, 'rgba(5, 14, 20, 0.02)');
      vignette.addColorStop(1, 'rgba(4, 10, 15, 0.58)');
      context.fillStyle = vignette;
      context.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
    }
    this.frameId = requestAnimationFrame(this.render);
  };

  private drawScene(
    context: CanvasRenderingContext2D,
    scene: HTMLCanvasElement,
    phase: number,
    alpha: number
  ): void {
    const coverage = Math.max(this.viewportWidth / BACKDROP_WIDTH, this.viewportHeight / BACKDROP_HEIGHT) * 1.1;
    const width = BACKDROP_WIDTH * coverage;
    const height = BACKDROP_HEIGHT * coverage;
    const extraX = Math.max(0, width - this.viewportWidth);
    const extraY = Math.max(0, height - this.viewportHeight);
    context.save();
    context.globalAlpha = alpha;
    context.drawImage(scene, -extraX * phase, -extraY * (0.32 + phase * 0.18), width, height);
    context.restore();
  }

  private nextSceneIndex(current: number): number {
    const offset = 1 + Math.floor(Math.random() * (THEMES.length - 1));
    return (current + offset) % THEMES.length;
  }

  private scenePanPosition(sceneIndex: number, time: number): number {
    // A sine sweep reverses at its edges with zero velocity, so it never snaps back to the left
    // after a modulo wrap. The per-biome offset keeps the framed vistas distinct while fading.
    return 0.5 + Math.sin(time / 15_000 + sceneIndex * 1.37) * 0.5;
  }

  private createScene(theme: BackdropTheme): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = BACKDROP_WIDTH;
    canvas.height = BACKDROP_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) {
      return canvas;
    }

    const random = new SeededRandom(theme.seed);
    const sky = context.createLinearGradient(0, 0, 0, BACKDROP_HEIGHT * 0.68);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(1, theme.sky[1]);
    context.fillStyle = sky;
    context.fillRect(0, 0, BACKDROP_WIDTH, BACKDROP_HEIGHT);
    const glow = context.createRadialGradient(BACKDROP_WIDTH * 0.72, 130, 12, BACKDROP_WIDTH * 0.72, 130, 380);
    glow.addColorStop(0, 'rgba(255, 248, 198, 0.8)');
    glow.addColorStop(1, 'rgba(255, 248, 198, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, BACKDROP_WIDTH, BACKDROP_HEIGHT);

    fillRidge(context, random, 460, 135, theme.shadow, 0.34);
    fillRidge(context, random, 530, 92, theme.accent, 0.48);
    context.fillStyle = theme.ground;
    context.fillRect(0, 490, BACKDROP_WIDTH, BACKDROP_HEIGHT - 490);

    for (let index = 0; index < 480; index += 1) {
      const x = random.between(0, BACKDROP_WIDTH);
      const y = random.between(480, BACKDROP_HEIGHT);
      const radius = random.between(0.5, 2.8);
      context.globalAlpha = random.between(0.08, 0.22);
      context.fillStyle = index % 3 === 0 ? theme.shadow : theme.accent;
      context.beginPath();
      context.ellipse(x, y, radius * 1.8, radius, -0.4, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    switch (theme.kind) {
      case 'meadow':
        this.drawMeadow(context, random, theme);
        break;
      case 'coast':
        this.drawCoast(context, random, theme);
        break;
      case 'frost':
        this.drawFrost(context, random, theme);
        break;
      case 'dunes':
        this.drawDunes(context, random, theme);
        break;
      case 'marsh':
        this.drawMarsh(context, random, theme);
        break;
    }

    return canvas;
  }

  private drawMeadow(context: CanvasRenderingContext2D, random: SeededRandom, theme: BackdropTheme): void {
    for (let index = 0; index < 56; index += 1) {
      const scale = random.between(0.48, 1.12);
      drawTreeOnGround(
        // Keep the woodland in the foreground meadow rather than on the distant ridge layers.
        context,
        random,
        random.between(-20, BACKDROP_WIDTH + 20),
        random.between(590, 840),
        scale,
        index % 2 === 0 ? '#397547' : '#4f914d',
        theme.shadow
      );
    }
    context.fillStyle = '#f7d96e';
    context.globalAlpha = 0.65;
    for (let index = 0; index < 120; index += 1) {
      context.beginPath();
      context.arc(random.between(40, BACKDROP_WIDTH - 40), random.between(620, 875), random.between(1, 3.5), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  private drawCoast(context: CanvasRenderingContext2D, random: SeededRandom, theme: BackdropTheme): void {
    const water = context.createLinearGradient(0, 505, 0, BACKDROP_HEIGHT);
    water.addColorStop(0, '#4cabb9');
    water.addColorStop(1, '#1b667d');
    context.fillStyle = water;
    context.beginPath();
    context.moveTo(0, 530);
    for (let x = 0; x <= BACKDROP_WIDTH; x += 64) {
      context.quadraticCurveTo(x + 32, 510 + random.between(-25, 25), x + 64, 535 + random.between(-25, 25));
    }
    context.lineTo(BACKDROP_WIDTH, BACKDROP_HEIGHT);
    context.lineTo(0, BACKDROP_HEIGHT);
    context.closePath();
    context.fill();
    context.strokeStyle = 'rgba(219, 250, 230, 0.55)';
    context.lineWidth = 4;
    for (let line = 0; line < 22; line += 1) {
      const y = 560 + line * 19 + random.between(-5, 5);
      context.beginPath();
      context.moveTo(random.between(-80, 0), y);
      context.bezierCurveTo(380, y - 20, 920, y + 15, BACKDROP_WIDTH + 80, y - 8);
      context.stroke();
    }
  }

  private drawFrost(context: CanvasRenderingContext2D, random: SeededRandom, theme: BackdropTheme): void {
    context.fillStyle = 'rgba(244, 254, 255, 0.68)';
    for (let index = 0; index < 250; index += 1) {
      const x = random.between(0, BACKDROP_WIDTH);
      const y = random.between(0, BACKDROP_HEIGHT);
      const size = random.between(1, 4);
      context.fillRect(x, y, size, size);
    }
    for (let index = 0; index < 42; index += 1) {
      const x = random.between(-10, BACKDROP_WIDTH + 10);
      const scale = random.between(0.42, 1.18);
      context.save();
      // These conifers are part of the snowy foreground, never the painted mountain band.
      context.translate(x, random.between(560, 835) - 7 * scale);
      context.scale(scale, scale);
      context.fillStyle = theme.shadow;
      context.fillRect(-2.5, -24, 5, 31);
      for (let layer = 0; layer < 3; layer += 1) {
        context.fillStyle = layer === 0 ? '#3b6470' : '#56828b';
        const top = -44 + layer * 13;
        context.beginPath();
        context.moveTo(0, top - 17);
        context.lineTo(-22 + layer * 3, top + 16);
        context.lineTo(22 - layer * 3, top + 16);
        context.closePath();
        context.fill();
      }
      context.restore();
    }
  }

  private drawDunes(context: CanvasRenderingContext2D, random: SeededRandom, theme: BackdropTheme): void {
    for (let dune = 0; dune < 7; dune += 1) {
      const y = 520 + dune * 58;
      context.fillStyle = dune % 2 === 0 ? '#e8bd69' : '#c89349';
      context.globalAlpha = 0.75;
      context.beginPath();
      context.moveTo(-80, BACKDROP_HEIGHT);
      context.lineTo(-80, y);
      for (let x = -80; x <= BACKDROP_WIDTH + 100; x += 160) {
        context.quadraticCurveTo(x + 70, y - random.between(35, 100), x + 160, y + random.between(-22, 20));
      }
      context.lineTo(BACKDROP_WIDTH + 100, BACKDROP_HEIGHT);
      context.closePath();
      context.fill();
    }
    context.globalAlpha = 1;
    for (let index = 0; index < 20; index += 1) {
      // Use the same sturdy, outlined cactus language as the in-game desert resources.
      drawCactus(
        context,
        random,
        random.between(0, BACKDROP_WIDTH),
        random.between(655, 865),
        random.between(0.58, 1.08)
      );
    }
  }

  private drawMarsh(context: CanvasRenderingContext2D, random: SeededRandom, theme: BackdropTheme): void {
    context.fillStyle = '#315f68';
    context.globalAlpha = 0.8;
    for (let pool = 0; pool < 13; pool += 1) {
      context.beginPath();
      context.ellipse(random.between(-20, BACKDROP_WIDTH + 20), random.between(535, 850), random.between(55, 160), random.between(18, 52), random.between(-0.4, 0.4), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    for (let index = 0; index < 56; index += 1) {
      const x = random.between(0, BACKDROP_WIDTH);
      const y = random.between(500, 810);
      context.strokeStyle = index % 2 === 0 ? '#243f3b' : theme.accent;
      context.lineWidth = random.between(1.5, 3);
      context.beginPath();
      context.moveTo(x, y + 24);
      context.quadraticCurveTo(x + random.between(-7, 7), y, x + random.between(-9, 9), y - random.between(12, 38));
      context.stroke();
    }
    for (let pad = 0; pad < 48; pad += 1) {
      const x = random.between(0, BACKDROP_WIDTH);
      const y = random.between(540, 850);
      context.fillStyle = '#7aad61';
      context.beginPath();
      context.arc(x, y, random.between(4, 10), 0.25, Math.PI * 2 - 0.25);
      context.lineTo(x, y);
      context.fill();
    }
  }
}

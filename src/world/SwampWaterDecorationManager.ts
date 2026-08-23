import Phaser from 'phaser';
import { Biome } from './generation/biomeGenerator';
import { randomAtTile } from './generation/noise';
import { surfaceAtTile } from './generation/terrainGenerator';
import {
  LILYPAD_CURRENT_STRENGTH,
  LILYPAD_DENSITY,
  LILYPAD_FLOAT_BOB_PIXELS,
  LILYPAD_LINEAR_DRAG,
  LILYPAD_MAX_SPEED_PIXELS_PER_SECOND,
  LILYPAD_MAX_VISIBLE_COUNT,
  LILYPAD_MIN_WATER_VISUAL_AMOUNT,
  LILYPAD_PAD_RADIUS_PIXELS,
  LILYPAD_PLAYER_BUMP_STRENGTH,
  LILYPAD_PLAYER_COLLISION_RADIUS_PIXELS,
  LILYPAD_PLAYER_SEPARATION_STRENGTH,
  LILYPAD_RENDER_RADIUS_X,
  LILYPAD_RENDER_RADIUS_Y,
  LILYPAD_RETAIN_RADIUS_X,
  LILYPAD_RETAIN_RADIUS_Y,
  LILYPAD_RETURN_STRENGTH
} from './swampWaterDecorConfig';
import { CHUNK_SIZE_TILES, WORLD_TILE_SIZE } from './worldConfig';

const LILYPAD_TEXTURE_KEY = 'swamp-water-decoration:lily-pad:v1';

interface LilyPad {
  readonly id: string;
  readonly homeX: number;
  readonly homeY: number;
  readonly phase: number;
  readonly baseRotation: number;
  readonly image: Phaser.GameObjects.Image;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  visible: boolean;
}

interface LilyCandidate {
  id: string;
  homeX: number;
  homeY: number;
  phase: number;
  baseRotation: number;
  scale: number;
  priority: number;
}

const clampMagnitude = (x: number, y: number, maximum: number): { x: number; y: number } => {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= maximum || magnitude === 0) {
    return { x, y };
  }
  const scale = maximum / magnitude;
  return { x: x * scale, y: y * scale };
};

const ensureLilyPadTexture = (scene: Phaser.Scene): void => {
  if (scene.textures.exists(LILYPAD_TEXTURE_KEY)) {
    return;
  }

  const texture = scene.textures.createCanvas(LILYPAD_TEXTURE_KEY, 52, 46);
  if (!texture) {
    throw new Error('Wildbound could not create the lily pad texture.');
  }

  const context = texture.getContext();
  context.save();
  context.translate(26, 23);
  context.fillStyle = 'rgba(6, 36, 39, 0.36)';
  context.beginPath();
  context.ellipse(2, 7, 19, 8, -0.08, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#173f32';
  context.beginPath();
  context.ellipse(0, 0, 20, 15, -0.16, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#2e7549';
  context.beginPath();
  context.ellipse(-1, -1, 18, 13.2, -0.16, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#529d58';
  context.globalAlpha = 0.84;
  context.beginPath();
  context.ellipse(-3, -4, 12, 6.4, -0.37, 0, Math.PI * 2);
  context.fill();
  // The narrow water notch makes the silhouette read immediately as a floating lily pad.
  context.globalAlpha = 1;
  context.fillStyle = '#204f3e';
  context.beginPath();
  context.moveTo(18, 2);
  context.lineTo(4, 2);
  context.lineTo(15, 9);
  context.closePath();
  context.fill();
  context.strokeStyle = 'rgba(169, 224, 127, 0.68)';
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(-15, -6);
  context.quadraticCurveTo(-2, -1, 12, 2);
  context.stroke();
  context.restore();
  texture.refresh();
};

// A streamed, purely visual set of physical floaters. Their home positions come from the world
// seed; only their short-lived local velocity is simulated, so saves stay compact and revisiting
// an area always reconstructs the same swamp dressing.
export class SwampWaterDecorationManager {
  private readonly pads = new Map<string, LilyPad>();
  private visiblePadIds = new Set<string>();
  private visiblePads: LilyPad[] = [];
  private lastChunkX = Number.NaN;
  private lastChunkY = Number.NaN;
  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly seed: string
  ) {
    ensureLilyPadTexture(scene);
  }

  prime(chunkX: number, chunkY: number): void {
    this.syncCandidates(chunkX, chunkY);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    this.pads.forEach((pad) => pad.image.setVisible(enabled && pad.visible));
  }

  update(
    time: number,
    deltaMs: number,
    chunkX: number,
    chunkY: number,
    playerX: number,
    playerY: number,
    playerVelocityX: number,
    playerVelocityY: number,
    playerIsSwimming: boolean
  ): void {
    if (!this.enabled) {
      return;
    }
    if (chunkX !== this.lastChunkX || chunkY !== this.lastChunkY) {
      this.syncCandidates(chunkX, chunkY);
    }

    const dt = Math.min(0.05, Math.max(0, deltaMs) / 1000);
    if (dt === 0) {
      return;
    }

    this.visiblePads.forEach((pad) => this.integratePad(
      pad,
      time,
      dt,
      playerX,
      playerY,
      playerVelocityX,
      playerVelocityY,
      playerIsSwimming
    ));
    this.resolvePadContacts(this.visiblePads);
    this.visiblePads.forEach((pad) => this.updatePadArt(pad, time));
  }

  destroy(): void {
    this.pads.forEach((pad) => pad.image.destroy());
    this.pads.clear();
    this.visiblePadIds.clear();
    this.visiblePads = [];
  }

  private syncCandidates(chunkX: number, chunkY: number): void {
    this.lastChunkX = chunkX;
    this.lastChunkY = chunkY;
    const candidates = this.collectCandidates(chunkX, chunkY);
    const desired = new Set(candidates.map((candidate) => candidate.id));

    this.pads.forEach((pad, id) => {
      const padChunkX = Math.floor(pad.homeX / (CHUNK_SIZE_TILES * WORLD_TILE_SIZE));
      const padChunkY = Math.floor(pad.homeY / (CHUNK_SIZE_TILES * WORLD_TILE_SIZE));
      const retain = Math.abs(padChunkX - chunkX) <= LILYPAD_RETAIN_RADIUS_X
        && Math.abs(padChunkY - chunkY) <= LILYPAD_RETAIN_RADIUS_Y;
      if (!retain) {
        pad.image.destroy();
        this.pads.delete(id);
      } else if (!desired.has(id)) {
        pad.visible = false;
        pad.image.setVisible(false);
      }
    });

    candidates.forEach((candidate) => {
      let pad = this.pads.get(candidate.id);
      if (!pad) {
        const image = this.scene.add.image(candidate.homeX, candidate.homeY, LILYPAD_TEXTURE_KEY)
          .setDepth(1.37)
          .setScale(candidate.scale)
          .setTint(Phaser.Display.Color.GetColor(
            205 - Math.round(candidate.phase * 18),
            255 - Math.round(candidate.phase * 16),
            205 - Math.round(candidate.phase * 22)
          ));
        pad = {
          id: candidate.id,
          homeX: candidate.homeX,
          homeY: candidate.homeY,
          phase: candidate.phase,
          baseRotation: candidate.baseRotation,
          image,
          x: candidate.homeX,
          y: candidate.homeY,
          velocityX: 0,
          velocityY: 0,
          visible: true
        };
        this.pads.set(candidate.id, pad);
      }
      pad.visible = true;
      pad.image.setVisible(true);
    });

    this.visiblePadIds = desired;
    this.visiblePads = Array.from(desired, (id) => this.pads.get(id)).filter((pad): pad is LilyPad => Boolean(pad));
  }

  private collectCandidates(chunkX: number, chunkY: number): LilyCandidate[] {
    const candidates: LilyCandidate[] = [];
    for (let chunkYCursor = chunkY - LILYPAD_RENDER_RADIUS_Y; chunkYCursor <= chunkY + LILYPAD_RENDER_RADIUS_Y; chunkYCursor += 1) {
      for (let chunkXCursor = chunkX - LILYPAD_RENDER_RADIUS_X; chunkXCursor <= chunkX + LILYPAD_RENDER_RADIUS_X; chunkXCursor += 1) {
        const firstTileX = chunkXCursor * CHUNK_SIZE_TILES;
        const firstTileY = chunkYCursor * CHUNK_SIZE_TILES;
        for (let localY = 0; localY < CHUNK_SIZE_TILES; localY += 1) {
          for (let localX = 0; localX < CHUNK_SIZE_TILES; localX += 1) {
            const tileX = firstTileX + localX;
            const tileY = firstTileY + localY;
            if (randomAtTile(this.seed, tileX, tileY, 0x4475d2a1) >= LILYPAD_DENSITY) {
              continue;
            }
            const offsetX = 0.2 + randomAtTile(this.seed, tileX, tileY, 0x1ba934de) * 0.6;
            const offsetY = 0.2 + randomAtTile(this.seed, tileX, tileY, 0x98bd5017) * 0.6;
            const sampleX = tileX + offsetX;
            const sampleY = tileY + offsetY;
            const surface = surfaceAtTile(this.seed, sampleX, sampleY);
            if (surface.biome !== Biome.Swamp || !surface.isSwampWater || !surface.isWater
              || surface.waterVisualAmount < LILYPAD_MIN_WATER_VISUAL_AMOUNT) {
              continue;
            }
            const phase = randomAtTile(this.seed, tileX, tileY, 0xb9287a31);
            candidates.push({
              id: `${tileX},${tileY}`,
              homeX: sampleX * WORLD_TILE_SIZE,
              homeY: sampleY * WORLD_TILE_SIZE,
              phase,
              baseRotation: (randomAtTile(this.seed, tileX, tileY, 0x27e4c065) - 0.5) * 0.75,
              scale: 0.72 + randomAtTile(this.seed, tileX, tileY, 0x5ef38d09) * 0.32,
              priority: randomAtTile(this.seed, tileX, tileY, 0x0db1f5ce)
            });
          }
        }
      }
    }
    return candidates.sort((first, second) => first.priority - second.priority).slice(0, LILYPAD_MAX_VISIBLE_COUNT);
  }

  private integratePad(
    pad: LilyPad,
    time: number,
    dt: number,
    playerX: number,
    playerY: number,
    playerVelocityX: number,
    playerVelocityY: number,
    playerIsSwimming: boolean
  ): void {
    const seconds = time / 1000;
    const currentAngle = seconds * 0.34 + pad.phase * Math.PI * 2;
    pad.velocityX += Math.cos(currentAngle) * LILYPAD_CURRENT_STRENGTH * dt;
    pad.velocityY += Math.sin(currentAngle * 0.83 + 0.7) * LILYPAD_CURRENT_STRENGTH * 0.65 * dt;
    pad.velocityX += (pad.homeX - pad.x) * LILYPAD_RETURN_STRENGTH * dt;
    pad.velocityY += (pad.homeY - pad.y) * LILYPAD_RETURN_STRENGTH * dt;

    if (playerIsSwimming) {
      const deltaX = pad.x - playerX;
      const deltaY = pad.y - (playerY + 7);
      const distance = Math.hypot(deltaX, deltaY);
      const collisionDistance = LILYPAD_PLAYER_COLLISION_RADIUS_PIXELS + LILYPAD_PAD_RADIUS_PIXELS;
      if (distance < collisionDistance) {
        const normalX = distance > 0.001 ? deltaX / distance : Math.cos(pad.phase * Math.PI * 2);
        const normalY = distance > 0.001 ? deltaY / distance : Math.sin(pad.phase * Math.PI * 2);
        const overlap = collisionDistance - distance;
        pad.x += normalX * overlap * LILYPAD_PLAYER_SEPARATION_STRENGTH * dt;
        pad.y += normalY * overlap * LILYPAD_PLAYER_SEPARATION_STRENGTH * dt;
        const playerPush = Math.max(0, playerVelocityX * normalX + playerVelocityY * normalY);
        pad.velocityX += normalX * (playerPush * LILYPAD_PLAYER_BUMP_STRENGTH + overlap * 2.1);
        pad.velocityY += normalY * (playerPush * LILYPAD_PLAYER_BUMP_STRENGTH + overlap * 2.1);
      }
    }

    const clamped = clampMagnitude(pad.velocityX, pad.velocityY, LILYPAD_MAX_SPEED_PIXELS_PER_SECOND);
    pad.velocityX = clamped.x;
    pad.velocityY = clamped.y;
    const damping = Math.exp(-LILYPAD_LINEAR_DRAG * dt);
    pad.velocityX *= damping;
    pad.velocityY *= damping;
    pad.x += pad.velocityX * dt;
    pad.y += pad.velocityY * dt;

    if (!this.isSwampWaterAt(pad.x, pad.y)) {
      // A soft rebound holds pads within the procedural water shape even along a moving shore.
      pad.x += (pad.homeX - pad.x) * Math.min(1, dt * 8);
      pad.y += (pad.homeY - pad.y) * Math.min(1, dt * 8);
      pad.velocityX *= -0.18;
      pad.velocityY *= -0.18;
    }
  }

  private resolvePadContacts(pads: readonly LilyPad[]): void {
    for (let index = 0; index < pads.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < pads.length; otherIndex += 1) {
        const first = pads[index];
        const second = pads[otherIndex];
        const deltaX = second.x - first.x;
        const deltaY = second.y - first.y;
        const distance = Math.hypot(deltaX, deltaY);
        const minimumDistance = LILYPAD_PAD_RADIUS_PIXELS * 1.55;
        if (distance === 0 || distance >= minimumDistance) {
          continue;
        }
        const normalX = deltaX / distance;
        const normalY = deltaY / distance;
        const correction = (minimumDistance - distance) * 0.5;
        first.x -= normalX * correction;
        first.y -= normalY * correction;
        second.x += normalX * correction;
        second.y += normalY * correction;
        const relativeSpeed = (second.velocityX - first.velocityX) * normalX + (second.velocityY - first.velocityY) * normalY;
        if (relativeSpeed < 0) {
          const impulse = relativeSpeed * 0.35;
          first.velocityX += normalX * impulse;
          first.velocityY += normalY * impulse;
          second.velocityX -= normalX * impulse;
          second.velocityY -= normalY * impulse;
        }
      }
    }
  }

  private updatePadArt(pad: LilyPad, time: number): void {
    const seconds = time / 1000;
    pad.image
      .setPosition(pad.x, pad.y + Math.sin(seconds * 1.7 + pad.phase * Math.PI * 2) * LILYPAD_FLOAT_BOB_PIXELS)
      .setRotation(pad.baseRotation + Math.sin(seconds * 0.55 + pad.phase * 8) * 0.045 + pad.velocityX * 0.0018);
  }

  private isSwampWaterAt(worldX: number, worldY: number): boolean {
    const surface = surfaceAtTile(this.seed, worldX / WORLD_TILE_SIZE, worldY / WORLD_TILE_SIZE);
    return surface.biome === Biome.Swamp && surface.isSwampWater && surface.isWater
      && surface.waterVisualAmount >= LILYPAD_MIN_WATER_VISUAL_AMOUNT;
  }
}

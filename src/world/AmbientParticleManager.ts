import Phaser from 'phaser';
import {
  AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
  AMBIENT_PARTICLE_MAX_COUNT,
  AMBIENT_PARTICLE_RADIUS_CELLS_X,
  AMBIENT_PARTICLE_RADIUS_CELLS_Y
} from './explorationConfig';
import { biomeAtTile, Biome } from './generation/biomeGenerator';
import { randomAtTile } from './generation/noise';
import { WORLD_TILE_SIZE } from './worldConfig';

// Every biome gets a distinct moving foreground layer. These are world-space effects rather
// than screen overlays, so a gust crossing the forest still feels anchored to the world.
type ParticleKind = 'leaf' | 'pollen' | 'dust' | 'mist' | 'snow' | 'firefly' | 'spray';

interface AmbientParticle {
  baseX: number;
  baseY: number;
  phase: number;
  driftSpeed: number;
  size: number;
  color: number;
  kind: ParticleKind;
  windStrength: number;
}

export class AmbientParticleManager {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private lastAnchorCellX = Number.NaN;
  private lastAnchorCellY = Number.NaN;
  private particles: AmbientParticle[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly seed: string) {
    this.graphics = scene.add.graphics().setDepth(2.5);
  }

  update(time: number, playerWorldX: number, playerWorldY: number): void {
    const anchorCellX = Math.floor(playerWorldX / AMBIENT_PARTICLE_CELL_SIZE_PIXELS);
    const anchorCellY = Math.floor(playerWorldY / AMBIENT_PARTICLE_CELL_SIZE_PIXELS);
    if (anchorCellX !== this.lastAnchorCellX || anchorCellY !== this.lastAnchorCellY) {
      this.lastAnchorCellX = anchorCellX;
      this.lastAnchorCellY = anchorCellY;
      this.particles = this.createParticles(anchorCellX, anchorCellY);
    }

    const timeSeconds = time / 1000;
    this.graphics.clear();
    this.particles.forEach((particle) => this.drawParticle(particle, timeSeconds));
  }

  destroy(): void {
    this.graphics.destroy();
    this.particles = [];
  }

  private createParticles(anchorCellX: number, anchorCellY: number): AmbientParticle[] {
    const particles: AmbientParticle[] = [];
    const candidates: Array<AmbientParticle & { priority: number }> = [];

    for (let cellY = anchorCellY - AMBIENT_PARTICLE_RADIUS_CELLS_Y; cellY <= anchorCellY + AMBIENT_PARTICLE_RADIUS_CELLS_Y; cellY += 1) {
      for (let cellX = anchorCellX - AMBIENT_PARTICLE_RADIUS_CELLS_X; cellX <= anchorCellX + AMBIENT_PARTICLE_RADIUS_CELLS_X; cellX += 1) {
        const placement = randomAtTile(this.seed, cellX, cellY, 0x7c43a5d1);
        if (placement < 0.2) {
          continue;
        }

        const centerWorldX = (cellX + 0.5) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS;
        const centerWorldY = (cellY + 0.5) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS;
        const biome = biomeAtTile(this.seed, centerWorldX / WORLD_TILE_SIZE, centerWorldY / WORLD_TILE_SIZE);
        const kind = this.kindForBiome(biome, randomAtTile(this.seed, cellX, cellY, 0x3bc6d2a7));
        if (!kind) {
          continue;
        }

        const variation = randomAtTile(this.seed, cellX, cellY, 0xa54cd63b);
        candidates.push({
          baseX: (cellX + 0.12 + randomAtTile(this.seed, cellX, cellY, 0x2ebf9541) * 0.76) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
          baseY: (cellY + 0.1 + randomAtTile(this.seed, cellX, cellY, 0x9f8c1ad5) * 0.8) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
          phase: randomAtTile(this.seed, cellX, cellY, 0x64e19f25) * Math.PI * 2,
          driftSpeed: 0.56 + variation * 0.82,
          size: 2 + variation * 3.4,
          color: this.colorForKind(kind, variation),
          kind,
          windStrength: 18 + randomAtTile(this.seed, cellX, cellY, 0x4d81e8b7) * 32,
          priority: randomAtTile(this.seed, cellX, cellY, 0x1d82f961)
        });
      }
    }

    candidates
      .sort((first, second) => second.priority - first.priority)
      .slice(0, AMBIENT_PARTICLE_MAX_COUNT)
      .forEach(({ priority: _priority, ...particle }) => particles.push(particle));
    return particles;
  }

  private drawParticle(particle: AmbientParticle, timeSeconds: number): void {
    const cycle = timeSeconds * particle.driftSpeed + particle.phase;
    const wind = Math.sin(cycle * 0.7) * particle.windStrength + Math.sin(cycle * 1.63) * 9;
    const x = particle.baseX + wind + Math.cos(cycle * 0.24) * 12;
    const y = particle.baseY + Math.cos(cycle * 0.56) * 13 + Math.sin(cycle * 0.31) * 8;
    const alpha = 0.28 + (Math.sin(cycle * 1.8) + 1) * 0.19;
    const graphics = this.graphics;

    graphics.fillStyle(particle.color, alpha);
    switch (particle.kind) {
      case 'leaf':
        graphics.fillEllipse(x, y, particle.size * 3.6, particle.size * 1.7);
        graphics.lineStyle(0.75, 0x5b3923, alpha * 0.82);
        graphics.lineBetween(x - particle.size * 1.25, y, x + particle.size * 1.35, y + Math.sin(cycle) * 1.2);
        break;
      case 'mist':
        graphics.fillCircle(x, y, particle.size * 2.25);
        graphics.fillStyle(0xe3ffff, alpha * 0.26);
        graphics.fillCircle(x - particle.size * 0.75, y - particle.size * 0.35, particle.size * 0.74);
        break;
      case 'dust':
        graphics.fillEllipse(x, y, particle.size * 4.7, particle.size * 1.65);
        graphics.fillStyle(0xf3d99a, alpha * 0.3);
        graphics.fillCircle(x + particle.size * 1.1, y - 1, particle.size * 0.65);
        break;
      case 'snow':
        graphics.fillCircle(x, y, particle.size * 0.9);
        graphics.lineStyle(0.65, 0xf8ffff, alpha * 0.75);
        graphics.lineBetween(x - particle.size, y, x + particle.size, y);
        graphics.lineBetween(x, y - particle.size, x, y + particle.size);
        break;
      case 'pollen':
        graphics.fillCircle(x, y, particle.size * 0.92);
        graphics.fillStyle(0xfff6aa, alpha * 0.5);
        graphics.fillCircle(x + Math.cos(cycle) * particle.size, y - Math.sin(cycle) * particle.size, particle.size * 0.38);
        break;
      case 'firefly':
        graphics.fillStyle(0xf4f06a, alpha * 0.42);
        graphics.fillCircle(x, y, particle.size * 2.4);
        graphics.fillStyle(0xffffc4, Math.min(1, alpha + 0.3));
        graphics.fillCircle(x, y, particle.size * 0.65);
        break;
      case 'spray':
        graphics.fillEllipse(x, y, particle.size * 3.8, particle.size * 1.2);
        graphics.lineStyle(0.85, 0xd9fbff, alpha * 0.8);
        graphics.lineBetween(x - particle.size * 1.6, y, x + particle.size * 1.8, y - 0.75);
        break;
    }
  }

  private kindForBiome(biome: Biome, variation: number): ParticleKind | null {
    switch (biome) {
      case Biome.Forest:
        return variation > 0.22 ? 'leaf' : 'pollen';
      case Biome.Plains:
        return variation > 0.62 ? 'leaf' : 'pollen';
      case Biome.Desert:
        return 'dust';
      case Biome.Swamp:
        return variation > 0.45 ? 'firefly' : 'mist';
      case Biome.Ocean:
        return 'spray';
      case Biome.Beach:
        return variation > 0.45 ? 'spray' : 'dust';
      case Biome.Hills:
        return variation > 0.5 ? 'dust' : 'pollen';
      case Biome.Mountains:
        return variation > 0.42 ? 'snow' : 'mist';
      case Biome.Snow:
        return 'snow';
    }
  }

  private colorForKind(kind: ParticleKind, variation: number): number {
    switch (kind) {
      case 'leaf':
        return variation > 0.6 ? 0xd8b65b : 0x7faf56;
      case 'pollen':
        return 0xf0df7a;
      case 'dust':
        return 0xd6b072;
      case 'mist':
        return 0xa8dfdf;
      case 'snow':
        return 0xe4fbff;
      case 'firefly':
        return variation > 0.58 ? 0xa9ec5a : 0xf1e567;
      case 'spray':
        return 0xc4f4f2;
    }
  }
}

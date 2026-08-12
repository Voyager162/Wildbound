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

type ParticleKind = 'leaf' | 'pollen' | 'dust' | 'mist' | 'snow';

interface AmbientParticle {
  baseX: number;
  baseY: number;
  phase: number;
  driftSpeed: number;
  size: number;
  color: number;
  kind: ParticleKind;
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
        if (placement < 0.46) {
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
          driftSpeed: 0.55 + variation * 0.55,
          size: 1.5 + variation * 2.3,
          color: this.colorForKind(kind, variation),
          kind,
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
    const x = particle.baseX + Math.sin(cycle * 0.75) * 17 + Math.cos(cycle * 0.24) * 10;
    const y = particle.baseY + Math.cos(cycle * 0.56) * 11 + Math.sin(cycle * 0.31) * 7;
    const alpha = 0.22 + (Math.sin(cycle * 1.8) + 1) * 0.16;
    const graphics = this.graphics;

    graphics.fillStyle(particle.color, alpha);
    switch (particle.kind) {
      case 'leaf':
        graphics.fillEllipse(x, y, particle.size * 2.8, particle.size * 1.45);
        graphics.lineStyle(0.7, 0x6c4128, alpha * 0.72);
        graphics.lineBetween(x - particle.size, y, x + particle.size, y);
        break;
      case 'dust':
      case 'mist':
        graphics.fillCircle(x, y, particle.size * (particle.kind === 'mist' ? 1.9 : 1.35));
        break;
      case 'pollen':
      case 'snow':
        graphics.fillCircle(x, y, particle.size * 0.75);
        break;
    }
  }

  private kindForBiome(biome: Biome, variation: number): ParticleKind | null {
    switch (biome) {
      case Biome.Forest:
        return variation > 0.36 ? 'leaf' : 'pollen';
      case Biome.Plains:
        return variation > 0.58 ? 'pollen' : 'leaf';
      case Biome.Desert:
      case Biome.Hills:
        return 'dust';
      case Biome.Swamp:
      case Biome.Ocean:
      case Biome.Beach:
        return 'mist';
      case Biome.Snow:
      case Biome.Mountains:
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
    }
  }
}

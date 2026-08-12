import Phaser from 'phaser';
import {
  AMBIENT_BIOME_TUNING,
  AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
  AMBIENT_PARTICLE_MAX_COUNT,
  AMBIENT_PARTICLE_RADIUS_CELLS_X,
  AMBIENT_PARTICLE_RADIUS_CELLS_Y,
  NIGHT_AMBIENT_LIGHT_MAX_COUNT,
  NIGHT_AMBIENT_LIGHT_RETENTION_CELLS
} from './explorationConfig';
import {
  AMBIENT_PARTICLE_PRELOAD_CELLS_X,
  AMBIENT_PARTICLE_PRELOAD_CELLS_Y,
  AMBIENT_PARTICLE_RETENTION_CELLS
} from './ambientBufferConfig';
import { biomeAtTile, Biome } from './generation/biomeGenerator';
import { randomAtTile } from './generation/noise';
import { WORLD_TILE_SIZE } from './worldConfig';

// Every biome gets a distinct moving foreground layer. These are world-space effects rather
// than screen overlays, so a gust crossing the forest still feels anchored to the world.
type ParticleKind = 'leaf' | 'pollen' | 'dust' | 'sand' | 'mist' | 'spore' | 'snow' | 'firefly' | 'spray' | 'ice-crystal';

export interface NightAmbientLight {
  worldX: number;
  worldY: number;
  radius: number;
  color: number;
  intensity: number;
}

interface AmbientParticle {
  id: string;
  cellX: number;
  cellY: number;
  lightPriority: number;
  baseX: number;
  baseY: number;
  phase: number;
  driftSpeed: number;
  size: number;
  color: number;
  kind: ParticleKind;
  windStrength: number;
  nightLightColor: number;
  nightLightRadius: number;
  nightLightIntensity: number;
}

export class AmbientParticleManager {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private lastAnchorCellX = Number.NaN;
  private lastAnchorCellY = Number.NaN;
  private particles: AmbientParticle[] = [];
  private readonly particlePool = new Map<string, AmbientParticle>();
  private readonly lightParticles = new Map<string, AmbientParticle>();
  private nightLights: NightAmbientLight[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly seed: string) {
    this.graphics = scene.add.graphics().setDepth(2.5);
  }

  update(time: number, playerWorldX: number, playerWorldY: number, nightAmount: number): void {
    const anchorCellX = Math.floor(playerWorldX / AMBIENT_PARTICLE_CELL_SIZE_PIXELS);
    const anchorCellY = Math.floor(playerWorldY / AMBIENT_PARTICLE_CELL_SIZE_PIXELS);
    if (anchorCellX !== this.lastAnchorCellX || anchorCellY !== this.lastAnchorCellY) {
      this.lastAnchorCellX = anchorCellX;
      this.lastAnchorCellY = anchorCellY;
      this.refreshStableParticlePool(this.createParticles(anchorCellX, anchorCellY), anchorCellX, anchorCellY);
      this.refreshStableLightPool(anchorCellX, anchorCellY);
    }

    const timeSeconds = time / 1000;
    this.graphics.clear();
    this.particles.forEach((particle) => {
      const state = this.particleState(particle, timeSeconds);
      this.drawParticle(particle, state, nightAmount);
    });
  }

  getNightLights(time: number): readonly NightAmbientLight[] {
    const timeSeconds = time / 1000;
    // Particle rendering is deliberately throttled, but each light is evaluated from its analytic
    // motion curve at the exact frame time. This preserves smooth drifting without increasing the
    // draw cost of the foreground particle Graphics layer.
    this.nightLights = Array.from(this.lightParticles.values(), (particle) => {
      const state = this.particleState(particle, timeSeconds);
      const pulse = 0.72 + (Math.sin(state.cycle * 1.9 + particle.phase * 0.44) + 1) * 0.14;
      return {
        worldX: state.x,
        worldY: state.y,
        radius: particle.nightLightRadius * (0.9 + pulse * 0.12),
        color: particle.nightLightColor,
        intensity: particle.nightLightIntensity * pulse
      };
    });
    return this.nightLights;
  }

  destroy(): void {
    this.graphics.destroy();
    this.particles = [];
    this.particlePool.clear();
    this.lightParticles.clear();
    this.nightLights = [];
  }

  private createParticles(anchorCellX: number, anchorCellY: number): AmbientParticle[] {
    const particles: AmbientParticle[] = [];
    const candidates: Array<AmbientParticle & { priority: number }> = [];

    const radiusX = AMBIENT_PARTICLE_RADIUS_CELLS_X + AMBIENT_PARTICLE_PRELOAD_CELLS_X;
    const radiusY = AMBIENT_PARTICLE_RADIUS_CELLS_Y + AMBIENT_PARTICLE_PRELOAD_CELLS_Y;
    for (let cellY = anchorCellY - radiusY; cellY <= anchorCellY + radiusY; cellY += 1) {
      for (let cellX = anchorCellX - radiusX; cellX <= anchorCellX + radiusX; cellX += 1) {
        const placement = randomAtTile(this.seed, cellX, cellY, 0x7c43a5d1);
        const centerWorldX = (cellX + 0.5) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS;
        const centerWorldY = (cellY + 0.5) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS;
        const biome = biomeAtTile(this.seed, centerWorldX / WORLD_TILE_SIZE, centerWorldY / WORLD_TILE_SIZE);
        if (placement > AMBIENT_BIOME_TUNING[biome].particleSpawnChance) {
          continue;
        }

        const kind = this.kindForBiome(biome, randomAtTile(this.seed, cellX, cellY, 0x3bc6d2a7));
        if (!kind) {
          continue;
        }

        const variation = randomAtTile(this.seed, cellX, cellY, 0xa54cd63b);
        const nightLight = this.nightLightFor(biome, kind, variation);
        candidates.push({
          ...this.particleIdentity(cellX, cellY, 'base', 0x1d82f961),
          baseX: (cellX + 0.12 + randomAtTile(this.seed, cellX, cellY, 0x2ebf9541) * 0.76) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
          baseY: (cellY + 0.1 + randomAtTile(this.seed, cellX, cellY, 0x9f8c1ad5) * 0.8) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
          phase: randomAtTile(this.seed, cellX, cellY, 0x64e19f25) * Math.PI * 2,
          driftSpeed: 0.56 + variation * 0.82,
          size: 2 + variation * 3.4,
          color: this.colorForKind(kind, variation),
          kind,
          windStrength: 18 + randomAtTile(this.seed, cellX, cellY, 0x4d81e8b7) * 32,
          ...this.tuneNightLight(biome, cellX, cellY, 0x6b73c12d, nightLight),
          priority: randomAtTile(this.seed, cellX, cellY, 0x1d82f961)
        });

        // Cold highlands get an additional drifting mote layer so snowfields and mountain
        // passes feel active even when their terrain features are sparse.
        if ((biome === Biome.Snow || biome === Biome.Mountains) && variation > 0.22) {
          const highlandVariation = randomAtTile(this.seed, cellX, cellY, 0x6be71af3);
          const highlandKind = highlandVariation > 0.62 ? 'ice-crystal' : 'snow';
          candidates.push({
            ...this.particleIdentity(cellX, cellY, 'highland', 0x139dd507),
            baseX: (cellX + 0.08 + randomAtTile(this.seed, cellX, cellY, 0x66c6b921) * 0.86) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
            baseY: (cellY + 0.06 + randomAtTile(this.seed, cellX, cellY, 0x8aa751ef) * 0.86) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
            phase: randomAtTile(this.seed, cellX, cellY, 0x2b5297d1) * Math.PI * 2,
            driftSpeed: 0.38 + highlandVariation * 0.7,
            size: 2.4 + highlandVariation * 3.8,
            color: highlandVariation > 0.58 ? 0xd8fbff : 0x9fe8fb,
            kind: highlandKind,
            windStrength: 24 + highlandVariation * 42,
            ...this.tuneNightLight(biome, cellX, cellY, 0x71a4d0e1, this.nightLightFor(biome, highlandKind, highlandVariation)),
            priority: 0.5 + randomAtTile(this.seed, cellX, cellY, 0x139dd507) * 0.5
          });
        }

        // Desert gusts are a separate, long-traveling layer from generic dust so arid regions
        // remain visibly alive even when the wind is moving parallel to the player.
        if (biome === Biome.Desert && variation > 0.1) {
          const sandVariation = randomAtTile(this.seed, cellX, cellY, 0x3a84f1c9);
          candidates.push({
            ...this.particleIdentity(cellX, cellY, 'sand', 0x5b6fd841),
            baseX: (cellX + 0.04 + randomAtTile(this.seed, cellX, cellY, 0x246f3b81) * 0.92) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
            baseY: (cellY + 0.18 + randomAtTile(this.seed, cellX, cellY, 0x664da8c7) * 0.64) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
            phase: randomAtTile(this.seed, cellX, cellY, 0x7a5237bd) * Math.PI * 2,
            driftSpeed: 0.9 + sandVariation * 0.95,
            size: 2.6 + sandVariation * 3.6,
            color: sandVariation > 0.54 ? 0xf1cf83 : 0xc8914c,
            kind: 'sand',
            windStrength: 44 + sandVariation * 54,
            ...this.tuneNightLight(biome, cellX, cellY, 0x3cd11895, this.nightLightFor(biome, 'sand', sandVariation)),
            priority: 0.55 + randomAtTile(this.seed, cellX, cellY, 0x5b6fd841) * 0.45
          });
        }

        // Swamp spores complement low mist and fireflies with a subtle upward-drifting life layer.
        if (biome === Biome.Swamp && variation > 0.46) {
          const sporeVariation = randomAtTile(this.seed, cellX, cellY, 0x17d9a3e5);
          candidates.push({
            ...this.particleIdentity(cellX, cellY, 'spore', 0x6c318f59),
            baseX: (cellX + 0.14 + randomAtTile(this.seed, cellX, cellY, 0x4f3d6657) * 0.72) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
            baseY: (cellY + 0.06 + randomAtTile(this.seed, cellX, cellY, 0x2e8bc4d1) * 0.84) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
            phase: randomAtTile(this.seed, cellX, cellY, 0x1d5ab743) * Math.PI * 2,
            driftSpeed: 0.34 + sporeVariation * 0.5,
            size: 1.7 + sporeVariation * 2.4,
            color: sporeVariation > 0.56 ? 0xb8e584 : 0x83c889,
            kind: 'spore',
            windStrength: 11 + sporeVariation * 18,
            ...this.tuneNightLight(biome, cellX, cellY, 0x57b59a29, this.nightLightFor(biome, 'spore', sporeVariation)),
            priority: 0.45 + randomAtTile(this.seed, cellX, cellY, 0x6c318f59) * 0.42
          });
        }

        // Forest and swamp fireflies emerge from a separate deterministic layer, so each
        // wetland and grove has an unmistakable night identity without raising the day particle
        // density or allocating new objects every frame.
        if ((biome === Biome.Forest || biome === Biome.Swamp) && variation > 0.16) {
          const fireflyVariation = randomAtTile(this.seed, cellX, cellY, 0x4619d5af);
          candidates.push({
            ...this.particleIdentity(cellX, cellY, 'firefly', 0x6492b31b),
            baseX: (cellX + 0.14 + randomAtTile(this.seed, cellX, cellY, 0x7b14c0e1) * 0.72) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
            baseY: (cellY + 0.12 + randomAtTile(this.seed, cellX, cellY, 0x9bd1f743) * 0.68) * AMBIENT_PARTICLE_CELL_SIZE_PIXELS,
            phase: randomAtTile(this.seed, cellX, cellY, 0xf20db7c1) * Math.PI * 2,
            driftSpeed: 0.32 + fireflyVariation * 0.42,
            size: 2 + fireflyVariation * 2.1,
            color: fireflyVariation > 0.5 ? 0xb8ee63 : 0xffe66e,
            kind: 'firefly',
            windStrength: 8 + fireflyVariation * 16,
            ...this.tuneNightLight(biome, cellX, cellY, 0x3e4db809, this.nightLightFor(biome, 'firefly', fireflyVariation)),
            priority: 0.72 + randomAtTile(this.seed, cellX, cellY, 0x6492b31b) * 0.28
          });
        }
      }
    }

    candidates
      .sort((first, second) => second.priority - first.priority)
      .slice(0, AMBIENT_PARTICLE_MAX_COUNT)
      .forEach(({ priority: _priority, ...particle }) => particles.push(particle));
    return particles;
  }

  private refreshStableParticlePool(
    candidates: readonly AmbientParticle[],
    anchorCellX: number,
    anchorCellY: number
  ): void {
    const retainRadiusX = AMBIENT_PARTICLE_RADIUS_CELLS_X
      + AMBIENT_PARTICLE_RETENTION_CELLS;
    const retainRadiusY = AMBIENT_PARTICLE_RADIUS_CELLS_Y
      + AMBIENT_PARTICLE_RETENTION_CELLS;
    this.particlePool.forEach((particle, id) => {
      if (Math.abs(particle.cellX - anchorCellX) > retainRadiusX || Math.abs(particle.cellY - anchorCellY) > retainRadiusY) {
        this.particlePool.delete(id);
      }
    });

    candidates
      .filter((particle) => !this.particlePool.has(particle.id))
      .sort((first, second) => second.lightPriority - first.lightPriority)
      .some((particle) => {
        this.particlePool.set(particle.id, particle);
        return this.particlePool.size >= AMBIENT_PARTICLE_MAX_COUNT;
      });

    this.particles = Array.from(this.particlePool.values());
  }

  private refreshStableLightPool(anchorCellX: number, anchorCellY: number): void {
    const retainRadiusX = AMBIENT_PARTICLE_RADIUS_CELLS_X
      + NIGHT_AMBIENT_LIGHT_RETENTION_CELLS;
    const retainRadiusY = AMBIENT_PARTICLE_RADIUS_CELLS_Y
      + NIGHT_AMBIENT_LIGHT_RETENTION_CELLS;
    this.lightParticles.forEach((particle, id) => {
      if (Math.abs(particle.cellX - anchorCellX) > retainRadiusX || Math.abs(particle.cellY - anchorCellY) > retainRadiusY) {
        this.lightParticles.delete(id);
      }
    });

    if (this.lightParticles.size >= NIGHT_AMBIENT_LIGHT_MAX_COUNT) {
      return;
    }

    this.particles
      .filter((particle) => particle.nightLightIntensity > 0 && !this.lightParticles.has(particle.id))
      .sort((first, second) => second.lightPriority - first.lightPriority)
      .some((particle) => {
        this.lightParticles.set(particle.id, particle);
        return this.lightParticles.size >= NIGHT_AMBIENT_LIGHT_MAX_COUNT;
      });
  }

  private particleIdentity(
    cellX: number,
    cellY: number,
    variant: string,
    prioritySalt: number
  ): Pick<AmbientParticle, 'id' | 'cellX' | 'cellY' | 'lightPriority'> {
    return {
      id: `${cellX},${cellY}:${variant}`,
      cellX,
      cellY,
      lightPriority: randomAtTile(this.seed, cellX, cellY, prioritySalt)
    };
  }

  private tuneNightLight(
    biome: Biome,
    cellX: number,
    cellY: number,
    sourceSalt: number,
    light: Pick<AmbientParticle, 'nightLightColor' | 'nightLightRadius' | 'nightLightIntensity'>
  ): Pick<AmbientParticle, 'nightLightColor' | 'nightLightRadius' | 'nightLightIntensity'> {
    const tuning = AMBIENT_BIOME_TUNING[biome];
    if (randomAtTile(this.seed, cellX, cellY, sourceSalt) > tuning.lightSpawnChance) {
      return { ...light, nightLightRadius: 0, nightLightIntensity: 0 };
    }

    return {
      nightLightColor: light.nightLightColor,
      nightLightRadius: light.nightLightRadius * tuning.glowRadiusMultiplier,
      nightLightIntensity: light.nightLightIntensity * tuning.glowIntensityMultiplier
    };
  }

  private particleState(particle: AmbientParticle, timeSeconds: number): { x: number; y: number; cycle: number; alpha: number } {
    const cycle = timeSeconds * particle.driftSpeed + particle.phase;
    const wind = Math.sin(cycle * 0.7) * particle.windStrength + Math.sin(cycle * 1.63) * 9;
    return {
      cycle,
      x: particle.baseX + wind + Math.cos(cycle * 0.24) * 12,
      y: particle.baseY + Math.cos(cycle * 0.56) * 13 + Math.sin(cycle * 0.31) * 8,
      alpha: 0.28 + (Math.sin(cycle * 1.8) + 1) * 0.19
    };
  }

  private drawParticle(
    particle: AmbientParticle,
    state: { x: number; y: number; cycle: number; alpha: number },
    nightAmount: number
  ): void {
    const { x, y, cycle } = state;
    const alpha = particle.kind === 'firefly'
      ? (nightAmount <= 0.04 ? 0 : state.alpha * nightAmount)
      : state.alpha;
    const graphics = this.graphics;

    if (nightAmount > 0.04 && particle.nightLightIntensity > 0) {
      const glowAlpha = particle.nightLightIntensity * nightAmount * (0.1 + (Math.sin(cycle * 1.7) + 1) * 0.055);
      graphics.fillStyle(particle.nightLightColor, glowAlpha);
      graphics.fillCircle(x, y, particle.nightLightRadius * 0.34);
      graphics.fillStyle(0xffffff, glowAlpha * 0.62);
      graphics.fillCircle(x, y, Math.max(1, particle.size * 0.55));
    }

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
      case 'sand':
        graphics.fillEllipse(x, y, particle.size * 6.4, particle.size * 1.05);
        graphics.lineStyle(0.9, 0xffdc8e, alpha * 0.82);
        graphics.lineBetween(x - particle.size * 2.6, y + 0.8, x + particle.size * 3.1, y - 0.7);
        graphics.fillStyle(0xf7d587, alpha * 0.42);
        graphics.fillCircle(x + particle.size * 1.8, y - 1.4, particle.size * 0.48);
        break;
      case 'spore':
        graphics.fillCircle(x, y, particle.size * 0.8);
        graphics.fillStyle(0xe1ffc1, alpha * 0.5);
        graphics.fillCircle(x + Math.sin(cycle) * particle.size, y - particle.size * 1.1, particle.size * 0.38);
        break;
      case 'snow':
        graphics.fillCircle(x, y, particle.size * 0.9);
        graphics.lineStyle(0.65, 0xf8ffff, alpha * 0.75);
        graphics.lineBetween(x - particle.size, y, x + particle.size, y);
        graphics.lineBetween(x, y - particle.size, x, y + particle.size);
        break;
      case 'ice-crystal':
        graphics.fillStyle(0x9eeeff, alpha * 0.45);
        graphics.fillCircle(x, y, particle.size * 2.3);
        graphics.fillStyle(0xf1ffff, Math.min(1, alpha + 0.32));
        graphics.fillTriangle(x, y - particle.size * 1.4, x + particle.size, y + particle.size, x - particle.size, y + particle.size);
        graphics.lineStyle(0.85, 0x8bd8ec, alpha * 0.9);
        graphics.lineBetween(x - particle.size * 1.7, y, x + particle.size * 1.7, y);
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
        return variation > 0.78 ? 'firefly' : variation > 0.26 ? 'leaf' : 'pollen';
      case Biome.Plains:
        return variation > 0.62 ? 'leaf' : 'pollen';
      case Biome.Desert:
        return variation > 0.42 ? 'sand' : 'dust';
      case Biome.Swamp:
        return variation > 0.45 ? 'firefly' : 'mist';
      case Biome.Ocean:
        return 'spray';
      case Biome.Beach:
        return variation > 0.45 ? 'spray' : 'dust';
      case Biome.Hills:
        return variation > 0.5 ? 'dust' : 'pollen';
      case Biome.Mountains:
        return variation > 0.68 ? 'ice-crystal' : variation > 0.2 ? 'snow' : 'mist';
      case Biome.Snow:
        return variation > 0.72 ? 'ice-crystal' : 'snow';
    }
  }

  private nightLightFor(
    biome: Biome,
    kind: ParticleKind,
    variation: number
  ): Pick<AmbientParticle, 'nightLightColor' | 'nightLightRadius' | 'nightLightIntensity'> {
    // Every biome has a restrained nighttime color language. These values describe the light
    // contribution only; the visible daytime particle remains appropriate for its biome.
    switch (biome) {
      case Biome.Forest:
        return kind === 'firefly'
          ? { nightLightColor: variation > 0.5 ? 0xc5ff6a : 0xffe879, nightLightRadius: 92 + variation * 34, nightLightIntensity: 0.72 }
          : { nightLightColor: 0xb5e66d, nightLightRadius: 42, nightLightIntensity: 0.16 };
      case Biome.Plains:
        return { nightLightColor: 0xf9df83, nightLightRadius: 44 + variation * 18, nightLightIntensity: 0.18 };
      case Biome.Desert:
        return { nightLightColor: 0xe6b977, nightLightRadius: 38 + variation * 16, nightLightIntensity: 0.14 };
      case Biome.Swamp:
        return kind === 'firefly'
          ? { nightLightColor: variation > 0.48 ? 0x9cff74 : 0xffe47a, nightLightRadius: 98 + variation * 36, nightLightIntensity: 0.78 }
          : { nightLightColor: 0x8fe7a8, nightLightRadius: 56 + variation * 20, nightLightIntensity: 0.28 };
      case Biome.Ocean:
        return { nightLightColor: 0x9ceeff, nightLightRadius: 48 + variation * 18, nightLightIntensity: 0.22 };
      case Biome.Beach:
        return { nightLightColor: 0xbceaff, nightLightRadius: 46 + variation * 16, nightLightIntensity: 0.2 };
      case Biome.Hills:
        return { nightLightColor: 0xf0d490, nightLightRadius: 40 + variation * 16, nightLightIntensity: 0.15 };
      case Biome.Mountains:
        return { nightLightColor: 0x91dbff, nightLightRadius: 62 + variation * 24, nightLightIntensity: 0.31 };
      case Biome.Snow:
        return { nightLightColor: 0xc9f8ff, nightLightRadius: 58 + variation * 24, nightLightIntensity: 0.3 };
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
      case 'sand':
        return variation > 0.5 ? 0xf1cf83 : 0xc8914c;
      case 'mist':
        return 0xa8dfdf;
      case 'spore':
        return variation > 0.5 ? 0xb8e584 : 0x83c889;
      case 'snow':
        return 0xe4fbff;
      case 'firefly':
        return variation > 0.58 ? 0xa9ec5a : 0xf1e567;
      case 'spray':
        return 0xc4f4f2;
      case 'ice-crystal':
        return variation > 0.55 ? 0x9ce9ff : 0xd8fbff;
    }
  }
}

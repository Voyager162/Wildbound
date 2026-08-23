import Phaser from 'phaser';
import { TERRAIN_MATERIAL_TEXTURE_KEYS } from './terrainMaterialConfig';

type TerrainMaterialName = keyof typeof TERRAIN_MATERIAL_TEXTURE_KEYS;

interface TerrainMaterialPixels {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

type TerrainMaterialSet = Readonly<Record<TerrainMaterialName, TerrainMaterialPixels | null>>;

interface WorkerResultMessage {
  readonly type: 'complete';
  readonly id: number;
  readonly pixels: ArrayBuffer;
  readonly waterKinds: ArrayBuffer;
}

interface WorkerFailureMessage {
  readonly type: 'failed';
  readonly id: number;
  readonly message: string;
}

type WorkerMessage = WorkerResultMessage | WorkerFailureMessage;

interface PendingBake {
  readonly resolve: (bake: TerrainBake) => void;
  readonly reject: (reason: Error) => void;
  readonly worker: TerrainBakeWorker;
}

interface TerrainBakeWorker {
  readonly worker: Worker;
  readonly requestIds: Set<number>;
}

export interface TerrainBake {
  readonly pixels: Uint8ClampedArray;
  // One compact 8px visual cell per entry: 0 = dry, 1 = ocean/surf, 2 = swamp water.
  readonly waterKinds: Uint8Array;
}

// The detailed terrain colour bake is pure seeded math. Keep it in a dedicated worker so a
// streamed chunk cannot block input, camera motion, or Phaser's renderer. Phaser still owns the
// final texture upload on the main thread, which keeps masks and all existing scene systems safe.
class TerrainBakeService {
  private readonly workers: TerrainBakeWorker[] = [];
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingBake>();
  private materials: TerrainMaterialSet | null = null;

  request(scene: Phaser.Scene, seed: string, chunkX: number, chunkY: number): Promise<TerrainBake> {
    const worker = this.selectWorker(scene);
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise<TerrainBake>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, worker });
      worker.requestIds.add(id);
      worker.worker.postMessage({ type: 'bake', id, seed, chunkX, chunkY });
    });
  }

  private selectWorker(scene: Phaser.Scene): TerrainBakeWorker {
    this.ensureWorkers(scene);
    return this.workers.reduce((best, candidate) =>
      candidate.requestIds.size < best.requestIds.size ? candidate : best
    );
  }

  private ensureWorkers(scene: Phaser.Scene): void {
    const requestedCount = this.workerCount();
    if (this.workers.length >= requestedCount) {
      return;
    }

    this.materials ??= this.readMaterials(scene);
    while (this.workers.length < requestedCount) {
      const worker = new Worker(new URL('./terrainBakeWorker.ts', import.meta.url), { type: 'module' });
      const entry: TerrainBakeWorker = { worker, requestIds: new Set<number>() };
      worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => this.handleWorkerMessage(entry, event));
      worker.addEventListener('error', () => this.handleWorkerError(entry));
      // Structured cloning keeps a private material snapshot in every worker. Unlike transfer,
      // this lets a small pool bake independent chunks in parallel without changing pixels or
      // deterministic output.
      worker.postMessage({ type: 'initialize', materials: this.materials });
      this.workers.push(entry);
    }
  }

  private workerCount(): number {
    const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
    if (cores >= 12) return 3;
    if (cores >= 6) return 2;
    return 1;
  }

  private readMaterials(scene: Phaser.Scene): TerrainMaterialSet {
    const read = (material: TerrainMaterialName): TerrainMaterialPixels | null => {
      const textureKey = TERRAIN_MATERIAL_TEXTURE_KEYS[material];
      if (!scene.textures.exists(textureKey)) {
        return null;
      }

      const source = scene.textures.get(textureKey).getSourceImage() as HTMLImageElement;
      const width = source.naturalWidth || source.width;
      const height = source.naturalHeight || source.height;
      if (width <= 0 || height <= 0) {
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        return null;
      }

      context.drawImage(source, 0, 0, width, height);
      return { width, height, pixels: context.getImageData(0, 0, width, height).data };
    };

    return {
      plains: read('plains'),
      desert: read('desert'),
      beach: read('beach'),
      rocky: read('rocky'),
      snow: read('snow')
    };
  }

  private handleWorkerMessage(worker: TerrainBakeWorker, event: MessageEvent<WorkerMessage>): void {
    const message = event.data;
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);
    worker.requestIds.delete(message.id);
    if (message.type === 'complete') {
      pending.resolve({
        pixels: new Uint8ClampedArray(message.pixels),
        waterKinds: new Uint8Array(message.waterKinds)
      });
    } else {
      pending.reject(new Error(message.message));
    }
  }

  private handleWorkerError(worker: TerrainBakeWorker): void {
    const failure = new Error('Wildbound terrain worker stopped unexpectedly.');
    worker.requestIds.forEach((id) => {
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        pending.reject(failure);
      }
    });
    worker.requestIds.clear();
    worker.worker.terminate();
    const index = this.workers.indexOf(worker);
    if (index >= 0) {
      this.workers.splice(index, 1);
    }
  }
}

const terrainBakeService = new TerrainBakeService();

export const requestTerrainBake = (
  scene: Phaser.Scene,
  seed: string,
  chunkX: number,
  chunkY: number
): Promise<TerrainBake> => terrainBakeService.request(scene, seed, chunkX, chunkY);

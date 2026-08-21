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
}

interface WorkerFailureMessage {
  readonly type: 'failed';
  readonly id: number;
  readonly message: string;
}

type WorkerMessage = WorkerResultMessage | WorkerFailureMessage;

interface PendingBake {
  readonly resolve: (pixels: Uint8ClampedArray) => void;
  readonly reject: (reason: Error) => void;
}

// The detailed terrain colour bake is pure seeded math. Keep it in a dedicated worker so a
// streamed chunk cannot block input, camera motion, or Phaser's renderer. Phaser still owns the
// final texture upload on the main thread, which keeps masks and all existing scene systems safe.
class TerrainBakeService {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingBake>();

  request(scene: Phaser.Scene, seed: string, chunkX: number, chunkY: number): Promise<Uint8ClampedArray> {
    const worker = this.ensureWorker(scene);
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise<Uint8ClampedArray>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'bake', id, seed, chunkX, chunkY });
    });
  }

  private ensureWorker(scene: Phaser.Scene): Worker {
    if (this.worker) {
      return this.worker;
    }

    const worker = new Worker(new URL('./terrainBakeWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', this.handleWorkerMessage);
    worker.addEventListener('error', this.handleWorkerError);
    const materials = this.readMaterials(scene);
    const transferables = Object.values(materials)
      .flatMap((material) => material ? [material.pixels.buffer] : []);
    worker.postMessage({ type: 'initialize', materials }, transferables);
    this.worker = worker;
    return worker;
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

  private readonly handleWorkerMessage = (event: MessageEvent<WorkerMessage>): void => {
    const message = event.data;
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);
    if (message.type === 'complete') {
      pending.resolve(new Uint8ClampedArray(message.pixels));
    } else {
      pending.reject(new Error(message.message));
    }
  };

  private readonly handleWorkerError = (): void => {
    const failure = new Error('Wildbound terrain worker stopped unexpectedly.');
    this.pending.forEach(({ reject }) => reject(failure));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  };
}

const terrainBakeService = new TerrainBakeService();

export const requestTerrainBake = (
  scene: Phaser.Scene,
  seed: string,
  chunkX: number,
  chunkY: number
): Promise<Uint8ClampedArray> => terrainBakeService.request(scene, seed, chunkX, chunkY);

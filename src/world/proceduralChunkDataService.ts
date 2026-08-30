import type { CaveEntrance } from './caves/caveGenerator';
import type { TerrainFeature } from './generation/featureGenerator';
import type { GroundGrassCandidate } from './generation/groundGrassGenerator';

interface WorkerCompleteMessage {
  readonly type: 'complete';
  readonly id: number;
  readonly features: TerrainFeature[];
  readonly caveEntrances: CaveEntrance[];
  readonly groundGrassCandidates: GroundGrassCandidate[];
}

interface WorkerFailureMessage {
  readonly type: 'failed';
  readonly id: number;
  readonly message: string;
}

type WorkerMessage = WorkerCompleteMessage | WorkerFailureMessage;

interface DataWorker {
  readonly worker: Worker;
  readonly requestIds: Set<number>;
}

interface PendingRequest {
  readonly cacheKey: string;
  readonly worker: DataWorker;
  readonly resolve: (data: ProceduralChunkData) => void;
  readonly reject: (error: Error) => void;
}

export interface ProceduralChunkData {
  readonly chunkX: number;
  readonly chunkY: number;
  readonly features: readonly TerrainFeature[];
  readonly caveEntrances: readonly CaveEntrance[];
  readonly groundGrassCandidates: readonly GroundGrassCandidate[];
}

class ProceduralChunkDataService {
  private static readonly MAX_CACHED_CHUNKS = 768;
  private readonly workers: DataWorker[] = [];
  private readonly pending = new Map<number, PendingRequest>();
  private readonly pendingByCoordinate = new Map<string, Promise<ProceduralChunkData>>();
  private readonly completed = new Map<string, ProceduralChunkData>();
  private nextRequestId = 1;

  request(seed: string, chunkX: number, chunkY: number): Promise<ProceduralChunkData> {
    const cacheKey = `${seed}:${chunkX},${chunkY}`;
    const cached = this.completed.get(cacheKey);
    if (cached) {
      this.completed.delete(cacheKey);
      this.completed.set(cacheKey, cached);
      return Promise.resolve(cached);
    }
    const existing = this.pendingByCoordinate.get(cacheKey);
    if (existing) {
      return existing;
    }

    const worker = this.selectWorker();
    const id = this.nextRequestId++;
    const request = new Promise<ProceduralChunkData>((resolve, reject) => {
      this.pending.set(id, { cacheKey, worker, resolve, reject });
      worker.requestIds.add(id);
      worker.worker.postMessage({ type: 'generate', id, seed, chunkX, chunkY });
    });
    this.pendingByCoordinate.set(cacheKey, request);
    return request;
  }

  private selectWorker(): DataWorker {
    this.ensureWorkers();
    return this.workers.reduce((best, candidate) => (
      candidate.requestIds.size < best.requestIds.size ? candidate : best
    ));
  }

  private ensureWorkers(): void {
    const cores = navigator.hardwareConcurrency || 4;
    const count = cores >= 8 ? 2 : 1;
    while (this.workers.length < count) {
      const worker = new Worker(new URL('./proceduralChunkDataWorker.ts', import.meta.url), { type: 'module' });
      const entry = { worker, requestIds: new Set<number>() };
      worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => this.handleMessage(entry, event.data));
      worker.addEventListener('error', () => this.handleWorkerError(entry));
      this.workers.push(entry);
    }
  }

  private handleMessage(worker: DataWorker, message: WorkerMessage): void {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    this.pendingByCoordinate.delete(pending.cacheKey);
    worker.requestIds.delete(message.id);
    if (message.type === 'failed') {
      pending.reject(new Error(message.message));
      return;
    }

    const separator = pending.cacheKey.lastIndexOf(':');
    const [chunkX, chunkY] = pending.cacheKey.slice(separator + 1).split(',').map(Number);
    const data: ProceduralChunkData = {
      chunkX,
      chunkY,
      features: message.features,
      caveEntrances: message.caveEntrances,
      groundGrassCandidates: message.groundGrassCandidates
    };
    this.completed.set(pending.cacheKey, data);
    while (this.completed.size > ProceduralChunkDataService.MAX_CACHED_CHUNKS) {
      const oldest = this.completed.keys().next().value as string | undefined;
      if (!oldest) break;
      this.completed.delete(oldest);
    }
    pending.resolve(data);
  }

  private handleWorkerError(worker: DataWorker): void {
    const failure = new Error('Wildbound procedural chunk-data worker stopped unexpectedly.');
    worker.requestIds.forEach((id) => {
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      this.pendingByCoordinate.delete(pending.cacheKey);
      pending.reject(failure);
    });
    worker.requestIds.clear();
    worker.worker.terminate();
    const index = this.workers.indexOf(worker);
    if (index >= 0) this.workers.splice(index, 1);
  }
}

const proceduralChunkDataService = new ProceduralChunkDataService();

export const requestProceduralChunkNeighborhood = async (
  seed: string,
  centerChunkX: number,
  centerChunkY: number
): Promise<readonly ProceduralChunkData[]> => {
  const requests: Array<Promise<ProceduralChunkData>> = [];
  for (let chunkY = centerChunkY - 1; chunkY <= centerChunkY + 1; chunkY += 1) {
    for (let chunkX = centerChunkX - 1; chunkX <= centerChunkX + 1; chunkX += 1) {
      requests.push(proceduralChunkDataService.request(seed, chunkX, chunkY));
    }
  }
  return Promise.all(requests);
};

import { generateChunkCaveEntrances } from './caves/caveGenerator';
import { generateChunkFeatures } from './generation/featureGenerator';

interface GenerateMessage {
  readonly type: 'generate';
  readonly id: number;
  readonly seed: string;
  readonly chunkX: number;
  readonly chunkY: number;
}

interface ProceduralDataWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<GenerateMessage>) => void): void;
  postMessage(message: unknown): void;
}

const workerScope = self as unknown as ProceduralDataWorkerScope;

workerScope.addEventListener('message', (event) => {
  const message = event.data;
  try {
    workerScope.postMessage({
      type: 'complete',
      id: message.id,
      features: generateChunkFeatures(message.seed, message.chunkX, message.chunkY),
      caveEntrances: generateChunkCaveEntrances(message.seed, message.chunkX, message.chunkY)
    });
  } catch (error) {
    workerScope.postMessage({
      type: 'failed',
      id: message.id,
      message: error instanceof Error ? error.message : 'Procedural chunk-data worker failed.'
    });
  }
});

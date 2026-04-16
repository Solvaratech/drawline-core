import { Worker, MessageChannel, parentPort } from "worker_threads";
import * as path from "path";
import * as os from "os";

export interface WorkerTask {
  event: "start_generation" | "start_export";
  data: unknown;
}

export interface WorkerResult {
  event: "done" | "error" | "progress";
  data?: unknown;
  error?: string;
}

export interface WorkerPoolOptions {
  maxWorkers?: number;
  workerPath?: string;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: Array<{ task: WorkerTask; resolve: (result: WorkerResult) => void; reject: (error: Error) => void }> = [];
  private activeWorkers = 0;
  private maxWorkers: number;
  private workerPath: string;
  private channel: MessageChannel | null = null;

  constructor(options: WorkerPoolOptions = {}) {
    this.maxWorkers = options.maxWorkers || Math.max(1, os.cpus().length - 1);
    this.workerPath = options.workerPath || path.join(__dirname, "worker.cjs");
  }

  async initialize(): Promise<void> {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(this.workerPath);
      this.workers.push(worker);
    }
  }

  async processTask(task: WorkerTask): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.taskQueue.length === 0 || this.activeWorkers >= this.maxWorkers) {
      return;
    }

    const { task, resolve, reject } = this.taskQueue.shift()!;
    this.activeWorkers++;

    const workerIndex = this.findAvailableWorker();
    if (workerIndex === -1) {
      this.activeWorkers--;
      this.taskQueue.unshift({ task, resolve, reject });
      return;
    }

    const worker = this.workers[workerIndex];

    const messageHandler = (result: WorkerResult) => {
      if (result.event === "progress") {
        task.data && typeof task.data === "object" && "onProgress" in task.data && 
          ((task.data as any).onProgress?.(result.data));
        return;
      }
      
      worker.off("message", messageHandler);
      worker.off("error", errorHandler);
      this.activeWorkers--;

      if (result.event === "error") {
        reject(new Error(result.error || "Unknown error"));
      } else {
        resolve(result);
      }

      this.processNext();
    };

    const errorHandler = (error: Error) => {
      worker.off("message", messageHandler);
      worker.off("error", errorHandler);
      this.activeWorkers--;
      reject(error);
      this.processNext();
    };

    worker.on("message", messageHandler);
    worker.on("error", errorHandler);

    try {
      worker.postMessage(task);
    } catch (error) {
      worker.off("message", messageHandler);
      worker.off("error", errorHandler);
      this.activeWorkers--;
      reject(error instanceof Error ? error : new Error(String(error)));
      this.processNext();
    }
  }

  private findAvailableWorker(): number {
    for (let i = 0; i < this.workers.length; i++) {
      return i;
    }
    return 0;
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map(w => w.terminate()));
    this.workers = [];
  }

  getWorkerCount(): number {
    return this.maxWorkers;
  }

  getActiveWorkerCount(): number {
    return this.activeWorkers;
  }

  getQueuedTaskCount(): number {
    return this.taskQueue.length;
  }
}

export interface ShardRange {
  workerId: number;
  start: number;
  end: number;
}

export function computeShards(
  totalCount: number,
  workerCount: number,
  seed: string | number
): ShardRange[] {
  const baseChunkSize = Math.floor(totalCount / workerCount);
  const remainder = totalCount % workerCount;
  const ranges: ShardRange[] = [];

  let currentStart = 0;
  for (let i = 0; i < workerCount; i++) {
    const chunkSize = baseChunkSize + (i < remainder ? 1 : 0);
    if (chunkSize === 0) continue;

    ranges.push({
      workerId: i,
      start: currentStart,
      end: currentStart + chunkSize,
    });
    currentStart += chunkSize;
  }

  return ranges;
}

export function generateDeterministicShards(
  collections: Array<{ collectionName: string; count: number }>,
  workerCount: number,
  seed: string | number
): Map<string, ShardRange[]> {
  const result = new Map<string, ShardRange[]>();

  for (const col of collections) {
    result.set(col.collectionName, computeShards(col.count, workerCount, seed));
  }

  return result;
}

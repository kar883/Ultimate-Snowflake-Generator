import CsgWorker from './csg.worker.ts?worker';

type CSGPayload = { base: any; slots: any[]; rotation: any & { __enqueueAt?: number; __dispatchAt?: number } };

const QUEUE: Array<{ payload: CSGPayload; resolve: (v: any) => void; reject: (e: any) => void }> = [];
let worker: Worker | null = null;
let busy = false;
let idleHandle: any = null;
const IDLE_TIMEOUT = 10000; // ms

let currentResolve: ((v: any) => void) | null = null;
let currentReject: ((e: any) => void) | null = null;

// Basic stats for benchmarking
const STATS = {
  jobs: 0,
  totalQueueDelay: 0,
  totalProcessTime: 0,
  lastQueueDelay: 0,
  lastProcessTime: 0,
};

function ensureWorker() {
  if (!worker) {
    worker = new CsgWorker();
    worker.onmessage = handleMessage;
    worker.onerror = handleError;
  }
  if (idleHandle) {
    clearTimeout(idleHandle);
    idleHandle = null;
  }
}

function handleMessage(e: any) {
  const res = e.data;
  const now = Date.now();
  if (currentResolve) currentResolve(res);
  // compute processing time if we have dispatch timestamp
  const dispatchAt = (res && res.__dispatchedAt) || 0;
  if (dispatchAt) {
    const processTime = now - dispatchAt;
    STATS.lastProcessTime = processTime;
    STATS.totalProcessTime += processTime;
  }
  STATS.jobs += 1;
  busy = false;
  currentResolve = null;
  currentReject = null;
  // log aggregate every 8 jobs
  if (STATS.jobs % 8 === 0) {
    console.debug('CSG Stats:', { jobs: STATS.jobs, avgQueueMs: STATS.totalQueueDelay / Math.max(1, STATS.jobs), avgProcessMs: STATS.totalProcessTime / Math.max(1, STATS.jobs) });
  }
  processNext();
}

function handleError(err: any) {
  if (currentReject) currentReject(err);
  busy = false;
  currentResolve = null;
  currentReject = null;
  console.error('CSG worker error', err);
  processNext();
}

function processNext() {
  if (QUEUE.length === 0) {
    // schedule idle termination
    idleHandle = setTimeout(() => {
      if (worker) {
        worker.terminate();
        worker = null;
      }
    }, IDLE_TIMEOUT);
    return;
  }

  const job = QUEUE.shift()!;
  ensureWorker();
  currentResolve = job.resolve;
  currentReject = job.reject;
  busy = true;
  try {
    const now = Date.now();
    // compute queue delay
    const enqueueAt = (job.payload.rotation && (job.payload.rotation as any).__enqueueAt) || now;
    const queueDelay = now - enqueueAt;
    STATS.lastQueueDelay = queueDelay;
    STATS.totalQueueDelay += queueDelay;
    // mark dispatch time on payload for worker-side timing
    (job.payload.rotation as any).__dispatchedAt = now;
    // For debugging, attach dispatchedAt to the payload so worker can echo it back if needed
    (job.payload as any).__debugDispatchedAt = now;
    worker!.postMessage(job.payload);
  } catch (err) {
    handleError(err);
  }
}

export function postCSGJob(base: any, slots: any[], rotation: any): Promise<any> {
  const payload: CSGPayload = { base, slots, rotation: { ...(rotation || {}), __enqueueAt: Date.now() } };
  return new Promise((resolve, reject) => {
    QUEUE.push({ payload, resolve, reject });
    if (!busy) processNext();
  });
}

export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  QUEUE.length = 0;
  if (idleHandle) {
    clearTimeout(idleHandle);
    idleHandle = null;
  }
}

export function getCSGStats() {
  return { ...STATS };
}

export function resetCSGStats() {
  STATS.jobs = 0;
  STATS.totalQueueDelay = 0;
  STATS.totalProcessTime = 0;
  STATS.lastQueueDelay = 0;
  STATS.lastProcessTime = 0;
}

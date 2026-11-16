import { DRACO_WRAPPER_FILE, DRACO_WASM_FILE, GEOMETRY_ROOT } from './manifest.js';

const DECODER_WORKER_URL = new URL('./workers/drc.worker.js', import.meta.url);

let decoderWorker = null;

const pendingRequests = new Map();
let nextRequestId = 1;

function handleWorkerMessage(event) {
  const { id, ok, result, error } = event.data ?? {};
  const request = pendingRequests.get(id);
  if (!request) return;
  pendingRequests.delete(id);
  if (ok) request.resolve(result);
  else request.reject(new Error(error || 'DrcDecoder: worker reported an error'));
}

function handleWorkerFailure(event) {

  const error = new Error(`DrcDecoder: worker failed — ${event.message || 'unknown error'}`);
  for (const request of pendingRequests.values()) request.reject(error);
  pendingRequests.clear();
  if (decoderWorker) {
    decoderWorker.terminate();
    decoderWorker = null;
  }
  console.error(error.message);
}

function getDecoderWorker() {
  if (decoderWorker) return decoderWorker;
  decoderWorker = new Worker(DECODER_WORKER_URL, {
    type: 'module',
    name: 'drc-decoder',
  });
  decoderWorker.onmessage = handleWorkerMessage;
  decoderWorker.onerror = handleWorkerFailure;
  return decoderWorker;
}

export function decodeDrc(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    return Promise.reject(new TypeError('decodeDrc expects an ArrayBuffer'));
  }
  const worker = getDecoderWorker();
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage(
      {
        id,
        buffer: arrayBuffer,
        wrapperUrl: DRACO_WRAPPER_FILE,
        wasmUrl: DRACO_WASM_FILE,
      },
      [arrayBuffer],
    );
  });
}

export async function decodeDrcUrl(name) {
  const response = await fetch(`${GEOMETRY_ROOT}${name}`);
  if (!response.ok) {
    throw new Error(`DrcDecoder: "${name}" responded HTTP ${response.status} ${response.statusText}`);
  }
  return decodeDrc(await response.arrayBuffer());
}

export function disposeDrcDecoder() {
  for (const request of pendingRequests.values()) {
    request.reject(new Error('DrcDecoder: disposed while a decode was in flight'));
  }
  pendingRequests.clear();
  if (decoderWorker) {
    decoderWorker.terminate();
    decoderWorker = null;
  }
}

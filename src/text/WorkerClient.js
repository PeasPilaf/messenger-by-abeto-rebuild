export function createWorkerClient(worker) {
  let nextId = 1;
  const pending = new Map();

  worker.onmessage = (event) => {
    const { id, ok, error, ...rest } = event.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(rest);
    else entry.reject(new Error(error));
  };

  worker.onerror = (event) => {

    const error = new Error(`glyph worker: ${event.message || 'failed to start'}`);
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };

  return {
    request(message) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const transfer = message.bytes ? [message.bytes] : [];
        worker.postMessage({ id, ...message }, transfer);
      });
    },
    dispose() {
      worker.terminate();
      pending.clear();
    },
  };
}

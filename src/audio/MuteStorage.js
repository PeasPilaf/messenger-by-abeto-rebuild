export const STORAGE_KEY = 'App3D_data';

export const STORAGE_FIELD = 'audioMuted';

export function readStore(storage = globalThis.localStorage) {
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || '{}') ?? {};
  } catch (error) {
    console.warn('audio: could not parse App3D_data; leaving it untouched', error);
    return null;
  }
}

export function readMutePreference(storage = globalThis.localStorage) {
  const store = readStore(storage);
  if (!store || typeof store[STORAGE_FIELD] !== 'boolean') return null;
  return store[STORAGE_FIELD];
}

export function writeMutePreference(muted, storage = globalThis.localStorage) {
  if (!storage) return false;
  const store = readStore(storage);
  if (store === null) return false;
  store[STORAGE_FIELD] = Boolean(muted);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {

    console.warn('audio: could not persist mute preference', error);
    return false;
  }
}

export const STORAGE_KEY = 'App3D_data';

export const STORAGE_FIELD = 'modelFiles';

export const ACCESSORIES = Object.freeze({
  base: ['base'],
  hair: ['hair1', 'hair2', 'hair3', 'hair4', 'hair5', 'hair6', 'hair7'],
  top: ['top1', 'top2', 'top3', 'top4', 'top5', 'top6', 'top7', 'top8', 'top9'],
  bottom: ['bottom1', 'bottom2', 'bottom3', 'bottom4', 'bottom5', 'bottom6', 'bottom7'],
  shoes: ['shoes1', 'shoes2', 'shoes3', 'shoes4', 'shoes5', 'shoes6', 'shoes7'],
});

export const CATEGORIES = Object.keys(ACCESSORIES);

export function randomAccessories(random = Math.random) {
  return CATEGORIES.map((category) => {
    const parts = ACCESSORIES[category];
    return parts[Math.floor(random() * parts.length)];
  });
}

export function validateAccessories(selection = []) {
  const valid = new Array(CATEGORIES.length).fill(false);
  for (let index = 0; index < selection.length; index++) {
    const name = selection[index];
    if (!name) continue;
    for (let category = 0; category < CATEGORIES.length; category++) {
      if (index === category && ACCESSORIES[CATEGORIES[category]].includes(name)) {
        valid[category] = true;
        break;
      }
    }
  }
  return valid.every(Boolean) ? selection.slice() : randomAccessories();
}

export function writeAccessories(selection, storage = globalThis.localStorage) {
  const valid = validateAccessories(selection);
  const store = readStore(storage);
  store[STORAGE_FIELD] = valid;
  storage.setItem(STORAGE_KEY, JSON.stringify(store));
  return valid;
}

export function readAccessories(storage = globalThis.localStorage, random = Math.random) {
  const stored = readStore(storage)[STORAGE_FIELD];
  const selection = Array.isArray(stored) && stored.length > 0 ? stored : randomAccessories(random);
  return writeAccessories(selection, storage);
}

export function accessoryGeometryNames(selection) {
  return selection.map((name) => `avatar/accessories/${name}`);
}

function readStore(storage) {
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || '{}') ?? {};
  } catch (error) {

    console.warn('Accessories: could not parse App3D_data, resetting to empty object', error);
    return {};
  }
}

import { QUESTS, QUESTINFO, anyStepInitiated, areAllQuestsCompleted, createResetProgress } from './QuestData.js';

export const SAVE_KEY = 'App3D_data';
export const LEGACY_PROGRESS_KEY = 'questProgress';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class SaveStore {

  constructor({ storage = defaultStorage(), warn = console.warn, key = SAVE_KEY } = {}) {
    this.storage = storage;
    this.warn = warn;
    this.key = key;

    this.lastResetReason = null;
  }

  get available() {
    return this.storage !== null;
  }

  readBlob() {
    if (!this.storage) return {};
    const raw = this.storage.getItem(this.key);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      this.warn(`[save] "${this.key}" is not valid JSON; starting from an empty save`);
      return {};
    }
  }

  writeBlob(blob) {
    if (!this.storage) return blob;
    this.storage.setItem(this.key, JSON.stringify(blob));
    return blob;
  }

  debugJSON() {
    return JSON.stringify(this.readBlob());
  }

  readQuestProgress() {
    const blob = this.readBlob();
    if (blob.questProgress !== undefined) return { value: blob.questProgress, source: 'blob' };
    const legacy = this._readLegacy();
    if (legacy !== undefined) return { value: legacy, source: 'legacy' };
    return { value: undefined, source: 'none' };
  }

  _readLegacy() {
    if (!this.storage) return undefined;
    const raw = this.storage.getItem(LEGACY_PROGRESS_KEY);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  writeQuestProgress(progress) {
    const blob = this.readBlob();
    blob.questProgress = progress;
    return this.writeBlob(blob);
  }

  loadProgress() {
    const { value, source } = this.readQuestProgress();
    const reset = () => {
      this.lastResetReason = this.lastResetReason ?? 'no-save';
      return createResetProgress();
    };
    if (value === undefined) {
      this.lastResetReason = 'no-save';
      const progress = createResetProgress();
      this.writeQuestProgress(progress);
      return { progress, anyStepInitiated: false, reset: true, source: 'none' };
    }

    const invalidReason = this._validate(value);
    if (invalidReason) {

      this.warn(invalidReason);
      this.lastResetReason = 'invalid';
      const progress = reset();
      this.writeQuestProgress(progress);
      return { progress, anyStepInitiated: false, reset: true, source };
    }

    const progress = createResetProgress();
    for (const quest of QUESTS) {
      const flags = value[quest.id];
      progress[quest.id] = quest.steps.map((_, index) => Boolean(flags?.[index]));
    }

    if (areAllQuestsCompleted(progress)) {

      this.lastResetReason = 'all-complete';
      const resetProgress = createResetProgress();
      this.writeQuestProgress(resetProgress);
      return { progress: resetProgress, anyStepInitiated: false, reset: true, source };
    }

    this.lastResetReason = null;

    this.writeQuestProgress(progress);
    return {
      progress,
      anyStepInitiated: anyStepInitiated(progress),
      reset: false,
      source,
    };
  }

  _validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return `Quest state is not an object! Resetting quest progress.`;
    }
    for (const [questId, flags] of Object.entries(value)) {
      const info = QUESTINFO[questId];
      if (!Array.isArray(flags) || !info || flags.length !== info.steps.length) {
        return `Quest ${questId} state does not match the quest info state! Resetting quest progress.`;
      }
    }
    return null;
  }

  readModelFiles() {
    const blob = this.readBlob();
    return Array.isArray(blob.modelFiles) ? blob.modelFiles.slice() : null;
  }

  writeModelFiles(modelFiles) {
    const blob = this.readBlob();
    blob.modelFiles = modelFiles.slice();
    return this.writeBlob(blob);
  }

  clear() {
    if (this.storage) this.storage.removeItem(this.key);
  }
}

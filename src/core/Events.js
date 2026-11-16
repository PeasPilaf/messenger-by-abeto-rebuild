export class EventEmitter {
  constructor() {

    this._listeners = new Map();
  }

  on(name, fn, context = null) {
    let list = this._listeners.get(name);
    if (!list) {
      list = [];
      this._listeners.set(name, list);
    }
    list.push({ fn, context, once: false });
    return this;
  }

  once(name, fn, context = null) {
    let list = this._listeners.get(name);
    if (!list) {
      list = [];
      this._listeners.set(name, list);
    }
    list.push({ fn, context, once: true });
    return this;
  }

  off(name, fn, context = null) {
    const list = this._listeners.get(name);
    if (!list) return this;
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];

      if (fn === undefined || (entry.fn === fn && (context === null || entry.context === context))) {
        list.splice(i, 1);
      }
    }
    if (list.length === 0) this._listeners.delete(name);
    return this;
  }

  emit(name, ...args) {
    const list = this._listeners.get(name);
    if (!list || list.length === 0) return false;

    for (const entry of list.slice()) {
      if (entry.once) this.off(name, entry.fn, entry.context);
      entry.fn.apply(entry.context, args);
    }
    return true;
  }

  removeAllListeners(name) {
    if (name === undefined) this._listeners.clear();
    else this._listeners.delete(name);
    return this;
  }

  listenerCount(name) {
    return this._listeners.get(name)?.length ?? 0;
  }
}

export const events = new EventEmitter();

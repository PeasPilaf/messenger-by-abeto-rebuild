import { pointInRect } from './UiLayout.js';

export const CLICK_MAX_DISTANCE = 25;
export const CLICK_MAX_DURATION = 0.5;

export class UiInput {

  constructor({ cursorTarget = null } = {}) {
    this.regions = [];
    this.hovered = null;
    this.pointer = {
      down: false, x: 0, y: 0, startX: 0, startY: 0, startedAt: 0, region: null,
    };
    this.cursorTarget = cursorTarget;

    this.onKey = null;
    this._keyListener = null;
  }

  addRegion(region) {
    const entry = {
      enabled: true,
      cursor: false,
      ...region,
      remove: () => {
        const index = this.regions.indexOf(entry);
        if (index !== -1) this.regions.splice(index, 1);
        if (this.hovered === entry) this._setHovered(null);
      },
    };
    this.regions.push(entry);
    return entry;
  }

  hitTest(x, y) {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const region = this.regions[i];
      if (region.enabled && pointInRect(x, y, region.rect)) return region;
    }
    return null;
  }

  handlePointerDown(x, y) {
    const region = this.hitTest(x, y);
    this.pointer.down = true;
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.startX = x;
    this.pointer.startY = y;
    this.pointer.startedAt = performance.now() / 1000;
    this.pointer.region = region;
    if (region?.onPress) region.onPress('touch_start', region);
    return region;
  }

  handlePointerMove(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
    if (!this.pointer.down) this._setHovered(this.hitTest(x, y));
  }

  handlePointerUp(x, y) {
    const released = this.hitTest(x, y);
    const started = this.pointer.region;
    const elapsed = performance.now() / 1000 - this.pointer.startedAt;
    const moved = Math.hypot(x - this.pointer.startX, y - this.pointer.startY);

    this.pointer.down = false;
    this.pointer.region = null;
    if (started?.onPress) started.onPress('touch_end', started);
    if (started && released === started && moved < CLICK_MAX_DISTANCE &&
        elapsed < CLICK_MAX_DURATION) {
      started.onClick?.(started);
    }
    this._setHovered(this.hitTest(x, y));
    return started;
  }

  pressRegion(region, down) {
    region?.onPress?.(down ? 'touch_start' : 'touch_end', region);
  }

  _setHovered(region) {
    if (region === this.hovered) return;
    const previous = this.hovered;
    this.hovered = region ?? null;
    previous?.onHover?.('hover_out', previous);
    this.hovered?.onHover?.('hover_in', this.hovered);
    if (this.cursorTarget) {
      const pointer = this.hovered?.cursor ? 'pointer' : '';
      if (this.cursorTarget.style.cursor !== pointer) this.cursorTarget.style.cursor = pointer;
    }
  }

  bindKeyboard(target = document) {
    if (this._keyListener) return this;
    this._keyListener = (event) => {
      if (event.code === 'Space') event.preventDefault();
      this.onKey?.(event.code, event.type);
    };
    target.addEventListener('keydown', this._keyListener);
    target.addEventListener('keyup', this._keyListener);
    return this;
  }

  bindElement(element) {
    element.addEventListener('pointerdown', (event) => {
      const rect = element.getBoundingClientRect();
      this.handlePointerDown(event.clientX - rect.left, event.clientY - rect.top);
    });
    element.addEventListener('pointermove', (event) => {
      const rect = element.getBoundingClientRect();
      this.handlePointerMove(event.clientX - rect.left, event.clientY - rect.top);
    });
    element.addEventListener('pointerup', (event) => {
      const rect = element.getBoundingClientRect();
      this.handlePointerUp(event.clientX - rect.left, event.clientY - rect.top);
    });
    return this;
  }
}

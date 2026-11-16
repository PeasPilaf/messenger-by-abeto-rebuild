import { Vector2, Vector3 } from 'three';

import { events } from '../core/Events.js';
import { client } from '../core/Client.js';

const CLICK_MAX_DRAG_PX = 25;
const CLICK_MAX_SECONDS = 0.5;

class Pointer {
  constructor(finger, screen) {
    this.finger = finger;
    this.eventID = finger === 0 ? 'touch' : `touch${finger + 1}`;
    this.touchID = false;
    this.input = finger === 0 ? 'mouse' : 'touch';
    this.button = 0;
    this.screen = screen;
    this.position = new Vector2();
    this.position11 = new Vector2();
    this.delta11 = new Vector2();
    this.dragged = new Vector2();
    this.dragStart = new Vector2();
    this.downTime = 0;
  }

  onStart(event) {
    this.input = event.pointerType === 'mouse' ? 'mouse' : 'touch';
    this.button = event.button;
    this.downTime = performance.now();
    this._read(event);
    this.dragStart.copy(this.position);
    this.dragged.set(0, 0);
  }

  onMove(event) {
    this._read(event);
    this.dragged.copy(this.position).sub(this.dragStart);
  }

  onEnd(event) {
    this._read(event);
  }

  _read(event) {
    const x = event.clientX;
    const y = event.clientY;
    const { w, h } = this.screen;
    this.position.set(x, y);
    this.position11.set((x / w) * 2 - 1, -((y / h) * 2 - 1));
    this.delta11.set(this.position11.x - (this._lastX11 ?? this.position11.x), this.position11.y - (this._lastY11 ?? this.position11.y));
    this._lastX11 = this.position11.x;
    this._lastY11 = this.position11.y;
  }
}

export class Input {

  constructor({
    element = window,
    controlMode = 'automatic',
    sprintEnabled = true,
    sprintSpeed = 1.3,
    sprintPreventsJump = false,
    controlTouchAmount = 75,
    controlTouchMarginLeft = 20,
    controlTouchMarginBottom = 25,
    controlTouchManualMultiplier = 0.75,
    controlMouseAmount = 200,
  } = {}) {
    this.element = element;
    this.controlMode = controlMode;
    this.sprintEnabled = sprintEnabled;
    this.sprintSpeed = sprintSpeed;
    this.sprintPreventsJump = sprintPreventsJump;
    this.controlTouchAmount = controlTouchAmount;
    this.controlTouchMarginLeft = controlTouchMarginLeft;
    this.controlTouchMarginBottom = controlTouchMarginBottom;
    this.controlTouchManualMultiplier = controlTouchManualMultiplier;
    this.controlMouseAmount = controlMouseAmount;

    this.controller = null;
    this.camera = null;

    this.moveKeys = [false, false, false, false];
    this._sprintPressed = false;
    this.isLeftMousePressed = false;
    this.touchMovingFinger = -1;
    this.touchCameraFinger = -1;
    this.touchMovingStart = new Vector2();
    this.touchMovingDelta = new Vector2();
    this.gamepadMovingCamera = false;
    this._jumpKeyLocked = false;
    this._move = new Vector3();
    this._screenPoint = new Vector3();
    this.pageVisible = !document.hidden;

    this.pointers = [new Pointer(0, client.screen), new Pointer(1, client.screen)];

    this.pointer = { position11: this.pointers[0].position11, isTouch: false, down: false };

    this._enabled = false;
    this._onKeyDown = (event) => events.emit('keydown', event);
    this._onKeyUp = (event) => events.emit('keyup', event);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onWheel = (event) => events.emit('wheel', event);
    this._onVisibility = () => {
      this.pageVisible = !document.hidden;
      events.emit('visibility_change', this.pageVisible);
      if (!this.pageVisible) this._endInteraction();
    };
  }

  connect({ controller, camera }) {
    this.controller = controller;
    this.camera = camera || null;
    if (camera) camera.input = this;
    if (controller) controller.controlMode = this.controlMode;
    return this;
  }

  get sprintPressed() {
    return this._sprintPressed;
  }

  set sprintPressed(value) {
    if (value === this._sprintPressed) return;
    this._sprintPressed = value;
    events.emit('character_controls_shift_pressed', value);
  }

  enable() {
    if (this._enabled) return;
    this._enabled = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.element.addEventListener('pointerdown', this._onPointerDown);
    this.element.addEventListener('pointermove', this._onPointerMove);
    this.element.addEventListener('pointerup', this._onPointerUp);
    this.element.addEventListener('pointercancel', this._onPointerUp);
    this.element.addEventListener('pointerout', this._onPointerUp);
    this.element.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('visibilitychange', this._onVisibility);

    events.on('keydown', this._onKey, this);
    events.on('keyup', this._onKey, this);
    for (const name of ['touch', 'touch2']) {
      events.on(`${name}_start`, this._onTouchStart, this);
      events.on(`${name}_drag`, this._onTouchDrag, this);
      events.on(`${name}_end`, this._onTouchEnd, this);
      events.on(`${name}_click`, this._onTouchClick, this);
    }
    events.on('character_controls_shift_press', this._onSprintButton, this);
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.element.removeEventListener('pointerdown', this._onPointerDown);
    this.element.removeEventListener('pointermove', this._onPointerMove);
    this.element.removeEventListener('pointerup', this._onPointerUp);
    this.element.removeEventListener('pointercancel', this._onPointerUp);
    this.element.removeEventListener('pointerout', this._onPointerUp);
    this.element.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('visibilitychange', this._onVisibility);
    events.off('keydown', this._onKey, this);
    events.off('keyup', this._onKey, this);
    for (const name of ['touch', 'touch2']) {
      events.off(`${name}_start`, this._onTouchStart, this);
      events.off(`${name}_drag`, this._onTouchDrag, this);
      events.off(`${name}_end`, this._onTouchEnd, this);
      events.off(`${name}_click`, this._onTouchClick, this);
    }
    events.off('character_controls_shift_press', this._onSprintButton, this);
    this._endInteraction();
  }

  _handlePointerDown(event) {
    const pointer = this.pointers.find((p) => p.touchID === false);
    if (!pointer) return;
    pointer.touchID = event.pointerId;
    pointer.onStart(event);
    this.pointer.isTouch = pointer.input === 'touch';
    this.pointer.down = true;
    this.pointer.position11 = pointer.position11;
    events.emit(`${pointer.eventID}_start`, pointer);
  }

  _handlePointerMove(event) {
    let pointer = this.pointers.find((p) => p.touchID === event.pointerId);
    if (!pointer) {

      if (event.pointerType !== 'mouse') return;
      pointer = this.pointers[0];
      pointer.onMove(event);
      events.emit(`${pointer.eventID}_move`, pointer);
      return;
    }
    pointer.onMove(event);
    events.emit(`${pointer.eventID}_move`, pointer);
    events.emit(`${pointer.eventID}_drag`, pointer);
  }

  _handlePointerUp(event) {
    const pointer = this.pointers.find((p) => p.touchID === event.pointerId);
    if (!pointer) return;
    pointer.onEnd(event);
    events.emit(`${pointer.eventID}_end`, pointer);
    const isClick =
      pointer.dragged.length() < CLICK_MAX_DRAG_PX &&
      (performance.now() - pointer.downTime) / 1000 < CLICK_MAX_SECONDS &&
      event.type !== 'pointerout';
    if (isClick) events.emit(`${pointer.eventID}_click`, pointer);
    pointer.touchID = false;
    this.pointer.down = false;
    this.pointer.isTouch = pointer.input === 'touch';
  }

  _onKey(event) {
    const down = event.type === 'keydown';
    const blockedBySprint = this.sprintEnabled && this.sprintPreventsJump && this.sprintPressed;
    switch (event.code) {
      case 'KeyW': case 'ArrowUp': this.moveKeys[0] = down; break;
      case 'KeyS': case 'ArrowDown': this.moveKeys[1] = down; break;
      case 'KeyA': case 'ArrowLeft': this.moveKeys[2] = down; break;
      case 'KeyD': case 'ArrowRight': this.moveKeys[3] = down; break;
      case 'Space': if (!blockedBySprint) this._requestJump(down); break;
      case 'ShiftLeft': case 'ShiftRight': if (this.sprintEnabled) this.sprintPressed = down; break;
    }
  }

  _requestJump(down) {
    const controller = this.controller;
    if (!controller) return;
    if (down) {
      if (this._jumpKeyLocked) return;
      this._jumpKeyLocked = true;

      controller.jump();
    } else {
      this._jumpKeyLocked = false;
    }
  }

  _onSprintButton(pressed) {
    this._onKey({ type: pressed === true ? 'keydown' : 'keyup', code: 'ShiftLeft' });
  }

  _onTouchStart(event) {
    if (event.input === 'mouse') {
      if (this.isLeftMousePressed || event.button !== 0) return;
      this.isLeftMousePressed = true;
      this._onTouchDrag(event);
      return;
    }
    if (this.controlMode === 'automatic') {
      if (this.touchMovingFinger !== -1 || event.finger !== 0) return;
      this.touchMovingFinger = event.finger;
      this.touchMovingStart.copy(event.position);
      this._onTouchDrag(event);
      return;
    }
    const radius = this.controlTouchAmount * this.controlTouchManualMultiplier;
    const center = this._manualCirclePixels();
    if (this.touchMovingFinger === -1 && event.position.distanceTo(center) < radius) {
      this.touchMovingFinger = event.finger;
      this.touchMovingStart.copy(center);
      this._onTouchDrag(event);
    } else if (this.touchCameraFinger === -1) {
      this.touchCameraFinger = event.finger;
      this._onTouchDrag(event);
    }
  }

  _onTouchDrag(event) {
    if (event.input === 'mouse') {
      if (!this.isLeftMousePressed) return;
      if (this.controlMode === 'automatic') {

        const screenPoint = this._characterScreenPosition();
        if (!screenPoint) return;
        this.touchMovingDelta.set(screenPoint.x, screenPoint.y).sub(event.position);
        this.touchMovingDelta.divideScalar(this.controlMouseAmount).clampLength(-1, 1);
      } else if (this.camera) {
        this.camera.orbitFromPointer(event.delta11.x, event.delta11.y);
      }
      return;
    }
    if (event.finger === this.touchMovingFinger) {
      const scale =
        this.controlMode === 'automatic' ? 1 : this.controlTouchManualMultiplier;
      this.touchMovingDelta
        .copy(this.touchMovingStart)
        .sub(event.position)
        .divideScalar(this.controlTouchAmount * scale)
        .clampLength(-1, 1);
    } else if (event.finger === this.touchCameraFinger && this.camera) {
      this.camera.orbitFromPointer(event.delta11.x, event.delta11.y);
    }
  }

  _onTouchEnd(event) {
    if (event.input === 'mouse') {
      this.isLeftMousePressed = false;
      this.touchMovingDelta.set(0, 0);
    } else if (event.finger === this.touchMovingFinger) {
      this.touchMovingFinger = -1;
      this.touchMovingDelta.set(0, 0);
    } else if (event.finger === this.touchCameraFinger) {
      this.touchCameraFinger = -1;
    }
  }

  _onTouchClick(event) {
    if (event.input === 'mouse') return;

    this._requestJump(true);
    this._requestJump(false);
  }

  _manualCirclePixels() {
    return new Vector2(
      this.controlTouchAmount + this.controlTouchMarginLeft,
      client.screen.h - this.controlTouchAmount - this.controlTouchMarginBottom,
    );
  }

  _characterScreenPosition() {
    if (!this.camera || !this.controller) return null;
    const point = this._screenPoint.copy(this.controller.position);
    const capsuleMiddle = this.controller.capsule.segment.end.y * 0.5;
    point.addScaledVector(this.controller.up, capsuleMiddle);
    point.project(this.camera);
    const { w, h } = client.screen;
    return new Vector2(((point.x + 1) / 2) * w, (-(point.y - 1) / 2) * h);
  }

  update() {
    const move = this._move.set(0, 0, 0);
    if (!this.pageVisible) return move;
    if (this.moveKeys.includes(true)) {
      if (this.moveKeys[0]) move.z += 1;
      if (this.moveKeys[1]) move.z -= 1;
      if (this.moveKeys[2]) move.x += 1;
      if (this.moveKeys[3]) move.x -= 1;
      move.normalize();
    }
    move.x += this.touchMovingDelta.x;
    move.z += this.touchMovingDelta.y;
    move.clampLength(-1, 1);
    if (this.sprintPressed) move.multiplyScalar(this.sprintSpeed);
    return move;
  }

  _endInteraction() {
    this.moveKeys.fill(false);
    this.sprintPressed = false;
    this.isLeftMousePressed = false;
    this.touchMovingFinger = -1;
    this.touchMovingDelta.set(0, 0);
    this.touchCameraFinger = -1;
  }

  dispose() {
    this.disable();
    if (this.camera) this.camera.input = null;
  }
}

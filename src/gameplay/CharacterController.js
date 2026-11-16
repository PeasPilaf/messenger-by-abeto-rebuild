import { Box3, Line3, Matrix4, Object3D, Plane, Quaternion, Spherical, Vector3 } from 'three';

import { events } from '../core/Events.js';
import { ticker } from '../core/Ticker.js';

export const MEDIUMS = { GROUND: 0, AIR: 1, WATER: 2 };

export const CHARACTER_PHYSICS_OPTIONS = {
  substeps: 3,
  positionForce: 0.0045,
  jumpForce: 0.2,
  gravity: -0.00981,
  directionLerp: 0.075,
  damp: 0.92,
  dampIdle: 0.92,
  rotVelocityMin: 0.0035,
  rotVelocityMax: 0.02,
  capsuleRadiusPercentage: 0.2,
  floorDetectInclination: 0.8,
  fallLimitDistance: 10,
  velocityDamp: 0.7,
  autoStep: true,
  moveTowardsCameraTarget: true,
  checkFalling: true,
};

const ORIGIN = new Vector3();
const TWO_PI = Math.PI * 2;
const lerp = (a, b, t) => (1 - t) * a + t * b;
const toVector = (target, value) =>
  value.isVector3 ? target.copy(value) : Array.isArray(value) ? target.fromArray(value) : target.set(value.x, value.y, value.z);

export function getShortestRotationAngle(a, b) {
  const positive = (angle) => {
    const wrapped = angle % TWO_PI;
    return wrapped < 0 ? TWO_PI + wrapped : wrapped;
  };
  const from = positive(a);
  let to = positive(b);
  if (Math.abs(to - from) > Math.PI) to += to > from ? -TWO_PI : TWO_PI;
  return a + to - from;
}

export function fit(value, inMin, inMax, outMin, outMax) {
  const v = Math.min(Math.max(value, Math.min(inMin, inMax)), Math.max(inMin, inMax));
  return outMin + ((v - inMin) * (outMax - outMin)) / (inMax - inMin);
}

export class CharacterController {

  constructor({ object = new Object3D(), camera = null, collision, ...options } = {}) {
    if (!collision) throw new Error('CharacterController: a CollisionWorld is required');
    this.object = object;
    this.camera = camera;
    this.collision = collision;
    this.controlMode = 'automatic';

    const config = { ...CHARACTER_PHYSICS_OPTIONS, ...options };
    Object.assign(this, {
      substeps: config.substeps,
      positionForce: config.positionForce,
      jumpForce: config.jumpForce,
      gravity: config.gravity,
      directionLerp: config.directionLerp,
      damp: config.damp,
      dampIdle: config.dampIdle,
      rotVelocityMin: config.rotVelocityMin,
      rotVelocityMax: config.rotVelocityMax,
      velocityDamp: config.velocityDamp,
      autoStep: config.autoStep,
      moveTowardsCameraTarget: config.moveTowardsCameraTarget,
      checkFalling: config.checkFalling,
      capsuleRadiusPercentage: Math.min(config.capsuleRadiusPercentage, 0.45),
      floorDetectInclination: Math.min(1, config.floorDetectInclination),
    });

    this.fallLimitDistance =
      typeof config.fallLimitDistance === 'number' ? Math.min(1, config.fallLimitDistance) : 10;

    this.capsule = { radius: 0.5, segment: new Line3(new Vector3(), new Vector3(0, 1, 0)) };

    object.up = object.up || new Vector3(0, 1, 0);
    object.velocity = object.velocity || new Vector3();
    object.velocityHorizontal = 0;
    object.rotationHorizontal = 0;
    object.userData.medium = MEDIUMS.GROUND;

    Object.assign(this, {
      _positionPrev: new Vector3(),
      _positionNext: new Vector3(),
      _acceleration: new Vector3(),
      _velocity: new Vector3(),
      _velocityVariation: 0,
      _velPhysicsDampInterpolation: 0,
      _rotationPrev: 0,
      _rotationNext: 0,
      _deltaRatioAccumulator: 0,
      _deltaRatioAccumulatorSteps: 0,
      _needsToLand: false,
      _lastFloorPosition: new Vector3(),
      _isMoving: false,
      _jumpRequested: false,
      _jumpRequestTimeout: null,
      _isAutoStepping: false,
      _isOnFloor: true,
      _prevIsOnFloor: true,
      _prevIsOnFloorTime: -1,
      _nearestVerticalPoint: -1,

      _initialPosition: new Vector3(),
      _initialRotation: 0,
      _initialUp: new Vector3(0, 1, 0),

      _physicsObject: new Object3D(),

      _v1: new Vector3(),
      _v2: new Vector3(),
      _v3: new Vector3(),
      _v4: new Vector3(),
      _right: new Vector3(),
      _forward: new Vector3(),
      _quaternion: new Quaternion(),
      _matrix: new Matrix4(),
      _spherical: new Spherical(),
      _plane: new Plane(),
      _bounds: new Box3(),
      _capsuleWorld: new Line3(),
      _capsuleBefore: new Line3(),
    });
  }

  get position() { return this.object.position; }
  get up() { return this.object.up; }
  get velocity() { return this.object.velocity; }

  get velocityHorizontal() { return this.object.velocityHorizontal; }
  get speed() { return this.object.velocityHorizontal; }
  get rotationHorizontal() { return this.object.rotationHorizontal; }
  get isOnFloor() { return this._isOnFloor; }
  get isMoving() { return this._isMoving; }
  get isAirborne() { return this.object.userData.medium === MEDIUMS.AIR; }
  get medium() { return this.object.userData.medium; }
  set medium(value) { this.object.userData.medium = value; }

  get nearestVerticalPoint() { return this._nearestVerticalPoint; }

  setCapsuleFromBounds(boundingBox) {
    const height = Math.abs(boundingBox.max.y - boundingBox.min.y);
    const radius = height * this.capsuleRadiusPercentage;
    this.capsule.radius = radius;
    this.capsule.segment.end.y = height - radius * 2;
    return this.capsule;
  }

  jump() {
    this._jumpRequested = true;
    clearTimeout(this._jumpRequestTimeout);
    this._jumpRequestTimeout = setTimeout(() => {
      this._jumpRequested = false;
    }, 75);
  }

  cancelJump() {
    this._jumpRequested = false;
    clearTimeout(this._jumpRequestTimeout);
  }

  teleport(position, rotation = 0, up = null) {
    toVector(this._positionPrev, position);
    this._positionNext.copy(this._positionPrev);
    this._updatePosition(0);
    if (up) toVector(this.object.up, up);
    else this.object.up.copy(this._positionPrev).normalize();
    if (this.object.up.lengthSq() === 0) this.object.up.set(0, 1, 0);
    this._rotationPrev = rotation;
    this._rotationNext = rotation;
    this._updateRotation(0);
    this._resetPhysics(false);
    return this;
  }

  setInitialPose(position, rotation = 0, up = null) {
    toVector(this._initialPosition, position);
    this._initialRotation = rotation;
    if (up) toVector(this._initialUp, up).normalize();
    else this._initialUp.copy(this._initialPosition).normalize();
    return this;
  }

  placeOnFloor(position, rotation = 0, up = null) {
    const start = toVector(new Vector3(), position);
    const upVector = up ? toVector(new Vector3(), up).normalize() : start.clone().normalize();
    if (upVector.lengthSq() === 0) upVector.set(0, 1, 0);
    const lift = Math.max(0.5, this.capsule.segment.end.y + this.capsule.radius * 2);
    const probe = start.clone().addScaledVector(upVector, lift);
    const hit = this.collision.raycast(probe, upVector.clone().negate());
    let resting = hit ? hit.point : start;
    if (!hit) {
      const closest = this.collision.closestPointToPoint(start);
      if (closest) resting = closest.point;
    }
    this._initialPosition.copy(resting);
    this._initialRotation = rotation;
    this._initialUp.copy(upVector);
    return this.teleport(resting, rotation, upVector);
  }

  update(moveInput, deltaRatio = ticker.ratio) {
    if (!this.collision || !this.collision.mesh) {
      throw new Error('CharacterController: collision world is not loaded');
    }
    if (!this.camera) throw new Error('CharacterController: a follow camera is required');

    if (this.object.position.lengthSq() < 1e-4) this.object.up.set(0, 1, 0);
    else this.object.up.copy(this.object.position).normalize();

    const wasMoving = this._isMoving;
    this._isMoving = moveInput.length() > 1e-5;
    this._deltaRatioAccumulator += deltaRatio;
    this._deltaRatioAccumulatorSteps = 0;
    while (this._deltaRatioAccumulator >= 1) this._step(moveInput);

    this._updatePosition(this._deltaRatioAccumulator);
    this._updateRotation(this._deltaRatioAccumulator);

    if (wasMoving !== this._isMoving) events.emit('character_is_moving_changed', this._isMoving);
    return this;
  }

  _step(moveInput) {
    this._deltaRatioAccumulator = Math.max(0, this._deltaRatioAccumulator - 1);
    this._deltaRatioAccumulatorSteps++;
    this._positionPrev.copy(this._positionNext);
    this._rotationPrev = this._rotationNext;
    this._isAutoStepping = false;

    if (this._isMoving) this._accumulateMovementInput(moveInput);
    if (!this._isOnFloor) this._acceleration.addScaledVector(this.object.up, this.gravity);

    this._velocity.add(this._acceleration);
    this._acceleration.setScalar(0);

    const idle = !this._isMoving && this.medium === MEDIUMS.GROUND && !this._needsToLand;
    this._velPhysicsDampInterpolation = idle ? lerp(this._velPhysicsDampInterpolation, 0, 0.05) : 1;
    this._velocity.multiplyScalar(lerp(this.dampIdle, this.damp, this._velPhysicsDampInterpolation));
    this._velocity.clampLength(0, this.capsule.radius * 0.9 * this.substeps);

    if (!this._isAutoStepping) this._isOnFloor = false;
    this._physicsObject.position.copy(this._positionPrev);
    this._physicsObject.quaternion.copy(this.object.quaternion);
    this._physicsObject.scale.copy(this.object.scale);
    for (let s = 0; s < this.substeps; s++) this._substep();
    this._positionNext.copy(this._physicsObject.position);

    this.object.velocity.add(this._v1.subVectors(this._positionNext, this._positionPrev));
    this.object.velocity.multiplyScalar(this.velocityDamp);
    this._velocityVariation += this._v1.length();
    this._velocityVariation *= this.velocityDamp;

    const speed = this.object.velocity.length();
    const horizontalFactor =
      speed < 0.001
        ? 1
        : 1 - Math.abs(this._v1.copy(this.object.velocity).normalize().dot(this.object.up));
    this.object.velocityHorizontal = speed * horizontalFactor;

    if (this.object.velocityHorizontal > this.rotVelocityMin) {
      this._forward.copy(this.object.velocity).applyAxisAngle(this.object.up, this._rotationPrev);
      this._spherical.setFromVector3(
        this._forward.applyQuaternion(this._quaternion.copy(this.object.quaternion).invert()),
      );
      this._rotationNext = lerp(
        this._rotationNext,
        getShortestRotationAngle(this._rotationNext, this._spherical.theta),
        this.directionLerp *
          fit(this.object.velocityHorizontal, this.rotVelocityMin, this.rotVelocityMax, 0, 1),
      );
    }

    this._updateNearestVerticalPoint(this._detectJump());

    if (
      this.checkFalling &&
      this._positionNext.y + this.fallLimitDistance < this.collision.geometry.boundingBox.min.y
    ) {

      this.teleport(this._initialPosition, this._initialRotation, this._initialUp);
    }
  }

  _accumulateMovementInput(moveInput) {
    const up = this.object.up;

    const reference = this.moveTowardsCameraTarget ? this.camera.baseTarget : this._positionPrev;
    this._forward.copy(this.camera.basePosition).sub(reference).normalize();
    this._right.crossVectors(up, this._forward);
    CharacterController.ensureRightVector(up, this._forward, this._right);
    this._v3.crossVectors(this._right, up);
    this._matrix.lookAt(ORIGIN, this._v3, up);
    this._quaternion.setFromRotationMatrix(this._matrix);

    this._acceleration.copy(moveInput).multiplyScalar(this.positionForce).applyQuaternion(this._quaternion);
    if (this.autoStep && this._isOnFloor) this._tryAutoStep();

    const cameraTheta = this.camera.isFollowCamera ? this.camera.spherical.theta : 0;
    this._rotationNext = lerp(
      this._rotationNext,
      getShortestRotationAngle(
        this._rotationNext,
        this._spherical.setFromVector3(moveInput).theta + cameraTheta,
      ),
      this.directionLerp,
    );
  }

  _tryAutoStep() {
    const up = this.object.up;
    this._v1.copy(this._acceleration).normalize();
    const probes = 3;
    const reach = this.capsule.radius * 2;
    for (let i = 0; i < probes; i++) {
      this._v2.copy(this._positionPrev).addScaledVector(this._v1, ((i + 1) / probes) * reach);
      this._v3.copy(this._v2).addScaledVector(up, this.capsule.radius * 2);
      const hit = this.collision.raycast(this._v3, this._v4.copy(up).negate());
      if (!hit || !hit.face) continue;
      const height = this._plane
        .setFromNormalAndCoplanarPoint(up, this._positionPrev)
        .distanceToPoint(hit.point);
      if (
        height > this.capsule.radius * 0.1 &&
        height < this.capsule.radius * 1.5 &&
        hit.face.normal.dot(up) > this.floorDetectInclination
      ) {
        this._isAutoStepping = true;
        this._v2.copy(hit.point).addScaledVector(up, height * 0.5);
        const force = this._acceleration.length();
        const boost = this.positionForce * 0.05;
        this._acceleration
          .copy(this._v1.subVectors(this._v2, this._positionPrev).normalize())
          .multiplyScalar(force + boost);
        return;
      }
    }
  }

  _substep() {
    const stepRatio = 1 / this.substeps;
    this._v1.copy(this._velocity).multiplyScalar(stepRatio);
    this._physicsObject.position.add(this._v1);
    const push = this._performShapecast(this._physicsObject, stepRatio);

    if (!this._isAutoStepping) this._velocity.addScaledVector(push, -push.dot(this._velocity));
  }

  _performShapecast(proxy, stepRatio) {
    const { radius } = this.capsule;
    const up = this.object.up;
    proxy.updateMatrix();
    this._capsuleWorld.copy(this.capsule.segment);
    this._capsuleWorld.start.y += radius;
    this._capsuleWorld.end.y += radius;
    this._capsuleWorld.start.applyMatrix4(proxy.matrix);
    this._capsuleWorld.end.applyMatrix4(proxy.matrix);
    this._capsuleBefore.copy(this._capsuleWorld);

    this._bounds.makeEmpty();
    this._bounds.expandByPoint(this._capsuleWorld.start);
    this._bounds.expandByPoint(this._capsuleWorld.end);
    this._bounds.min.addScalar(-radius);
    this._bounds.max.addScalar(radius);

    const capsule = this._capsuleWorld;
    const onTriangle = this._v2;
    const onSegment = this._v3;
    const normal = this._v4;
    this.collision.shapecast({
      intersectsBounds: (box) => box.intersectsBox(this._bounds),
      intersectsTriangle: (triangle) => {
        const distance = triangle.closestPointToSegment(capsule, onTriangle, onSegment);
        if (distance < radius) {
          const atBottom = onSegment.equals(capsule.start);
          const push = radius - distance;
          const direction = onSegment.sub(onTriangle).normalize();
          capsule.start.addScaledVector(direction, push);
          capsule.end.addScaledVector(direction, push);
          if (atBottom && direction.dot(up) > 0) {
            triangle.getNormal(normal);
            if (normal.dot(up) > this.floorDetectInclination) this._isOnFloor = true;
          }
        }
        return false;
      },
    });

    const push = this._v1.subVectors(this._capsuleWorld.start, this._capsuleBefore.start);
    const length = Math.max(0, push.length() - 1e-5 * stepRatio);
    push.normalize();
    proxy.position.addScaledVector(push, length);
    return push;
  }

  _detectJump() {
    const up = this.object.up;
    const origin = this._v1.copy(this._positionNext).addScaledVector(up, 0.005);
    const hit = this.collision.raycast(origin, this._v2.copy(up).negate());
    const awayFromFloor = (hit && typeof hit.distance === 'number' ? hit.distance : Infinity) > 0.25;
    const hasVariation = this._velocityVariation > 0.01;
    if (!this._isOnFloor && !hasVariation) this._isOnFloor = true;

    if (this._prevIsOnFloor !== this._isOnFloor) {
      if (this._prevIsOnFloor) {
        const now = ticker.time;
        if (this._prevIsOnFloorTime === -1) {
          this._prevIsOnFloorTime = now;
        } else if (now - this._prevIsOnFloorTime > 0.045 && awayFromFloor) {
          this._prevIsOnFloor = false;
          this._prevIsOnFloorTime = -1;
          this.medium = MEDIUMS.AIR;
        }
      } else {
        this._prevIsOnFloor = true;
        this.medium = MEDIUMS.GROUND;
        const height = this._plane
          .setFromNormalAndCoplanarPoint(up, this._positionNext)
          .distanceToPoint(this._lastFloorPosition);
        if ((this._needsToLand && height > -0.3) || height > 0.3) {
          events.emit('character_physics_land');
        }
        this._needsToLand = false;
      }
    } else {
      this._prevIsOnFloorTime = -1;
    }

    if (!this._prevIsOnFloor) {
      if (!awayFromFloor && this.medium === MEDIUMS.AIR) this.medium = MEDIUMS.GROUND;
      if (awayFromFloor && this.medium !== MEDIUMS.AIR) this.medium = MEDIUMS.AIR;
    }

    if (this._isOnFloor) {
      if (this._jumpRequested) {
        this._jumpRequested = false;
        this._velocity.addScaledVector(up, this.jumpForce);
        this._needsToLand = true;
        events.emit('character_physics_jump');
      }
      this._lastFloorPosition.copy(this._positionNext);
    }
    return hit;
  }

  _updateNearestVerticalPoint(hit) {
    if (!hit || !hit.face) {
      this._nearestVerticalPoint = -1;
      return;
    }
    const face = hit.face;
    const positions = this.collision.geometry.attributes.position;
    const a = this._v1.fromBufferAttribute(positions, face.a).distanceToSquared(hit.point);
    const b = this._v2.fromBufferAttribute(positions, face.b).distanceToSquared(hit.point);
    const c = this._v3.fromBufferAttribute(positions, face.c).distanceToSquared(hit.point);
    let nearest = face.a;
    if (b < a && b < c) nearest = face.b;
    if (c < a && c < b) nearest = face.c;
    this._nearestVerticalPoint = nearest;
  }

  _updatePosition(ratio = 1) {
    this.object.position.lerpVectors(this._positionPrev, this._positionNext, ratio);
  }

  _updateRotation(ratio = 1) {
    const object = this.object;
    const rotation = lerp(this._rotationPrev, this._rotationNext, ratio);
    const delta = rotation - object.rotationHorizontal;
    object.rotationHorizontal = rotation;
    this._forward.set(0, 0, -1).applyQuaternion(object.quaternion);
    this._forward.applyAxisAngle(object.up, delta);
    this._right.crossVectors(object.up, this._forward);
    CharacterController.ensureRightVector(object.up, this._forward, this._right);
    this._v3.crossVectors(this._right, object.up);
    this._matrix.lookAt(ORIGIN, this._v3, object.up);
    object.quaternion.setFromRotationMatrix(this._matrix);
  }

  static ensureRightVector(up, forward, right) {
    if (right.lengthSq() === 0) {
      if (Math.abs(up.z) === 1) forward.x += 1e-4;
      else forward.z += 1e-4;
      forward.normalize();
      right.crossVectors(up, forward);
    }
  }

  _setFloorState(onFloor = false) {
    this._isOnFloor = onFloor;
    this._prevIsOnFloor = onFloor;
    this.medium = onFloor ? MEDIUMS.GROUND : MEDIUMS.AIR;
    this._needsToLand = !onFloor;
  }

  _resetPhysics(onFloor = false) {
    this._acceleration.setScalar(0);
    this._velocity.setScalar(0);
    this._velocityVariation = 0;
    this.object.velocity.setScalar(0);
    this.object.velocityHorizontal = 0;
    this._setFloorState(onFloor);
  }
}

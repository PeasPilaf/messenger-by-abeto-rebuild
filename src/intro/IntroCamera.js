import * as THREE from 'three';

const HALF_PI = Math.PI * 0.5;
const TWO_PI = Math.PI * 2;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => (1 - t) * a + t * b;
const fit = (value, a1, a2, b1, b2) => {
  const t = clamp((value - a1) / (a2 - a1), 0, 1);
  return b1 + (b2 - b1) * t;
};

const damp = (coefficient, ratio) => 1 - Math.exp(Math.log(1 - coefficient) * ratio);
const friction = (coefficient, ratio) => Math.exp(Math.log(coefficient) * ratio);

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _lookMatrix = new THREE.Matrix4();
const _rollAxis = new THREE.Vector3();

export class IntroCamera extends THREE.PerspectiveCamera {

  constructor({ width = 1280, height = 800 } = {}) {
    super(45, width / height, 2, 1000);

    this.basePosition = new THREE.Vector3(0, 0, -120);
    this.baseTarget = new THREE.Vector3(0, -2.5, 0);
    this.baseUp = new THREE.Vector3(0, 1, 0);

    this.target = new THREE.Vector3().copy(this.baseTarget);
    this.up.copy(this.baseUp);
    this.position.copy(this.basePosition);

    this.displacement = {
      position: new THREE.Vector2(0, 0),
      target: new THREE.Vector2(-0.01, -0.0075),
      rotation: 0.01,
    };
    this.lerpPosition = 1;
    this.lerpTarget = 0.02;
    this.lerpRotation = 0.05;
    this.lerpRotate = 1;
    this.lerpZoom = 1;
    this.lerpPan = 1;

    this.autoRotate = true;
    this.autoRotateSpeed = 1;
    this.touchAmount = 1;
    this.roll = { value: 0 };

    this.spherical = new THREE.Spherical();
    this.sphericalTarget = new THREE.Spherical().setFromVector3(
      _offset.copy(this.basePosition).sub(this.baseTarget),
    );
    this.spherical.copy(this.sphericalTarget);

    this.pointer = new THREE.Vector2(0, 0);
    this._touchPosition = new THREE.Vector2();
    this._touchVelocity = new THREE.Vector2();
    this._additionalSphericalTarget = new THREE.Spherical(1, 0, 0);
    this._additionalRotationUp = 0;
    this._prev = { position: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3() };

    this.updateProjectionMatrix();
  }

  setViewportSize(width, height) {
    this.aspect = width / height;

    this.zoom = width < height && width < 700 ? 0.8 : 1;
    this.updateProjectionMatrix();
  }

  update(dt, ratio = dt * 60) {
    const frameRatio = Math.max(1e-6, ratio);

    if (this.autoRotate) {
      this.sphericalTarget.theta -= (TWO_PI / 60 / 60) * this.autoRotateSpeed * frameRatio;
    }

    const rotateCoef = damp(this.lerpRotate, frameRatio);
    const zoomCoef = damp(this.lerpZoom, frameRatio);
    this.spherical.theta = lerp(this.spherical.theta, this.sphericalTarget.theta, rotateCoef);
    this.spherical.phi = lerp(this.spherical.phi, this.sphericalTarget.phi, rotateCoef);
    this.spherical.radius = lerp(this.spherical.radius, this.sphericalTarget.radius, zoomCoef);

    const px = this.pointer.x;
    const py = this.pointer.y;
    const goalX = fit(px, -1, 1, -HALF_PI, HALF_PI);
    const goalY = fit(py, 1, -1, -HALF_PI, HALF_PI);
    const previousX = this._touchPosition.x;
    const previousY = this._touchPosition.y;
    const pointerCoef = damp(0.1, frameRatio);
    this._touchPosition.x = lerp(previousX, goalX, pointerCoef);
    this._touchPosition.y = lerp(previousY, goalY, pointerCoef);
    this._touchVelocity.x += this._touchPosition.x - previousX;
    this._touchVelocity.y += this._touchPosition.y - previousY;
    this._touchVelocity.multiplyScalar(friction(0.95, frameRatio));
    if (this._touchVelocity.lengthSq() < 1e-4) this._touchVelocity.set(0, 0);

    const touchX = lerp(0, this._touchPosition.x, this.touchAmount);
    const touchY = lerp(0, this._touchPosition.y, this.touchAmount);
    const touchVelocityX = lerp(0, this._touchVelocity.x, this.touchAmount);

    _forward.subVectors(this.basePosition, this.baseTarget);
    if (_forward.lengthSq() === 0) _forward.z = 1;
    _forward.normalize();
    _right.crossVectors(this.baseUp, _forward);
    if (_right.lengthSq() === 0) {
      if (Math.abs(this.baseUp.z) === 1) _forward.x += 1e-4;
      else _forward.z += 1e-4;
      _forward.normalize();
      _right.crossVectors(this.baseUp, _forward);
    }
    _right.normalize();
    _up.crossVectors(_forward, _right);

    this.basePosition.setFromSpherical(this.spherical).add(this.baseTarget);

    if (this.displacement.position.equals(new THREE.Vector2(0, 0))) {
      this.position.copy(this.basePosition);
      this._additionalSphericalTarget.set(1, 0, 0);
    } else {
      const coef = damp(this.lerpPosition, frameRatio);
      const theta = lerp(0, touchX * this.displacement.position.x, coef);
      const phi = lerp(0, touchY * this.displacement.position.y, coef);
      _offset.subVectors(this.basePosition, this.baseTarget);
      _offset.applyAxisAngle(_right, phi).applyAxisAngle(_up, theta);
      this.position.copy(this.baseTarget).add(_offset);
    }

    {
      const coef = damp(this.lerpTarget, frameRatio);
      this._additionalSphericalTarget.theta = lerp(
        this._additionalSphericalTarget.theta,
        touchX * this.displacement.target.x,
        coef,
      );
      this._additionalSphericalTarget.phi = lerp(
        this._additionalSphericalTarget.phi,
        touchY * this.displacement.target.y,
        coef,
      );
      _offset.subVectors(this.baseTarget, this.basePosition);
      _offset
        .applyAxisAngle(_right, this._additionalSphericalTarget.phi)
        .applyAxisAngle(_up, this._additionalSphericalTarget.theta);
      this.target.copy(this.basePosition).add(_offset);
    }

    {
      const coef = damp(this.lerpRotation, frameRatio);
      const goal = touchVelocityX * this.displacement.rotation * this.touchAmount;
      this._additionalRotationUp = lerp(this._additionalRotationUp, goal, coef);
      _offset.subVectors(this.position, this.target).normalize();
      this.up.copy(this.baseUp).applyAxisAngle(_offset, this._additionalRotationUp);
    }

    _lookMatrix.lookAt(this.position, this.target, this.up);
    this.quaternion.setFromRotationMatrix(_lookMatrix);
    if (this.roll.value !== 0) {
      _rollAxis.subVectors(this.position, this.target).normalize();
      this.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(_rollAxis, this.roll.value),
      );
    }
    this.updateMatrixWorld();
  }
}

const _lockForward = new THREE.Vector3();
const _lockBack = new THREE.Vector3();
const _lockRight = new THREE.Vector3();
const _lockUp = new THREE.Vector3();
const _lockMatrix = new THREE.Matrix4();

export function applyCameraLock(group, camera, baseOffset, camPosition = camera.position) {
  _lockForward.subVectors(camera.target, camPosition).normalize();
  group.position.copy(camPosition).addScaledVector(_lockForward, 45);

  _lockBack.subVectors(camPosition, camera.target);
  if (_lockBack.lengthSq() === 0) _lockBack.z = 1;
  _lockBack.normalize();
  _lockRight.crossVectors(camera.up, _lockBack);
  if (_lockRight.lengthSq() === 0) {
    if (Math.abs(camera.up.z) === 1) _lockBack.x += 1e-4;
    else _lockBack.z += 1e-4;
    _lockBack.normalize();
    _lockRight.crossVectors(camera.up, _lockBack);
  }
  _lockRight.normalize();
  _lockUp.crossVectors(_lockBack, _lockRight);

  group.position.addScaledVector(_lockUp, baseOffset);
  _lockMatrix.lookAt(camPosition, camera.target, _lockUp.set(0, 1, 0));
  group.quaternion.setFromRotationMatrix(_lockMatrix);
  group.updateMatrixWorld();
}

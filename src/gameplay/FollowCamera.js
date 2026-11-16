import { MathUtils, PerspectiveCamera, Spherical, Vector2, Vector3, Matrix4 } from 'three';

import { ticker } from '../core/Ticker.js';
import { fit, getShortestRotationAngle } from './CharacterController.js';

const HALF_PI = Math.PI * 0.5;
const ZERO_V2 = new Vector2();

const lerp = (a, b, t) => (1 - t) * a + t * b;

export const damp = (coef, ratio) =>
  coef >= 1 ? 1 : 1 - Math.exp(Math.log(1 - coef) * ratio);

export const friction = (coef, ratio) => Math.exp(Math.log(coef) * ratio);

const noiseA = new Vector3();
const noiseB = new Vector3();

export function sineNoise1(x, y, z) {
  noiseA.set(x, y, z);
  let sum = 0;
  sum += Math.sin(noiseA.dot(noiseB.set(1.5, 3.4598, 1.234)));
  sum += Math.sin(noiseA.dot(noiseB.set(3.12, -3.234, 4.221)));
  sum += Math.sin(noiseA.dot(noiseB.set(0.355, 2.3, -1.375)));
  sum += Math.sin(noiseA.dot(noiseB.set(-0.156, -3.34, -0.4566)));
  sum += Math.sin(noiseA.dot(noiseB.set(-4.1235, -0.485, -1.45)));
  sum += Math.sin(noiseA.dot(noiseB.set(2.54, -0.879, -2.123)));
  return sum / 6;
}

export class FollowCamera extends PerspectiveCamera {

  constructor({ collision, aspect = 16 / 9, near = 0.2, far = 175, fov = 45 } = {}) {
    super(fov, aspect, near, far);
    this.isFollowCamera = true;
    this.isBaseCamera = true;
    this.collision = collision || null;

    this.input = null;

    this.target = new Vector3();
    this.basePosition = new Vector3(0, 0, 6);
    this.baseTarget = new Vector3();
    this.baseUp = new Vector3(0, 1, 0);
    this.displacement = { position: new Vector2(-0.075, -0.05), target: new Vector2(), rotation: 0 };
    this.lerpPosition = 0.05;
    this.lerpTarget = 0.05;
    this.lerpRotation = 0.05;
    this.shake = new Vector3();
    this.shakeSpeed = new Vector3(1, 1, 1);
    this.touchAmount = 1;
    this.resetOnTouch = true;
    this._touchPosition = new Vector2();
    this._touchVelocity = new Vector2();
    this._additionalSphericalPosition = new Spherical(1, 0, 0);
    this._additionalSphericalTarget = new Spherical(1, 0, 0);
    this._additionalRotationUp = 0;
    this._prevPosition = new Vector3();
    this._prevTarget = new Vector3();
    this._prevUp = new Vector3();

    this.spherical = new Spherical();
    this.sphericalTarget = new Spherical();
    this._sphericalVerticalMinLimit = Math.PI * 0.25;
    this._sphericalVerticalMaxLimit = Math.PI * 0.75;
    this.character = null;
    this.followedMeshPhi = Math.PI * 0.5;
    this.followedMeshDistance = 1;
    this.followedMeshOffset = new Vector3();
    this.followedMeshOffsetDistance = 0;
    this.followedMeshOffsetTarget = new Vector3();
    this.followedMeshTarget = new Vector3();
    this._cameraCollisions = true;
    this._cameraCollisionsMinDistance = 0.75;
    this._cameraCollisionsIncrement = 0.05;
    this._cameraCollisionsMaxIterations = 10;
    this._cameraTargetLocalLerp = 0.0125;
    this._cameraTargetWorldLerp = 0.175;
    this._cameraRotationLerp = 0.03;
    this._cameraSphericalRotationLerp = 0.075;
    this._cameraSphericalRotationFastLerp = 0.3;
    this._cameraSphericalRadiusLerp = 0.035;
    this._cameraSphericalRadiusCollisionsLerp = 0.35;
    this._cameraAutomaticCenteringActiveLerp = 0.1;
    this._cameraAutomaticCenteringInactiveLerp = 0.0125;
    this._disableAutomaticCentering = false;
    this._automaticCenteringAmount = 1;
    this._cameraInactiveMultiplier = 0.025;
    this.additionalSpherical = new Spherical(0, 0, 0);
    this.overwriteSpherical = new Spherical(1, Math.PI * 0.5, 0);
    this.overwriteTarget = new Vector3();
    this.overwriteAmount = 0;
    this.controlAutomaticInfluence = 0.5;
    this.controlMode = 'automatic';

    this._v1 = new Vector3();
    this._v2 = new Vector3();
    this._v3 = new Vector3();
    this._sphericalA = new Spherical();
    this._sphericalB = new Spherical();
    this._matrix = new Matrix4();
  }

  resize(width = window.innerWidth, height = window.innerHeight) {
    if (!height) return;
    const aspect = width / height;
    if (this.aspect !== aspect) {
      this.aspect = aspect;
      this.updateProjectionMatrix();
    }
  }

  setPointer(pointer) {
    this.pointer = pointer;
    return this;
  }

  setCollision(collision) {
    this.collision = collision;
    return this;
  }

  _coef(coef) {
    return damp(coef, this._dtRatio);
  }

  follow(character, {
    relativeCameraPosition = new Vector3(0, 2, 5.75),
    relativeCameraOffset = new Vector3(0, 1, 0.5),
  } = {}) {
    if (!character || !character.object) throw new Error('FollowCamera: follow() needs a CharacterController');
    this.character = character;

    if (!this.collision) this.collision = character.collision || null;
    this.setOffset(relativeCameraOffset);

    const spherical = this._sphericalA.setFromVector3(relativeCameraPosition);
    spherical.phi = MathUtils.clamp(
      spherical.phi,
      this._sphericalVerticalMinLimit,
      this._sphericalVerticalMaxLimit,
    );
    this.followedMeshPhi = spherical.phi;
    this.followedMeshDistance = spherical.radius;
    this.spherical.copy(spherical);
    this.spherical.theta = getShortestRotationAngle(
      this.spherical.theta,
      character.object.rotationHorizontal,
    );
    this.sphericalTarget.copy(this.spherical);
    this._applySpherical(this.spherical, this.baseTarget, this._v1, this.basePosition);
    this.baseUp.copy(character.object.up);
    return this;
  }

  setOffset(offset, immediate = true) {
    const local = this.character.object;
    this._capsuleTop(this._v1).add(local.position);
    if (offset.isVector3) this.followedMeshOffset.copy(offset);
    else this.followedMeshOffset.fromArray(offset);
    this.followedMeshOffsetDistance = this.followedMeshOffset.length();
    if (immediate) {
      this.followedMeshOffsetTarget.copy(this.followedMeshOffset).applyQuaternion(local.quaternion);
      this.followedMeshTarget.copy(this.followedMeshOffsetTarget).add(this._v1);
      this.baseTarget.copy(this.followedMeshTarget);
    }
    return this;
  }

  orbitFromPointer(dx = 0, dy = 0) {
    this.sphericalTarget.phi +=
      dy * (this._sphericalVerticalMaxLimit - this._sphericalVerticalMinLimit);
    this.sphericalTarget.theta -= dx * Math.PI * 2;
  }

  zoom(delta) {
    this.additionalSpherical.radius = MathUtils.clamp(
      this.additionalSpherical.radius + delta,
      -this.followedMeshDistance * 0.5,
      Math.max(0, this.followedMeshDistance - this._cameraCollisionsMinDistance),
    );
  }

  _capsuleTop(target) {
    const capsule = this.character.capsule;
    target.copy(capsule.segment.end);
    target.y += capsule.radius;
    return target.applyQuaternion(this.character.object.quaternion);
  }

  _applySpherical(spherical, position, temp, target) {
    const local = this.character.object;
    temp.setFromSpherical(spherical).applyQuaternion(local.quaternion);
    temp.applyAxisAngle(local.up, Math.PI - local.rotationHorizontal);
    target.copy(position).add(temp);
  }

  update(deltaRatio = ticker.ratio) {
    this._dtRatio = deltaRatio;
    this._updateFollow();
    this._updateBase();
  }

  _updateFollow() {
    const character = this.character;
    if (!character) return;
    const local = character.object;
    const coefLocal = this._coef(this._cameraTargetLocalLerp);
    const coefWorld = this._coef(this._cameraTargetWorldLerp);

    this._capsuleTop(this._v1).add(local.position);
    this._v2.copy(this.followedMeshOffset).applyQuaternion(local.quaternion);
    const origin = this._v1;
    const direction = this._v3.copy(this._v2).normalize();
    const hit = this.collision ? this.collision.raycast(origin, direction) : null;
    if (hit && hit.distance < this.followedMeshOffsetDistance) this._v2.set(0, 0, 0);
    if (this.sphericalTarget.radius < this.followedMeshDistance * 0.75) this._v2.set(0, 0, 0);
    this.followedMeshOffsetTarget.lerp(this._v2, coefLocal);
    this.followedMeshTarget.lerp(this._v1.add(this.followedMeshOffsetTarget), coefWorld);
    this.baseTarget.lerpVectors(this.followedMeshTarget, this.overwriteTarget, this.overwriteAmount);

    this._v1.setFromSpherical(this.spherical).setY(0).normalize();
    this._v2.set(0, 0, -1).applyAxisAngle(this._v3.set(0, 1, 0), local.rotationHorizontal);
    const centredness = fit(this._v1.dot(this._v2), 1, 0, 0, 1);
    const speedFactor = character.isMoving ? centredness : this._cameraInactiveMultiplier;
    const targetTheta = getShortestRotationAngle(this.sphericalTarget.theta, local.rotationHorizontal);

    let influence = 1;
    let centeringLerp = 1;
    if (character.controlMode !== 'automatic') {
      const idle = this._isPlayerIdle();
      influence = idle ? this.controlAutomaticInfluence : 0;
      centeringLerp = idle
        ? this._cameraAutomaticCenteringInactiveLerp
        : this._cameraAutomaticCenteringActiveLerp;
    }
    this._automaticCenteringAmount = this._disableAutomaticCentering
      ? 0
      : lerp(this._automaticCenteringAmount, influence, this._coef(centeringLerp));

    this.sphericalTarget.theta = lerp(
      this.sphericalTarget.theta,
      targetTheta,
      this._coef(this._cameraRotationLerp * speedFactor * this._automaticCenteringAmount),
    );
    this.sphericalTarget.phi = lerp(
      this.sphericalTarget.phi,
      this.followedMeshPhi,
      this._coef(this._cameraRotationLerp * this._automaticCenteringAmount),
    );

    let radius = this.sphericalTarget.radius;
    if (this._cameraCollisions && this.collision) {
      let collided = false;
      this._applySpherical(this.sphericalTarget, this.baseTarget, this._v1, this._v2);
      const targetRadius = this.sphericalTarget.radius - this._v2.distanceTo(local.position);
      this._sphericalA.copy(this.sphericalTarget);
      const hitDir = this._v3.subVectors(this._v2, this.baseTarget).normalize();
      const rayHit = this.collision.raycast(this.baseTarget, hitDir);
      if (
        rayHit &&
        rayHit.distance < this.followedMeshDistance &&
        rayHit.distance > targetRadius &&
        !this.collision.isSkippedTriangle(rayHit.faceIndex)
      ) {
        this._sphericalA.radius = Math.max(this.followedMeshOffsetDistance, rayHit.distance * 0.9);
        collided = true;
      }
      const increment = this.followedMeshDistance * this._cameraCollisionsIncrement;
      let iterations = 0;
      while (
        this._sphericalA.radius > this.followedMeshOffsetDistance &&
        iterations < this._cameraCollisionsMaxIterations
      ) {
        this._applySpherical(this._sphericalA, this.baseTarget, this._v1, this._v2);
        const closest = this.collision.closestPointToPoint(
          this._v2,
          undefined,
          0,
          this._cameraCollisionsMinDistance,
        );
        if (
          closest &&
          closest.distance < this._cameraCollisionsMinDistance &&
          !this.collision.isSkippedTriangle(closest.faceIndex)
        ) {
          this._sphericalA.radius = Math.max(
            this.followedMeshOffsetDistance,
            this._sphericalA.radius - increment,
          );
          iterations++;
          collided = true;
        } else break;
      }
      radius = collided
        ? this._sphericalA.radius
        : Math.min(this.followedMeshDistance, this._sphericalA.radius + increment * this._dtRatio);
    } else {
      radius = this.followedMeshDistance;
    }
    this.sphericalTarget.radius = lerpCoefFPS(this.sphericalTarget.radius, radius, this._cameraSphericalRadiusCollisionsLerp, this._dtRatio);

    this._sphericalA.radius = this.sphericalTarget.radius + this.additionalSpherical.radius;
    this._sphericalA.phi = this.sphericalTarget.phi + this.additionalSpherical.phi;
    this._sphericalA.theta = this.sphericalTarget.theta + this.additionalSpherical.theta;
    this._sphericalA.makeSafe();

    const rotationCoef = this._coef(
      character.controlMode === 'automatic'
        ? this._cameraSphericalRotationLerp
        : this._cameraSphericalRotationFastLerp,
    );
    const radiusCoef = this._coef(this._cameraSphericalRadiusLerp);
    this.spherical.phi = lerp(this.spherical.phi, this._sphericalA.phi, rotationCoef);
    this.spherical.theta = lerp(this.spherical.theta, this._sphericalA.theta, rotationCoef);
    this.spherical.radius = lerp(this.spherical.radius, this._sphericalA.radius, radiusCoef);

    this._sphericalB.radius = lerp(this.spherical.radius, this.overwriteSpherical.radius, this.overwriteAmount);
    this._sphericalB.phi = lerp(this.spherical.phi, this.overwriteSpherical.phi, this.overwriteAmount);
    this._sphericalB.theta = lerp(this.spherical.theta, this.overwriteSpherical.theta, this.overwriteAmount);
    this._sphericalB.makeSafe();
    this._applySpherical(this._sphericalB, this.baseTarget, this._v1, this.basePosition);
    this.baseUp.copy(local.up);
  }

  _isPlayerIdle() {
    const input = this.input;
    if (!input) return true;
    return (
      input.isLeftMousePressed === false &&
      input.touchCameraFinger === -1 &&
      !input.gamepadMovingCamera
    );
  }

  _updateBase(immediate = false) {
    const pointer = this.pointer;
    const position11 = pointer ? pointer.position11 : null;
    const reset = this.resetOnTouch && pointer && pointer.isTouch && !pointer.down;
    const scale = reset ? 0.5 : 1;
    const targetX = reset || !position11 ? 0 : fit(position11.x, -1, 1, -HALF_PI, HALF_PI);
    const targetY = reset || !position11 ? 0 : fit(position11.y, 1, -1, -HALF_PI, HALF_PI);
    const previousX = this._touchPosition.x;
    const previousY = this._touchPosition.y;
    const coef = immediate ? 1 : this._coef(0.1);
    this._touchPosition.x = lerp(this._touchPosition.x, targetX, coef);
    this._touchPosition.y = lerp(this._touchPosition.y, targetY, coef);
    this._touchVelocity.x += this._touchPosition.x - previousX;
    this._touchVelocity.y += this._touchPosition.y - previousY;
    this._touchVelocity.multiplyScalar(friction(0.95, this._dtRatio));
    if (this._touchVelocity.lengthSq() < 1e-4 || immediate) this._touchVelocity.set(0, 0);

    const pointerX = lerp(0, this._touchPosition.x, this.touchAmount);
    const pointerY = lerp(0, this._touchPosition.y, this.touchAmount);
    const pointerVelocityX = lerp(0, this._touchVelocity.x, this.touchAmount);

    const forward = this._v1.subVectors(this.basePosition, this.baseTarget);
    if (forward.lengthSq() === 0) forward.z = 1;
    forward.normalize();
    const right = this._v2.crossVectors(this.baseUp, forward);
    if (right.lengthSq() === 0) {
      if (Math.abs(this.baseUp.z) === 1) forward.x += 1e-4;
      else forward.z += 1e-4;
      forward.normalize();
      right.crossVectors(this.baseUp, forward);
    }
    right.normalize();
    const up = this._v3.crossVectors(forward, right);

    if (this.displacement.position.equals(ZERO_V2)) {
      this.position.copy(this.basePosition);
      this._additionalSphericalPosition.set(1, 0, 0);
    } else {
      const coefPosition = immediate ? 1 : this._coef(this.lerpPosition * scale);
      const targetXOffset = pointerX * this.displacement.position.x;
      const targetYOffset = pointerY * this.displacement.position.y;
      this._additionalSphericalPosition.theta = lerp(
        this._additionalSphericalPosition.theta,
        targetXOffset,
        coefPosition,
      );
      this._additionalSphericalPosition.phi = lerp(
        this._additionalSphericalPosition.phi,
        targetYOffset,
        coefPosition,
      );
      const offset = this._v1.subVectors(this.basePosition, this.baseTarget);
      offset
        .applyAxisAngle(this._v2, this._additionalSphericalPosition.phi)
        .applyAxisAngle(up, this._additionalSphericalPosition.theta);
      this.position.copy(this.baseTarget).add(offset);
    }

    if (
      this.displacement.target.equals(ZERO_V2) &&
      this.shake.x === 0 &&
      this.shake.y === 0
    ) {
      this.target.copy(this.baseTarget);
      this._additionalSphericalTarget.set(1, 0, 0);
    } else {
      const coefTarget = immediate ? 1 : this._coef(this.lerpTarget * scale);
      const targetXOffset = pointerX * this.displacement.target.x;
      const targetYOffset = pointerY * this.displacement.target.y;
      this._additionalSphericalTarget.theta = lerp(
        this._additionalSphericalTarget.theta,
        targetXOffset,
        coefTarget,
      );
      this._additionalSphericalTarget.phi = lerp(
        this._additionalSphericalTarget.phi,
        targetYOffset,
        coefTarget,
      );
      const shakeX =
        this.shake.x === 0
          ? 0
          : sineNoise1(12.23, 3.44, -3.234 + ticker.time * this.shakeSpeed.x) *
            this.shake.x *
            this.touchAmount;
      const shakeY =
        this.shake.y === 0
          ? 0
          : sineNoise1(-2.45, 4.789, 7.343 + ticker.time * this.shakeSpeed.y) *
            this.shake.y *
            this.touchAmount;
      const offset = this._v1.subVectors(this.baseTarget, this.basePosition);
      offset
        .applyAxisAngle(this._v2, this._additionalSphericalTarget.phi + shakeY)
        .applyAxisAngle(up, this._additionalSphericalTarget.theta + shakeX);
      this.target.copy(this.basePosition).add(offset);
    }

    if (this.displacement.rotation === 0 && this.shake.z === 0) {
      this.up.copy(this.baseUp);
      this._additionalRotationUp = 0;
    } else {
      const coefRoll = immediate ? 1 : this._coef(this.lerpRotation * scale);
      const targetRoll = pointerVelocityX * this.displacement.rotation * this.touchAmount;
      this._additionalRotationUp = lerp(this._additionalRotationUp, targetRoll, coefRoll);
      const shakeRoll =
        this.shake.z === 0
          ? 0
          : sineNoise1(23.434, -1.565, 8.454 + ticker.time * this.shakeSpeed.z) *
            this.shake.z *
            this.touchAmount;
      const viewAxis = this._v1.subVectors(this.position, this.target).normalize();
      this.up.copy(this.baseUp).applyAxisAngle(viewAxis, this._additionalRotationUp + shakeRoll);
    }

    if (
      !this.position.equals(this._prevPosition) ||
      !this.target.equals(this._prevTarget) ||
      !this.up.equals(this._prevUp)
    ) {
      this._prevPosition.copy(this.position);
      this._prevTarget.copy(this.target);
      this._prevUp.copy(this.up);
      this.quaternion.setFromRotationMatrix(
        this._matrix.lookAt(this.position, this.target, this.up),
      );
    }
  }
}

function lerpCoefFPS(value, target, coef, ratio) {
  return lerp(value, target, damp(coef, ratio));
}

import * as THREE from 'three';

import { COLORS, SHADOW } from '../graphics/constants.js';

const FORWARD_OFFSET = 6;

export class FollowSun extends THREE.DirectionalLight {

  constructor({ shadowMapSize = SHADOW.mapSize, shadowSize = SHADOW.orthoHalfSize } = {}) {
    super(COLORS.lightColor, COLORS.lightIntensity);

    this.castShadow = true;
    this._shadowMapSize = shadowMapSize;
    this.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.shadow.camera.left = -shadowSize;
    this.shadow.camera.right = shadowSize;
    this.shadow.camera.top = shadowSize;
    this.shadow.camera.bottom = -shadowSize;
    this.shadow.camera.near = 50;
    this.shadow.camera.far = 160;
    this.shadow.bias = SHADOW.bias;
    this.shadow.normalBias = SHADOW.normalBias;
    this.shadow.camera.updateProjectionMatrix();

    this._offset = new THREE.Vector3().setFromSpherical(
      new THREE.Spherical(SHADOW.distance, SHADOW.polarAngle, SHADOW.azimuthAngle),
    );

    this.target = new THREE.Object3D();
    this.target.name = 'sun-target';

    this._forward = new THREE.Vector3();
    this._offsetWorld = new THREE.Vector3();
  }

  setShadowQuality(multiplier) {
    const full = this._shadowMapSize;
    const desired = multiplier < 0.9 ? Math.floor(full / 2) : full;
    if (this.shadow.mapSize.width === desired) return;
    this.shadow.mapSize.width = desired;
    this.shadow.mapSize.height = desired;
    this.shadow.map?.dispose();
    this.shadow.map = null;
  }

  addTo(scene) {
    scene.add(this);
    scene.add(this.target);
    return this;
  }

  update(character, cameraPosition, cameraTarget) {
    const local = character.object;

    this._forward.copy(cameraTarget).sub(cameraPosition).normalize();
    this.target.position.copy(cameraTarget).addScaledVector(this._forward, FORWARD_OFFSET);

    this._offsetWorld.copy(this._offset).applyQuaternion(local.quaternion);
    this._offsetWorld.applyAxisAngle(character.up, Math.PI - character.rotationHorizontal);
    this.position.copy(this.target.position).add(this._offsetWorld);

    this.up.copy(character.up);
    this.shadow.camera.up.copy(character.up);

    this.target.updateMatrixWorld();
  }
}

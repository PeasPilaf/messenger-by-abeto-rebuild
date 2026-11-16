import * as THREE from 'three';

import { events } from '../core/Events.js';
import { createTween } from '../core/Tween.js';
import { ticker } from '../core/Ticker.js';
import { Avatar } from '../gameplay/avatar/Avatar.js';
import { readAccessories } from '../gameplay/avatar/Accessories.js';
import { CharacterController, CHARACTER_PHYSICS_OPTIONS } from '../gameplay/CharacterController.js';
import { CollisionWorld } from '../gameplay/CollisionWorld.js';
import { FollowCamera } from '../gameplay/FollowCamera.js';
import { Input } from '../gameplay/Input.js';

const GAME_CHARACTER_OPTIONS = {
  ...CHARACTER_PHYSICS_OPTIONS,
  positionForce: 0.005,
  jumpForce: 0.15,
  gravity: -0.00981,
  damp: 0.92,
  dampIdle: 0.65,
  capsuleRadiusPercentage: 0.2,
  floorDetectInclination: 0.7,
  autoStep: true,
  checkFalling: true,
  moveTowardsCameraTarget: true,
  substeps: 3,
  directionLerp: 0.075,
};

export class Player {

  constructor({ app, geometryLoader, shared, accessories = null }) {
    this.app = app;
    this.geometryLoader = geometryLoader;
    this.shared = shared;
    this.initialAccessories = accessories;

    this.camera = new FollowCamera({
      aspect: app.width / app.height,
      near: 0.2,
      far: 175,
      fov: 45,
    });

    this.collision = new CollisionWorld({
      loadGeometry: (name) => this.geometryLoader.load(name),
    });

    this.object = null;

    this.avatar = null;

    this.controller = null;

    this.input = null;

    this._up = new THREE.Vector3(0, 1, 0);
  }

  async load() {
    await this.collision.load();

    this.avatar = new Avatar({
      loadGeometry: (name) => this.geometryLoader.load(name),
      loadBones: (name) => this.geometryLoader.loadBones(name),
      loadAnimation: (name) => this.geometryLoader.loadAnimation(name),
      shared: this.shared,
      accessories: this.initialAccessories ?? readAccessories(),
    });
    await this.avatar.load();

    this.object = new THREE.Object3D();
    this.object.name = 'character';
    this.object.add(this.avatar.object3D);

    this.controller = new CharacterController({
      object: this.object,
      camera: this.camera,
      collision: this.collision,
      ...GAME_CHARACTER_OPTIONS,
    });

    this.avatar.geometry.computeBoundingBox();
    this.controller.setCapsuleFromBounds(this.avatar.geometry.boundingBox);

    this._followOptions = {
      relativeCameraPosition: new THREE.Vector3(0, 1, 5),
      relativeCameraOffset: new THREE.Vector3(-0.65, 0, 1),
    };
    this.camera.follow(this.controller, this._followOptions);

    this.input = new Input({ element: this.app.renderer.domElement });
    this.input.enable();
    this.input.connect({ controller: this.controller, camera: this.camera });
    this.camera.setPointer(this.input.pointer);

    this.app.onResize((width, height) => {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.camera.resize?.();
    });

    return this;
  }

  snapToSpawn(spawn) {
    const up = new THREE.Vector3().fromArray(spawn.position).normalize();
    this.controller.placeOnFloor(spawn.position, spawn.rotation, up);
    this.controller.setInitialPose?.(spawn.position, spawn.rotation, up);
    this.camera.follow(this.controller, this._followOptions);
    this.camera.update(1);
  }

  update(time, delta) {
    if (!this.controller) return;

    const move = this.input.update();
    this.controller.update(move, ticker.ratio);

    this.avatar.setVelocity(this.object.velocity, this.object.up);
    this.avatar.setAirborne(this.object.userData.medium === 1);
    this.avatar.setInteracting(Boolean(this.interacting));
    this.avatar.update(delta);
    this.avatar.updateWetness(this.object.position.length(), ticker.ratio);

    this.camera.update(ticker.ratio);

    events.emit('character_broadcast_position', this.position.toArray());
  }

  lockCameraTo(focusWorld, offsetWorld, duration = 2.5) {
    const { camera, controller } = this;

    const local = this.object;
    const invQ = local.quaternion.clone().invert();
    const offset = offsetWorld.clone();
    offset.applyAxisAngle(local.up, -(Math.PI - local.rotationHorizontal));
    offset.applyQuaternion(invQ);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    camera.overwriteTarget.copy(focusWorld);
    camera.overwriteSpherical.radius = spherical.radius;
    camera.overwriteSpherical.phi = spherical.phi;
    camera.overwriteSpherical.theta = spherical.theta;

    camera._cameraCollisions = false;
    this._cameraTween?.stop?.();
    this._cameraTween = createTween(camera, {
      to: { overwriteAmount: 1 },
      duration,
      ease: 'inOut1',
    });
  }

  lockCameraOnNpc(actor, duration = 2.5) {
    const npcPosition = actor.mesh.position;
    const up = npcPosition.clone().normalize();
    const direction = this.position.clone().sub(npcPosition);
    direction.addScaledVector(up, -direction.dot(up));
    if (direction.lengthSq() < 1e-6) direction.set(1, 0, 0);
    direction.normalize();

    const focus = npcPosition.clone()
      .addScaledVector(up, 1.25)
      .add(new THREE.Vector3().fromArray(actor.data?.lookatOffset ?? [0, 0, 0]));
    const offset = direction.clone().multiplyScalar(2.5).addScaledVector(up, 0.55);
    this.lockCameraTo(focus, offset, duration);
  }

  lockCameraOnSelf(duration = 2.5) {
    const up = this.position.clone().normalize();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.object.quaternion);
    forward.addScaledVector(up, -forward.dot(up)).normalize();
    const focus = this.position.clone().addScaledVector(up, 1.15);

    const offset = forward.clone().multiplyScalar(2.2)
      .addScaledVector(up, 0.35)
      .addScaledVector(new THREE.Vector3().crossVectors(up, forward), 0.9);
    this.lockCameraTo(focus, offset, duration);
  }

  unlockCamera(duration = 1.25) {
    this._cameraTween?.stop?.();
    this._cameraTween = createTween(this.camera, {
      to: { overwriteAmount: 0 },
      duration,
      ease: 'inOut1',
      onComplete: () => { this.camera._cameraCollisions = true; },
    });
  }

  get ready() {
    return this.object !== null && this.object !== undefined;
  }

  get position() {
    return this.object.position;
  }

  get up() {
    return this.object.up;
  }

  get quaternion() {
    return this.object.quaternion;
  }

  get rotationHorizontal() {
    return this.object.rotationHorizontal;
  }

  get velocity() {
    return this.object.velocity;
  }

  get isOnFloor() {
    return this.controller.isOnFloor;
  }

  get speed() {
    return this.object.velocity.length();
  }

  get medium() {
    return this.object.userData.medium;
  }

  get weights() {
    return this.avatar?.weights ?? null;
  }

  get animationTime() {
    return this.avatar?.animations?.mixer?.time ?? 0;
  }

  get object3D() {
    return this.object;
  }

  setInteracting(interacting) {
    this.interacting = Boolean(interacting);
  }

  async setAccessories(selection) {
    const applied = await this.avatar.setAccessories(selection);
    events.emit('character_accessories_changed', applied);
    return applied;
  }

  dispose() {
    this.input?.dispose();
    this.avatar?.dispose();
    this.object?.removeFromParent();
  }
}

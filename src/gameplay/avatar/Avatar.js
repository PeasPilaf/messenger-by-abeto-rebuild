import { Matrix4, SkinnedMesh } from 'three';

import { buildClip } from './AnimationBuilder.js';
import { AvatarAnimations, CLIP_NAMES } from './AvatarAnimations.js';
import { createAvatarMaterial } from './AvatarMaterial.js';
import { mergeAccessoryGeometries } from './mergeAccessoryGeometries.js';
import { buildSkeleton } from './SkeletonBuilder.js';
import {
  CATEGORIES,
  accessoryGeometryNames,
  randomAccessories,
  validateAccessories,
} from './Accessories.js';

export const DEFAULT_FILES = Object.freeze({
  bonesFile: 'avatar/avatar-bones',
  modelFiles: ['avatar/accessories/base'],
  animationFiles: [
    'avatar/avatar-idle',
    'avatar/avatar-run',
    'avatar/avatar-sprint',
    'avatar/avatar-air',
    'avatar/avatar-afk1',
    'avatar/avatar-afk2',
    'avatar/avatar-afk3',
  ],
});

export class Avatar {

  constructor({
    loadGeometry,
    loadBones,
    loadAnimation,
    material = null,
    shared = null,
    accessories = null,
    animationOffset = Math.random() * 100,
    inactiveTime,
    inactiveAnimations,
    animationLerp,
    sprintLerp,
    name = 'Avatar',
  } = {}) {
    if (typeof loadGeometry !== 'function' || typeof loadBones !== 'function' || typeof loadAnimation !== 'function') {
      throw new TypeError('Avatar: loadGeometry, loadBones and loadAnimation functions are required');
    }
    this.loadGeometry = loadGeometry;
    this.loadBones = loadBones;
    this.loadAnimation = loadAnimation;
    this.name = name;

    const preparedMaterial = createAvatarMaterial({ material, shared });
    this.material = preparedMaterial.material;
    this.shared = preparedMaterial.shared;
    this._ownsMaterial = preparedMaterial.ownsMaterial;

    this.accessories = accessories ?? randomAccessories();
    this._animationOffset = animationOffset;
    this._animationOptions = { inactiveTime, inactiveAnimations, animationLerp, sprintLerp };

    this.mesh = null;
    this.geometry = null;
    this.skeleton = null;
    this.animations = null;
    this.clips = [];
    this._loadPromise = null;
  }

  load() {
    this._loadPromise ??= this._load();
    return this._loadPromise;
  }

  async _load() {

    this.accessories = validateAccessories(this.accessories);
    const [bonePointCloud, accessoryGeometries, ...animationData] = await Promise.all([
      this.loadBones(DEFAULT_FILES.bonesFile),
      Promise.all(accessoryGeometryNames(this.accessories).map((path) => this.loadGeometry(path))),
      ...DEFAULT_FILES.animationFiles.map((file) => this.loadAnimation(file)),
    ]);

    this.skeleton = buildSkeleton(bonePointCloud, { name: DEFAULT_FILES.bonesFile });
    this.geometry = mergeAccessoryGeometries(accessoryGeometries);
    this.clips = animationData.map((data, index) => buildClip(CLIP_NAMES[index], data));

    this._createMesh();
    this.animations = new AvatarAnimations(this.mesh, this.clips, {
      animationOffset: this._animationOffset,
      ...this._animationOptions,
    });
    return this;
  }

  _createMesh() {
    const mesh = new SkinnedMesh(this.geometry, this.material);
    mesh.name = this.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    mesh.frustumCulled = false;

    for (const bone of this.skeleton.rootBones) mesh.add(bone);
    mesh.bind(this.skeleton.skeleton, new Matrix4());
    mesh.normalizeSkinWeights();

    this.mesh = mesh;
  }

  setSpeed(speed) {
    this.animations?.setSpeed(speed);
  }

  setVelocity(velocity, up) {
    this.animations?.setVelocity(velocity, up);
  }

  setAirborne(airborne) {
    this.animations?.setAirborne(airborne);
  }

  setInteracting(interacting) {
    this.animations?.setInteracting(interacting);
  }

  setTalking(talking) {
    this._talking = Boolean(talking);
    const uniform = this.mesh?.material?.uniforms?.uIsTalking;
    if (uniform) uniform.value = this._talking ? 1 : 0;
  }

  setClipOverride(index) {
    this.animations?.setClipOverride(index);
  }

  update(deltaSeconds) {
    this.animations?.update(deltaSeconds);
  }

  updateWetness(distanceFromPlanetCenter, deltaRatio = 1) {
    const height = Math.max(0, 22 - distanceFromPlanetCenter);
    const uniform = this.mesh?.material?.uniforms?.uWetHeight;
    if (!uniform) return 0;
    if (uniform.value < height) uniform.value = height;
    else uniform.value = Math.max(0, uniform.value - 2e-4 * deltaRatio);
    return uniform.value;
  }

  get object3D() {
    return this.mesh;
  }

  get jointCount() {
    return this.skeleton?.jointCount ?? 0;
  }

  get jointLabels() {
    return this.skeleton?.jointLabels ?? [];
  }

  get weights() {
    return this.animations?.weights ?? [];
  }

  get clipNames() {
    return CLIP_NAMES;
  }

  get currentClipIndex() {
    return this.animations?.currentClipIndex ?? 0;
  }

  get currentClipName() {
    return this.animations?.currentClipName ?? CLIP_NAMES[0];
  }

  get currentClipTime() {
    return this.animations?.currentClipTime ?? 0;
  }

  get currentClipFps() {
    return this.animations?.currentClipFps ?? 0;
  }

  get currentClipDuration() {
    return this.animations?.currentClipDuration ?? 0;
  }

  get animationIndex() {
    return this.animations?.animationIndex ?? 0;
  }

  get forcedClipIndex() {
    return this.animations?.forcedClipIndex ?? null;
  }

  get isInactive() {
    return this.animations?.isInactive ?? false;
  }

  async setAccessories(selection) {
    const valid = validateAccessories(selection);
    if (!this.mesh) await this.load();
    const geometries = await Promise.all(
      accessoryGeometryNames(valid).map((path) => this.loadGeometry(path)),
    );
    const geometry = mergeAccessoryGeometries(geometries);
    const previous = this.mesh.geometry;
    this.mesh.geometry = geometry;
    this.mesh.normalizeSkinWeights();
    previous.dispose();
    this.geometry = geometry;
    this.accessories = valid;
    return valid;
  }

  dispose() {
    this.animations?.dispose();
    this.animations = null;
    this.clips = [];
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose();
      this.mesh = null;
    }

    this.skeleton?.skeleton.dispose();
    this.skeleton = null;
    this.geometry = null;
    if (this._ownsMaterial) this.material?.dispose();
  }
}

export { CATEGORIES, CLIP_NAMES };

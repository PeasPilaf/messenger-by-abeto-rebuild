import { AnimationMixer, CurvePath, LineCurve3, Matrix4, SkinnedMesh, Quaternion, Vector3 } from 'three';

import { buildClip } from '../avatar/AnimationBuilder.js';
import { buildSkeleton } from '../avatar/SkeletonBuilder.js';
import { createNpcMaterial } from './npcMaterials.js';
import { fit, lerpCoefFPS } from './npcMath.js';

const UPDATE_DISTANCE = 75;
const UPDATE_DISTANCE_MULT = 0.3;

const POSITION_LERP = 0.1;
const ROTATION_LERP = 0.04;

const CURVE_PROGRESS_RATE = 0.001575;

const scratchMatrix = new Matrix4();
const scratchDirection = new Vector3();
const scratchRight = new Vector3();
const scratchForward = new Vector3();
const scratchPrevious = new Vector3();

export function calculateDirection(up, direction, target) {
  const forward = scratchDirection.copy(direction);
  if (forward.lengthSq() === 0) forward.set(0, 0, 1);
  forward.normalize();
  const right = scratchRight.crossVectors(up, forward);
  if (right.lengthSq() === 0) {

    if (Math.abs(up.z) === 1) forward.x += 1e-4;
    else forward.z += 1e-4;
    forward.normalize();
    right.crossVectors(up, forward);
  }
  const trueForward = scratchForward.crossVectors(right, up);
  scratchMatrix.set(
    right.x, up.x, trueForward.x, 0,
    right.y, up.y, trueForward.y, 0,
    right.z, up.z, trueForward.z, 0,
    0, 0, 0, 1,
  );
  return target.setFromRotationMatrix(scratchMatrix);
}

export function buildCurvePath(geometry) {
  const position = geometry.getAttribute('position');
  if (!position) return null;
  const points = [];
  for (let index = 0; index < position.count; index++) {
    points.push(new Vector3().fromBufferAttribute(position, index));
  }
  if (points.length < 2) return null;
  const path = new CurvePath();
  for (let index = 0; index < points.length - 1; index++) {
    path.add(new LineCurve3(points[index], points[index + 1]));
  }
  return path;
}

export class NpcActor {

  constructor({ options, geometryLoader, shared }) {
    this.options = options;
    this.id = options.id;
    this.geometryLoader = geometryLoader;
    this.shared = shared;

    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.skeleton = null;
    this.mixer = null;
    this.actions = {};
    this.activeAction = null;

    this.targetPosition = new Vector3();
    this.targetQuaternion = new Quaternion();
    this.originalQuaternion = new Quaternion();
    this.up = new Vector3(0, 1, 0);

    this.curve = null;
    this.curveLength = 0;
    this.curveProgress = options.curve ? 0 : 0;
    this.curveProgressMultiplier = 0;

    this.boundingBox = null;
    this.boundingSphereCenterLocal = new Vector3();
    this.boundingSphereRadius = 1;
    this.bubbleAnchorY = 1.5;
    this.iconAnchorY = 1.7;

    this._hasUpdatedOnce = false;
    this._mixerOffset = Math.random() * 100;
    this._lastAnimationUpdate = -Math.random();
    this._talking = false;
    this._talkAnimationPlaying = false;
    this._isClose = false;
    this._interacting = false;
    this._clipName = 'idle';
    this._loadPromise = null;
  }

  load() {
    this._loadPromise ??= this._load();
    return this._loadPromise;
  }

  async _load() {
    const { options } = this;
    const animationNames = options.animations;
    const [model, bonePointCloud, ...animationData] = await Promise.all([
      this.geometryLoader.load(options.model),
      this.geometryLoader.loadBones(options.bones),
      ...animationNames.map((name) => this.geometryLoader.loadAnimation(name)),
    ]);

    this.skeleton = buildSkeleton(bonePointCloud, { name: options.bones });
    this.geometry = model;
    this.material = createNpcMaterial({
      shared: this.shared,
      visibilityThreshold: options.visibilityThreshold,
      id: options.id,
    });

    this._createMesh();
    this._createMixer(animationData);
    this._applyAuthoredTransform();

    if (options.curve) {
      const curveGeometry = await this.geometryLoader.load(options.curve.file);
      this.curve = buildCurvePath(curveGeometry);
      if (this.curve) {
        this.curveLength = this.curve.getLength() || 1;

        this.curveProgressMultiplier = (1 / this.curveLength) * CURVE_PROGRESS_RATE;
        this.curve.getPointAt(this.curveProgress % 1, this.targetPosition);
      }
    }
    return this;
  }

  _createMesh() {
    const mesh = new SkinnedMesh(this.geometry, this.material);
    mesh.name = `NPC-${this.id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    mesh.frustumCulled = false;
    for (const bone of this.skeleton.rootBones) mesh.add(bone);
    mesh.bind(this.skeleton.skeleton, new Matrix4());
    mesh.normalizeSkinWeights();

    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();
    this.boundingBox = this.geometry.boundingBox;
    this.boundingSphereCenterLocal.copy(this.geometry.boundingSphere.center);

    this.boundingSphereRadius = this.geometry.boundingSphere.radius + this.options.hitboxOffset;
    this.bubbleAnchorY = this.boundingBox.max.y + 0.2;
    this.iconAnchorY = Math.abs(this.boundingBox.min.y) + Math.abs(this.boundingBox.max.y);

    mesh.isWorldNPC = true;
    this.mesh = mesh;
  }

  _createMixer(animationData) {
    const names = ['idle', 'talk', 'idleTalk', 'walk'];
    this.mixer = new AnimationMixer(this.mesh);
    animationData.forEach((data, index) => {
      const clip = buildClip(names[index], data);
      const action = this.mixer.clipAction(clip);

      action.setEffectiveTimeScale(this.options.animationsOptions[index]?.speed || 1);
      action.weight = 1;
      if (index === 0) {
        action.play();
        this.activeAction = action;
      } else {
        action.enabled = false;
      }
      this.actions[names[index]] = action;
    });
    this.mixer.setTime(this._mixerOffset);
  }

  _applyAuthoredTransform() {
    this.mesh.position.fromArray(this.options.position);

    this.mesh.rotation.fromArray(this.options.rotation);
    this.mesh.updateMatrix();
    this.originalQuaternion.copy(this.mesh.quaternion);
    this.targetPosition.copy(this.mesh.position);
    this.targetQuaternion.copy(this.mesh.quaternion);
    this.up.copy(this.mesh.position).normalize();
  }

  update(time, delta, state) {
    if (!this.mesh) return;
    const ratio = delta * 60;
    this._talking = state.talking;
    this._isClose = state.isClose;
    this._interacting = state.interacting;

    this._updateTransform(time, delta, state);
    this._updateClip();
    this._applyAnimations(time, state.distance);
  }

  _updateTransform(time, delta, state) {
    const mesh = this.mesh;
    const up = this.up.copy(mesh.position).normalize();
    if (!Number.isFinite(up.x) || up.lengthSq() < 1e-4) up.set(0, 1, 0);

    const playerPosition = state.playerPosition;
    const canFace = state.isClose && (this.options.alwaysFaceCharacter || state.interacting);
    if (canFace && this.options.talkFacingPlayer) {

      calculateDirection(up, scratchDirection.copy(playerPosition).sub(mesh.position), this.targetQuaternion);
    } else if (this.curve) {

      this.curve.getPointAt(this.curveProgress % 1, scratchPrevious);
      this.curveProgress =
        (this.curveProgress + delta * 1000 * this.curveProgressMultiplier * this.options.curve.speed) % 1;
      this.curve.getPointAt(this.curveProgress, this.targetPosition);
      calculateDirection(
        up,
        scratchDirection.copy(this.targetPosition).sub(scratchPrevious),
        this.targetQuaternion,
      );
    } else {
      this.targetQuaternion.copy(this.originalQuaternion);
    }

    if (this._hasUpdatedOnce) {
      mesh.position.lerp(this.targetPosition, lerpCoefFPS(POSITION_LERP, delta * 60));
      mesh.quaternion.slerp(this.targetQuaternion, lerpCoefFPS(ROTATION_LERP, delta * 60));
    } else {
      this._hasUpdatedOnce = true;
      mesh.position.copy(this.targetPosition);
      mesh.quaternion.copy(this.targetQuaternion);
    }

    mesh.visible = state.distance < this.options.visibilityThreshold;
  }

  _updateClip() {
    const { actions } = this;
    let next;
    if (this._talking) {
      next = this._talkAnimationPlaying ? actions.talk : actions.idleTalk;
    } else if (this._isClose && (this.options.alwaysFaceCharacter || this._interacting)) {
      next = actions.idle;
    } else if (this.curve) {
      next = actions.walk;
    } else {
      next = actions.idle;
    }
    if (!next || next === this.activeAction) return;

    const fade = this.activeAction === actions.talk || next === actions.talk ? 1 : 0.5;
    if (this.activeAction) {
      this.activeAction._scheduleFading(fade * 2, this.activeAction.getEffectiveWeight(), 0);
    }
    next.enabled = true;
    next._scheduleFading(fade, next.getEffectiveWeight(), 1).play();
    this.activeAction = next;
    this._clipName = Object.keys(actions).find((name) => actions[name] === next) ?? this._clipName;
  }

  _applyAnimations(time, distance) {
    const threshold = fit(distance, UPDATE_DISTANCE * 0.1, UPDATE_DISTANCE, 0, UPDATE_DISTANCE_MULT);
    if (time - this._lastAnimationUpdate < threshold) return;
    this._lastAnimationUpdate = time;
    this.mixer.setTime(time + this._mixerOffset);
  }

  setTalkAnimationPlaying(playing) {
    if (this._talkAnimationPlaying === playing) return;
    this._talkAnimationPlaying = playing;
    const uniform = this.material?.uniforms?.uIsTalking;
    if (uniform) uniform.value = playing ? 1 : 0;
  }

  setTalking(talking) {
    const uniform = this.material?.uniforms?.uIsTalking;
    if (uniform) uniform.value = talking ? 1 : 0;
  }

  setQuestEnabled(enabled) {
    this.questEnabled = Boolean(enabled);
  }

  get object3D() {
    return this.mesh;
  }

  get talkAnimationPlaying() {
    return this._talkAnimationPlaying;
  }

  get currentClipName() {
    return this._clipName;
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.mesh) this.mixer.uncacheRoot(this.mesh);
      this.mixer = null;
    }
    this.actions = {};
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.skeleton?.skeleton.dispose();
    this.skeleton = null;
    this.material?.dispose();
  }
}

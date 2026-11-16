import * as THREE from 'three';

import chunks from '../graphics/shaders/chunks.glsl?raw';
import { createTween } from '../core/Tween.js';
import { applyCameraLock } from './IntroCamera.js';

const LETTER_SPACING_X = 5.35;
const LETTER_SPACING_Y = 6.9;
const BASE_OFFSET = 2;
const GRID_CENTER_INDEX = 4;

const TWO_PI = Math.PI * 2;
const makeAnglePositive = (angle) => {
  const positive = angle % TWO_PI;
  return positive < 0 ? TWO_PI + positive : positive;
};
const frictionFPS = (coefficient, ratio) => Math.exp(Math.log(coefficient) * ratio);

const VERTEX_SHADER =  `
    uniform float uTime;
    uniform float uLetter;

    attribute float surfaceId;
    varying float vSurfaceId;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec2 vHighPrecisionZW;

    vec3 hash31(float p) {
        vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xxy + p3.yzz) * p3.zyx);
    }

    mat4 rotation3D(vec3 axis, float angle) {
        axis = normalize(axis);
        float s = sin(angle);
        float c = cos(angle);
        float oc = 1.0 - c;
        return mat4(
            oc * axis.x * axis.x + c,        oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0,
            oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c,        oc * axis.y * axis.z - axis.x * s, 0.0,
            oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c,       0.0,
            0.0, 0.0, 0.0, 1.0);
    }

    void main() {
        vSurfaceId = surfaceId;
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);

        float t = floor(uTime * 3.0);
        vec3 axis = normalize(hash31(uLetter + t) * 2.0 - 1.0);
        vec4 pos = rotation3D(axis, 0.03) * vec4(position, 1.0);

        gl_Position = projectionMatrix * modelViewMatrix * pos;
        vHighPrecisionZW = gl_Position.zw;
    }
`;

const FRAGMENT_SHADER =  `
    layout(location = 1) out highp vec4 gInfo;

    #include <common>
    #include <packing>
    /* INCLUDE_CHUNKS */

    varying float vSurfaceId;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec2 vHighPrecisionZW;

    uniform sampler2D tNoise;
    uniform vec3 uColor;
    uniform vec3 uColor2;

    void main() {
        float noise = texture(tNoise, vUv * 6.0).r;

        float outlineContribution = 1.0;
        float surfaceId = vSurfaceId;

        vec3 norm = normalize(vNormal);
        float facing = abs(dot(norm, normalize(vec3(0.0, 0.0, 1.0))));
        vec3 color = mix(uColor, uColor2, 1.0 - smoothstep(0.2, 0.8, facing));

        gl_FragColor = vec4(color, surfaceId);
        gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                     encodeNormalSpheremap(norm), 1.0);
    }
`;

function createTitleMaterial(shared, textures) {
  return new THREE.ShaderMaterial({
    name: 'intro-title-letter',
    uniforms: {
      uTime: shared.uTime,
      uLetter: { value: 0 },
      tNoise: { value: textures.clouds64 },
      uColor: { value: new THREE.Color('#F8F8F8') },
      uColor2: { value: new THREE.Color('#a0a8a6') },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER.replace('/* INCLUDE_CHUNKS */', chunks),
  });
}

function createLetterState(index) {
  const x = ((index % 3) - 1) * LETTER_SPACING_X;
  const y = (Math.floor(index / 3) - 1) * -LETTER_SPACING_Y;
  return {
    index,
    position: new THREE.Vector3(x, y, 0),
    finalPosition: new THREE.Vector3(x, y, 0),
    finalRotation: { x: 0, y: 0 },
    rotationTarget: { x: 0, y: 0 },
    animRotation: { x: 0, y: 0 },
    scale: { value: 1 },
    animScale: { value: 1 },
  };
}

export class TitleLetters {

  constructor({ scene, camera, app, geometryLoader, shared, textures, events }) {
    this.scene = scene;
    this.camera = camera;
    this.app = app;
    this.geometryLoader = geometryLoader;
    this.shared = shared;
    this.textures = textures;
    this.events = events;

    this.group = new THREE.Group();
    this.group.name = 'Title Group';
    scene.add(this.group);

    this.rays = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();
    this.pointerPixels = new THREE.Vector2();
    this.lastPointerPixels = new THREE.Vector2();
    this.deltaAccum = { x: 0, y: 0 };

    this.letters = [];
    this.hoveredIndex = -1;
    this.enabled = false;
    this.updateCamPosition = true;
    this.camPosition = new THREE.Vector3().copy(camera.position);

    this._bindPointer();
    this.ready = this._load();
  }

  async _load() {
    const batches = await this.geometryLoader.batched('planets/present/intro/title_vertical');
    batches.forEach(({ geometry }, index) => {
      const material = createTitleMaterial(this.shared, this.textures);
      material.uniforms.uLetter.value = index;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `Title letter ${index}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.userData.letterIndex = index;
      this.group.add(mesh);

      const state = createLetterState(index);
      state.mesh = mesh;
      state.material = material;
      this.letters.push(state);
    });
    this._applyLetterTransforms();
    return this;
  }

  update(dt, ratio = dt * 60) {
    if (this.updateCamPosition) this.camPosition.copy(this.camera.position);
    applyCameraLock(this.group, this.camera, BASE_OFFSET, this.camPosition);
    this._applyLetterTransforms();
    this.group.updateMatrixWorld(true);
    this._updatePointerDelta(dt, ratio);
  }

  _applyLetterTransforms() {
    const mobileScale = this.meshScale ?? 1;
    for (const letter of this.letters) {
      letter.mesh.position.copy(letter.finalPosition);
      letter.mesh.rotation.set(
        letter.finalRotation.x + letter.animRotation.x,
        letter.finalRotation.y + letter.animRotation.y,
        0,
      );
      letter.mesh.scale.setScalar(letter.scale.value * letter.animScale.value * mobileScale);
    }
  }

  playInAnimation(delay = 0) {
    for (const letter of this.letters) {
      const letterDelay = delay + 0.075 * letter.index;

      letter.animScale.value = 0;
      createTween(letter.animScale, {
        from: { value: 0 },
        to: { value: 1 },
        duration: 3,
        delay: letterDelay,
        ease: 'elastic.out(1,0.75)',
      });
      createTween(letter.animRotation, {
        from: {
          x: (Math.random() - 0.5) * TWO_PI,
          y: (Math.random() - 0.5) * TWO_PI,
        },
        to: { x: 0, y: 0 },
        duration: 3,
        delay: letterDelay,
        ease: 'elastic.out(1,0.75)',
      });
      const center = this.letters[GRID_CENTER_INDEX].position;
      createTween(letter.finalPosition, {
        from: { x: center.x, y: center.y, z: center.z },
        to: { x: letter.position.x, y: letter.position.y, z: letter.position.z },
        duration: 3,
        delay: letterDelay,
        ease: 'elastic.out(1,0.75)',
      });
    }
  }

  playOutAnimation() {
    this.updateCamPosition = false;
  }

  resize(isMobileLayout) {
    this.meshScale = isMobileLayout ? 1.2 : 1;
  }

  enable() {
    this.enabled = true;

    this.lastPointerPixels.copy(this.pointerPixels);
  }

  disable() {
    this.enabled = false;
    this.hoveredIndex = -1;
  }

  _bindPointer() {
    const canvas = this.app.renderer.domElement;

    this._handlers = {
      move: (event) => this._onPointerMove(event),
      down: (event) => this._onPointerDown(event),
      up: (event) => this._onPointerUp(event),
      cancel: () => this._endDrag(),

      leave: () => {
        if (this.hoveredIndex >= 0) this._hoverOut(this.hoveredIndex);
      },
    };
    canvas.addEventListener('pointermove', this._handlers.move);
    canvas.addEventListener('pointerdown', this._handlers.down);
    canvas.addEventListener('pointerup', this._handlers.up);
    canvas.addEventListener('pointercancel', this._handlers.cancel);
    canvas.addEventListener('pointerleave', this._handlers.leave);
  }

  _updatePointer(event) {
    const rect = this.app.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.pointerPixels.set(x, y);
    this.pointerNdc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
  }

  _pick() {
    this.rays.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.rays.intersectObjects(this.letters.map((letter) => letter.mesh), false);
    return hits.length ? hits[0].object.userData.letterIndex : -1;
  }

  _onPointerMove(event) {
    this._updatePointer(event);

    if (!this.enabled) return;
    const index = this._pick();
    if (index !== this.hoveredIndex) {
      if (this.hoveredIndex >= 0) this._hoverOut(this.hoveredIndex);
      if (index >= 0) this._hoverIn(index);
    }
  }

  _onPointerDown(event) {
    if (!this.enabled || event.button !== 0) return;
    this._updatePointer(event);
    this.lastPointerPixels.copy(this.pointerPixels);
    const index = this._pick();
    if (index < 0) return;
    event.stopPropagation();
    this.dragging = true;
    this.draggedIndex = index;
    this.hoveredIndex = index;
    this.deltaAccum.x = 0;
    this.deltaAccum.y = 0;
  }

  _onPointerUp() {
    if (!this.enabled) return;
    this._endDrag();
  }

  _endDrag() {
    if (!this.dragging) return;
    this.dragging = false;

    if (this.hoveredIndex >= 0) this._hoverOut(this.hoveredIndex);
  }

  _hoverIn(index) {
    this.hoveredIndex = index;
    const letter = this.letters[index];
    createTween(letter.scale, {
      to: { value: 1.05 },
      duration: 0.2,
      ease: 'power2.out',
      onComplete: () => {
        createTween(letter.scale, { to: { value: 1 }, duration: 0.75, ease: 'elastic.out(1,0.6)' });
      },
    });
  }

  _hoverOut(index) {
    this.hoveredIndex = -1;
    const letter = this.letters[index];
    if (!letter) return;

    const axis = Math.abs(this.deltaAccum.x) > Math.abs(this.deltaAccum.y) ? 'x' : 'y';
    const sign = Math.sign(this.deltaAccum[axis] * (axis === 'y' ? -1 : 1));
    if (sign === 0) return;

    let direction = 1;
    if (axis === 'x') direction = makeAnglePositive(letter.rotationTarget.x) > 0.1 ? -1 : 1;
    const targetAxis = axis === 'x' ? 'y' : 'x';
    letter.rotationTarget[targetAxis] += Math.PI * sign * direction;

    const displayed = letter.finalRotation[targetAxis] + letter.animRotation[targetAxis];
    const difference = letter.rotationTarget[targetAxis] - displayed;
    letter.finalRotation[targetAxis] = makeAnglePositive(displayed);
    letter.rotationTarget[targetAxis] = letter.finalRotation[targetAxis] + difference;
    letter.rotationTarget[targetAxis] = Math.round(letter.rotationTarget[targetAxis] / Math.PI) * Math.PI;

    createTween(letter.finalRotation, {
      to: { [targetAxis]: letter.rotationTarget[targetAxis] },
      duration: 2.5,
      ease: `elastic.out(1,${(0.5 + Math.random() * 0.3).toFixed(2)})`,
    });
    createTween(letter.scale, {
      to: { value: 0.9 },
      duration: 0.4,
      ease: 'power2.out',
      onComplete: () => {
        createTween(letter.scale, { to: { value: 1 }, duration: 1, ease: 'elastic.out(1,0.6)' });
      },
    });

    this.events.emit('webgl_play_audio', `rune${Math.floor(Math.random() * 3 + 1)}`);
  }

  _updatePointerDelta(dt, ratio) {
    if (!this.enabled) return;
    const dx = this.pointerPixels.x - this.lastPointerPixels.x;
    const dy = -(this.pointerPixels.y - this.lastPointerPixels.y);
    this.lastPointerPixels.copy(this.pointerPixels);
    this.deltaAccum.x += dx;
    this.deltaAccum.y += dy;
    const decay = frictionFPS(0.4, ratio);
    this.deltaAccum.x *= decay;
    this.deltaAccum.y *= decay;
  }

  dispose() {
    const canvas = this.app.renderer.domElement;
    for (const [name, handler] of Object.entries(this._handlers ?? {})) {
      canvas.removeEventListener('pointer' + name, handler);
    }
    for (const letter of this.letters) letter.material.dispose();
    this.group.clear();
    this.group.removeFromParent();
  }
}

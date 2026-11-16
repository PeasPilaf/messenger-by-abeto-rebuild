import * as THREE from 'three';

import chunks from '../graphics/shaders/chunks.glsl?raw';
import slugVertexShader from '../text/slug.vert.glsl?raw';
import slugFragmentShader from '../text/slug.frag.glsl?raw';
import { SlugMaterial } from '../text/SlugMaterial.js';
import { TextMesh } from '../text/TextMesh.js';
import { createTween, createDelayedCall } from '../core/Tween.js';
import { applyCameraLock } from './IntroCamera.js';

const BASE_OFFSET_DESKTOP = -13.5;

const SAVE_KEY = 'App3D_data';
const LEGACY_PROGRESS_KEY = 'questProgress';

function readQuestProgress() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return undefined;
    const raw = storage.getItem(SAVE_KEY);
    const blob = raw ? JSON.parse(raw) : null;
    if (blob && typeof blob === 'object' && !Array.isArray(blob) && blob.questProgress !== undefined) {
      return blob.questProgress;
    }
    const legacy = storage.getItem(LEGACY_PROGRESS_KEY);
    return legacy ? JSON.parse(legacy) : undefined;
  } catch {
    return undefined;
  }
}

export function hasInitiatedAnyQuestStep() {
  const progress = readQuestProgress();
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return false;
  const arrays = Object.values(progress).filter(Array.isArray);
  if (arrays.length === 0) return false;
  const anyStep = arrays.some((steps) => steps.some((step) => step === true));
  const allComplete = arrays.every((steps) => steps.length > 0 && steps.every((step) => step === true));
  return anyStep && !allComplete;
}
const BASE_OFFSET_MOBILE = -16;
const TEXT_SCALE = 1.4;
const TEXT_POSITION = new THREE.Vector3(0, -0.25 * 1.4, 1.2);

const VERTEX_SHADER =  `
    uniform float uTime;
    uniform float uSeed;
    uniform float uHover;

    attribute int vertid;

    varying vec3 vNormal;
    varying vec2 vUv;
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
            oc * axis.x * axis.x + c,         oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0,
            oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c,         oc * axis.y * axis.z - axis.x * s, 0.0,
            oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c,        0.0,
            0.0, 0.0, 0.0, 1.0);
    }

    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);

        float t = floor(uTime * 3.0);
        vec3 axis = normalize(hash31(t) * 2.0 - 1.0);
        float angle = 0.02;

        vec4 pos = vec4(position, 1.0);

        float seed = fract(uSeed * 54.32 + float(vertid) * 31.2344);
        vec3 dir = normalize(position.xyz);
        pos.xyz += dir * seed * 0.3;
        pos.xyz *= 1.0 + 0.05 * uHover;

        pos = rotation3D(axis, angle) * pos;

        gl_Position = projectionMatrix * modelViewMatrix * pos;
        vHighPrecisionZW = gl_Position.zw;
    }
`;

const FRAGMENT_SHADER =  `
    layout(location = 1) out highp vec4 gInfo;

    #include <common>
    #include <packing>
    /* INCLUDE_CHUNKS */

    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec2 vHighPrecisionZW;

    uniform sampler2D tNoise;
    uniform vec3 uColor;
    uniform vec3 uColor2;

    void main() {
        vec4 noise = texture(tNoise, vUv * 1.0);

        float outlineContribution = step(0.2, noise.r);
        float surfaceId = 0.34242;

        float facing = abs(dot(normalize(vNormal), normalize(vec3(0.0, 0.0, 1.0))));
        vec3 color = mix(uColor, uColor2, 1.0 - smoothstep(0.2, 0.8, facing));

        gl_FragColor = vec4(color, 1.0);
        gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                     encodeNormalSpheremap(normalize(vNormal)), outlineContribution);
    }
`;

function createButtonMaterial(shared, textures) {
  return new THREE.ShaderMaterial({
    name: 'intro-button',
    uniforms: {
      uTime: shared.uTime,
      uColor: { value: new THREE.Color('#F6CF5F') },
      uColor2: { value: new THREE.Color('#BD8A42') },
      tNoise: { value: textures.cloudNoise64 },
      uSeed: { value: Math.random() },
      uHover: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER.replace('/* INCLUDE_CHUNKS */', chunks),
  });
}

function patchSlugForInfoBuffer(material) {
  const vertex = slugVertexShader
    .replace(
      'varying vec2 vTexCoord;',
      'varying vec2 vTexCoord;\nvarying vec2 vHighPrecisionZW;',
    )

    .replace('void main() {', 'uniform float uHover;\n\nvoid main() {')
    .replace(
      'vec3 pos = SlugVS(color, uResolution, projectionMatrix * modelViewMatrix);',
      'vec3 pos = SlugVS(color, uResolution, projectionMatrix * modelViewMatrix);\n    pos *= 1.0 - 0.05 * uHover;',
    )

    .replace(
      'gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);',
      'gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);\n    vHighPrecisionZW = gl_Position.zw;',
    );

  const fragment = slugFragmentShader
    .replace(
      'void main() {',
      'layout(location = 1) out highp vec4 gInfo;\nvarying vec2 vHighPrecisionZW;\n\nvoid main() {',
    )
    .replace(
      'gl_FragColor = vec4(color.rgb, alpha);',
      'gl_FragColor = vec4(color.rgb, alpha);\n' +
        '    gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5), vec2(0.0), 0.0);',
    );

  if (!vertex.includes('uHover')) {
    throw new Error('BeginButton: slug vertex shader changed; hover uniform patch needs updating');
  }
  material.uniforms.uHover = { value: 0 };
  if (!vertex.includes('vHighPrecisionZW = gl_Position.zw')) {
    throw new Error('BeginButton: slug vertex shader changed; patchSlugForInfoBuffer needs updating');
  }
  if (!fragment.includes('gInfo = vec4')) {
    throw new Error('BeginButton: slug fragment shader changed; patchSlugForInfoBuffer needs updating');
  }

  material.vertexShader = vertex;
  material.fragmentShader = fragment;
  material.needsUpdate = true;
  return material;
}

export class BeginButton {

  constructor({ scene, camera, app, geometryLoader, glyphLoader, shared, textures, events }) {
    this.scene = scene;
    this.camera = camera;
    this.app = app;
    this.geometryLoader = geometryLoader;
    this.glyphLoader = glyphLoader;
    this.shared = shared;
    this.textures = textures;
    this.events = events;

    this.group = new THREE.Group();
    this.group.name = 'Button Group';
    this.groupAnim = new THREE.Group();
    this.groupAnim.name = 'Button Animation Group';
    this.group.add(this.groupAnim);
    scene.add(this.group);

    this.hoverRotation = 0;
    this.rotation = { value: 0 };
    this.animRotation = { value: 0 };
    this.scaleMultiplier = { value: 1 };
    this.baseScale = 1;
    this.baseOffset = BASE_OFFSET_DESKTOP;
    this.updateCamPosition = true;
    this.camPosition = new THREE.Vector3().copy(camera.position);
    this.enabled = false;
    this.hovered = false;
    this.pressed = false;
    this.listener = null;

    this.rays = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();

    this._bindPointer();
    this.ready = this._load();
  }

  async _load() {
    const [geometry, font] = await Promise.all([
      this.geometryLoader.load('planets/present/intro/button'),
      this.glyphLoader.loadFont('heading'),
    ]);

    this.material = createButtonMaterial(this.shared, this.textures);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'Button';
    this.mesh.frustumCulled = false;
    this.groupAnim.add(this.mesh);

    this.text = new TextMesh({
      glyphs: this.glyphLoader,
      font: 'heading',
      text: hasInitiatedAnyQuestStep() ? 'ENTER ' : 'BEGIN',
      anchor: 'center',
      textOptions: {
        size: 1,
        maxWidth: 20,
        letterSpacing: 0.01,
        lineHeight: 1.1,
        color: '#F8F8F8',
        align: 'center',
        shadow: true,
        shadowX: 0.06,

        shadowY: -0.06,
        shadowColor: '#7A5E0D',
      },
    });
    await this.text.ready;
    this.text.name = 'Button text';
    this.text.frustumCulled = false;
    patchSlugForInfoBuffer(this.text.material);
    this.text.scale.setScalar(TEXT_SCALE);
    this.text.position.copy(TEXT_POSITION);
    this.text.setResolution(this.app.resolution.x, this.app.resolution.y);
    this.groupAnim.add(this.text);

    return this;
  }

  update() {
    if (this.updateCamPosition) this.camPosition.copy(this.camera.position);
    applyCameraLock(this.group, this.camera, this.baseOffset, this.camPosition);

    this.mesh.rotation.set(this.rotation.value + this.animRotation.value, 0, 0);

    const scale = this.baseScale * this.scaleMultiplier.value;
    this.group.scale.setScalar(scale);

    this.group.updateMatrixWorld(true);
  }

  setResolution(width, height) {
    this.text?.setResolution(width, height);
  }

  playInAnimation(delay = 0) {
    this.groupAnim.scale.setScalar(0);
    createTween(this.groupAnim.scale, {
      to: { x: 1, y: 1, z: 1 },
      duration: 3.25,
      delay,
      ease: 'elastic.out(1,0.9)',
    });
    this.groupAnim.rotation.x = Math.PI * -1;
    createTween(this.groupAnim.rotation, {
      to: { x: 0 },
      duration: 3.25,
      delay,
      ease: 'elastic.out(1,0.5)',
    });
  }

  spinOut() {
    createTween(this.animRotation, {
      to: { value: this.animRotation.value - Math.PI * 2 },
      duration: 1.5,
      ease: 'inOut1',
    });
    createDelayedCall(0.3, () => this.events.emit('webgl_play_audio', 'button-out'));
  }

  playOutAnimation() {
    this.updateCamPosition = false;
  }

  resize(isMobileLayout) {
    this.baseScale = isMobileLayout ? 1.5 : 1;
    this.baseOffset = isMobileLayout ? BASE_OFFSET_MOBILE : BASE_OFFSET_DESKTOP;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    this.hovered = false;
  }

  onBegin(callback) {
    this.listener = callback;
  }

  _bindPointer() {
    const canvas = this.app.renderer.domElement;

    this._handlers = {
      move: (event) => this._onPointerMove(event),
      down: (event) => this._onPointerDown(event),
      up: (event) => this._onPointerUp(event),
      wheel: (event) => this._onWheel(event),
    };
    canvas.addEventListener('pointermove', this._handlers.move);
    canvas.addEventListener('pointerdown', this._handlers.down);
    canvas.addEventListener('pointerup', this._handlers.up);
    canvas.addEventListener('wheel', this._handlers.wheel, { passive: true });
  }

  _updatePointer(event) {
    const rect = this.app.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.pointerNdc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
  }

  _pick() {
    this.rays.setFromCamera(this.pointerNdc, this.camera);
    return this.rays.intersectObject(this.mesh, false).length > 0;
  }

  _onPointerMove(event) {
    this._updatePointer(event);
    if (!this.enabled) return;
    const over = this._pick();
    if (over && !this.hovered) this._hoverIn();
    if (!over && this.hovered) this.hovered = false;
  }

  _hoverIn() {
    this.hovered = true;
    this.material.uniforms.uSeed.value = Math.random();

    createTween(this.material.uniforms.uHover, {
      to: { value: 1 },
      duration: 0.07,
      ease: 'none',
      onComplete: () => {
        this.material.uniforms.uSeed.value = Math.random();
        createTween(this.material.uniforms.uHover, { to: { value: 0 } });
      },
    });
    if (this.text) {
      createTween(this.text.material.uniforms.uHover, {
        to: { value: 1 },
        duration: 0.07,
        ease: 'none',
        onComplete: () => {
          createTween(this.text.material.uniforms.uHover, { to: { value: 0 } });
        },
      });
    }
    this.events.emit('webgl_play_audio', 'hover2');
  }

  _onWheel(event) {
    if (!this.enabled || !this.hovered) return;
    const direction = Math.sign(event.deltaY);
    if (direction === 0) return;

    this.hoverRotation -= (Math.PI * 0.5) * direction;
    createTween(this.rotation, {
      to: { value: this.hoverRotation },
      duration: 1.5,
      ease: 'elastic.out(1,0.9)',
    });
    if (!this.text) return;
    createTween(this.text.material.uniforms.uShow, { to: { value: 1 } });
    createTween(this.text.material.uniforms.uHide, {
      to: { value: 1 },
      duration: 0.05,
      ease: 'none',
      onComplete: () => {
        createTween(this.text.material.uniforms.uHide, { to: { value: 0 }, delay: 0.14 });
        createTween(this.text.material.uniforms.uShow, {
          from: { value: 0 },
          to: { value: 1 },
          delay: 0.14,
          duration: 0.2,
          ease: 'none',
        });
      },
    });
    this.events.emit('webgl_play_audio', 'button-turn');
  }

  _onPointerDown(event) {
    if (!this.enabled || event.button !== 0) return;
    this._updatePointer(event);
    if (!this._pick()) return;
    this.pressed = true;
    createTween(this.scaleMultiplier, { to: { value: 0.95 }, duration: 0.02, ease: 'none' });
    this.events.emit('webgl_play_audio', 'click2');
  }

  _onPointerUp(event) {
    if (!this.enabled) return;
    if (!this.pressed) return;
    this.pressed = false;
    this._updatePointer(event);
    createTween(this.scaleMultiplier, { to: { value: 1 }, duration: 0.02, ease: 'none' });
    this.events.emit('webgl_play_audio', 'click3');
    if (this._pick()) {

      this.listener?.();
    }
  }

  dispose() {
    const canvas = this.app.renderer.domElement;
    canvas.removeEventListener('pointermove', this._handlers.move);
    canvas.removeEventListener('pointerdown', this._handlers.down);
    canvas.removeEventListener('pointerup', this._handlers.up);
    canvas.removeEventListener('wheel', this._handlers.wheel);
    this.material?.dispose();
    this.text?.dispose();
    this.group.removeFromParent();
  }
}

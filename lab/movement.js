import * as THREE from 'three';

import { ticker } from '../src/core/Ticker.js';
import { WebGLApp } from '../src/graphics/WebGLApp.js';
import { loadRendererTextures } from '../src/graphics/Textures.js';
import { createPainterlyMaterial, createSharedUniforms } from '../src/graphics/PainterlyMaterial.js';
import { Terrain } from '../src/world/Terrain.js';
import { Sky } from '../src/world/Sky.js';
import { COLORS, CHARACTER, SHADOW } from '../src/graphics/constants.js';
import { GeometryLoader } from '../src/assets/GeometryLoader.js';
import { CollisionWorld } from '../src/gameplay/CollisionWorld.js';
import { CharacterController, CHARACTER_PHYSICS_OPTIONS } from '../src/gameplay/CharacterController.js';
import { FollowCamera } from '../src/gameplay/FollowCamera.js';
import { Input } from '../src/gameplay/Input.js';
import { events } from '../src/core/Events.js';

const hud = document.getElementById('hud');
const checksEl = document.getElementById('checks');
const query = new URLSearchParams(location.search);
const controlMode = query.get('control') === 'manual' ? 'manual' : 'automatic';

const SCENE = {
  spawnPosition: new THREE.Vector3(13.9316, 19.3062, 8.38147),
  spawnRotation: Math.PI * 0.55,
  spawnRadius: 1.15,
  relativeCameraPosition: new THREE.Vector3(0, 1, 5),
  relativeCameraOffset: new THREE.Vector3(-0.65, 0, 1),
};

const app = new WebGLApp();
app.resize();
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.fogNear);
const textures = await loadRendererTextures(app.renderer);
const shared = createSharedUniforms(textures);
const terrainMaterial = createPainterlyMaterial({ kind: 'terrain', shared });

const sun = new THREE.DirectionalLight(COLORS.lightColor, 3);
sun.position.set(-41.6, 80.9, 41.6).normalize().multiplyScalar(100);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -34;
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.camera.near = 60;
sun.shadow.camera.far = 140;
sun.shadow.bias = SHADOW.bias;
sun.shadow.normalBias = SHADOW.normalBias;
scene.add(sun);
scene.add(sun.target);

const terrainGeometryLoader = new GeometryLoader();
async function loadTerrainGeometry(name) {
  const short = name.replace('planets/present/', '');
  if (short.startsWith('full-lod-')) {
    const chunk = short.split('_').pop();
    return terrainGeometryLoader.load(`planets/present/full_${chunk}`);
  }
  return terrainGeometryLoader.load(name);
}

const terrain = new Terrain({ scene, loadGeometry: loadTerrainGeometry, material: terrainMaterial });
const loadStart = performance.now();
await terrain.load();
const terrainMs = performance.now() - loadStart;

const sky = new Sky(scene, textures.clouds);
sky.setResolution(app.resolution.x, app.resolution.y);
app.onResize((w, h) => sky.setResolution(w, h));

const geometryLoader = new GeometryLoader();
const collision = new CollisionWorld({ loadGeometry: (name) => geometryLoader.load(name) });
await collision.load();

const controller = new CharacterController({
  object: new THREE.Object3D(),
  collision,

  capsuleRadiusPercentage: 0.2,
  floorDetectInclination: 0.7,
  jumpForce: 0.15,
  positionForce: 0.005,
  gravity: -0.00981,
  damp: 0.92,
  dampIdle: 0.65,
  autoStep: true,
  substeps: 3,
});

const avatar = new THREE.Group();
controller.object.add(avatar);
const avatarMaterial = new THREE.MeshStandardMaterial({ color: 0xebced0, roughness: 0.8 });
const capsuleMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.32, 0.98, 6, 12),
  avatarMaterial,
);
capsuleMesh.position.y = 0.32 + 0.98 / 2;
capsuleMesh.castShadow = true;
avatar.add(capsuleMesh);
const nose = new THREE.Mesh(
  new THREE.ConeGeometry(0.12, 0.35, 8),
  new THREE.MeshStandardMaterial({ color: 0xc84b4b }),
);
nose.rotation.x = Math.PI / 2;
nose.position.set(0, 0.85, 0.28);
avatar.add(nose);
const tail = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.18, 0.18),
  new THREE.MeshStandardMaterial({ color: 0x35506a }),
);
tail.position.set(0, 0.85, -0.28);
avatar.add(tail);

const camera = new FollowCamera({ collision, aspect: window.innerWidth / window.innerHeight });
controller.camera = camera;
camera.resize(window.innerWidth, window.innerHeight);
const pipeline = app.createPipeline(camera);
pipeline.setLut(textures.lut);
app.onResize((w, h) => camera.resize(w, h));

const input = new Input({ element: app.renderer.domElement, controlMode });
input.connect({ controller, camera });

const spawnUp = SCENE.spawnPosition.clone().normalize();
const spawnPlaneRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), spawnUp);
const spawnAngle = 0;
const spawnOffset = new THREE.Vector3(
  Math.cos(spawnAngle) * 0,
  0,
  Math.sin(spawnAngle) * 0,
).applyQuaternion(spawnPlaneRotation);
controller.setCapsuleFromBounds(
  new THREE.Box3(new THREE.Vector3(-0.53, 0, -0.12), new THREE.Vector3(0.53, 1.63, 0.15)),
);
controller.placeOnFloor(SCENE.spawnPosition.clone().add(spawnOffset), SCENE.spawnRotation);
camera.follow(controller, {
  relativeCameraPosition: SCENE.relativeCameraPosition,
  relativeCameraOffset: SCENE.relativeCameraOffset,
});
camera.update(1);
input.enable();

let jumpCount = 0;
let landCount = 0;
events.on('character_physics_jump', () => jumpCount++);
events.on('character_physics_land', () => landCount++);

const state = { fps: 0, frame: 0, walkSpeed: 0, sprintSpeed: 0, jumpHeight: 0 };
const zeroMove = new THREE.Vector3();
const pointer = input.pointer;
camera.setPointer(pointer);

ticker.on('prerender', () => {

  camera.update(ticker.ratio);
  controller.update(input.update(), ticker.ratio);
  terrain.update(camera, controller.position);
  sky.update(ticker.time, { object: controller.object });
  sun.target.position.copy(controller.position);
  sun.position.copy(controller.position).add(new THREE.Vector3(-41.6, 80.9, 41.6).normalize().multiplyScalar(100));
  state.frame++;
  state.fps = ticker.averageFPS;
});
ticker.on('render', () => {
  pipeline.render(scene, camera);
  updateHud();
});
ticker.start();

function updateHud() {
  const p = controller.position;
  const radial = p.clone().normalize();
  const upDot = controller.up.dot(radial);
  const speedPerSecond = controller.velocityHorizontal * 60;
  hud.textContent = [
    `pos      ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}   |p| ${p.length().toFixed(2)}`,
    `up·radial ${upDot.toFixed(4)}   yaw ${controller.rotationHorizontal.toFixed(2)}`,
    `speed    ${controller.velocityHorizontal.toFixed(4)} u/tick  ${speedPerSecond.toFixed(2)} u/s@60`,
    `floor    ${controller.isOnFloor ? 'yes' : 'no'}   medium ${controller.isAirborne ? 'AIR' : 'GROUND'}   sprint ${input.sprintPressed ? 'on' : 'off'}`,
    `camera   r ${camera.spherical.radius.toFixed(2)} / ${camera.followedMeshDistance.toFixed(2)}   dist ${camera.position.distanceTo(p).toFixed(2)}`,
    `bvh      ${collision.triangleCount} tris  build ${(collision.timings.load + collision.timings.merge + collision.timings.bvh) | 0} ms  terrain ${terrainMs | 0} ms`,
    `fps      ${state.fps.toFixed(1)}   jumps ${jumpCount}  lands ${landCount}`,
    `mode     ${controlMode}   [WASD walk, shift sprint, space jump, drag = ${controlMode === 'automatic' ? 'joystick' : 'orbit'}]`,
  ].join('\n');
}

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  checksEl.textContent = checks.map((c) => `${c.pass ? 'PASS' : 'FAIL'} ${c.name} — ${c.detail}`).join('\n');
}

function simulate(ticks, move, onTick = null) {
  for (let i = 0; i < ticks; i++) {

    ticker._time += 1 / 60;
    camera.update(1);
    controller.update(move, 1);
    if (onTick) onTick(i);
  }
}

function placeAt(spot, rotation = SCENE.spawnRotation, ticks = 120) {
  controller.placeOnFloor(spot.position, rotation, spot.up);
  camera.follow(controller, {
    relativeCameraPosition: SCENE.relativeCameraPosition,
    relativeCameraOffset: SCENE.relativeCameraOffset,
  });
  simulate(ticks, zeroMove);
}

function arcDistance(a, b) {
  const ra = a.length();
  const rb = b.length();
  const dot = a.dot(b) / (ra * rb);
  return 0.5 * (ra + rb) * Math.acos(Math.max(-1, Math.min(1, dot)));
}

function settle(ticks = 120) {
  simulate(ticks, zeroMove);
}

function measureSpeed(plate, move, ticks = 20, fixedRotation = null) {
  const rotations = [];
  if (fixedRotation === null) for (let k = 0; k < 8; k++) rotations.push((k * Math.PI) / 4);
  else rotations.push(fixedRotation);
  let best = { speed: 0, rotation: rotations[0] };
  for (const rotation of rotations) {
    placeAt(plate, rotation);

    simulate(30, move);
    let distance = 0;
    let previous = controller.position.clone();
    simulate(ticks, move, () => {
      distance += arcDistance(previous, controller.position);
      previous.copy(controller.position);
    });
    const speed = (distance / (ticks - 1)) * 60;
    if (speed > best.speed) best = { speed, rotation };
    if (fixedRotation !== null) break;
  }
  return best;
}

async function runChecks() {

  const plate = findFlatPlate() || { position: new THREE.Vector3(28.1, 0, 0), up: new THREE.Vector3(1, 0, 0) };
  const walkMove = new THREE.Vector3(0, 0, 1);
  const sprintMove = new THREE.Vector3(0, 0, 1.3);

  if (plate) placeAt(plate);
  simulate(90, walkMove);
  const upDot = controller.up.dot(controller.position.clone().normalize());
  check('up stays radial while walking', upDot > 0.9999, `up·radial ${upDot.toFixed(6)}`);

  let walkRotation = SCENE.spawnRotation;
  if (plate) {
    const walk = measureSpeed(plate, walkMove);
    state.walkSpeed = walk.speed;
    walkRotation = walk.rotation;

    check('walk speed ≈ 3.45 u/s at 60 Hz', state.walkSpeed > 2.6 && state.walkSpeed < 4.2,
      `${state.walkSpeed.toFixed(3)} u/s`);

    state.sprintSpeed = measureSpeed(plate, sprintMove, 20, walkRotation).speed;
    const ratio = state.sprintSpeed / state.walkSpeed;
    check('sprint is 1.3x walk', Math.abs(ratio - 1.3) < 0.12,
      `${ratio.toFixed(3)}x (${state.sprintSpeed.toFixed(3)} u/s)`);
  } else {
    check('walk/sprint measured on a flat plate', false, 'no flat plate found');
  }

  if (plate) placeAt(plate, walkRotation);
  jumpCount = 0;
  landCount = 0;
  const baseRadius = controller.position.length();
  let maxRadius = baseRadius;
  let fired = false;
  simulate(120, zeroMove, (i) => {
    if (i === 10 && !fired) {
      controller.jump();
      fired = true;
    }
    maxRadius = Math.max(maxRadius, controller.position.length());
  });
  state.jumpHeight = maxRadius - baseRadius;

  check('jump height in the 0.4-0.9 u band', state.jumpHeight > 0.35 && state.jumpHeight < 0.9,
    `${state.jumpHeight.toFixed(3)} u`);
  check('jump and land events fire', jumpCount >= 1 && landCount >= 1,
    `jump ${jumpCount}, land ${landCount}`);
  check('lands back on the floor', controller.isOnFloor, `isOnFloor ${controller.isOnFloor}`);

  const wallSpot = findCameraWallSpot();
  if (wallSpot) {
    controller.teleport(wallSpot.position, wallSpot.rotation, wallSpot.up);
    camera.follow(controller, {
      relativeCameraPosition: SCENE.relativeCameraPosition,
      relativeCameraOffset: SCENE.relativeCameraOffset,
    });
    simulate(240, zeroMove);
    const radius = camera.spherical.radius;
    check('camera pulls in against a wall', radius < camera.followedMeshDistance - 0.4,
      `spherical radius ${radius.toFixed(2)} < free ${camera.followedMeshDistance.toFixed(2)}`);
  } else {
    check('camera pulls in against a wall', false, 'no wall spot found');
  }

  controller.teleport(SCENE.spawnPosition, SCENE.spawnRotation);
  camera.follow(controller, {
    relativeCameraPosition: SCENE.relativeCameraPosition,
    relativeCameraOffset: SCENE.relativeCameraOffset,
  });
  simulate(180, zeroMove);

  lab.done = true;
}

function findFlatPlate() {
  const direction = new THREE.Vector3();
  for (let lat = -85; lat <= 85; lat += 5) {
    for (let lon = 0; lon < 360; lon += 5) {
      const phi = Math.PI * 0.5 - (lat * Math.PI) / 180;
      const theta = (lon * Math.PI) / 180;
      direction
        .set(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta))
        .normalize();
      const from = direction.clone().multiplyScalar(60);
      const hit = collision.raycast(from, direction.clone().negate());
      if (!hit || !hit.face) continue;
      const up = hit.point.clone().normalize();
      if (hit.face.normal.dot(up) < 0.999) continue;
      const center = hit.point.clone();
      let plate = true;
      for (let a = 0; a < 8 && plate; a++) {
        const tangent = new THREE.Vector3(1, 0, 0).cross(up).normalize().applyAxisAngle(up, (a * Math.PI) / 4);
        for (const radius of [1.5, 3, 4.5]) {
          const sampleFrom = center.clone().addScaledVector(tangent, radius).addScaledVector(up, 3);
          const sample = collision.raycast(sampleFrom, up.clone().negate());
          if (!sample || !sample.face || sample.face.normal.dot(up) < 0.995) {
            plate = false;
            break;
          }
        }
      }
      if (plate) return { position: center, up };
    }
  }
  return null;
}

function findCameraWallSpot() {
  const up = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  const temp = new THREE.Vector3();
  for (let lat = -80; lat <= 80; lat += 10) {
    for (let lon = 0; lon < 360; lon += 10) {
      const phi = Math.PI * 0.5 - (lat * Math.PI) / 180;
      const theta = (lon * Math.PI) / 180;
      const direction = temp
        .set(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta))
        .normalize()
        .clone();
      const from = direction.clone().multiplyScalar(60);
      const hit = collision.raycast(from, direction.clone().negate());
      if (!hit) continue;
      const position = hit.point.clone();
      up.copy(position).normalize();
      for (let r = 0; r < Math.PI * 2; r += Math.PI / 8) {
        controller.teleport(position, r, up);
        spherical.setFromVector3(SCENE.relativeCameraPosition);
        spherical.phi = THREE.MathUtils.clamp(
          spherical.phi,
          Math.PI * 0.25,
          Math.PI * 0.75,
        );
        spherical.theta = r;
        temp.setFromSpherical(spherical)
          .applyQuaternion(controller.object.quaternion)
          .applyAxisAngle(controller.object.up, Math.PI - r);
        const baseTarget = position
          .clone()
          .addScaledVector(up, controller.capsule.segment.end.y + controller.capsule.radius)
          .add(SCENE.relativeCameraOffset);
        const probeHit = collision.raycast(baseTarget, temp.clone().normalize(), {
          far: spherical.radius,
        });
        if (probeHit && probeHit.distance > 0.9 && probeHit.distance < spherical.radius - 1) {
          return { position, rotation: r, up };
        }
      }
    }
  }
  return null;
}

const lab = {
  done: false,
  checks,
  state,
  app,
  scene,
  camera,
  controller,
  collision,
  terrain,
  input,
  events,
  THREE,
  CHARACTER_PHYSICS_OPTIONS,
  CHARACTER,
  simulate,
};
window.__lab = lab;
runChecks().catch((error) => {
  console.error(error);
  lab.error = String(error && error.stack ? error.stack : error);
  lab.done = true;
});

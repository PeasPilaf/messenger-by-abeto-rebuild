import * as THREE from 'three';
import { decodeDrc } from '../src/assets/DrcDecoder.js';
import { GeometryLoader } from '../src/assets/GeometryLoader.js';
import { TextureLoader } from '../src/assets/TextureLoader.js';
import { AudioLoader } from '../src/assets/AudioLoader.js';
import { TERRAIN } from '../src/assets/manifest.js';
import {
  check,
  checkAtLeast,
  finishLab,
  heading,
  note,
  setPhase,
  state,
} from './lab-harness.js';
import { testAudio, testTextures } from './textures-lab.js';

async function testTerrainChunk(geometryLoader) {
  setPhase('terrain chunk');
  heading('1. Terrain chunk — planets/present/full_0');

  const name = TERRAIN.lod[0][0];
  const response = await fetch(`/assets/geometries/${name}.drc`);
  const decoded = await decodeDrc(await response.arrayBuffer());

  check('decodeDrc numPoints', decoded.numPoints, 56883);
  check('decodeDrc numFaces', decoded.numFaces, 48763);
  check('decodeDrc kind', decoded.kind, 'mesh');
  check('decodeDrc attribute order', Object.keys(decoded.attributes),
    ['position', 'normal', 'uv', 'surfaceId', 'batchId', 'elementId']);
  check('surfaceId itemSize', decoded.itemSizes.surfaceId, 1);
  check('surfaceId typed array', decoded.attributes.surfaceId.constructor.name, 'Int32Array');
  check('indices length', decoded.indices.length, 48763 * 3);
  check('userData is null for meshes', decoded.userData, null);
  note('full_0 info JSON', JSON.stringify(decoded.info));

  const geometry = await geometryLoader.load(name);
  check('load position count', geometry.attributes.position.count, 56883);
  check('load index count', geometry.index.count, 48763 * 3);
  check('load attribute names', Object.keys(geometry.attributes),
    ['position', 'normal', 'uv', 'surfaceId', 'batchId', 'elementId']);
  check('load uv itemSize', geometry.attributes.uv.itemSize, 2);

  const batches = await geometryLoader.batched(name);
  check('batched batch count', batches.length, 65);
  check('batched ids ascending 0..64', batches.map((batch) => batch.batchId).join(','),
    Array.from({ length: 65 }, (_, index) => index).join(','));
  check('userData.batchId on batch 7', batches[7].geometry.userData.batchId, 7);
  check('batched vertex total', batches.reduce((sum, batch) => sum + batch.geometry.attributes.position.count, 0), 56883);
  check('batched index total', batches.reduce((sum, batch) => sum + batch.geometry.index.count, 0), 48763 * 3);
  check('batch 0 vertex count', batches[0].geometry.attributes.position.count, 191);
  check('batch 64 vertex count', batches[64].geometry.attributes.position.count, 1001);

  const indicesFit = batches.every((batch) => {
    const positions = batch.geometry.attributes.position.count;
    const index = batch.geometry.index.array;
    let maxIndex = 0;
    for (let i = 0; i < index.length; i++) if (index[i] > maxIndex) maxIndex = index[i];
    return maxIndex < positions;
  });
  check('every batch index < its vertex count', indicesFit, true);

  check('batch geometry has no batchId attribute', 'batchId' in batches[0].geometry.attributes, false);
  note('batches 0-5 (batchId: verts, tris)', batches.slice(0, 6)
    .map((batch) => `${batch.batchId}: ${batch.geometry.attributes.position.count}v/${batch.geometry.index.count / 3}t`)
    .join('  '));
  note('batch 64 (batchId: verts, tris)', `${batches[64].batchId}: ${batches[64].geometry.attributes.position.count}v/${batches[64].geometry.index.count / 3}t`);
}

async function testGrass(geometryLoader) {
  setPhase('grass point cloud');
  heading('2. Grass point cloud — planets/present/grass');

  const points = await geometryLoader.load(TERRAIN.grass);
  check('grass point count', points.attributes.position.count, 660);
  check('grass attribute names', Object.keys(points.attributes),
    ['position', 'up', 'randomm', 'instanceId']);
  check('grass has no index (point cloud)', points.index, null);
  check('randomm itemSize', points.attributes.randomm.itemSize, 4);
  check('instanceId typed array', points.attributes.instanceId.array.constructor.name, 'Int32Array');

  const blade = new THREE.PlaneGeometry();
  blade.rotateZ(Math.PI);
  blade.translate(0, -0.5, 0);
  blade.rotateX(Math.PI * -0.5);
  blade.scale(0.7, 0.7, 0.7);

  const patches = await geometryLoader.instancedPatches(blade, TERRAIN.grass);
  check('grass patch count', patches.length, 33);
  check('grass instanceCount total', patches.reduce((sum, patch) => sum + patch.geometry.instanceCount, 0), 660);
  check('patch instanceIds 0..32', patches.map((patch) => patch.instanceId).join(','),
    Array.from({ length: 33 }, (_, index) => index).join(','));
  check('patch instanceCounts', patches.map((patch) => patch.geometry.instanceCount).join(','),
    '13,11,16,24,4,20,21,23,30,41,37,21,18,22,2,19,17,16,40,34,29,37,10,20,25,24,15,14,15,9,10,12,11');
  check('patch geometry is instanced', patches[0].geometry.isInstancedBufferGeometry, true);
  check('_matrixArray length', patches[0].geometry._matrixArray.length, 16 * patches[0].geometry.instanceCount);
  check('up is an InstancedBufferAttribute', patches[0].geometry.attributes.up.isInstancedBufferAttribute, true);

  const merged = await geometryLoader.instanced(blade, TERRAIN.grass);
  check('instanced() instanceCount', merged.instanceCount, 660);
  check('instanced() _matrixArray length', merged._matrixArray.length, 660 * 16);
  check('instanced() up count', merged.attributes.up.count, 660);
  check('instanced() keeps blade position count', merged.attributes.position.count, blade.attributes.position.count);
  note('patch 0 first matrix (translation)', Array.from(patches[0].geometry._matrixArray.slice(12, 15))
    .map((value) => value.toFixed(3)).join(', '));
  note('patch 0 up/randomm counts', `${patches[0].geometry.attributes.up.count} up, ${patches[0].geometry.attributes.randomm.count} randomm`);
}

async function testNpc(geometryLoader) {
  setPhase('NPC fox');
  heading('3. NPC — npcs/present/fox: fox, fox-bones, fox-idle');

  const mesh = await geometryLoader.load('npcs/present/fox/fox');
  check('fox mesh vertex count', mesh.attributes.position.count, 904);
  check('fox mesh triangle count', mesh.index.count / 3, 1408);
  check('fox mesh attribute names', Object.keys(mesh.attributes),
    ['skinIndex', 'skinWeight', 'position', 'normal', 'uv', 'surfaceId']);
  check('skinIndex typed array', mesh.attributes.skinIndex.array.constructor.name, 'Uint16Array');
  check('skinWeight itemSize', mesh.attributes.skinWeight.itemSize, 4);

  const bones = await geometryLoader.loadBones('npcs/present/fox/fox-bones');
  check('fox joint count', bones.joints.length, 18);
  check('fox jointCount field', bones.jointCount, 18);
  check('fox parents', bones.joints.map((joint) => joint.parent).join(','),
    '-1,0,1,2,3,0,5,0,7,0,9,10,9,12,0,14,15,16');
  check('fox roots', bones.rootIndexes, [0]);
  note('fox joint 5 (position, scale, parent)',
    `${Array.from(bones.joints[5].position.toArray()).map((v) => v.toFixed(3)).join(',')} / ` +
    `${bones.joints[5].scale.toArray().map((v) => v.toFixed(3)).join(',')} / ${bones.joints[5].parent}`);

  const clip = await geometryLoader.loadAnimation('npcs/present/fox/fox-idle');
  check('fox-idle fps', clip.fps, 24);
  check('fox-idle frames', clip.frames, 120);
  check('fox-idle jointCount', clip.jointCount, 18);
  check('fox-idle duration', clip.duration, 5);
  check('fox-idle takes are per joint', clip.tracks.length, 18);
  check('fox-idle track[0].position length', clip.tracks[0].position.length, 120 * 3);
  check('fox-idle track[17].quaternion length', clip.tracks[17].quaternion.length, 120 * 4);

  const response = await fetch('/assets/geometries/npcs/present/fox/fox-idle.drc');
  const raw = await decodeDrc(await response.arrayBuffer());
  const joints = raw.numPoints / raw.userData.frames;
  const rawPosition = raw.attributes.position;
  const pointKey = (point) => [rawPosition[point * 3], rawPosition[point * 3 + 1], rawPosition[point * 3 + 2]]
    .map((value) => value.toFixed(5)).join(',');
  const trackTriple = (track, componentOffset) => Array.from(track.slice(componentOffset, componentOffset + 3))
    .map((value) => value.toFixed(5)).join(',');
  check('frame-major: track[1] frame 0 == point 1', pointKey(joints * 0 + 1), trackTriple(clip.tracks[1].position, 0));
  check('frame-major: track[0] frame 1 == point joints', pointKey(joints * 1 + 0), trackTriple(clip.tracks[0].position, 3));
  check('frame-major: track[17] last frame == point joints*frames-1', pointKey(joints * raw.userData.frames - 1),
    trackTriple(clip.tracks[17].position, (raw.userData.frames - 1) * 3));

  let constantJoints = 0;
  for (let joint = 0; joint < joints; joint++) {
    const first = pointKey(joint);
    let constant = true;
    for (let frame = 1; frame < raw.userData.frames; frame++) {
      if (pointKey(frame * joints + joint) !== first) { constant = false; break; }
    }
    if (constant) constantJoints++;
  }
  check('frame-major: all 18 joints have constant translation', constantJoints, 18);

  let rotationAngle = 0;
  for (let joint = 0; joint < joints; joint++) {
    const track = clip.tracks[joint].quaternion;
    for (let frame = 0; frame < clip.frames - 1; frame++) {
      const a = frame * 4;
      const b = (frame + 1) * 4;
      const dot = Math.abs(track[a] * track[b] + track[a + 1] * track[b + 1] + track[a + 2] * track[b + 2] + track[a + 3] * track[b + 3]);
      rotationAngle += 2 * Math.acos(Math.min(1, dot));
    }
  }
  checkAtLeast('fox-idle total rotation (rad)', Number(rotationAngle.toFixed(2)), 1);

  let restMatches = 0;
  for (let joint = 0; joint < joints; joint++) {
    const same = bones.joints[joint].position.distanceTo(
      new THREE.Vector3().fromArray(clip.tracks[joint].position, 0),
    ) < 1e-3;
    if (same) restMatches++;
  }
  check('fox-idle frame 0 matches rest skeleton for 15/18 joints', restMatches, 15);

  const avatarClip = await geometryLoader.loadAnimation('avatar/avatar-idle');
  check('avatar-idle frames', avatarClip.frames, 90);
  check('avatar-idle jointCount', avatarClip.jointCount, 22);
  check('avatar-idle frames*joints', avatarClip.frames * avatarClip.jointCount, 1980);
  check('avatar-idle track count', avatarClip.tracks.length, 22);
}

async function testHeaderlessContainer() {
  setPhase('headerless container');
  heading('4. Headerless container variant (built from water.drc)');

  const standard = new Uint8Array(await (await fetch('/assets/geometries/planets/present/water.drc')).arrayBuffer());
  check('water.drc starts with DRACO magic', String.fromCharCode(...standard.subarray(0, 5)), 'DRACO');

  let offset = 11;
  const readVarint = () => {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = standard[offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value >>> 0;
      shift += 7;
    }
  };
  const skipMetadata = () => {
    const entries = readVarint();
    for (let i = 0; i < entries; i++) {
      offset += 1 + standard[offset];
      const dataSize = readVarint();
      offset += dataSize;
    }
  };
  const attributeMetadataCount = readVarint();
  for (let i = 0; i < attributeMetadataCount; i++) {
    readVarint();
    skipMetadata();
  }
  skipMetadata();
  const subMetadataCount = readVarint();
  for (let i = 0; i < subMetadataCount; i++) {
    offset += 1 + standard[offset];
    skipMetadata();
  }
  const payload = standard.subarray(offset);
  note('water.drc bitstream offset', offset);

  const standardDecoded = await decodeDrc(standard.slice().buffer);
  check('water numPoints', standardDecoded.numPoints, 1091);
  check('water numFaces', standardDecoded.numFaces, 1499);
  const descriptor = new TextEncoder().encode(JSON.stringify(standardDecoded.info));
  const headerless = new Uint8Array(4 + descriptor.length + standard.length);
  new DataView(headerless.buffer).setUint32(0, descriptor.length, true);
  headerless.set(descriptor, 4);
  headerless.set(standard, 4 + descriptor.length);
  note('headerless container bytes', headerless.length);

  const decoded = await decodeDrc(headerless.buffer);
  check('variant B kind', decoded.kind, 'mesh');
  check('variant B numPoints', decoded.numPoints, 1091);
  check('variant B numFaces', decoded.numFaces, 1499);
  check('variant B attributes', Object.keys(decoded.attributes), ['position', 'uv', 'batchId']);
  check('variant B batchId typed array', decoded.attributes.batchId.constructor.name, 'Int32Array');
  check('variant B userData', decoded.userData, null);

  check('variant B position[0..2] matches standard', Array.from(decoded.attributes.position.slice(0, 3)),
    Array.from(standardDecoded.attributes.position.slice(0, 3)));

  const bare = new Uint8Array(4 + descriptor.length + payload.length);
  new DataView(bare.buffer).setUint32(0, descriptor.length, true);
  bare.set(descriptor, 4);
  bare.set(payload, 4 + descriptor.length);
  let bareError = null;
  try {
    await decodeDrc(bare.buffer);
  } catch (error) {
    bareError = String(error.message || error);
  }
  check('bare bitstream rejected with a Draco diagnostic', Boolean(bareError && bareError.includes('Draco')), true);
  note('bare bitstream error', bareError ? bareError.split('\n')[0] : 'none');
}

async function main() {
  setPhase('renderer');
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(64, 64, false);
  document.getElementById('gl').appendChild(renderer.domElement);

  const geometryLoader = new GeometryLoader();
  const textures = new TextureLoader(renderer);
  const audio = new AudioLoader();

  await testTerrainChunk(geometryLoader);
  await testGrass(geometryLoader);
  await testNpc(geometryLoader);
  await testHeaderlessContainer();
  await testTextures(textures, renderer);
  await testAudio(audio);

  finishLab();
}

main().catch((error) => {
  state.phase = 'error';
  state.done = true;
  state.errors.push(String(error && error.stack ? error.stack : error));
  const summary = document.getElementById('status');
  summary.className = 'summary bad';
  summary.textContent = `lab error: ${error}`;
  console.error(error);
});

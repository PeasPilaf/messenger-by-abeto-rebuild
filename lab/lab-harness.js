import * as THREE from 'three';

export const state = { phase: 'boot', done: false, checks: [], data: {}, errors: [] };
window.__lab = state;

const checksEl = document.getElementById('checks');
const reportEl = document.getElementById('report');
const statusEl = document.getElementById('status');

export function setPhase(phase) {
  state.phase = phase;
  statusEl.textContent = `running: ${phase}`;
}

export function heading(title) {
  const element = document.createElement('h2');
  element.textContent = title;
  reportEl.appendChild(element);
}

function row(label, value) {
  const element = document.createElement('div');
  element.className = 'row';
  element.innerHTML = `<span class="label">${label}</span><span class="value">${String(value)}</span>`;
  reportEl.appendChild(element);
}

export function note(label, value) {
  state.data[label] = value;
  row(label, value);
}

export function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  state.checks.push({ name, actual, expected, pass });
  const element = document.createElement('div');
  element.className = `check ${pass ? 'pass' : 'fail'}`;
  element.textContent = `${pass ? 'PASS' : 'FAIL'} ${name} = ${JSON.stringify(actual)}` +
    (pass ? '' : ` (expected ${JSON.stringify(expected)})`);
  checksEl.appendChild(element);
  return pass;
}

export function checkAtLeast(name, actual, minimum) {
  return check(`${name} (>= ${minimum})`, typeof actual === 'number' && actual >= minimum, true);
}

export function checkClose(name, actual, expected, tolerance) {
  const pass = Math.abs(actual - expected) <= tolerance;
  state.checks.push({ name, actual, expected, tolerance, pass });
  const element = document.createElement('div');
  element.className = `check ${pass ? 'pass' : 'fail'}`;
  element.textContent = `${pass ? 'PASS' : 'FAIL'} ${name} = ${Number(actual).toFixed(5)}` +
    (pass ? '' : ` (expected ${expected} ± ${tolerance})`);
  checksEl.appendChild(element);
  return pass;
}

export function checkArrayClose(name, actual, expected, tolerance) {
  const pass = actual.length === expected.length &&
    actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
  state.checks.push({ name, actual, expected, tolerance, pass });
  const element = document.createElement('div');
  element.className = `check ${pass ? 'pass' : 'fail'}`;
  element.textContent = `${pass ? 'PASS' : 'FAIL'} ${name} = [${actual.map((v) => v.toFixed(4)).join(', ')}]` +
    (pass ? '' : ` (expected [${expected.map((v) => v.toFixed(4)).join(', ')}] ± ${tolerance})`);
  checksEl.appendChild(element);
  return pass;
}

export const LUT_SIZE = 32;

export const EXPECTED_LUT_RAMP = {
  0: [0, 0, 0],
  0.25: [0.18489, 0.19275, 0.20605],
  0.5: [0.47076, 0.48636, 0.46872],
  0.75: [0.7366, 0.75762, 0.71265],
  1: [0.95166, 0.96582, 0.91699],
};

export function readHalfFloat(data, index) {
  return THREE.DataUtils.fromHalfFloat(data[index]);
}

export function sampleLutRamp(texture, value) {
  const size = texture.image.width;
  const data = texture.image.data;
  const t = (value * (size - 1)) / size + 1 / (2 * size);
  const point = t * size - 0.5;
  const base = Math.floor(point);
  const fraction = point - base;
  const out = [0, 0, 0];
  for (let channel = 0; channel < 3; channel++) {
    let total = 0;
    for (let dz = 0; dz < 2; dz++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = Math.min(size - 1, Math.max(0, base + dx));
          const y = Math.min(size - 1, Math.max(0, base + dy));
          const z = Math.min(size - 1, Math.max(0, base + dz));
          const weight = (dx ? fraction : 1 - fraction) * (dy ? fraction : 1 - fraction) * (dz ? fraction : 1 - fraction);
          total += weight * readHalfFloat(data, ((z * size + y) * size + x) * 4 + channel);
        }
      }
    }
    out[channel] = total;
  }
  return out;
}

export function lutTexel(texture, r, g, b) {
  const data = texture.image.data;
  const size = texture.image.width;
  const index = ((b * size + g) * size + r) * 4;
  return [readHalfFloat(data, index), readHalfFloat(data, index + 1), readHalfFloat(data, index + 2)];
}

export function sampleLutNearest(texture, value) {
  const size = texture.image.width;
  const coordinate = (value * (size - 1)) / size + 1 / (2 * size);
  const texel = Math.min(size - 1, Math.max(0, Math.floor(coordinate * size)));
  return lutTexel(texture, texel, texel, texel);
}

export function drawLutRamp(canvas, lutTexture) {
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const half = canvas.height / 2;
  for (let x = 0; x < width; x++) {
    const value = x / (width - 1);
    const grey = Math.round(value * 255);
    context.fillStyle = `rgb(${grey},${grey},${grey})`;
    context.fillRect(x, 0, 1, half);
    const [r, g, b] = sampleLutRamp(lutTexture, value);
    context.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    context.fillRect(x, half, 1, half);
  }
}

export function drawLutSlice(canvas, lutTexture) {
  const data = lutTexture.image.data;
  const size = lutTexture.image.width;
  const cell = canvas.width / size;
  const context = canvas.getContext('2d');
  const z = size >> 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = ((z * size + y) * size + x) * 4;
      const r = Math.round(readHalfFloat(data, index) * 255);
      const g = Math.round(readHalfFloat(data, index + 1) * 255);
      const b = Math.round(readHalfFloat(data, index + 2) * 255);
      context.fillStyle = `rgb(${r},${g},${b})`;

      context.fillRect(x * cell, (size - 1 - y) * cell, cell, cell);
    }
  }
}

export function renderAndRead(renderer, material, size) {
  renderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const pixels = new Uint8Array(size * size * 4);
  gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

export function blitPixelsToCanvas(canvas, pixels, size) {
  const source = document.createElement('canvas');
  source.width = size;
  source.height = size;
  const sourceContext = source.getContext('2d');
  const imageData = sourceContext.createImageData(size, size);
  imageData.data.set(pixels);
  sourceContext.putImageData(imageData, 0, 0);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
}

export function finishLab() {
  const failed = state.checks.filter((entry) => !entry.pass).length;
  const summary = document.getElementById('status');
  summary.className = `summary ${failed === 0 ? 'ok' : 'bad'}`;
  summary.textContent = failed === 0
    ? `${state.checks.length} checks passed`
    : `${failed} of ${state.checks.length} checks FAILED`;
  state.phase = 'done';
  state.done = true;
}

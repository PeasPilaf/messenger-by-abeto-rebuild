import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three';

export const CUSTOMIZE_LAYOUT = Object.freeze({
  plateSize: 0.175,
  plateX: 0.5,
  arrowX: 0.5075,
  closeY: 1.9,
  rowY: [0.10, 0.56, 1.02, 1.48],
  rows: ['shoes', 'bottom', 'top', 'hair'],
  shadowOffset: 0.01175,
  plateColor: '#F8F8F8',
  shadowColor: '#647A87',
  inkColor: '#363a3c',
  closeScale: 1.15,
});

export const ICON_GLYPH_SIZE = 0.115;

export const PLATE_SURFACE_ID = 0.31;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function falloff(value, start, end, margin, progress) {
  const m = margin * Math.sign(end - start);
  const p = (start - m) + (end - (start - m)) * progress;
  return clamp((value - (p + m)) / (p - (p + m)), 0, 1);
}

export function fract(value) {
  return value - Math.floor(value);
}

export function createStickerMaterial(color, { doubleSided = false } = {}) {
  const material = new ShaderMaterial({
    name: 'customize-sticker',
    uniforms: { uColor: { value: new Color(color) } },
    vertexShader:  `
      varying vec2 vHighPrecisionZW;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vHighPrecisionZW = gl_Position.zw;
      }`,
    fragmentShader:  `
      uniform vec3 uColor;
      varying vec2 vHighPrecisionZW;
      layout(location = 1) out highp vec4 gInfo;
      void main() {
        gl_FragColor = vec4(uColor, ${PLATE_SURFACE_ID.toFixed(4)});

        float packedDepth = 1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5);
        gInfo = vec4(packedDepth, 0.0, 0.0, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });

  if (doubleSided) material.side = DoubleSide;
  return material;
}

export function createPlate(plateGeometry, plateMaterial, shadowMaterial, index) {
  const shadow = new Mesh(plateGeometry, shadowMaterial);
  shadow.name = `customize-shadow-${index}`;
  shadow.renderOrder = 20;

  const plate = new Mesh(plateGeometry, plateMaterial);
  plate.name = `customize-plate-${index}`;
  plate.renderOrder = 21;
  plate.userData.index = index;

  return { shadow, plate };
}

function pushBar(positions, ax, ay, bx, by, width) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * (width * 0.5);
  const ny = (dx / length) * (width * 0.5);
  positions.push(
    ax + nx, ay + ny, 0, bx + nx, by + ny, 0, bx - nx, by - ny, 0,
    ax + nx, ay + ny, 0, bx - nx, by - ny, 0, ax - nx, ay - ny, 0,
  );
}

function geometryFromPositions(positions) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

export function createArrowGeometry() {
  const half = ICON_GLYPH_SIZE * 0.5;
  const width = ICON_GLYPH_SIZE * 0.16;
  const positions = [];

  pushBar(positions, -half, 0, half * 0.55, 0, width);
  pushBar(positions, half * 0.05, half * 0.62, half * 0.9, 0, width);
  pushBar(positions, half * 0.05, -half * 0.62, half * 0.9, 0, width);
  return geometryFromPositions(positions);
}

export function createCrossGeometry() {
  const half = ICON_GLYPH_SIZE * 0.45;
  const width = ICON_GLYPH_SIZE * 0.16;
  const positions = [];
  pushBar(positions, -half, -half, half, half, width);
  pushBar(positions, -half, half, half, -half, width);
  return geometryFromPositions(positions);
}

import { Mesh } from 'three';
import {
  CustomBlending, OneFactor, OneMinusSrcAlphaFactor,
} from 'three';
import { SlugMaterial } from '../text/SlugMaterial.js';
import { TextMesh } from '../text/TextMesh.js';

export const UI_FONTS = {
  body: 'UglyDave-Alternates-optimized',
  heading: 'heading',
  title: 'planet',
};

function applySmall(material, small) {
  if (!small) return;
  material.defines = { ...(material.defines ?? {}), SLUG_WEIGHT: 1 };
  material.needsUpdate = true;
}

function applyPremultiplied(material) {
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.blending = CustomBlending;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneMinusSrcAlphaFactor;
  material.blendEquation = 32774;
  material.blendEquationAlpha = 32774;
}

function patchOutput(material, replacement) {
  const marker = 'gl_FragColor = vec4(color.rgb, alpha);';
  if (!material.fragmentShader.includes(marker)) {
    throw new Error('UiText: SlugMaterial fragment output line not found');
  }
  material.fragmentShader = material.fragmentShader.replace(marker, replacement);
  material.needsUpdate = true;
}

export function interiorTextMaterial(font, { small = false, opacity = 1 } = {}) {
  const material = new SlugMaterial({ font, opacity });
  patchOutput(material, 'gl_FragColor = vec4(-color.rgb * alpha, alpha);');
  applySmall(material, small);
  applyPremultiplied(material);
  material.name = 'ui-text-interior';
  return material;
}

export function displayTextMaterial(font, { small = false, opacity = 1, glyphTilt = 0 } = {}) {
  const material = new SlugMaterial({ font, opacity });
  patchOutput(material, 'gl_FragColor = vec4(color.rgb * alpha, alpha);');
  applySmall(material, small);
  applyPremultiplied(material);
  material.name = 'ui-text-display';
  if (glyphTilt) addGlyphTilt(material, glyphTilt);
  return material;
}

function addGlyphTilt(material, amount) {
  const marker = 'gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);';
  if (!material.vertexShader.includes(marker)) {
    throw new Error('UiText: SlugMaterial vertex main line not found');
  }
  material.vertexShader = material.vertexShader.replace(marker,  `

    float uiAngle = (hash13(centr) * 2.0 - 1.0) * ${Number(amount).toFixed(4)};
    float uiCos = cos(uiAngle);
    float uiSin = sin(uiAngle);
    vec3 uiRel = pos - centr;
    pos = centr + vec3(uiRel.x * uiCos - uiRel.y * uiSin,
                       uiRel.x * uiSin + uiRel.y * uiCos,
                       uiRel.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);`);
  material.needsUpdate = true;
  return material;
}

export function iconMaterial(font, { tint = null } = {}) {
  const material = new SlugMaterial({ font, reveal: false });
  patchOutput(material, 'gl_FragColor = vec4(color.rgb, 1.0);');
  material.transparent = false;
  material.depthTest = false;
  material.depthWrite = false;
  material.name = 'ui-icon';
  if (tint) material.setOverwriteColor(tint);
  return material;
}

export async function makeText(glyphs, {
  font, text, size, maxWidth,
  color = '#0f0f0f',
  align = 'left',
  letterSpacing = 0,
  lineHeight = 1.1,
  shadow = false,
  shadowX = 0.05,
  shadowY = 0.05,
  shadowColor = '#0f0f0f',
  interior = true,
  small = false,
  opacity = 1,
  glyphTilt = 0,
}) {

  const mesh = new TextMesh({
    glyphs,
    font,
    text,
    anchor: 'top-left',
    textOptions: {
      size, maxWidth, color, align, letterSpacing, lineHeight,
      shadow, shadowX, shadowY, shadowColor,
    },
  });
  await mesh.ready;
  mesh.material = interior
    ? interiorTextMaterial(mesh.font, { small, opacity })
    : displayTextMaterial(mesh.font, { small, opacity, glyphTilt });
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return mesh;
}

export async function makeIcon(glyphs, name, { height = 20, tint = null } = {}) {
  const { geometry, font } = await glyphs.buildPicture(name, { size: 1 });
  const mesh = new Mesh(geometry, iconMaterial(font, { tint }));
  mesh.name = `icon ${name}`;
  mesh.scale.setScalar(height);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

export function textBlock(mesh) {
  const metrics = mesh.metrics;
  const size = metrics.size;
  const topAlign = size * Math.abs(metrics.ascent - metrics.descent);
  const lineSize = size * metrics.lineHeight;
  return {
    topAlign,
    lineSize,
    lines: metrics.lines,
    height: topAlign + lineSize * Math.max(0, metrics.lines - 1),
    width: mesh.bounds.width,
    inkHeight: mesh.bounds.height,

    inkAscent: mesh.bounds.max[1],
  };
}

export function placeText(mesh, x, baselineY) {
  mesh.position.set(x, mesh.bounds.max[1] - baselineY, 0);
  mesh.updateMatrix();
  return mesh;
}

export function placeTextCentred(mesh, centreX, baselineY) {
  return placeText(mesh, centreX - mesh.bounds.width / 2, baselineY);
}

export async function setText(mesh, text) {
  await mesh.setText(text);
  return mesh;
}

export function typewrite(mesh, charsPerSecond) {
  return mesh.typewriter({ charsPerSecond });
}

export function isTyping(mesh) {
  return mesh.material.uniforms.uShow.value < 1;
}

export function forceTypewriterEnd(mesh) {
  if (!isTyping(mesh) && !mesh._cancelTypewriter) return false;
  mesh._cancelTypewriter?.();
  mesh.material.setShow(1);
  mesh.typewriterProgress = 1;
  return true;
}

export function setTextResolution(root, deviceWidth, deviceHeight) {
  root.traverse((object) => {
    const material = object.material;
    if (material && material.setResolution) material.setResolution(deviceWidth, deviceHeight);
  });
}

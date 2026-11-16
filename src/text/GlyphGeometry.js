export const VERTEX_FLOATS = 20;

export const VERTEX_ATTRIBUTES = [
  ['position', 3],
  ['posnorm', 2],
  ['texcoord', 4],
  ['jacobian', 4],
  ['banding', 4],
  ['color', 4],
];

export function unpackGeometry(heapBuffer, geom) {
  const floats = geom.vertexSize / 4;
  if (floats !== VERTEX_FLOATS) {

    throw new Error(`glyph: unexpected vertex size ${geom.vertexSize} bytes (${floats} floats)`);
  }

  const interleaved = new Float32Array(heapBuffer, geom.ptrVertex, geom.vertexCount * floats);
  const count = geom.vertexCount;

  const out = {

    position: new Float32Array(count * 3),
    posnorm: new Float32Array(count * 2),
    texcoord: new Float32Array(count * 4),
    jacobian: new Float32Array(count * 4),
    banding: new Float32Array(count * 4),
    color: new Float32Array(count * 4),
  };

  for (let v = 0; v < count; v++) {
    const s = v * floats;
    out.position[v * 3 + 0] = interleaved[s + 0];
    out.position[v * 3 + 1] = interleaved[s + 1];

    for (let i = 0; i < 2; i++) out.posnorm[v * 2 + i] = interleaved[s + 2 + i];
    for (let i = 0; i < 4; i++) {
      out.texcoord[v * 4 + i] = interleaved[s + 4 + i];
      out.jacobian[v * 4 + i] = interleaved[s + 8 + i];
      out.banding[v * 4 + i] = interleaved[s + 12 + i];
      out.color[v * 4 + i] = interleaved[s + 16 + i];
    }
  }

  const IndexArray = geom.indexType === 0 ? Uint16Array : Uint32Array;
  const indexBytes = geom.indexType === 0 ? 2 : 4;
  const indexCount = geom.triangleCount * (geom.triangleSize / indexBytes);

  out.index = new IndexArray(heapBuffer, geom.ptrTriangle, indexCount).slice();
  return out;
}

export function computeGlyphWeights(attributes, { rightToLeft = false } = {}) {
  const { position, index, vertexCount } = attributes;
  const quadCount = index.length / 6;
  const lastQuad = quadCount - 1;

  const centr = new Float32Array(vertexCount * 3);
  const textWeights = new Float32Array(vertexCount * 2);
  const lineWeights = new Float32Array(vertexCount * 3);

  const glyphsPerLine = [0];
  const gaps = [];
  let letterCursor = 0;

  const px = (i) => position[i * 3 + 0];
  const py = (i) => position[i * 3 + 1];
  const pz = (i) => position[i * 3 + 2];

  for (let q = 0; q < quadCount; q++) {
    const base = q * 6;
    const v0 = index[base];
    const v1 = index[base + 1];
    const v2 = index[base + 2];

    const cx = px(v0) + Math.abs(px(v1) - px(v0)) * 0.5;
    const cy = py(v0) + Math.abs(py(v2) - py(v0)) * 0.5;
    const cz = pz(v0) + Math.abs(pz(v1) - pz(v0)) * 0.5;

    const letterT = lastQuad > 0 ? letterCursor / lastQuad : 0;
    for (let v = v0; v < v0 + 4; v++) {
      centr[v * 3 + 0] = cx;
      centr[v * 3 + 1] = cy;
      centr[v * 3 + 2] = cz;
      textWeights[v * 2 + 0] = letterT;
    }

    letterCursor++;
    glyphsPerLine[glyphsPerLine.length - 1]++;

    if (letterCursor === quadCount) break;

    if (rightToLeft) {
      const nextRight = index[base + 7];
      if (px(nextRight) > cx) glyphsPerLine.push(0);
      else gaps.push(Math.abs(Math.min(0, px(nextRight) - px(v0))));
    } else {
      const nextLeft = index[base + 6];
      if (px(nextLeft) < cx) glyphsPerLine.push(0);
      else gaps.push(Math.max(0, px(nextLeft) - px(v1)));
    }
  }

  const averageGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const smallGaps = gaps.filter((g) => g <= averageGap);
  const wordGap = (smallGaps.length ? smallGaps.reduce((a, b) => a + b, 0) / smallGaps.length : 0) * 3;

  const wordsPerLine = [0];
  const wordsBeforeInLine = [];
  const wordsBeforeInText = [];
  let wordsSeen = 0;
  let line = 0;
  let cursor = 0;

  for (let q = 0; q < quadCount; q++) {
    const base = q * 6;
    cursor++;
    wordsBeforeInLine.push(wordsPerLine[line]);
    wordsBeforeInText.push(wordsSeen);

    if (cursor === glyphsPerLine[line]) {

      cursor = 0;
      wordsPerLine[line]++;
      wordsSeen++;
      if (line < glyphsPerLine.length) {
        line++;
        wordsPerLine[line] = 0;
      }
      continue;
    }

    let gap;
    if (rightToLeft) {
      const v0 = index[base];
      const nextRight = index[base + 7];
      gap = Math.abs(Math.min(0, px(nextRight) - px(v0)));
    } else {
      const v1 = index[base + 1];
      const nextLeft = index[base + 6];
      gap = Math.max(0, px(nextLeft) - px(v1));
    }
    if (gap > wordGap) {
      wordsPerLine[line]++;
      wordsSeen++;
    }
  }

  const lineCount = glyphsPerLine.length;
  let quadsOnLine = 0;
  let lineCursor = 0;
  let quad = 0;

  for (let q = 0; q < quadCount; q++) {
    const base = q * 6;
    const v0 = index[base];

    const wordT = wordsSeen > 1 ? wordsBeforeInText[quad] / (wordsSeen - 1) : 0;
    const letterInLineT = glyphsPerLine[lineCursor] > 1 ? quadsOnLine / (glyphsPerLine[lineCursor] - 1) : 0;
    const wordInLineT = wordsPerLine[lineCursor] > 1 ? wordsBeforeInLine[quad] / (wordsPerLine[lineCursor] - 1) : 0;
    const lineT = lineCount > 1 ? lineCursor / (lineCount - 1) : 0;

    for (let v = v0; v < v0 + 4; v++) {
      textWeights[v * 2 + 1] = wordT;
      lineWeights[v * 3 + 0] = letterInLineT;
      lineWeights[v * 3 + 1] = wordInLineT;
      lineWeights[v * 3 + 2] = lineT;
    }

    quad++;
    quadsOnLine++;
    if (quadsOnLine === glyphsPerLine[lineCursor]) {
      lineCursor++;
      quadsOnLine = 0;
    }
  }

  return { centr, textWeights, lineWeights };
}

export function computeBounds(position, vertexCount) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let v = 0; v < vertexCount; v++) {
    const x = position[v * 3 + 0], y = position[v * 3 + 1], z = position[v * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (vertexCount === 0) {
    minX = minY = minZ = maxX = maxY = maxZ = 0;
  }

  const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  let radius = 0;
  for (let v = 0; v < vertexCount; v++) {
    const dx = position[v * 3 + 0] - center[0];
    const dy = position[v * 3 + 1] - center[1];
    const dz = position[v * 3 + 2] - center[2];
    radius = Math.max(radius, Math.hypot(dx, dy, dz));
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center,
    radius,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function computeBoxUV(position, vertexCount, bounds) {
  const uv = new Float32Array(vertexCount * 2);
  const { min, max } = bounds;
  const w = max[0] - min[0];
  const h = max[1] - min[1];

  if (w === 0 || h === 0) return uv;

  for (let v = 0; v < vertexCount; v++) {
    uv[v * 2 + 0] = (position[v * 3 + 0] - min[0]) / w;
    uv[v * 2 + 1] = (position[v * 3 + 1] - min[1]) / h;
  }
  return uv;
}

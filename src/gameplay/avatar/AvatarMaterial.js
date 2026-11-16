import { createPainterlyMaterial, createSharedUniforms } from '../../graphics/PainterlyMaterial.js';

export function prepareCharacterMaterial(material) {
  let vertexShader = material?.vertexShader;
  let fragmentShader = material?.fragmentShader;
  if (typeof vertexShader !== 'string') return material;

  if (vertexShader.includes('skinnormal_vertex') && !vertexShader.includes('skinbase_vertex')) {
    vertexShader = vertexShader.replace(
      '        #include <skinnormal_vertex>',
      '        #include <skinbase_vertex>\n        #include <skinnormal_vertex>',
    );
  }

  if (vertexShader.includes('lPos = position;') && !vertexShader.includes('vBatchID = 0.0')) {
    vertexShader = vertexShader.replace(
      '        lPos = position;\n    #endif',
      '        lPos = position;\n    #endif\n\n' +
        '    #ifdef IS_CHARACTER\n' +
        '        vIsLocal = 1;\n' +
        '        vBatchID = 0.0;\n' +
        '    #endif',
    );
  }

  if (
    typeof fragmentShader === 'string' &&
    fragmentShader.includes('vBatchID') &&
    !fragmentShader.includes('flat varying float vBatchID')
  ) {
    fragmentShader = fragmentShader.replace(
      '    flat varying int vIsLocal;',
      '    flat varying int vIsLocal;\n    flat varying float vBatchID;',
    );
  }

  material.vertexShader = vertexShader;
  if (typeof fragmentShader === 'string') material.fragmentShader = fragmentShader;
  return material;
}

export function createAvatarMaterial({ material = null, shared = null } = {}) {
  const uniforms = shared ?? createSharedUniforms();
  const resolved = material ?? createPainterlyMaterial({ kind: 'character', shared: uniforms });
  return {
    material: prepareCharacterMaterial(resolved),
    shared: uniforms,

    ownsMaterial: !material,
  };
}

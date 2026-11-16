uniform float uTime;

#ifdef IS_TERRAIN

    attribute int surfaceId;
    attribute int elementId;
    flat varying int vElementId;
    varying vec3 vLocalNormal;
#else
    attribute float surfaceId;
#endif

#ifdef IS_CHARACTER
    flat varying int vIsLocal;
    flat varying float vBatchID;
#endif

#if defined(IS_CHARACTER) || defined(IS_NPC)
    varying vec3 lPos;
#endif

varying vec2 vUv;
varying vec3 wPos;
varying vec3 wNormal;
varying vec3 vViewPosition;
varying vec2 vHighPrecisionZW;
flat varying float vSurfaceId;

#include <common>
#include <normal_pars_vertex>

#ifdef USE_SKINNING
    #include <skinning_pars_vertex>
#endif

#include <shadowmap_pars_vertex>

void main() {
    vUv = uv;

    #ifdef IS_TERRAIN
        vElementId = elementId;
        vLocalNormal = normal;

        vSurfaceId = fract(float(surfaceId) / 10e5);
    #else
        vSurfaceId = surfaceId;
    #endif

    #if defined(IS_CHARACTER) || defined(IS_NPC)
        lPos = position;
    #endif

    #ifdef IS_CHARACTER

        vIsLocal = 1;
        vBatchID = 0.0;
    #endif

    #include <beginnormal_vertex>

    #ifdef USE_SKINNING

        #include <skinbase_vertex>
        #include <skinnormal_vertex>
    #endif

    #include <defaultnormal_vertex>
    #include <begin_vertex>

    #ifdef USE_SKINNING
        #include <skinning_vertex>
    #endif

    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vec4 viewPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * viewPosition;

    wPos = worldPosition.xyz;
    wNormal = inverseTransformDirection(transformedNormal, viewMatrix);
    vViewPosition = -viewPosition.xyz;

    #include <shadowmap_vertex>

    vHighPrecisionZW = gl_Position.zw;
}

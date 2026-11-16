uniform sampler2D tDiffuse;
uniform sampler2D tInfo;
uniform sampler2D tWater;
uniform sampler3D tLUT;

uniform vec2 uResolution;
uniform float uCameraNear;
uniform float uCameraFar;

uniform vec2 uOutlineFade;
uniform float uOutlineThickness;
uniform vec3 uOutlineColor;
uniform float uOutlineScale;
uniform vec3 uInfoRange;
uniform vec3 uDepthRange;
uniform vec3 uNormalRange;
uniform float uSmoothMargin;
uniform float uInfoMinScale;
uniform float uLUTIntensity;
uniform float uOutlineEnabled;

uniform float uDebugSurfaceId;
uniform float uDebugOutline;

varying vec2 vUv;

#include <common>
#include <packing>

/* INCLUDE_CHUNKS */

void main() {

    vec4 scene = texture2D(tDiffuse, vUv);
    vec3 sceneColor = scene.rgb;

    vec4 water = texture2D(tWater, vUv);
    float isWater = max(0.0, sign(water.a));
    sceneColor = mix(sceneColor, water.rgb, isWater);

    if (uDebugSurfaceId > 0.5) {
        float id = scene.a;
        gl_FragColor = vec4(fract(id * 500.0), fract(id * 5000.0), fract(id * 50.0), 1.0);
        return;
    }

    float resolutionScale = min(1.0, uResolution.y / 1300.0) * uOutlineScale;

    float centerDepth = 0.0;
    float nearestDepth = 0.0;
    float outlineValue = 0.0;
    if (uOutlineEnabled > 0.5) {
        outlineValue = outline(tDiffuse, tInfo, vUv, uOutlineThickness, resolutionScale,
                               uInfoRange, uDepthRange, uNormalRange, uSmoothMargin, uInfoMinScale,
                               uOutlineFade, vec2(uCameraNear, uCameraFar), nearestDepth, centerDepth);
    }

    float waterDepth = linearDepthFromInfo(water.a, uCameraNear, uCameraFar);
    float outlineUnderWater = isWater;
    if (nearestDepth < waterDepth) outlineUnderWater = 0.0;

    vec3 aboveOutlineColor = uOutlineColor;
    vec3 underwaterOutlineColor = sceneColor;
    vec3 outlineColor = mix(aboveOutlineColor, underwaterOutlineColor, outlineUnderWater);

    if (uDebugOutline > 0.5) {
        gl_FragColor = vec4(vec3(outlineValue), 1.0);
        return;
    }

    sceneColor = mix(sceneColor, outlineColor, outlineValue);

    sceneColor = apply3DLUTTetrahedral(sceneColor, tLUT, uLUTIntensity);

    gl_FragColor = vec4(sceneColor, 1.0);
    #include <colorspace_fragment>
}

const MAIN_OUTPUT =  `
#ifdef WATER_PASS

    gl_FragColor = vec4(color, 1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5));
#else

    gl_FragColor = vec4(color, uSurfaceId);
    gInfo = vec4(1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5),
                 encodeNormalSpheremap(normalize(vNormal)), 0.0);
#endif
`;

const MRT_OUT =  `
#ifndef WATER_PASS
layout(location = 1) out highp vec4 gInfo;
uniform float uSurfaceId;
#endif
`;

export const WATERFALL_VERTEX =  `
attribute float scalefactor;
varying vec2 vHighPrecisionZW;
varying vec2 vUv;
varying vec2 vUv2;
varying float vScaleFactor;
varying vec3 vLocalPos;
varying vec4 vPos;
varying vec3 vNormal;

void main() {
    vLocalPos = position;
    vPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * vPos;
    vHighPrecisionZW = gl_Position.zw;
    vUv = uv;
    vUv2 = uv;
    vScaleFactor = scalefactor;
    vNormal = normalize(normalMatrix * normal);
}
`;

export const WATERFALL_FRAGMENT =  `
varying vec2 vHighPrecisionZW;
varying vec2 vUv;
varying vec2 vUv2;
varying float vScaleFactor;
varying vec3 vLocalPos;
varying vec4 vPos;
varying vec3 vNormal;

uniform sampler2D tNoise;
uniform sampler2D tNoise2;
uniform sampler2D tNoise3;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
${MRT_OUT}

void main() {
    vec3 off = vLocalPos * 0.025;

    vec2 uv = vUv;
    uv.y *= 0.08;
    uv.y += time * 0.06;

    float n1 = texture2D(tNoise, vec2(uv.x * (0.5 - vScaleFactor * 0.3) + time * 0.01,
                                     uv.y + vScaleFactor * 0.25)).r;
    float n2 = texture2D(tNoise2, vUv * vec2(0.5, 0.1) + vec2(off.x, time * 0.07)).g;
    n2 -= texture2D(tNoise2, vUv * vec2(2.0 - vScaleFactor * 2.0, 0.15) + vec2(off.z, time * 0.051)).g;
    float n3 = texture2D(tNoise2, vUv * vec2(0.5, 0.5 + vUv.y * 0.25) + vec2(-off.x, time * 0.5)).r;
    float n4 = 1.0 - texture2D(tNoise3, vUv * vec2(0.5, 0.5) - vec2(time * 0.02 - off.z, time * 0.125)).r;
    n4 = 1.0 - pow(1.0 - n4, 2.0);

    float edgegrad = 1.0 - abs(vUv.x - 0.5) * 2.0;
    edgegrad -= n3 * 0.2;
    float edgemask = 1.0 - aastep(0.125 + vScaleFactor * 0.25, edgegrad);

    float streaks = 1.0 - abs(n1 - 0.5) * 2.0;
    streaks = streaks * streaks * streaks;
    streaks = aastep(0.8, streaks);

    float foam = vUv.y - n4 * 0.04;
    float foammask = 1.0 - step(0.002, foam);

    if (edgegrad < 0.05) discard;

    float shine1 = 1.0 - clamp(abs(vUv.y - 0.6) * 4.0, 0.0, 1.0);
    shine1 = 1.0 - pow(1.0 - shine1, 2.0);
    shine1 -= n2 * 0.06;
    shine1 = aastep(0.99, shine1);

    float shine2 = 1.0 - clamp(abs(vUv.y - 0.3) * 4.0, 0.0, 1.0);
    shine2 = 1.0 - pow(1.0 - shine2, 2.0);
    shine2 -= n2 * 0.2;
    shine2 = aastep(0.95, shine2 - 0.05);

    float shadow = vUv.y - n2 * 0.25;
    shadow = 1.0 - aastep(0.175, shadow);

    vec3 color = uColor1;
    color = mix(color, uColor3, max(shine1, shine2));
    color = mix(color, uColor2, shadow);
    color = mix(color, vec3(1.0), max(streaks, edgemask));
    color = mix(color, vec3(1.0), foammask);

    addFog(color, vPos.z);
${MAIN_OUTPUT}
}
`;

export const SPLASH_VERTEX =  `
varying vec2 vHighPrecisionZW;
varying vec2 vUv;
varying vec4 vPos;
varying vec3 vNormal;

void main() {
    vPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * vPos;
    vHighPrecisionZW = gl_Position.zw;
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
}
`;

export const SPLASH_FRAGMENT =  `
varying vec2 vHighPrecisionZW;
varying vec2 vUv;
varying vec4 vPos;
varying vec3 vNormal;

uniform sampler2D tNoise;
${MRT_OUT}

void main() {
    vec2 uv = vUv * vec2(1.0, 5.0);
    uv.x = pow(uv.x, 2.0);

    float mask1 = texture2D(tNoise, uv + vec2(-time * 0.2, 0.0)).r;
    float concentric = sin(uv.x * 25.0 - time * 5.0) * 0.5 + 0.5;

    float foam = mask1 * 0.65;
    foam += 0.3 * pow(concentric, 20.0);
    foam += pow(1.0 - vUv.x, 3.0);
    foam *= 1.0 - pow(smoothstep(0.2, 1.0, vUv.x), 3.0);

    if (step(0.5, foam) < 0.5) discard;

    vec3 color = vec3(1.0);
    addFog(color, vPos.z);
${MAIN_OUTPUT}
}
`;

export const INLET_VERTEX =  `
attribute float extrafoam;
varying vec2 vHighPrecisionZW;
varying vec2 vUv;
varying float vExtraFoam;
varying vec4 vPos;
varying vec3 vNormal;

void main() {
    vPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * vPos;
    vHighPrecisionZW = gl_Position.zw;
    vUv = uv;
    vExtraFoam = extrafoam;
    vNormal = normalize(normalMatrix * normal);
}
`;

export const INLET_FRAGMENT =  `
varying vec2 vHighPrecisionZW;
varying vec2 vUv;
varying float vExtraFoam;
varying vec4 vPos;
varying vec3 vNormal;

uniform sampler2D tNoise;
uniform sampler2D tNoise2;
uniform vec3 uColor1;
uniform vec3 uColor2;
${MRT_OUT}

void main() {
    float foam = texture2D(tNoise, vUv * vec2(0.5, 2.0) + vec2(0.5, time * 0.15)).r;
    float foam2 = texture2D(tNoise, vUv * vec2(0.5, 2.0) * 2.0 + vec2(0.0, time * 0.13)).r;
    float edges = smoothstep(0.3, 0.0, vUv.x) + smoothstep(0.8, 1.0, vUv.x);

    float value = max(foam, edges);
    value = max(value, smoothstep(0.2, 0.0, vUv.y) - foam2 * 0.1 + vExtraFoam * foam2 * 1.5);
    value = step(0.7, value);

    vec3 color = uColor1;
    color = mix(uColor1, uColor2, step(0.4, smoothstep(0.425, 0.6, vUv.y) - foam2 * 0.1));
    color = mix(color, vec3(1.0), value);

    float n2 = texture2D(tNoise2, vUv * vec2(0.55, 1.0) + vec2(0.0, time * 0.07)).g;
    float alpha = smoothstep(0.0, 0.05, vUv.y) - foam2 * 0.4;
    if (alpha < 0.05) discard;

    addFog(color, vPos.z);
${MAIN_OUTPUT}
}
`;

export const BEACH_VERTEX =  `
varying vec2 vHighPrecisionZW;
varying vec2 vUv;
varying vec3 vLPos;
varying vec4 vPos;
varying vec3 vNormal;

void main() {
    vLPos = position;
    vPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * vPos;
    vHighPrecisionZW = gl_Position.zw;
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
}
`;

export const BEACH_FRAGMENT =  `
varying vec2 vHighPrecisionZW;
varying vec2 vUv;
varying vec3 vLPos;
varying vec4 vPos;
varying vec3 vNormal;

uniform sampler2D tNoise;
uniform sampler2D tNoise2;
uniform sampler2D tScene;
uniform sampler2D tSceneInfo;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform mat4 uProjMat;
uniform mat4 uWorldMat;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uHasScene;
${MRT_OUT}

vec4 getWave(float t) {
    float w1 = sin(t) * 0.5 + 0.5;
    float looptime = fract(t / 6.283 + 3.14159 * 5.0);

    float n1 = 1.0 - texture2D(tNoise2, vUv * vec2(1.5, 2.5) + vec2(w1 * 1.0, -w1 * 0.1)).r;
    float n2 = texture2D(tNoise, vUv * vec2(2.0, 4.0) + vec2(w1 * 1.0, -t * 0.24)).r;
    float n3 = texture2D(tNoise, vUv * vec2(2.0, 2.0) + vec2(w1 * 0.1, -t * 0.065)).r;

    float og1 = vUv.x + w1;
    og1 += n1 * 0.2 - 0.1;
    float base1 = fract(og1);
    base1 *= 1.0 - step(1.0, og1);

    float foamfront1 = smoothstep(0.9, 1.0, base1);
    float foamwide1 = base1 * n2 * smoothstep(0.0, 0.5, base1);
    float rearfade = smoothstep(0.0, 0.3, vUv.x);
    foamwide1 *= rearfade;
    foamfront1 *= rearfade;

    float value = foamfront1 + foamwide1;
    value *= smoothstep(1.0, 0.3, looptime);
    float alpha = base1;
    value = step(0.45, value);

    return vec4(mix(mix(uColor1, uColor2, step(0.7, n3)), vec3(1.0), value), alpha);
}

float getWetSand(float t) {
    float w1 = sin(t) * 0.5 + 0.5;
    float looptime = fract(t / 6.283 + 3.14159 * 5.0 + 0.018);
    float og1 = vUv.x + w1;
    float n1 = 1.0 - texture2D(tNoise2, vUv * vec2(1.5, 2.5) + vec2(w1 * 1.0, -w1 * 0.1)).r;
    og1 += n1 * 0.2 - 0.1;
    float base1 = fract(og1);
    base1 *= 1.0 - step(0.99, og1);
    base1 *= 1.0 - looptime;
    return base1;
}

void main() {
    float t = time * 0.66;

    vec4 wave = getWave(t);
    float wetsand = getWetSand(t - 0.3);
    vec4 wave2 = getWave(t + 3.14159);
    float wetsand2 = getWetSand(t + 3.14159 - 0.3);

    wave = max(wave, wave2);
    wetsand = max(wetsand, wetsand2);

    float wetsandmask = max(0.0, step(0.01, wetsand) - step(0.01, wave.a));
    vec3 color = mix(wave.rgb, uColor3, wetsandmask);

    if (wave.a + wetsandmask < 0.01) discard;

    if (uHasScene > 0.5) {
        vec2 screenUv = gl_FragCoord.xy / resolution.xy;
        float sceneDepth = 1.0 - texture2D(tSceneInfo, screenUv).r;
        float waterSurfaceDepth = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;

        vec3 sceneViewPos = getViewPosition(sceneDepth, screenUv, uCameraNear, uCameraFar, uProjMat);
        vec3 sceneWorldPos = (uWorldMat * vec4(sceneViewPos, 1.0)).xyz;
        float sceneDist = length(sceneViewPos);
        float sceneHeight = length(sceneWorldPos);
        vec3 waterViewPos = getViewPosition(waterSurfaceDepth, screenUv, uCameraNear, uCameraFar, uProjMat);
        vec3 waterWorldPos = (uWorldMat * vec4(waterViewPos, 1.0)).xyz;
        float waterDist = length(waterViewPos);
        float waterHeight = length(waterWorldPos);

        float viewDistDiff = sceneDist - waterDist;
        float worldHeightDiff = waterHeight - sceneHeight;
        float depthGradient = fit(viewDistDiff, 0.0, 2.5, 0.0, 1.0);

        float gradientScene = 1.0 - max(fit(worldHeightDiff, 0.0, 0.2, 0.0, 1.0), depthGradient);
        float gradientSceneSmall = 1.0 - max(fit(worldHeightDiff, 0.0, 0.06, 0.0, 1.0), depthGradient);
        color = mix(color, mix(color + color, color * color, wetsandmask), gradientScene * 0.5);
        color = mix(color, mix(color + color, color * color, wetsandmask), pow(gradientSceneSmall, 5.0));
        color = clamp(color, vec3(0.0), vec3(1.0));

        color = mix(color, color * (step(0.5, texture2D(tScene, screenUv).r) * 0.3 + 0.7),
                    smoothstep(0.3, 0.65, vUv.x));
    }

    addFog(color, vPos.z);
${MAIN_OUTPUT}
}
`;

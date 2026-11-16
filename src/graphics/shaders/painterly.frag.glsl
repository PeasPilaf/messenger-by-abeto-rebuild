uniform sampler2D tColors;
uniform sampler2D tNoise;
uniform sampler2D tNoiseTerrain;

uniform float uTime;
uniform float uFadeDistance;

#include <common>
#include <packing>

/* INCLUDE_CHUNKS */

#ifdef IS_TERRAIN
    flat varying int vElementId;
    varying vec3 vLocalNormal;

    vec3 applyTerrainColor(vec3 norm, vec3 pos, vec3 color) {
        vec4 triplanarGrass = triplanar(tNoiseTerrain, norm, pos.xyz, 0.035);
        color = rgb2hsv(color);
        color.b -= step(0.7, triplanarGrass.r) * 0.03;
        float grassLight = step(triplanarGrass.g, 0.8);
        color.b += grassLight * 0.05;
        return hsv2rgb(color);
    }
#endif

varying vec3 wPos;
varying vec3 wNormal;
varying vec2 vHighPrecisionZW;
flat varying float vSurfaceId;

#if defined(IS_CHARACTER) || defined(IS_NPC)
    varying vec3 lPos;
    uniform sampler2D tEye;
    uniform vec3 uSkinColor;

    float hash11(float p) {
        p = fract(p * 0.1031);
        p *= p + 33.33;
        p *= p + p;
        return fract(p);
    }
#endif

#ifdef IS_CHARACTER
    uniform float uShowChars;
    uniform float uWetHeight;
    flat varying int vIsLocal;
    flat varying float vBatchID;
#endif

#ifdef IS_NPC
    uniform sampler2D tMouth;
    uniform vec3 uMouthColor;
    uniform float uIsTalking;
    uniform float uNPCSeed;
#endif

float lineFade(vec3 p, float size, float amount) {
    float h = size * 0.5;
    return 1.0 - step(amount * 1.01, (abs(mod(p.y, size) - h) / h));
}

float sphereFade(vec3 p, float size, float amount) {
    float h = size * 0.5;
    return clamp(1.0 - step(amount * 1.85, length(mod(p, size) - h) / h), 0.0, 1.0);
}

uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;

varying vec2 vUv;

#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>

layout(location = 1) out highp vec4 gInfo;

void main() {

    #ifdef IS_TERRAIN
        vec4 triplanarNoise = triplanar(tNoise, wNormal, wPos.xyz * 0.4, 1.0);
        float height = length(wPos);
        float grassMask = 0.0;
        float wetMask = 0.0;

        if (vElementId == 1) {
            grassMask = step(0.15,
                max(0.0, -triplanarNoise.r * 1.5 + dot(wNormal, normalize(wPos)))
                - triplanarNoise.g * 0.35 + 0.1 - triplanarNoise.b * 0.05);
            wetMask = 1.0 - step(0.334, height * 0.015 + triplanarNoise.g * 0.006);
        }
    #endif

    float showAmount = 1.0;
    float distanceToCamera = length(wPos - cameraPosition);

    #ifndef IS_CHARACTER
        showAmount = lineFade(wPos, 0.015, linearstep(0.1, 0.5, distanceToCamera));
    #else
        if (uShowChars < 1.0) showAmount *= sphereFade(wPos, 0.15, uShowChars);
    #endif

    #ifdef FADE_AWAY
        showAmount *= sphereFade(wPos, 0.3, smoothstep(uFadeDistance, uFadeDistance - 3.0, distanceToCamera));
    #endif

    if (showAmount < 0.001) discard;

    vec4 diffuseColor = vec4(diffuse, opacity);
    ReflectedLight reflectedLight = ReflectedLight(vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));
    vec3 totalEmissiveRadiance = emissive;
    float specularStrength = 1.0;

    #include <normal_fragment_begin>
    vec3 wNorm = normalize(wNormal);

    #include <lights_phong_fragment>

    #include <lights_fragment_end>

    vec3 diffuseSpecular = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse
                         + reflectedLight.directSpecular + reflectedLight.indirectSpecular;
    vec3 outgoingLight = diffuseSpecular + totalEmissiveRadiance;

    float shadowContribution = 1.0;
    float outlineContribution = 1.0;

    #if NUM_DIR_LIGHTS > 0
        float specularAmount = 0.075;

        #if defined(IS_CHARACTER) || defined(IS_NPC)
            specularAmount = 0.0;
        #endif

        vec3 baseColor = diffuseColor.rgb;

        #ifdef IS_TERRAIN
            if (vElementId == 1) {
                vec2 colorUv = vUv;
                if (grassMask > 0.5) colorUv = vec2(0.15, 0.95);
                if (wetMask > 0.5) colorUv = vec2(0.21, 0.54);
                baseColor = applyTerrainColor(wNorm, wPos, texture2D(tColors, colorUv).rgb);
            } else {
                baseColor = texture2D(tColors, vUv).rgb;
            }
        #elif defined(IS_CHARACTER) || defined(IS_NPC)
            baseColor = texture2D(tColors, vUv).rgb;

            if (vUv.y > 1.0) {
                vec2 eyeUv = vUv;

                #ifdef IS_CHARACTER
                    float blinkTimeOffset = vBatchID;
                #else
                    float blinkTimeOffset = uNPCSeed;
                #endif

                float eyeTime = uTime * 3.0 + blinkTimeOffset * 23.73464;
                float interval1 = 22.0;
                float interval2 = 34.0;
                float interval3 = 57.0;
                float line1 = fract(eyeTime * (1.0 / interval1)) * interval1 - interval1 + 1.0;
                float line2 = fract(eyeTime * (1.0 / interval2)) * interval2 - interval2 + 1.0;
                float line3 = fract(eyeTime * (1.0 / interval3)) * interval3 - interval3 + 1.0;
                float eyeProgress = max(0.0, max(max(line1, line2), line3));

                float spriteWidth = 0.25;
                eyeUv.x *= spriteWidth;
                eyeUv.x += floor(eyeProgress * 3.0) * spriteWidth;

                float eyeMask = aastep(0.5, texture2D(tEye, eyeUv).r);
                baseColor = uSkinColor * (1.0 - eyeMask);
            }

            #ifdef IS_NPC

                if (vUv.y < 0.0) {
                    float spriteWidth = 0.25;
                    vec2 mouthUv = vUv;
                    mouthUv.x *= spriteWidth;

                    float offset = 0.0;
                    if (uIsTalking > 0.5) {
                        offset = floor(hash11(floor(uTime * 8.0)) * 3.0);
                    }
                    mouthUv.x += offset * spriteWidth;

                    vec3 mask = texture2D(tMouth, mouthUv).rgb;
                    mask.r = aastep(0.5, mask.r);
                    mask.g = aastep(0.5, mask.g);
                    mask.b = aastep(0.5, mask.b);
                    float mouthMask = min(1.0, mask.r + mask.g + mask.b);
                    float skinMask = 1.0 - mouthMask;

                    baseColor = vec3(0.0);
                    baseColor += vec3(1.0) * mask.g;
                    baseColor += uMouthColor * mask.r;
                    baseColor += mix(uMouthColor, uSkinColor, 0.1) * mask.b;
                    baseColor += uSkinColor * skinMask;
                }
            #endif
        #endif

        vec3 colorHsv = rgb2hsv(baseColor);
        vec3 colorShadow = colorHsv;
        colorShadow.r -= 0.02;
        colorShadow.b *= 0.5;
        colorShadow = hsv2rgb(colorShadow);

        const float shadowLimit = 0.15;
        float totalShadow = reflectedLight.directDiffuse.r * _dirShadow * shadowContribution;

        #ifdef HARD_CUT_SHADOW
            float shadowCut = smoothstep(0.1, 0.15, totalShadow);
        #else
            float shadowCut = smoothstep(0.2, 0.4, totalShadow);
        #endif

        outgoingLight = mix(colorShadow, baseColor, shadowCut);

        outgoingLight += smoothstep(0.01, 0.011, reflectedLight.directSpecular) * specularAmount
                       * fit(dot(wNorm, vec3(0.0, 1.0, 0.0)), 0.95, 0.9, 0.0, 1.0);

        outgoingLight += reflectedLight.indirectDiffuse;
    #endif

    float surfaceId = vSurfaceId;

    #ifdef IS_TERRAIN
        if (vElementId == 1) {

            float n1 = sin(height * 0.1
                         + (vLocalNormal.x + vLocalNormal.y + vLocalNormal.z) * 0.5
                         + (wPos.x + wPos.y + wPos.z) * 2.0);
            float striations = texture2D(tNoise, vec2(n1 * 0.01, height * 0.07 - n1 * 0.02)).g;
            striations = step(0.47, striations + triplanarNoise.r * 0.2 + triplanarNoise.g * 0.05);

            outlineContribution *= step(0.3, triplanarNoise.r);

            surfaceId += striations * (1.0 - grassMask);
            surfaceId += grassMask * 0.1;
            surfaceId += wetMask * 0.12;
        }

        outlineContribution *= step(0.13, triplanarNoise.g * triplanarNoise.b);
    #endif

    #if defined(IS_CHARACTER) || defined(IS_NPC)
        float outlineNoise = sinenoise1(lPos * 12.0 + vec3(3.324, 34.2, 56.343) * surfaceId) * 0.5 + 0.5;
        outlineContribution = step(0.3, outlineNoise);

        #ifdef IS_CHARACTER

            if (vIsLocal == 1) {
                vec3 colorWet = rgb2hsv(outgoingLight);
                colorWet.b = max(colorWet.b - 0.1, colorWet.b * 0.75);
                colorWet = hsv2rgb(colorWet);
                outgoingLight = mix(outgoingLight, colorWet,
                    step(lPos.y, uWetHeight + (sin(lPos.x * 30.0) - 1.0) * 0.012));
            }
        #endif
    #endif

    #ifndef NO_FOG
        addFog(outgoingLight, vViewPosition.z);
    #endif

    gl_FragColor = vec4(outgoingLight, surfaceId);

    float packedDepth = 1.0 - (0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5);
    gInfo = vec4(packedDepth, encodeNormalSpheremap(geometryNormal), outlineContribution);
}

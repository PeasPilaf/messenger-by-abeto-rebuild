float efit(float x, float a1, float a2, float b1, float b2) {
    return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1);
}

float fit(float x, float a1, float a2, float b1, float b2) {
    return clamp(efit(x, a1, a2, b1, b2), min(b1, b2), max(b1, b2));
}

float fit01(float x, float a1, float a2) {
    return fit(x, 0.0, 1.0, a1, a2);
}

float fit10(float x, float a1, float a2) {
    return fit(x, 1.0, 0.0, a1, a2);
}

vec3 efit(vec3 x, vec3 a1, vec3 a2, vec3 b1, vec3 b2) {
    return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1);
}

vec3 fit(vec3 x, vec3 a1, vec3 a2, vec3 b1, vec3 b2) {
    return clamp(efit(x, a1, a2, b1, b2), min(b1, b2), max(b1, b2));
}

float linearstep(float begin, float end, float t) {
    return clamp((t - begin) / (end - begin), 0.0, 1.0);
}

float aastep(float threshold, float value) {
    float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
    return smoothstep(threshold - afwidth, threshold + afwidth, value);
}

float luma(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6. * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.);
    return c.z * mix(vec3(1.), rgb, c.y);
}

vec3 brightnessContrast(vec3 color, float brightness, float contrast) {
    return (color - 0.5) * contrast + 0.5 + brightness;
}

vec3 vibrance(vec3 color, float v) {
    float average = (color.r + color.g + color.b) / 3.0;
    float mx = max(color.r, max(color.g, color.b));
    float amt = (mx - average) * (-v * 3.0);
    return mix(color, vec3(mx), amt);
}

float _linstep(float begin, float end, float t) {
    return clamp((t - begin) / (end - begin), 0.0, 1.0);
}

float falloff(float _input, float start, float end, float margin, float progress) {
    float m = margin * sign(end - start);
    float p = mix(start - m, end, progress);
    return _linstep(p + m, p, _input);
}

float falloffsmooth(float _input, float start, float end, float margin, float progress) {
    float m = margin * sign(end - start);
    float p = mix(start - m, end, progress);
    return smoothstep(p + m, p, _input);
}

#define sinlayer(frX, frY, frZ) val += sin(dot(p, vec3(frX, frY, frZ)));

float sinenoise1(vec3 p) {
    float val = 0.0;
    sinlayer(1.5, 3.4598, 1.234);
    sinlayer(3.12, -3.234, 4.221);
    sinlayer(0.355, 2.3, -1.375);
    sinlayer(-0.156, -3.34, -0.4566);
    sinlayer(-4.1235, -0.485, -1.45);
    sinlayer(2.54, -0.879, -2.123);
    return val / 6.0;
}

vec4 triplanar(sampler2D tex, vec3 wNorm, vec3 wPos, float scale) {
    vec3 blend = normalize(abs(wNorm));
    blend /= dot(blend, vec3(1.0));

    vec4 cx = texture2D(tex, wPos.yz * scale) * blend.x;
    vec4 cy = texture2D(tex, wPos.zx * scale) * blend.y;
    vec4 cz = texture2D(tex, wPos.xy * scale) * blend.z;
    return cx + cy + cz;
}

vec2 encodeNormalSpheremap(vec3 n) {
    float f = sqrt(8.0 * n.z + 8.0);
    return n.xy / f * 2.0;
}

vec3 decodeNormalSpheremap(vec2 n) {
    vec4 nn = vec4(n.xy, 1.0, -1.0);
    float l = dot(nn.xyz, -nn.xyw);
    nn.z = l;
    nn.xy *= sqrt(l);
    return nn.xyz * 2.0 + vec3(0.0, 0.0, -1.0);
}

float linearDepthFromInfo(float infoChannelR, float near, float far) {
    float fragCoordZ = 1.0 - infoChannelR;
    float viewZ = perspectiveDepthToViewZ(fragCoordZ, near, far);
    return viewZToOrthographicDepth(viewZ, near, far);
}

float getViewZ(float depth, float near, float far) {
    return perspectiveDepthToViewZ(depth, near, far);
}

float getLinearDepth(float depth, float near, float far) {
    return viewZToOrthographicDepth(getViewZ(depth, near, far), near, far);
}

vec3 getViewPosition(float depth, vec2 uv, float near, float far, mat4 projMat) {
    float viewZ = getViewZ(depth, near, far);
    float clipW = projMat[2][3] * viewZ + projMat[3][3];
    vec4 clipPosition = vec4((vec3(uv, depth) - 0.5) * 2.0, 1.0);
    clipPosition *= clipW;
    return (inverse(projMat) * clipPosition).xyz;
}

uniform vec3 uFogColorNear;
uniform vec3 uFogColorFar;
uniform float uFogDistance;
uniform float uFogDensity;

void addFog(inout vec3 outColor, float distanceAlongView) {
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * distanceAlongView * distanceAlongView);
    float range1 = smoothstep(0.0, uFogDistance, fogFactor);
    float range2 = 1.0 - range1;
    vec3 fogColor = uFogColorNear * range2 + uFogColorFar * range1;
    outColor = mix(outColor, fogColor, fogFactor);
}

#ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp sampler3D;
#else
    precision mediump sampler3D;
#endif

vec3 LUTLinearTosRGB(vec3 value) {
    return mix(pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), value.rgb * 12.92,
               vec3(lessThanEqual(value.rgb, vec3(0.0031308))));
}

vec3 LUTsRGBToLinear(vec3 value) {
    return mix(pow(value.rgb * 0.9478672986 + vec3(0.0521327014), vec3(2.4)),
               value.rgb * 0.0773993808, vec3(lessThanEqual(value.rgb, vec3(0.04045))));
}

vec3 apply3DLUTTetrahedral(vec3 color, sampler3D lutTexture, float lutIntensity) {
    float lutSize = float(textureSize(lutTexture, 0).x);
    float scale = lutSize - 1.0;
    float texelSize = 1.0 / lutSize;

    vec3 col = LUTLinearTosRGB(color);
    vec3 rgb = clamp(col, 0.0, 1.0) * scale;
    vec3 p = floor(rgb);
    vec3 f = rgb - p;

    vec3 v1 = (p + 0.5) * texelSize;
    vec3 v4 = (p + 1.5) * texelSize;
    vec3 v2, v3;
    vec3 frac;

    if (f.r >= f.g) {
        if (f.g > f.b) {
            frac = f.rgb;
            v2 = vec3(v4.x, v1.y, v1.z);
            v3 = vec3(v4.x, v4.y, v1.z);
        } else if (f.r >= f.b) {
            frac = f.rbg;
            v2 = vec3(v4.x, v1.y, v1.z);
            v3 = vec3(v4.x, v1.y, v4.z);
        } else {
            frac = f.brg;
            v2 = vec3(v1.x, v1.y, v4.z);
            v3 = vec3(v4.x, v1.y, v4.z);
        }
    } else {
        if (f.b > f.g) {
            frac = f.bgr;
            v2 = vec3(v1.x, v1.y, v4.z);
            v3 = vec3(v1.x, v4.y, v4.z);
        } else if (f.r >= f.b) {
            frac = f.grb;
            v2 = vec3(v1.x, v4.y, v1.z);
            v3 = vec3(v4.x, v4.y, v1.z);
        } else {
            frac = f.gbr;
            v2 = vec3(v1.x, v4.y, v1.z);
            v3 = vec3(v1.x, v4.y, v4.z);
        }
    }

    vec4 n1 = texture(lutTexture, v1);
    vec4 n2 = texture(lutTexture, v2);
    vec4 n3 = texture(lutTexture, v3);
    vec4 n4 = texture(lutTexture, v4);

    vec4 weights = vec4(1.0 - frac.x, frac.x - frac.y, frac.y - frac.z, frac.z);

    vec4 result = weights * mat4(
        vec4(n1.r, n2.r, n3.r, n4.r),
        vec4(n1.g, n2.g, n3.g, n4.g),
        vec4(n1.b, n2.b, n3.b, n4.b),
        vec4(1.0)
    );

    return LUTsRGBToLinear(mix(col, result.rgb, lutIntensity));
}

float outline(
    sampler2D tColor,
    sampler2D tInfo,
    vec2 uv,
    float outlineWidth,
    float scale,
    vec3 idRange,
    vec3 depthRange,
    vec3 normalRange,
    float rangeSmoothMargin,
    float idMinScale,
    vec2 distanceFadeRange,
    vec2 nearFar,
    inout float nearestDepth,
    inout float centDepth
) {
    vec2 offset = 1.0 / vec2(textureSize(tInfo, 0)) * outlineWidth * scale;

    vec4 cInfo = texture2D(tInfo, uv);
    vec4 lInfo = texture2D(tInfo, uv + offset * vec2(-1.0, 0.0));
    vec4 rInfo = texture2D(tInfo, uv + offset * vec2(1.0, 0.0));
    vec4 dInfo = texture2D(tInfo, uv + offset * vec2(0.0, -1.0));
    vec4 uInfo = texture2D(tInfo, uv + offset * vec2(0.0, 1.0));

    float cId = texture2D(tColor, uv).a;
    float lId = texture2D(tColor, uv + offset * vec2(-1.0, 0.0)).a;
    float rId = texture2D(tColor, uv + offset * vec2(1.0, 0.0)).a;
    float dId = texture2D(tColor, uv + offset * vec2(0.0, -1.0)).a;
    float uId = texture2D(tColor, uv + offset * vec2(0.0, 1.0)).a;

    float cDepth = linearDepthFromInfo(cInfo.r, nearFar.x, nearFar.y);
    float lDepth = linearDepthFromInfo(lInfo.r, nearFar.x, nearFar.y);
    float rDepth = linearDepthFromInfo(rInfo.r, nearFar.x, nearFar.y);
    float dDepth = linearDepthFromInfo(dInfo.r, nearFar.x, nearFar.y);
    float uDepth = linearDepthFromInfo(uInfo.r, nearFar.x, nearFar.y);

    vec3 cNormal = decodeNormalSpheremap(cInfo.gb);
    vec3 lNormal = decodeNormalSpheremap(lInfo.gb);
    vec3 rNormal = decodeNormalSpheremap(rInfo.gb);
    vec3 dNormal = decodeNormalSpheremap(dInfo.gb);
    vec3 uNormal = decodeNormalSpheremap(uInfo.gb);

    float centerContribution = cInfo.a;
    centDepth = cDepth;

    vec2 idVariation = vec2((lId - cId) - (rId - cId), (uId - cId) - (dId - cId));
    vec2 depthVariation = vec2((lDepth - cDepth) - (rDepth - cDepth), (uDepth - cDepth) - (dDepth - cDepth));
    vec2 normalVariation = vec2(distance(lNormal, cNormal) - distance(rNormal, cNormal),
                               distance(uNormal, cNormal) - distance(dNormal, cNormal));

    float idVariationTotal = length(idVariation);
    float depthVariationTotal = length(depthVariation);
    float normalVariationTotal = length(normalVariation);

    float idContribution = fit(fit(idVariationTotal, idRange.x, idRange.y, 0.0, 1.0), idRange.z,
                               idRange.z + rangeSmoothMargin, 0.0, 1.0);
    idContribution = mix(idContribution * idMinScale, idContribution, clamp(scale, 0.0, 1.0));

    float normalContribution = fit(fit(normalVariationTotal, normalRange.x, normalRange.y, 0.0, 1.0),
                                   normalRange.z, normalRange.z + rangeSmoothMargin, 0.0, 1.0);

    float depthLimit = depthRange.z + 1.0 - cNormal.z;
    float depthContribution = fit(fit(depthVariationTotal, depthRange.x, depthRange.y, 0.0, 1.0),
                                  depthLimit, depthLimit + rangeSmoothMargin, 0.0, 1.0);

    float minDepth = cDepth;
    float minContribution = centerContribution;
    if (lDepth < minDepth) { minDepth = lDepth; minContribution = lInfo.a; }
    if (rDepth < minDepth) { minDepth = rDepth; minContribution = rInfo.a; }
    if (dDepth < minDepth) { minDepth = dDepth; minContribution = dInfo.a; }
    if (uDepth < minDepth) { minDepth = uDepth; minContribution = uInfo.a; }

    nearestDepth = minDepth;

    if (minDepth < cDepth) {
        if (minContribution > centerContribution) centerContribution = max(centerContribution, ceil(minContribution));
        else centerContribution = min(centerContribution, floor(minContribution));
    }

    float viewZ = -orthographicDepthToViewZ(minDepth, nearFar.x, nearFar.y);
    centerContribution *= fit(viewZ, distanceFadeRange.x, distanceFadeRange.y, 1.0, 0.0);

    return clamp(idContribution + normalContribution + depthContribution, 0.0, 1.0) * centerContribution;
}

float bicubicW0(float a) { return (1.0 / 6.0) * (a * (a * (-a + 3.0) - 3.0) + 1.0); }
float bicubicW1(float a) { return (1.0 / 6.0) * (a * a * (3.0 * a - 6.0) + 4.0); }
float bicubicW2(float a) { return (1.0 / 6.0) * (a * (a * (-3.0 * a + 3.0) + 3.0) + 1.0); }
float bicubicW3(float a) { return (1.0 / 6.0) * (a * a * a); }
float bicubicG0(float a) { return bicubicW0(a) + bicubicW1(a); }
float bicubicG1(float a) { return bicubicW2(a) + bicubicW3(a); }
float bicubicH0(float a) { return -1.0 + bicubicW1(a) / (bicubicW0(a) + bicubicW1(a)); }
float bicubicH1(float a) { return 1.0 + bicubicW3(a) / (bicubicW2(a) + bicubicW3(a)); }

vec4 bicubic(sampler2D tex, vec2 uv, vec4 texelSize) {
    uv = uv * texelSize.zw + 0.5;
    vec2 iuv = floor(uv);
    vec2 fuv = fract(uv);
    float g0x = bicubicG0(fuv.x);
    float g1x = bicubicG1(fuv.x);
    float h0x = bicubicH0(fuv.x);
    float h1x = bicubicH1(fuv.x);
    float h0y = bicubicH0(fuv.y);
    float h1y = bicubicH1(fuv.y);
    vec2 p0 = (vec2(iuv.x + h0x, iuv.y + h0y) - 0.5) * texelSize.xy;
    vec2 p1 = (vec2(iuv.x + h1x, iuv.y + h0y) - 0.5) * texelSize.xy;
    vec2 p2 = (vec2(iuv.x + h0x, iuv.y + h1y) - 0.5) * texelSize.xy;
    vec2 p3 = (vec2(iuv.x + h1x, iuv.y + h1y) - 0.5) * texelSize.xy;

    return bicubicG0(fuv.y) * (g0x * texture(tex, p0) + g1x * texture(tex, p1))
         + bicubicG1(fuv.y) * (g0x * texture(tex, p2) + g1x * texture(tex, p3));
}

vec4 textureBicubic(sampler2D map, vec2 uv) {
    vec2 fullSize = vec2(textureSize(map, 0));
    vec2 fullSizeInv = 1.0 / fullSize;
    return bicubic(map, uv, vec4(fullSizeInv, fullSize));
}

float parabola(float x, float k) {
    return pow(4.0 * x * (1.0 - x), k);
}

attribute vec2 posnorm;
attribute vec4 texcoord;
attribute vec4 jacobian;
attribute vec4 banding;
attribute vec4 color;
attribute vec3 centr;
attribute vec2 textWeights;

uniform vec2 uResolution;
uniform vec3 uColor;
uniform bool uOverwriteColor;
uniform float uShow;
uniform float uHide;
uniform float uRevealMargin;
uniform bool uReveal;

varying vec2 vTexCoord;
varying vec4 vColor;
flat varying vec4 vBanding;
flat varying ivec4 vGlyph;
flat varying vec3 vCentr;

void GlyphUnpack(vec4 tex, vec4 bnd) {
    uvec2 g = floatBitsToUint(tex.zw);
    vGlyph = ivec4(g.x & 0xFFFFU, g.x >> 16U, g.y & 0xFFFFU, g.y >> 16U);
    vBanding = bnd;
}

vec3 SlugVS(vec4 color, vec2 dim, mat4 mvpMatrix) {
    mat4 mvp_row = transpose(mvpMatrix);
    vec4 m0 = mvp_row[0];
    vec4 m1 = mvp_row[1];
    vec4 m3 = mvp_row[3];
    vec4 pos = vec4(position.xy, posnorm.xy);
    vec4 tex = texcoord;
    vec4 jac = jacobian;
    GlyphUnpack(texcoord, banding);
    vColor = color;

    vec2 n = normalize(pos.zw);
    float s = dot(m3.xy, pos.xy) + m3.w;
    float t = dot(m3.xy, n);

    float u = (s * dot(m0.xy, n) - t * (dot(m0.xy, pos.xy) + m0.w)) * dim.x;
    float v = (s * dot(m1.xy, n) - t * (dot(m1.xy, pos.xy) + m1.w)) * dim.y;

    float s2 = s * s;
    float st = s * t;
    float uv = u * u + v * v;
    vec2 d = pos.zw * (s2 * (st + sqrt(uv)) / (uv - st * st));

    vTexCoord = vec2(tex.x + dot(d, jac.xy), tex.y + dot(d, jac.zw));

    return vec3(pos.xy + d, 0.0);
}

float falloff(float value, float start, float end, float margin, float progress) {
    float m = margin * sign(end - start);
    float p = mix(start - m, end, progress);
    return clamp((value - (p + m)) / (p - (p + m)), 0.0, 1.0);
}

float hash13(vec3 p3) {
    p3 = fract(p3 * .1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vCentr = centr;

    vec3 pos = SlugVS(color, uResolution, projectionMatrix * modelViewMatrix);

    if (uOverwriteColor) vColor.rgb = uColor;

    if (uReveal && (uShow < 1.0 || uHide > 0.0)) {
        float seed = fract(hash13(centr));
        float stepsShow = floor(3.0 + seed * 2.0);
        float trShow = floor(falloff(textWeights.y, 0.0, 1.0, uRevealMargin, uShow) * stepsShow) / stepsShow;
        vTexCoord += vec2(0.0, 1.0) * (1.0 - trShow);

        float stepsHide = floor(2.0 + seed * 2.0);
        float trHide = 1.0 - floor(uHide * (stepsHide + 1.0)) / (stepsHide + 1.0);
        pos -= centr;
        pos *= trHide;
        pos += centr;
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

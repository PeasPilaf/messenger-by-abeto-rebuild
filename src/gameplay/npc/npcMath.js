export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export const lerp = (from, to, alpha) => (1 - alpha) * from + alpha * to;

export const efit = (value, a1, a2, b1, b2) => b1 + ((value - a1) * (b2 - b1)) / (a2 - a1);

export const fit = (value, a1, a2, b1, b2) =>
  efit(clamp(value, Math.min(a1, a2), Math.max(a1, a2)), a1, a2, b1, b2);

export const lerpCoefFPS = (k, ratio = 1) => 1 - Math.pow(1 - k, ratio);

export const parabola = (t, height = 1) => 4 * height * t * (1 - t);

export const lerpFPS = (value, target, k, ratio = 1) => lerp(value, target, lerpCoefFPS(k, ratio));

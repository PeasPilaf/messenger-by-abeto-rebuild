export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return (1 - t) * a + t * b;
}

export function efit(value, inA, inB, outA, outB) {
  return outA + ((value - inA) * (outB - outA)) / (inB - inA);
}

export function fit(value, inA, inB, outA, outB) {
  return efit(clamp(value, Math.min(inA, inB), Math.max(inA, inB)), inA, inB, outA, outB);
}

export function lerpCoefFPS(t, ratio = 1) {
  return 1 - Math.exp(Math.log(1 - t) * ratio);
}

export function lerpFPS(current, target, t, ratio = 1) {
  return lerp(current, target, lerpCoefFPS(t, ratio));
}

export function ratioFromDelta(dt, targetFPS = 60) {
  return clamp(dt, 0, 0.1) * targetFPS;
}

export function timeToConstant(current = 0, target = 1, time = 1, epsilon = 0.001) {
  const constant = target !== 0
    ? time / Math.log(Math.abs(target - current) / epsilon / target)
    : time / Math.log(current / epsilon);
  return Math.max(epsilon, constant);
}

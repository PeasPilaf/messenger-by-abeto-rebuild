import { OrthographicCamera } from 'three';

export const BREAKPOINTS = { width: 1600, height: 800, mobile: 640 };

export const MARGINS = {
  desktop: { left: 50, top: 80, grid: 50, topGrid: 80 },
  small: { left: 30, top: 50, grid: 30, topGrid: 50 },
  mobile: { left: 20, top: 30, grid: 20, topGrid: 30 },
};

export function responsive(width, height) {
  const mobile = width < BREAKPOINTS.mobile || height < BREAKPOINTS.mobile;
  const small = width < BREAKPOINTS.width || height < BREAKPOINTS.height;
  const mode = mobile ? 'mobile' : small ? 'small' : 'desktop';
  return {
    desktop: mode === 'desktop',
    small: mode === 'small',
    mobile: mode === 'mobile',
    mode,
    marginLeft: MARGINS[mode].left,
    marginTop: MARGINS[mode].top,
  };
}

export function createScreenCamera(width, height) {
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 100);
  camera.position.set(width / 2, -height / 2, 10);
  camera.updateProjectionMatrix();
  return camera;
}

export function worldPoint(x, y) {
  return { x, y: -y };
}

export function rectCenter(rect) {
  return { x: rect.x + rect.w / 2, y: -(rect.y + rect.h / 2) };
}

export function makeRect(x, y, w, h) {
  return { x, y, w, h };
}

export function pointInRect(pointX, pointY, rect) {
  return pointX >= rect.x && pointX <= rect.x + rect.w &&
    pointY >= rect.y && pointY <= rect.y + rect.h;
}

export function shadefromColor(color, saturation = -0.3, lightness = -0.2) {
  const out = color.clone ? color.clone() : color;
  return out.offsetHSL(0, saturation, lightness);
}

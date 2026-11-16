import { Raycaster, Vector3 } from 'three';

export const CUSTOMIZE_CAMERA = Object.freeze({
  radius: 3.5,
  phi: Math.PI * 0.5,
  targetHeight: 1.0,
  rayCount: 8,
  rayDistanceFactor: 1.25,
  bias: 0.15 * Math.PI,
  duration: 1.5,
  closeDuration: 1.25,
  touchAmount: 0.35,
});

const UP = new Vector3(0, 1, 0);

export function characterFrame(avatar) {
  const object = avatar.object3D;
  const worldPosition = object.getWorldPosition(new Vector3());
  const forward = new Vector3(0, 0, 1).applyQuaternion(object.getWorldQuaternion(object.quaternion.clone()));
  const yaw = Math.atan2(forward.x, forward.z);
  return { worldPosition, yaw };
}

export function computeCustomizeCameraPose(avatar, { obstacles = [] } = {}) {
  const { radius, targetHeight, rayCount, rayDistanceFactor, bias, duration } = CUSTOMIZE_CAMERA;
  const { worldPosition, yaw } = characterFrame(avatar);
  const target = worldPosition.clone().addScaledVector(UP, targetHeight);
  const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));

  const raycaster = new Raycaster();
  raycaster.far = radius * rayDistanceFactor;
  let freeAngle = -bias;
  for (let index = 0; index < rayCount; index++) {
    const angle = index * ((Math.PI * 2) / rayCount) - bias;
    raycaster.set(target, forward.clone().applyAxisAngle(UP, angle));
    const hits = obstacles.length > 0 ? raycaster.intersectObjects(obstacles, true) : [];
    if (hits.length === 0) {

      freeAngle = angle > 0 ? angle : -bias;
      break;
    }
  }

  const cameraAzimuth = yaw + freeAngle;
  const position = target
    .clone()
    .addScaledVector(new Vector3(Math.sin(cameraAzimuth), 0, Math.cos(cameraAzimuth)), radius);

  const characterYaw = yaw + bias + freeAngle;
  return { position, target, characterYaw, freeAngle, duration };
}

export function frameCamera(camera, avatar, options = {}) {
  const pose = computeCustomizeCameraPose(avatar, options);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  return pose;
}

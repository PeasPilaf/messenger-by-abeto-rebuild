import { Bone, Matrix4, Quaternion, Skeleton, Vector3 } from 'three';

export const BONE_PREFIX = 'bone_';

export function boneName(index) {
  return `${BONE_PREFIX}${index}`;
}

export const JOINT_LABELS = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'clavicle.L', 'upperArm.L', 'forearm.L', 'hand.L',
  'clavicle.R', 'upperArm.R', 'forearm.R', 'hand.R',
  'thigh.L', 'shin.L', 'foot.L', 'toe.L',
  'thigh.R', 'shin.R', 'foot.R', 'toe.R',
];

function typedArray(attribute) {
  if (!attribute) return null;
  return attribute.array ?? attribute;
}

export function readJoints(pointCloud) {
  if (Array.isArray(pointCloud?.joints)) {
    return pointCloud.joints.map((joint) => ({
      position: joint.position,
      quaternion: joint.quaternion,
      scale: joint.scale,
      parent: joint.parent,
    }));
  }

  const attributes = pointCloud?.attributes ?? pointCloud;
  const position = typedArray(attributes?.position);
  const quaternion = typedArray(attributes?.quaternion);
  const scale = typedArray(attributes?.scale);
  const hierarchy = typedArray(attributes?.hierarchy);
  if (!position || !quaternion || !scale) {
    throw new Error('SkeletonBuilder: point cloud needs position, quaternion and scale');
  }
  const jointCount = position.length / 3;
  if (jointCount !== quaternion.length / 4 || jointCount !== scale.length / 3) {
    throw new Error('SkeletonBuilder: position/quaternion/scale counts disagree');
  }

  const joints = [];
  for (let index = 0; index < jointCount; index++) {
    joints.push({
      position: new Vector3().fromArray(position, index * 3),

      quaternion: new Quaternion().fromArray(quaternion, index * 4).normalize(),
      scale: new Vector3().fromArray(scale, index * 3),

      parent: hierarchy ? hierarchy[index] - 1 : -1,
    });
  }
  return joints;
}

export function buildSkeleton(pointCloud, { name = 'avatar' } = {}) {
  const joints = readJoints(pointCloud);
  if (joints.length === 0) throw new Error(`SkeletonBuilder: ${name} has no joints`);

  const bones = joints.map((joint, index) => {
    const parent = joint.parent;
    if (parent !== -1 && (parent < 0 || parent >= index)) {
      throw new Error(
        `SkeletonBuilder: ${name} joint ${index} has parent ${parent}; ` +
          'the point cloud is not parent-first, a single pass cannot build it',
      );
    }
    const bone = new Bone();
    bone.name = boneName(index);
    bone.position.copy(joint.position);
    bone.quaternion.copy(joint.quaternion);
    bone.scale.copy(joint.scale);
    return bone;
  });
  for (let index = 0; index < bones.length; index++) {
    const parent = joints[index].parent;
    if (parent !== -1) bones[parent].add(bones[index]);
  }
  const rootBones = bones.filter((bone) => bone.parent === null);

  const localMatrix = new Matrix4();
  const bindMatrices = [];
  for (let index = 0; index < joints.length; index++) {
    const joint = joints[index];
    localMatrix.compose(joint.position, joint.quaternion, joint.scale);
    const world = new Matrix4();
    if (joint.parent === -1) world.copy(localMatrix);
    else world.multiplyMatrices(bindMatrices[joint.parent], localMatrix);
    bindMatrices.push(world);
  }
  const inverseBindMatrices = bindMatrices.map((matrix) => matrix.clone().invert());

  const skeleton = new Skeleton(bones, inverseBindMatrices);

  return {
    skeleton,
    bones,
    rootBones,
    jointCount: bones.length,
    jointLabels: JOINT_LABELS.slice(0, bones.length),
    bindMatrices,
    inverseBindMatrices,
  };
}

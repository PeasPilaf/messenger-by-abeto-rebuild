import {
  AnimationClip,
  InterpolateLinear,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';

import { boneName } from './SkeletonBuilder.js';

function typedArray(attribute) {
  if (!attribute) return null;
  return attribute.array ?? attribute;
}

export function readAnimation(animation, name = 'clip') {
  if (Array.isArray(animation?.tracks)) {
    const tracks = animation.tracks;
    const jointCount = animation.jointCount ?? animation.joints ?? tracks.length;
    const fps = animation.fps;
    const frames = animation.frames;
    if (!Number.isFinite(fps) || !Number.isFinite(frames) || frames <= 0) {
      throw new Error(`AnimationBuilder: "${name}" has no fps/frames`);
    }
    return { fps, frames, jointCount, tracks, duration: frames / fps };
  }

  const attributes = animation?.attributes ?? animation;
  const position = typedArray(attributes?.position);
  const quaternion = typedArray(attributes?.quaternion);
  const scale = typedArray(attributes?.scale);
  const info = animation?.info ?? animation?.userData ?? {};
  const fps = info.fps;
  const frames = info.frames;
  if (!position || !quaternion || !scale) {
    throw new Error(`AnimationBuilder: "${name}" needs position/quaternion/scale`);
  }
  if (!Number.isFinite(fps) || !Number.isFinite(frames) || frames <= 0) {
    throw new Error(`AnimationBuilder: "${name}" point cloud has no { fps, frames } userData`);
  }

  const pointCount = position.length / 3;
  if (pointCount % frames !== 0) {
    throw new Error(
      `AnimationBuilder: "${name}" has ${pointCount} points, not a multiple of ${frames} frames`,
    );
  }
  const jointCount = pointCount / frames;

  const tracks = new Array(jointCount);
  for (let joint = 0; joint < jointCount; joint++) {
    tracks[joint] = {
      position: new Float32Array(frames * 3),
      quaternion: new Float32Array(frames * 4),
      scale: new Float32Array(frames * 3),
    };
  }
  const rotation = new Quaternion();
  for (let frame = 0; frame < frames; frame++) {
    const frameBase = frame * jointCount;
    for (let joint = 0; joint < jointCount; joint++) {
      const source = (frameBase + joint);
      const track = tracks[joint];
      for (let component = 0; component < 3; component++) {
        track.position[frame * 3 + component] = position[source * 3 + component];
        track.scale[frame * 3 + component] = scale[source * 3 + component];
      }
      rotation.fromArray(quaternion, source * 4).normalize();
      track.quaternion[frame * 4 + 0] = rotation.x;
      track.quaternion[frame * 4 + 1] = rotation.y;
      track.quaternion[frame * 4 + 2] = rotation.z;
      track.quaternion[frame * 4 + 3] = rotation.w;
    }
  }
  return { fps, frames, jointCount, tracks, duration: frames / fps };
}

export function buildClip(name, animation) {
  const { fps, frames, jointCount, tracks, duration } = readAnimation(animation, name);

  const times = new Float32Array(frames);
  const spacing = frames > 1 ? duration / (frames - 1) : 0;
  for (let frame = 0; frame < frames; frame++) times[frame] = frame * spacing;

  const keyframeTracks = [];
  const rotation = new Quaternion();
  for (let joint = 0; joint < jointCount; joint++) {
    const track = tracks[joint];
    const bone = boneName(joint);

    keyframeTracks.push(
      new VectorKeyframeTrack(`${bone}.position`, times, Float32Array.from(track.position), InterpolateLinear),
    );

    const quaternions = new Float32Array(frames * 4);
    for (let frame = 0; frame < frames; frame++) {
      rotation.fromArray(track.quaternion, frame * 4).normalize();
      quaternions[frame * 4 + 0] = rotation.x;
      quaternions[frame * 4 + 1] = rotation.y;
      quaternions[frame * 4 + 2] = rotation.z;
      quaternions[frame * 4 + 3] = rotation.w;
    }
    keyframeTracks.push(
      new QuaternionKeyframeTrack(`${bone}.quaternion`, times, quaternions, InterpolateLinear),
    );

    keyframeTracks.push(
      new VectorKeyframeTrack(`${bone}.scale`, times, Float32Array.from(track.scale), InterpolateLinear),
    );
  }

  const clip = new AnimationClip(name, duration, keyframeTracks);
  clip.userData = { fps, frames, jointCount };
  return clip;
}

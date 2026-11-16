import * as THREE from 'three';

import { events } from '../core/Events.js';
import { CUSTOMIZE_CAMERA, computeCustomizeCameraPose } from '../gameplay/avatar/CustomizeScreen.js';
import { CustomizeScreen } from '../gameplay/avatar/CustomizeScreen.js';

export class CustomizeController {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.screen = null;
    this.pose = null;
    this._wasInputEnabled = true;
  }

  init() {
    const player = this.game.player;
    this.screen = new CustomizeScreen({
      avatar: player.avatar,
      scene: this.game.present.scene,
      screenHeight: () => window.innerHeight,
      screenWidth: () => window.innerWidth,
      onSelectionChanged: () => {  },
      onClose: () => this.close(),
    });
    events.on('character_change_traits_show', () => this.open());
    events.on('character_change_traits_hide', () => this.close());
    events.on('keydown', (event) => {
      if (this.isOpen && event.code === 'Escape') this.close();
    });
    return this;
  }

  open() {
    if (this.isOpen || !this.screen) return;
    this.isOpen = true;
    const { player, present } = this.game;

    this._wasInputEnabled = player.input._enabled !== false;
    player.input.disable();
    player.setInteracting(true);
    events.emit('character_change_traits_shown');

    this.screen.show();

    this.pose = computeCustomizeCameraPose(player.avatar, { obstacles: [present.water.mesh] });
    this._blend = 0;
    this._fromPosition = player.camera.position.clone();
    this._fromTarget = player.camera.baseTarget.clone();
    this._faceCamera(this.pose.characterYaw);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    const { player } = this.game;
    this.screen.hide();
    player.avatar.object3D.rotation.y = 0;

    player.camera.follow(player.controller);
    player.unlockCamera(1.25);
    player.setInteracting(false);
    if (this._wasInputEnabled) player.input.enable();
    events.emit('character_change_traits_hiddden');
  }

  update(deltaSeconds) {
    if (!this.isOpen) return;
    const camera = this.game.player.camera;
    const duration = CUSTOMIZE_CAMERA.duration ?? 1.5;
    this._blend = Math.min(1, (this._blend ?? 1) + deltaSeconds / duration);
    const t = this._blend;
    camera.position.lerpVectors(this._fromPosition, this.pose.position, t);
    const target = new THREE.Vector3().lerpVectors(this._fromTarget, this.pose.target, t);
    camera.lookAt(target);
    camera.updateMatrixWorld();

    camera.basePosition.copy(camera.position);
    camera.baseTarget.copy(target);
    this.screen.update(deltaSeconds, camera);
  }

  handlePointer(x, y) {
    if (!this.isOpen) return false;
    const canvas = this.game.app.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    );
    const index = this.screen.pick(this.game.player.camera, ndc);
    if (index == null) return true;
    if (index === 8) this.close();
    else this.screen.activate(index);
    return true;
  }

  _faceCamera(worldYaw) {
    const object = this.game.player.object;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(object.quaternion);
    const objectYaw = Math.atan2(forward.x, forward.z);
    this.game.player.avatar.object3D.rotation.y = worldYaw - objectYaw;
  }
}

import { events } from '../core/Events.js';
import { createTween, wait } from '../core/Tween.js';

export class FirstRun {
  constructor(game) {
    this.game = game;
  }

  start() {
    const { player, quests } = this.game;
    const camera = player.camera;
    const character = player.position.clone().addScaledVector(player.up, 2);

    camera.overwriteTarget.copy(character);
    camera.overwriteSpherical.radius = 12;
    camera.overwriteSpherical.phi = camera.spherical.phi;
    camera.overwriteSpherical.theta = camera.spherical.theta;
    camera.overwriteAmount = 1;
    const firstRun = !quests?.anyStepInitiated;
    const duration = firstRun ? 2 : 3.25;
    createTween(camera, { to: { overwriteAmount: 0 }, duration, ease: 'inOut1' });

    wait(duration + 0.25).then(() => this.run(firstRun));
  }

  async run(firstRun) {
    const { player } = this.game;
    if (firstRun) {
      player.input.disable();
      player.setInteracting(true);
      player.lockCameraOnSelf(2.5);
      await wait(0.5);

      const lines = [
        "Looks like I slept in... I better start today's deliveries.",
        "I've got five on the list. Hopefully they're easy to find.",
        'Alright, I better get going.',
      ];
      for (const line of lines) {
        events.emit('npc_dialog_open', 'intro', line,
          { name: 'MESSENGER', color: '#66bde6' },
          { bubblesEnabled: false });
        await this.waitForEvent('npc_force_next_dialog', (id) => id === 'intro', 120000);
      }
      events.emit('npc_dialog_close', 'intro');
      await wait(0.4);
      player.unlockCamera(2.25);
      player.input.enable();
      player.setInteracting(false);
    }
    events.emit('ui_show_sideicons');
  }

  waitForEvent(name, predicate = () => true, timeoutMs = 60000) {
    return new Promise((resolve) => {
      const handler = (...args) => {
        if (!predicate(...args)) return;
        events.off(name, handler);
        clearTimeout(timer);
        resolve(args);
      };
      const timer = setTimeout(() => {
        events.off(name, handler);
        resolve(null);
      }, timeoutMs);
      events.on(name, handler);
    });
  }
}

export function wireDialogueCamera({ player, npcs }) {
  events.on('npc_dialog_open', (id, text, data = {}, options = {}) => {
    if (options?.bubblesEnabled) return;
    if (id === 'intro') return;
    const actor = npcs.getActor(id);
    if (!actor) return;
    player.setInteracting(true);
    player.input.disable();
    player.lockCameraOnNpc(actor, 1.5);
  });
  const release = () => {
    if (!player.interacting) return;
    player.setInteracting(false);
    player.unlockCamera(1.25);
    player.input.enable();
  };
  events.on('npc_dialog_hidden', release);
  events.on('npc_dialog_interrupted', release);
}

export function wirePointerInput({ app, uiLayer, npcs, customize = null }) {
  const canvas = app.renderer.domElement;
  const local = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const isCanvas = (event) => event.target === canvas;

  window.addEventListener('pointerdown', (event) => {
    if (!isCanvas(event)) return;
    const { x, y } = local(event);
    if (uiLayer.handlePointerDown(x, y)) {
      event.stopPropagation();
      return;
    }

    if (customize?.handlePointer(x, y)) {
      event.stopPropagation();
      return;
    }
    npcs.handleClick({ x, y, element: canvas });
  }, true);

  window.addEventListener('pointermove', (event) => {
    if (!isCanvas(event)) return;
    const { x, y } = local(event);
    const overUi = uiLayer.input.hovered !== null;
    uiLayer.handlePointerMove(x, y);
    if (!overUi) npcs.handleHover({ x, y, element: canvas });
  }, true);

  window.addEventListener('pointerup', (event) => {
    if (!isCanvas(event)) return;
    const { x, y } = local(event);
    if (uiLayer.handlePointerUp(x, y)) event.stopPropagation();
  }, true);
}

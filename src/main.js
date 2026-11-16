import { Game } from './game/Game.js';

const game = new Game();

window.__game = game;

game.start().catch((error) => {

  console.error('[messenger] boot failed', error);
  document.body.insertAdjacentHTML('beforeend',
    `<pre style="position:fixed;left:12px;bottom:12px;max-width:80vw;color:#900;font:12px monospace;white-space:pre-wrap">${String(error?.stack || error)}</pre>`);
});

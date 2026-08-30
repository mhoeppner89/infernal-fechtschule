import { GameController } from './app/controller.js';

const canvas = document.getElementById('game-canvas');
const controls = document.getElementById('touch-controls');
if (!(canvas instanceof HTMLCanvasElement) || !(controls instanceof HTMLElement)) {
  throw new Error('The game shell is incomplete.');
}

const controller = new GameController(canvas, controls);

Object.assign(window, {
  __FECHTSCHULE__: {
    controller,
    snapshot: () => controller.getSnapshot()
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

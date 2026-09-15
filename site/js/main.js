import { GameController } from './app/controller.js';
const canvas = document.getElementById('game-canvas');
const controls = document.getElementById('touch-controls');
if (!(canvas instanceof HTMLCanvasElement) || !(controls instanceof HTMLElement)) {
    throw new Error('The game shell is incomplete.');
}
const controller = new GameController(canvas, controls);
Object.assign(window, {
    advanceTime: (milliseconds) => controller.advanceTime(milliseconds),
    render_game_to_text: () => controller.renderGameToText(),
    __FECHTSCHULE__: {
        controller,
        snapshot: () => controller.getSnapshot(),
        advanceTime: (milliseconds) => controller.advanceTime(milliseconds),
        renderGameToText: () => controller.renderGameToText()
    }
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        void navigator.serviceWorker.register('./sw.js').then((registration) => {
            // A deploy updates the worker in the background while a tab may stay
            // open for days. When the new worker takes over, reload once so the
            // tab actually runs the deployed build instead of its cached one —
            // but never mid-run; the next title visit picks it up instead.
            registration.addEventListener('updatefound', () => {
                registration.installing?.addEventListener('statechange', (event) => {
                    const worker = event.target;
                    const idle = !window.__FECHTSCHULE__?.controller?.world;
                    if (worker.state === 'activated' && navigator.serviceWorker.controller && idle)
                        location.reload();
                });
            });
        }).catch(() => undefined);
    });
}
//# sourceMappingURL=main.js.map
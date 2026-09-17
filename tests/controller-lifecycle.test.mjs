import test from 'node:test';
import assert from 'node:assert/strict';
import { GameController, interpolateGuestSnapshot } from '../site/js/app/controller.js';
import { titleSnapshot } from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

test('guest camera interpolates retreat as well as advance without mutating packets', () => {
  const previous = { ...titleSnapshot(), tick: 10, cameraX: 180 };
  const latest = { ...titleSnapshot(), tick: 13, cameraX: 80 };
  const midpoint = interpolateGuestSnapshot(previous, latest, 0.025, 0.05);
  assert.equal(midpoint.cameraX, 130);
  assert.equal(previous.cameraX, 180);
  assert.equal(latest.cameraX, 80);
});

test('paused animation frame renders with zero elapsed time', () => {
  const original = globalThis.requestAnimationFrame;
  const drawn = [];
  globalThis.requestAnimationFrame = () => 1;
  try {
    const controller = Object.assign(Object.create(GameController.prototype), {
      running: true, manualClock: false, paused: true, lastFrameTime: 0,
      input: { sample: () => ({ ...NEUTRAL_INPUT }) }, pendingLocal: { ...NEUTRAL_INPUT },
      renderCurrentSnapshot: dt => drawn.push(dt)
    });
    controller.frame(16.67);
    assert.deepEqual(drawn, [0]);
  } finally { globalThis.requestAnimationFrame = original; }
});

test('backgrounding a host pauses once and informs its peer', () => {
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  const listeners = {}, pauses = [], messages = [];
  globalThis.document = { hidden: true, addEventListener: (name, callback) => { listeners[name] = callback; } };
  globalThis.window = { addEventListener: () => undefined };
  try {
    const controller = Object.assign(Object.create(GameController.prototype), {
      mode: 'host', paused: false,
      peer: { send: message => messages.push(message) },
      setPaused(value) { this.paused = value; pauses.push(value); }
    });
    controller.bindLifecycle(); listeners.visibilitychange(); listeners.visibilitychange();
    assert.deepEqual(pauses, [true]);
    assert.deepEqual(messages, [{ type: 'pause', paused: true }]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

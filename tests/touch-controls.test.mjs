import test from 'node:test';
import assert from 'node:assert/strict';

import { InputHub } from '../site/js/input/input.js';
import { TouchControls } from '../site/js/input/touch.js';

class FakeClassList {
  values = new Set();
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
}

class FakeElement {
  constructor(button) {
    this.dataset = button ? { button } : {};
  }

  listeners = new Map();
  classList = new FakeClassList();

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  setPointerCapture() {}

  emit(type, properties = {}) {
    const event = {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      preventDefault() {},
      ...properties
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeRoot extends FakeElement {
  constructor(buttons) {
    super();
    this.buttons = buttons;
  }

  querySelector() { return null; }
  querySelectorAll(selector) { return selector === '[data-button]' ? this.buttons : []; }
}

test('short touch taps are latched once and distinct buttons remain multitouch-safe', () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { matchMedia: () => ({ matches: true }) }
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { maxTouchPoints: 5 }
  });

  try {
    const duck = new FakeElement('mobility');
    const light = new FakeElement('light');
    const controls = new TouchControls(new FakeRoot([duck, light]));

    // Both taps finish before a sample, matching a quick Duck -> Light input.
    duck.emit('pointerdown', { pointerId: 11 });
    duck.emit('pointerup', { pointerId: 11 });
    light.emit('pointerdown', { pointerId: 12 });
    light.emit('pointerup', { pointerId: 12 });
    assert.equal(controls.consumePressed('mobility'), true);
    assert.equal(controls.consumePressed('light'), true);
    assert.equal(controls.consumePressed('mobility'), false);
    assert.equal(controls.consumePressed('light'), false);

    duck.emit('pointerdown', { pointerId: 21 });
    light.emit('pointerdown', { pointerId: 22 });
    assert.equal(controls.isHeld('mobility'), true);
    assert.equal(controls.isHeld('light'), true);
    duck.emit('pointerup', { pointerId: 21 });
    assert.equal(controls.isHeld('mobility'), false);
    assert.equal(controls.isHeld('light'), true);
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else delete globalThis.window;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

test('Duck only modifies an Attack edge when Duck was pressed first', () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia: () => ({ matches: true }),
      addEventListener() {}
    }
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { maxTouchPoints: 5 }
  });

  try {
    const duck = new FakeElement('mobility');
    const light = new FakeElement('light');
    const input = new InputHub(new FakeRoot([duck, light]));

    light.emit('pointerdown', { pointerId: 31 });
    light.emit('pointerup', { pointerId: 31 });
    duck.emit('pointerdown', { pointerId: 32 });
    duck.emit('pointerup', { pointerId: 32 });
    const attackFirst = input.sample(1 / 60);
    assert.equal(attackFirst.lightPressed, true);
    assert.equal(attackFirst.mobilityPressed, false);

    input.reset();
    duck.emit('pointerdown', { pointerId: 41 });
    duck.emit('pointerup', { pointerId: 41 });
    light.emit('pointerdown', { pointerId: 42 });
    light.emit('pointerup', { pointerId: 42 });
    const duckFirst = input.sample(1 / 60);
    assert.equal(duckFirst.mobilityPressed, true);
    assert.equal(duckFirst.lightPressed, true);
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else delete globalThis.window;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

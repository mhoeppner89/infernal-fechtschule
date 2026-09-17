import test from 'node:test';
import assert from 'node:assert/strict';

import { InputHub } from '../site/js/input/input.js';
import { TouchControls } from '../site/js/input/touch.js';

class FakeClassList {
  values = new Set();

  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(button, tagName = 'button', rect = { left: 0, top: 0, width: 120, height: 120 }) {
    this.dataset = button ? { button } : {};
    this.tagName = tagName.toUpperCase();
    this.rect = rect;
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.style = {};
    this.captureIds = new Set();
    this.closestResult = null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  setPointerCapture(pointerId) { this.captureIds.add(pointerId); }
  getBoundingClientRect() { return this.rect; }
  closest() { return this.closestResult; }
  matches(selector) {
    return selector.split(', ').some((entry) => entry === this.tagName.toLowerCase() || entry === 'button' && this.tagName === 'BUTTON');
  }
  focus() {}

  emit(type, properties = {}) {
    let defaultPrevented = false;
    const event = {
      type,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      preventDefault() { defaultPrevented = true; },
      ...properties
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return { ...event, defaultPrevented };
  }
}

class FakeRoot extends FakeElement {
  constructor(buttons, joystick = null, knob = null) {
    super(undefined, 'div');
    this.buttons = buttons;
    this.joystick = joystick;
    this.knob = knob;
  }

  querySelector(selector) {
    if (selector === '[data-control="joystick"]') return this.joystick;
    if (selector === '[data-control="joystick-knob"]') return this.knob;
    return null;
  }

  querySelectorAll(selector) {
    return selector === '[data-button]' ? this.buttons : [];
  }
}

class FakeWindow {
  constructor() {
    this.listeners = new Map();
    this.orientation = 0;
  }

  matchMedia() { return { matches: true }; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  emit(type, properties = {}) {
    let defaultPrevented = false;
    const event = {
      type,
      code: '',
      repeat: false,
      preventDefault() { defaultPrevented = true; },
      stopImmediatePropagation() {},
      ...properties
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return { ...event, defaultPrevented };
  }
}

function installGlobals({ document = undefined } = {}) {
  const descriptors = new Map();
  const fakeWindow = new FakeWindow();
  const values = { window: fakeWindow, navigator: { maxTouchPoints: 5 } };
  if (document !== undefined) values.document = document;
  for (const [name, value] of Object.entries(values)) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  return () => {
    for (const name of Object.keys(values)) {
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

function installDocument({ mode = 'game', activeElement = null, overlayOpen = false } = {}) {
  return {
    body: { dataset: { mode } },
    hidden: false,
    activeElement,
    addEventListener() {},
    querySelector(selector) {
      return selector === '.modal-overlay:not(.is-hidden)' && overlayOpen ? {} : null;
    }
  };
}

test('short taps latch once and action ownership is reference-counted per pointer', () => {
  const restore = installGlobals();
  try {
    const step = new FakeElement('mobility');
    const cut = new FakeElement('light');
    const controls = new TouchControls(new FakeRoot([step, cut]));

    // Both taps finish before a sample, matching a quick STEP -> CUT input.
    step.emit('pointerdown', { pointerId: 11 });
    step.emit('pointerup', { pointerId: 11 });
    cut.emit('pointerdown', { pointerId: 12 });
    cut.emit('pointerup', { pointerId: 12 });
    assert.equal(controls.consumePressed('mobility'), true);
    assert.equal(controls.consumePressed('light'), true);
    assert.equal(controls.consumePressed('mobility'), false);
    assert.equal(controls.consumePressed('light'), false);

    // Two fingers can hold one action. Releasing either one leaves it held.
    cut.emit('pointerdown', { pointerId: 21 });
    cut.emit('pointerdown', { pointerId: 22 });
    assert.equal(controls.isHeld('light'), true);
    cut.emit('pointerup', { pointerId: 21 });
    assert.equal(controls.isHeld('light'), true);
    assert.equal(cut.classList.contains('is-held'), true);
    cut.emit('pointerup', { pointerId: 22 });
    assert.equal(controls.isHeld('light'), false);
    assert.equal(cut.classList.contains('is-held'), false);
  } finally {
    restore();
  }
});

test('the first stick pointer owns the origin and joystick geometry is dynamic', () => {
  const restore = installGlobals();
  try {
    const joystick = new FakeElement(undefined, 'div', { left: 10, top: 20, width: 180, height: 140 });
    const knob = new FakeElement(undefined, 'div', { left: 0, top: 0, width: 42, height: 42 });
    const controls = new TouchControls(new FakeRoot([], joystick, knob));

    joystick.emit('pointerdown', { pointerId: 31, clientX: 100, clientY: 90 });
    joystick.emit('pointermove', { pointerId: 31, clientX: 178, clientY: 90 });
    const ownedX = controls.moveX;
    assert.ok(ownedX > 0.9 && ownedX <= 1);

    // A secondary touch on the stick is ignored instead of resetting the
    // origin or stealing movement from the first finger.
    joystick.emit('pointerdown', { pointerId: 32, clientX: 100, clientY: 90 });
    joystick.emit('pointermove', { pointerId: 32, clientX: 22, clientY: 90 });
    assert.equal(controls.moveX, ownedX);
    joystick.emit('pointerup', { pointerId: 32 });
    assert.equal(controls.moveX, ownedX);

    joystick.emit('lostpointercapture', { pointerId: 31 });
    assert.equal(controls.moveX, 0);
    assert.equal(controls.moveZ, 0);
  } finally {
    restore();
  }
});

test('reset releases visual and logical state after blur, cancel, or rotation', () => {
  const restore = installGlobals();
  try {
    const guard = new FakeElement('guard');
    const joystick = new FakeElement(undefined, 'div');
    const knob = new FakeElement(undefined, 'div', { left: 0, top: 0, width: 42, height: 42 });
    const controls = new TouchControls(new FakeRoot([guard], joystick, knob));
    guard.emit('pointerdown', { pointerId: 41 });
    joystick.emit('pointerdown', { pointerId: 42, clientX: 60, clientY: 60 });
    assert.equal(controls.isHeld('guard'), true);

    controls.reset();
    assert.equal(controls.isHeld('guard'), false);
    assert.equal(guard.classList.contains('is-held'), false);
    assert.equal(controls.moveX, 0);
    assert.equal(controls.moveZ, 0);
    guard.emit('pointerup', { pointerId: 41 });
    assert.equal(controls.isHeld('guard'), false);
  } finally {
    restore();
  }
});

test('STEP then CUT and CUT then STEP preserve physical press order', () => {
  const restore = installGlobals();
  try {
    const step = new FakeElement('mobility');
    const cut = new FakeElement('light');
    const input = new InputHub(new FakeRoot([step, cut]));

    cut.emit('pointerdown', { pointerId: 51 });
    cut.emit('pointerup', { pointerId: 51 });
    step.emit('pointerdown', { pointerId: 52 });
    step.emit('pointerup', { pointerId: 52 });
    const cutFirst = input.sample(1 / 60);
    assert.equal(cutFirst.lightPressed, true);
    assert.equal(cutFirst.mobilityPressed, false);

    input.reset();
    step.emit('pointerdown', { pointerId: 61 });
    step.emit('pointerup', { pointerId: 61 });
    cut.emit('pointerdown', { pointerId: 62 });
    cut.emit('pointerup', { pointerId: 62 });
    const stepFirst = input.sample(1 / 60);
    assert.equal(stepFirst.mobilityPressed, true);
    assert.equal(stepFirst.lightPressed, true);
  } finally {
    restore();
  }
});

test('focused form controls and open overlays do not record gameplay input', () => {
  const inputField = new FakeElement(undefined, 'input');
  const fakeDocument = installDocument({ activeElement: inputField });
  const oldHtmlElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: FakeElement });
  const restore = installGlobals({ document: fakeDocument });
  try {
    const cut = new FakeElement('light');
    const input = new InputHub(new FakeRoot([cut]));

    cut.emit('pointerdown', { pointerId: 71 });
    cut.emit('pointerup', { pointerId: 71 });
    assert.deepEqual(input.sample(1 / 60), {
      moveX: 0,
      moveZ: 0,
      lightPressed: false,
      heavyPressed: false,
      mobilityPressed: false,
      switchPressed: false,
      guardHeld: false,
      guardPressed: false
    });

    fakeDocument.activeElement = null;
    fakeDocument.querySelector = (selector) => selector === '.modal-overlay:not(.is-hidden)' ? {} : null;
    cut.emit('pointerdown', { pointerId: 72 });
    cut.emit('pointerup', { pointerId: 72 });
    assert.equal(input.sample(1 / 60).lightPressed, false);
  } finally {
    restore();
    if (oldHtmlElement) Object.defineProperty(globalThis, 'HTMLElement', oldHtmlElement);
    else delete globalThis.HTMLElement;
  }
});

test('an owned stick overrides tilt until its pointer is released', () => {
  const restore = installGlobals({ document: installDocument() });
  try {
    const stick = new FakeElement(undefined, 'div', { left:0, top:0, width:120, height:120 });
    const knob = new FakeElement(undefined, 'div', { left:40, top:40, width:40, height:40 });
    const hub = new InputHub(new FakeRoot([], stick, knob));
    hub.tilt.enabled = true;
    hub.tilt.sample = () => ({ x:-1, z:0 });
    stick.emit('pointerdown', { pointerId:11, clientX:98, clientY:60 });
    assert.equal(hub.touch.hasMovementPointer, true);
    assert.ok(hub.sample(1/60).moveX > .9);
    stick.emit('pointerup', { pointerId:11 });
    assert.equal(hub.touch.hasMovementPointer, false);
    assert.equal(hub.sample(1/60).moveX, -1);
  } finally { restore(); }
});

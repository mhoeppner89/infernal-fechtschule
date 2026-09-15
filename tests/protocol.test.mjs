import test from 'node:test';
import assert from 'node:assert/strict';
import { isPeerMessage } from '../site/js/network/protocol.js';
import { GameWorld } from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

test('peer input validation rejects malformed axes and missing booleans', () => {
  assert.equal(isPeerMessage({ type: 'input', seq: 1, frame: { ...NEUTRAL_INPUT, moveX: 0.5 } }), true);
  assert.equal(isPeerMessage({ type: 'input', seq: 1, frame: { ...NEUTRAL_INPUT, moveX: Number.NaN } }), false);
  assert.equal(isPeerMessage({ type: 'input', seq: 1, frame: { ...NEUTRAL_INPUT, moveZ: 9 } }), false);
  assert.equal(isPeerMessage({ type: 'input', seq: -1, frame: NEUTRAL_INPUT }), false);
  assert.equal(isPeerMessage({ type: 'input', seq: 1, frame: { moveX: 0, moveZ: 0 } }), false);
});

test('network protocol and snapshot schema reject stale version 1 peers', () => {
  const world = new GameWorld({ playerCount: 1, seed: 98, skipCountdown: true });
  world.step(1 / 60, [NEUTRAL_INPUT]);
  const snapshot = world.snapshot();
  assert.equal(isPeerMessage({ type: 'hello', protocol: 2 }), true);
  assert.equal(isPeerMessage({ type: 'hello', protocol: 1 }), false);
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot }), true);
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot: { ...snapshot, version: 1 } }), false);
});

test('authoritative snapshots pass validation and malformed snapshots fail', () => {
  const world = new GameWorld({ playerCount: 2, seed: 99, skipCountdown: true });
  for (let index = 0; index < 120; index += 1) world.step(1 / 60, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
  const snapshot = world.snapshot();
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot }), true);
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot: { ...snapshot, actors: [{ id: 1, x: Number.NaN }] } }), false);
});

test('snapshot validation accepts crouching and exact hit zones only', () => {
  const world = new GameWorld({ playerCount: 1, seed: 101, skipCountdown: true });
  world.step(1 / 60, [NEUTRAL_INPUT]);
  const snapshot = world.snapshot();
  const actor = snapshot.actors[0];

  for (const reactionZone of [null, 'head', 'torso', 'legs']) {
    const zoned = { ...snapshot, actors: [{ ...actor, state: 'crouch', reactionZone }] };
    assert.equal(isPeerMessage({ type: 'snapshot', snapshot: zoned }), true);
  }

  assert.equal(isPeerMessage({
    type: 'snapshot',
    snapshot: { ...snapshot, actors: [{ ...actor, reactionZone: 'hands' }] }
  }), false);
  const { reactionZone: _omitted, ...withoutReactionZone } = actor;
  assert.equal(isPeerMessage({
    type: 'snapshot',
    snapshot: { ...snapshot, actors: [withoutReactionZone] }
  }), false);
});

test('lesson and start messages are range checked', () => {
  assert.equal(isPeerMessage({ type: 'lesson', id: 'ls-crossing' }), true);
  assert.equal(isPeerMessage({ type: 'lesson', id: 'unbounded-power' }), false);
  assert.equal(isPeerMessage({ type: 'start', seed: 42 }), true);
  assert.equal(isPeerMessage({ type: 'start', seed: -42 }), false);
});

test('pause messages require an explicit boolean state', () => {
  assert.equal(isPeerMessage({ type: 'pause', paused: true }), true);
  assert.equal(isPeerMessage({ type: 'pause', paused: 'yes' }), false);
});

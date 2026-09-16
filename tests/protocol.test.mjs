import test from 'node:test';
import assert from 'node:assert/strict';
import { PEER_PROTOCOL_VERSION, isPeerMessage } from '../site/js/network/protocol.js';
import { GameWorld } from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

test('peer input validation rejects malformed axes and missing booleans', () => {
  assert.equal(isPeerMessage({ type: 'input', seq: 1, frame: { ...NEUTRAL_INPUT, moveX: 0.5 } }), true);
  assert.equal(isPeerMessage({ type: 'input', seq: 1, frame: { ...NEUTRAL_INPUT, moveX: Number.NaN } }), false);
  assert.equal(isPeerMessage({ type: 'input', seq: 1, frame: { ...NEUTRAL_INPUT, moveZ: 9 } }), false);
  assert.equal(isPeerMessage({ type: 'input', seq: -1, frame: NEUTRAL_INPUT }), false);
  assert.equal(isPeerMessage({ type: 'input', seq: 1, frame: { moveX: 0, moveZ: 0 } }), false);
});

test('the handshake and the schema both reject a peer from another build', () => {
  const world = new GameWorld({ playerCount: 1, seed: 98, skipCountdown: true });
  world.step(1 / 60, [NEUTRAL_INPUT]);
  const snapshot = world.snapshot();
  assert.equal(isPeerMessage({ type: 'hello', protocol: PEER_PROTOCOL_VERSION }), true);
  // A peer from before the snapshot carried the road and the fight on it cannot
  // read this build's packets, so the pairing is refused at the handshake rather
  // than accepting a peer that would drop every snapshot it was sent.
  assert.equal(isPeerMessage({ type: 'hello', protocol: PEER_PROTOCOL_VERSION - 1 }), false);
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot }), true);
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot: { ...snapshot, version: 8 } }), false);
});

test('authoritative snapshots pass validation and malformed snapshots fail', () => {
  const world = new GameWorld({ playerCount: 2, seed: 99, skipCountdown: true });
  for (let index = 0; index < 120; index += 1) world.step(1 / 60, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
  const snapshot = world.snapshot();
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot }), true);
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot: { ...snapshot, actors: [{ id: 1, x: Number.NaN }] } }), false);

  // A v5 snapshot (before the stage exit) is stale, and so is a v6 one that
  // drops the open doorway the guest has to draw.
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot: { ...snapshot, version: 5 } }), false);
  const { exitOpen, ...withoutExit } = snapshot;
  assert.equal(typeof exitOpen, 'boolean');
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot: withoutExit }), false);
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot: { ...snapshot, exitOpen: 'yes' } }), false);
});

test('a replica accepts a player carrying a find and the items on the floor', () => {
  const world = new GameWorld({ playerCount: 1, seed: 103, skipCountdown: true });
  world.step(1 / 60, [NEUTRAL_INPUT]);
  const snapshot = world.snapshot();
  const [player] = snapshot.actors;

  // A cudgel in hand and the fencing weapon stowed is an ordinary state, and a
  // guest must not silently drop every snapshot of it.
  const carrying = {
    ...snapshot,
    actors: [{ ...player, weapon: 'club', desiredWeapon: 'club', stowedWeapon: 'longsword', durability: 7 }],
    items: [
      { id: 1, kind: 'club', x: 300, z: 300, y: 0, durability: 9, thrown: false, age: 1.5 },
      { id: 2, kind: 'potion', x: 340, z: 320, y: 12, durability: 0, thrown: false, age: 0.4 },
      { id: 3, kind: 'spear', x: 380, z: 300, y: 4, durability: 2, thrown: true, age: 0.2 }
    ]
  };
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot: carrying }), true);

  // A stowed weapon is always fencing steel, and the item list is bounded and
  // typed the same way everywhere else in the protocol is.
  assert.equal(isPeerMessage({
    type: 'snapshot',
    snapshot: { ...carrying, actors: [{ ...carrying.actors[0], stowedWeapon: 'club' }] }
  }), false);
  assert.equal(isPeerMessage({
    type: 'snapshot',
    snapshot: { ...carrying, actors: [{ ...carrying.actors[0], durability: -1 }] }
  }), false);
  assert.equal(isPeerMessage({
    type: 'snapshot',
    snapshot: { ...carrying, items: [{ ...carrying.items[0], kind: 'ballista' }] }
  }), false);
  assert.equal(isPeerMessage({
    type: 'snapshot',
    snapshot: { ...carrying, items: [{ ...carrying.items[0], thrown: 'yes' }] }
  }), false);
  assert.equal(isPeerMessage({
    type: 'snapshot',
    snapshot: { ...carrying, items: Array.from({ length: 65 }, (_, index) => ({ ...carrying.items[0], id: index })) }
  }), false);
  const { items: _omitted, ...withoutItems } = snapshot;
  assert.equal(isPeerMessage({ type: 'snapshot', snapshot: withoutItems }), false);
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

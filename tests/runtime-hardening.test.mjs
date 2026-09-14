import test from 'node:test';
import assert from 'node:assert/strict';

import { GameController } from '../site/js/app/controller.js';
import { attackDuration, getAttack } from '../site/js/sim/attacks.js';
import { createEnemy } from '../site/js/sim/factories.js';
import { GameWorld } from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

const frame = (overrides = {}) => ({ ...NEUTRAL_INPUT, ...overrides });

function readyWorld(seed = 731) {
  const world = new GameWorld({ playerCount: 1, seed, skipCountdown: true });
  while (world.phase !== 'wave') world.step(1 / 60, [frame()]);
  world.actors.splice(1);
  return world;
}

function armAttack(actor, attackId, targetId) {
  const definition = getAttack(attackId);
  actor.state = 'attack';
  actor.stateElapsed = definition.startup;
  actor.stateDuration = attackDuration(definition);
  actor.attack = {
    id: attackId,
    elapsed: definition.startup,
    targetId,
    hitIds: new Set(),
    hitConfirmed: false,
    blocked: false,
    queuedAction: null,
    activeCuePlayed: false,
    signatureShown: false
  };
}

test('raw analog deadzones prevent drift and tiny-direction Duck remains crouch', () => {
  const world = readyWorld();
  const player = world.actors[0];
  assert.ok(player);
  const startX = player.x;

  world.step(1 / 60, [frame({ moveX: 0.05, moveZ: -0.04 })]);
  assert.equal(player.x, startX);
  assert.equal(player.vx, 0);
  assert.equal(player.state, 'idle');

  world.step(1 / 60, [frame({ moveX: 0.05, mobilityPressed: true })]);
  assert.equal(player.state, 'crouch');
});

test('hit-stop preserves action edges and their Duck/Attack order', () => {
  const attackFirstWorld = readyWorld(732);
  const attackFirst = attackFirstWorld.actors[0];
  assert.ok(attackFirst);
  attackFirstWorld.hitStop = 0.04;
  attackFirstWorld.step(1 / 60, [frame({ lightPressed: true })]);
  attackFirstWorld.step(1 / 60, [frame({ mobilityPressed: true })]);
  for (let index = 0; index < 4; index += 1) attackFirstWorld.step(1 / 60, [frame()]);
  assert.equal(attackFirst.attack?.id, 'ls_l1');

  const duckFirstWorld = readyWorld(733);
  const duckFirst = duckFirstWorld.actors[0];
  assert.ok(duckFirst);
  duckFirstWorld.hitStop = 0.04;
  duckFirstWorld.step(1 / 60, [frame({ mobilityPressed: true })]);
  duckFirstWorld.step(1 / 60, [frame({ lightPressed: true })]);
  for (let index = 0; index < 4; index += 1) duckFirstWorld.step(1 / 60, [frame()]);
  assert.equal(duckFirst.attack?.id, 'ls_low_l');
});

test('Duck keeps its accepted movement axis through controller and hit-stop buffering', () => {
  const cases = [
    {
      label: 'neutral Duck followed by movement',
      edge: frame({ mobilityPressed: true }),
      later: frame({ moveX: 1 }),
      expectedX: 0,
      expectedState: 'crouch'
    },
    {
      label: 'directional Duck followed by release',
      edge: frame({ moveX: 1, mobilityPressed: true }),
      later: frame(),
      expectedX: 1,
      expectedState: 'dodge'
    }
  ];

  for (const entry of cases) {
    const controller = Object.create(GameController.prototype);
    const pending = frame();
    controller.mergeIntoPending(pending, entry.edge);
    controller.mergeIntoPending(pending, entry.later);
    const coalesced = controller.consumePending(pending);
    assert.equal(coalesced.moveX, entry.expectedX, `${entry.label}: controller axis`);

    const world = readyWorld(entry.expectedState === 'crouch' ? 737 : 738);
    const player = world.actors[0];
    assert.ok(player);
    world.hitStop = 0.02;
    world.step(1 / 60, [entry.edge]);
    world.step(1 / 60, [entry.later]);
    world.step(1 / 60, [entry.later]);
    assert.equal(player.state, entry.expectedState, `${entry.label}: world action`);
  }
});

test('low attacks stay crouched against head blows and report crouched torso contact', () => {
  for (const [incoming, shouldHit] of [['thug_overhead', false], ['thug_body', true]]) {
    const world = readyWorld(incoming === 'thug_overhead' ? 734 : 735);
    const player = world.actors[0];
    assert.ok(player);
    player.x = 400;
    player.z = 420;
    player.facing = 1;
    armAttack(player, 'ls_low_l', null);

    const thug = createEnemy(90, 'thug', 345, 420);
    thug.facing = 1;
    thug.aiCooldown = 99;
    world.actors.push(thug);
    armAttack(thug, incoming, player.id);
    const healthBefore = player.health;
    world.step(1 / 60, [frame()]);

    assert.equal(player.health < healthBefore, shouldHit);
    const contact = world.consumeEvents().find((event) => event.type === 'hit' || event.type === 'heavy-hit');
    if (shouldHit) assert.equal(contact?.targetCrouched, true);
    else assert.equal(contact, undefined);
  }
});

test('second-intention block snapshots stay finite and reaction zones clear on recovery', () => {
  const world = readyWorld(736);
  const player = world.actors[0];
  assert.ok(player);
  world.upgrades.add('second-intention');
  armAttack(player, 'ls_h', null);
  player.attack.blocked = true;
  player.attack.elapsed = getAttack('ls_h').startup + getAttack('ls_h').active;
  world.step(1 / 60, [frame({ guardHeld: true })]);
  assert.equal(player.state, 'block');
  assert.equal(player.stateDuration, 0);
  assert.equal(Number.isFinite(world.snapshot().actors[0]?.stateDuration), true);

  player.state = 'hitstun';
  player.stateElapsed = 0;
  player.stateDuration = 0.01;
  player.reactionZone = 'head';
  world.step(1 / 60, [frame()]);
  assert.equal(player.state, 'idle');
  assert.equal(player.reactionZone, null);
});

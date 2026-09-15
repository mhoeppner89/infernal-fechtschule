import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTACKS,
  attackDuration,
  getAttack,
  isHitZoneExposed,
  resolveCrouchAttack,
  resolvePlayerAttack
} from '../site/js/sim/attacks.js';
import { createEnemy } from '../site/js/sim/factories.js';
import {
  CROUCH_ATTACK_WINDOW_SECONDS,
  CROUCH_DURATION_SECONDS,
  GameWorld
} from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

const frame = (overrides = {}) => ({ ...NEUTRAL_INPUT, ...overrides });

function readyWorld(seed = 9102) {
  const world = new GameWorld({ playerCount: 1, seed, skipCountdown: true });
  for (let tick = 0; tick < 12 && world.phase !== 'wave'; tick += 1) {
    world.step(1 / 60, [frame()]);
  }
  assert.equal(world.phase, 'wave');
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

function strikeCrouchedPlayer(attackId) {
  const world = readyWorld();
  const player = world.actors[0];
  assert.ok(player);
  player.x = 400;
  player.z = 420;

  world.step(1 / 60, [frame({ mobilityPressed: true })]);
  assert.equal(player.state, 'crouch');

  const thug = createEnemy(900, 'thug', 455, 420);
  thug.aiCooldown = 99;
  world.actors.push(thug);
  armAttack(thug, attackId, player.id);
  const healthBefore = player.health;
  world.step(1 / 60, [frame()]);
  return { world, player, thug, healthBefore };
}

test('every attack declares one of the three explicit hit zones', () => {
  const zones = new Set(['head', 'torso', 'legs']);
  for (const definition of Object.values(ATTACKS)) {
    assert.ok(zones.has(definition.hitZone), `${definition.id} has invalid hit zone`);
  }

  assert.equal(getAttack('thug_overhead').hitZone, 'head');
  assert.equal(getAttack('thug_body').hitZone, 'torso');
  assert.equal(getAttack('thug_low').hitZone, 'legs');
});

test('crouching hides the head zone but leaves torso and legs exposed', () => {
  assert.equal(isHitZoneExposed('idle', 'head'), true);
  assert.equal(isHitZoneExposed('idle', 'torso'), true);
  assert.equal(isHitZoneExposed('idle', 'legs'), true);
  assert.equal(isHitZoneExposed('crouch', 'head'), false);
  assert.equal(isHitZoneExposed('crouch', 'torso'), true);
  assert.equal(isHitZoneExposed('crouch', 'legs'), true);
});

test('a crouched player evades an in-range head strike after geometry is resolved', () => {
  const { player, healthBefore } = strikeCrouchedPlayer('thug_overhead');
  assert.equal(player.health, healthBefore);
  assert.equal(player.state, 'crouch');
  assert.equal(player.reactionZone, null);
});

test('torso and leg strikes still connect against a crouched player', () => {
  for (const [attackId, expectedZone] of [['thug_body', 'torso'], ['thug_low', 'legs']]) {
    const { world, player, healthBefore } = strikeCrouchedPlayer(attackId);
    assert.ok(player.health < healthBefore, `${attackId} should deal damage`);
    assert.equal(player.state, 'hitstun');
    assert.equal(player.reactionZone, expectedZone);
    assert.equal(world.snapshot().actors.find((actor) => actor.id === player.id)?.reactionZone, expectedZone);
    const hit = world.consumeEvents().find((event) => event.type === 'hit' || event.type === 'heavy-hit');
    assert.equal(hit?.hitZone, expectedZone);
  }
});

test('neutral Duck opens a short crouch window and Duck then Attack routes low', () => {
  const world = readyWorld();
  const player = world.actors[0];
  assert.ok(player);

  world.step(1 / 60, [frame({ mobilityPressed: true })]);
  assert.equal(player.state, 'crouch');
  assert.equal(player.stateDuration, CROUCH_DURATION_SECONDS);
  assert.ok(CROUCH_ATTACK_WINDOW_SECONDS < CROUCH_DURATION_SECONDS);

  world.step(1 / 60, [frame({ lightPressed: true })]);
  assert.equal(player.state, 'attack');
  assert.equal(player.attack?.id, 'ls_low_l');
  assert.equal(getAttack(player.attack?.id ?? '').hitZone, 'legs');
});

test('same-tick Duck plus Attack is buffered as a low attack for both weapons', () => {
  const longswordWorld = readyWorld(44);
  const longsword = longswordWorld.actors[0];
  assert.ok(longsword);
  longswordWorld.lessons.add('ls-threefold');
  longswordWorld.step(1 / 60, [frame({ mobilityPressed: true, heavyPressed: true })]);
  assert.equal(longsword.attack?.id, 'ls_low_h');

  const dussackWorld = readyWorld(45);
  const dussack = dussackWorld.actors[0];
  assert.ok(dussack);
  dussack.weapon = 'dussack';
  dussack.desiredWeapon = 'dussack';
  dussackWorld.step(1 / 60, [frame({ mobilityPressed: true, lightPressed: true })]);
  assert.equal(dussack.attack?.id, 'ds_low_l');
});

test('all four low routes exist and low-light rejoins the existing combo grammar', () => {
  const allLessons = new Set(['ls-crossing', 'ls-threefold', 'ls-provoker', 'ds-backhand', 'ds-wheel', 'switch-flourish']);
  assert.equal(resolveCrouchAttack('longsword', 'light'), 'ls_low_l');
  assert.equal(resolveCrouchAttack('longsword', 'heavy', allLessons), 'ls_low_h');
  assert.equal(resolveCrouchAttack('dussack', 'light'), 'ds_low_l');
  assert.equal(resolveCrouchAttack('dussack', 'heavy', allLessons), 'ds_low_h');
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_low_l', false, allLessons), 'ls_l2');
  assert.equal(resolvePlayerAttack('longsword', 'heavy', 'ls_low_l', false, allLessons), 'ls_lh');
  assert.equal(resolvePlayerAttack('dussack', 'light', 'ds_low_l', false, allLessons), 'ds_l2');
  assert.equal(resolvePlayerAttack('dussack', 'heavy', 'ds_low_l', false, allLessons), 'ds_lh');
});

test('direction plus Duck preserves the dodge instead of crouching', () => {
  const world = readyWorld();
  const player = world.actors[0];
  assert.ok(player);
  world.step(1 / 60, [frame({ moveX: 1, mobilityPressed: true })]);
  assert.equal(player.state, 'dodge');
  assert.ok(player.stateMoveX > 0.99);
  assert.equal(player.attack, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { getAttack, attackDuration } from '../site/js/sim/attacks.js';
import { createEnemy } from '../site/js/sim/factories.js';
import {
  DODGE_CUT_MIN_SECONDS,
  GameWorld
} from '../site/js/sim/world.js';
import { MAX_PLAYER_CHAIN_LENGTH } from '../site/js/sim/combo.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

const FRAME = 1 / 60;

function frame(overrides = {}) {
  return { ...NEUTRAL_INPUT, ...overrides };
}

function readyWorld(seed = 4201) {
  const world = new GameWorld({ playerCount: 1, seed, skipCountdown: true });
  while (world.phase !== 'wave') world.step(FRAME, [frame()]);
  world.actors.splice(1);
  const player = world.actors[0];
  assert.ok(player);
  player.x = 400;
  player.z = 420;
  player.facing = 1;
  player.invulnerable = 2;
  return { world, player };
}

function addDummy(world, gap = 64) {
  const dummy = createEnemy(9000, 'thug', 400 + gap, 420);
  dummy.health = 1e6;
  dummy.maxHealth = 1e6;
  dummy.aiCooldown = 1e6;
  dummy.attackPermission = false;
  world.actors.push(dummy);
  return dummy;
}

function runPulses({ weapon = 'longsword', gap = 64, dt = FRAME, pulseTicks = [], frames = 90 }) {
  const { world, player } = readyWorld(4200 + Math.round(dt * 1000));
  player.weapon = weapon;
  player.desiredWeapon = weapon;
  const dummy = addDummy(world, gap);
  const starts = [];
  const contacts = [];
  let previousAttack = null;

  for (let tick = 0; tick < frames; tick += 1) {
    player.x = 400;
    player.z = 420;
    player.invulnerable = 2;
    dummy.x = 400 + gap;
    dummy.z = 420;
    dummy.attackPermission = false;
    world.consumeEvents();

    const pressing = pulseTicks.includes(tick);
    world.step(dt, [frame({ lightPressed: pressing })]);
    world.actors.splice(2);

    const attack = player.attack;
    const started = attack && (!previousAttack
      || previousAttack.id !== attack.id
      || attack.elapsed < previousAttack.elapsed);
    if (started) starts.push({ id: attack.id, tick });
    previousAttack = attack ? { id: attack.id, elapsed: attack.elapsed } : null;

    for (const event of world.consumeEvents()) {
      if (event.type === 'hit' || event.type === 'heavy-hit') contacts.push(event);
    }
  }

  return { world, player, dummy, starts, contacts };
}

function pulseTicksAtSeconds(dt, seconds) {
  return seconds.map((time) => Math.round(time / dt));
}

test('starter L-L-L and L-L-H routes are usable without lessons', () => {
  const lightRoute = runPulses({ pulseTicks: [0, 8, 20] });
  assert.deepEqual(
    lightRoute.contacts.slice(0, 3).map((event) => event.attackId),
    ['ls_l1', 'ls_l2', 'ls_l3']
  );

  // Replace only the third edge with Heavy; the first two presses remain the
  // same intentional link timing.
  const { world, player } = readyWorld(4202);
  player.weapon = 'longsword';
  player.desiredWeapon = 'longsword';
  const dummy = addDummy(world, 64);
  const contacts = [];
  for (let tick = 0; tick < 90; tick += 1) {
    player.x = 400;
    player.z = 420;
    player.invulnerable = 2;
    dummy.x = 464;
    dummy.z = 420;
    world.consumeEvents();
    world.step(FRAME, [frame({
      lightPressed: tick === 0 || tick === 8,
      heavyPressed: tick === 20
    })]);
    world.actors.splice(2);
    for (const event of world.consumeEvents()) {
      if (event.type === 'hit' || event.type === 'heavy-hit') contacts.push(event);
    }
  }
  assert.deepEqual(
    contacts.slice(0, 3).map((event) => event.attackId),
    ['ls_l1', 'ls_l2', 'ls_h']
  );
});

test('a light edge tapped during startup is latched for the confirmed link', () => {
  const result = runPulses({ pulseTicks: [0, 2] });
  assert.deepEqual(result.starts.slice(0, 2).map((start) => start.id), ['ls_l1', 'ls_l2']);
  assert.ok(result.starts[1].tick > 2, 'the follow-up waits for its legal link point');
});

test('the one follow-up buffer expires and an opening edge alone cannot refill it', () => {
  const expired = runPulses({ gap: 220, pulseTicks: [0, 2, 28], frames: 80 });
  assert.deepEqual(expired.starts.slice(0, 2).map((start) => start.id), ['ls_l1', 'ls_l1']);
  assert.ok(
    expired.starts[1].tick >= Math.ceil(attackDuration(getAttack('ls_l1')) / FRAME),
    'the whiffed first cut pays its full recovery'
  );

  const held = readyWorld(4203);
  held.player.weapon = 'longsword';
  held.player.desiredWeapon = 'longsword';
  const dummy = addDummy(held.world, 64);
  const starts = [];
  let previousAttack = null;
  for (let tick = 0; tick < 100; tick += 1) {
    held.player.x = 400;
    held.player.z = 420;
    held.player.invulnerable = 2;
    dummy.x = 464;
    dummy.z = 420;
    held.world.consumeEvents();
    held.world.step(FRAME, [frame({ lightPressed: tick === 0 })]);
    held.world.actors.splice(2);
    const attack = held.player.attack;
    if (attack && (!previousAttack || previousAttack.id !== attack.id || attack.elapsed < previousAttack.elapsed)) {
      starts.push(attack.id);
    }
    previousAttack = attack ? { id: attack.id, elapsed: attack.elapsed } : null;
    held.world.consumeEvents();
  }
  assert.deepEqual(starts, ['ls_l1']);
});

test('the same intentional chain survives 30, 60, and 120 Hz caller sampling', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const pulseTicks = pulseTicksAtSeconds(dt, [0, 0.13, 0.33]);
    const result = runPulses({ dt, pulseTicks, frames: Math.ceil(1.2 / dt) });
    assert.deepEqual(
      result.contacts.slice(0, 3).map((event) => event.attackId),
      ['ls_l1', 'ls_l2', 'ls_l3'],
      `${Math.round(1 / dt)} Hz caller`
    );
  }
});

test('held guard plus Cut leaves guard for a normal cut, while a fresh parry answers Cut and Heavy', () => {
  const ordinary = readyWorld(4204);
  ordinary.player.guard = ordinary.player.maxGuard;
  ordinary.world.step(FRAME, [frame({ guardHeld: true })]);
  ordinary.world.step(FRAME, [frame({ guardHeld: true, lightPressed: true })]);
  assert.equal(ordinary.player.attack?.id, 'ls_l1');
  assert.equal(ordinary.player.parryWindow, 0);
  assert.equal(ordinary.player.counterWindow, 0);

  for (const [action, expected] of [['light', 'ls_counter'], ['heavy', 'ls_counter']]) {
    const { world, player } = readyWorld(action === 'light' ? 4205 : 4206);
    player.guard = player.maxGuard;
    player.invulnerable = 0;
    const enemy = createEnemy(9010, 'thug', 458, 420);
    enemy.aiCooldown = 1e6;
    world.actors.push(enemy);
    enemy.state = 'attack';
    enemy.stateElapsed = 0.08;
    enemy.stateDuration = attackDuration(getAttack('thug_body'));
    enemy.attack = {
      id: 'thug_body',
      elapsed: getAttack('thug_body').startup,
      targetId: player.id,
      hitIds: new Set(),
      hitConfirmed: false,
      blocked: false,
      queuedAction: null,
      activeCuePlayed: false,
      signatureShown: false,
      released: false
    };

    world.step(FRAME, [frame({ guardHeld: true, guardPressed: true })]);
    assert.equal(player.counterWindow > 0, true);
    // Keep Guard held while the one-frame attack edge is retained through hit-stop.
    world.step(FRAME, [frame({ guardHeld: true, [`${action}Pressed`]: true })]);
    for (let tick = 0; tick < 8 && player.state !== 'attack'; tick += 1) {
      world.step(FRAME, [frame({ guardHeld: true })]);
    }
    assert.equal(player.attack?.id, expected, `${action} parry answer`);
    assert.equal(player.parryWindow, 0);
  }
});

test('Guard -> direction -> Cut selects relative front/back and vertical routes', () => {
  const cases = [
    ['forward', { moveX: 1 }, 'ls_guard_forward'],
    ['back', { moveX: -1 }, 'ls_guard_back'],
    ['up', { moveZ: -1 }, 'ls_guard_up'],
    ['down', { moveZ: 1 }, 'ls_guard_down']
  ];

  for (const [direction, move, expected] of cases) {
    const { world, player } = readyWorld(4210 + cases.findIndex((entry) => entry[0] === direction));
    world.step(FRAME, [frame({ guardHeld: true, guardPressed: true })]);
    world.step(FRAME, [frame({ guardHeld: true, ...move })]);
    world.step(FRAME, [frame({ guardHeld: true, lightPressed: true })]);
    assert.equal(player.attack?.id, expected, direction);
    assert.equal(player.guardCommand, null);
  }

  // The complete chord is a single, readable command: it cannot become a
  // block and a separate starter in the same sample.
  const chord = readyWorld(4220);
  chord.world.step(FRAME, [frame({
    guardHeld: true,
    guardPressed: true,
    moveX: 1,
    lightPressed: true
  })]);
  assert.equal(chord.player.attack?.id, 'ls_guard_forward');

  for (const [move, expected] of [
    [{ moveX: 1 }, 'ds_guard_forward'],
    [{ moveX: -1 }, 'ds_guard_back'],
    [{ moveZ: -1 }, 'ds_guard_up'],
    [{ moveZ: 1 }, 'ds_guard_down']
  ]) {
    const dussack = readyWorld(4225);
    dussack.player.weapon = 'dussack';
    dussack.player.desiredWeapon = 'dussack';
    dussack.world.step(FRAME, [frame({ guardHeld: true, guardPressed: true, ...move, lightPressed: true })]);
    assert.equal(dussack.player.attack?.id, expected);
  }

  const releasedTap = readyWorld(4221);
  releasedTap.player.facing = 1;
  releasedTap.world.step(FRAME, [frame({ guardPressed: true })]);
  releasedTap.world.step(FRAME, [frame({ moveX: -1 })]);
  releasedTap.world.step(FRAME, [frame({ lightPressed: true })]);
  assert.equal(releasedTap.player.attack?.id, 'ls_guard_back');
  assert.equal(releasedTap.player.facing, 1, 'back remains relative to the Guard-edge facing');

  const expiredCommand = readyWorld(4222);
  expiredCommand.world.step(FRAME, [frame({ guardHeld: true, guardPressed: true })]);
  for (let tick = 0; tick < 30; tick += 1) {
    expiredCommand.world.step(FRAME, [frame({ guardHeld: true })]);
  }
  assert.equal(expiredCommand.player.guardCommand, null);
  expiredCommand.world.step(FRAME, [frame({ guardHeld: true, moveX: 1 })]);
  expiredCommand.world.step(FRAME, [frame({ guardHeld: true, lightPressed: true })]);
  assert.equal(expiredCommand.player.attack?.id, 'ls_l1', 'an expired command cannot be refreshed by held Guard');
});

test('an early Step + Cut tap becomes a dodge cut only after startup-safe frames', () => {
  const { world, player } = readyWorld(4230);
  world.step(FRAME, [frame({ moveX: 1, mobilityPressed: true })]);
  assert.equal(player.state, 'dodge');
  world.step(FRAME, [frame({ lightPressed: true })]);
  assert.equal(player.state, 'dodge');
  assert.ok(player.actionBuffer?.action === 'light');
  let transitionTick = null;
  for (let tick = 0; tick < 8 && player.state === 'dodge'; tick += 1) {
    world.step(FRAME, [frame()]);
    if (player.state === 'attack') transitionTick = tick;
  }
  assert.equal(player.attack?.id, 'ls_dodge_l');
  assert.ok(
    (transitionTick ?? -1) + 2 >= Math.ceil(DODGE_CUT_MIN_SECONDS / FRAME),
    'the dodge cut waits for the startup-safe window'
  );
});

test('whiffs pay recovery and the chain cap forces a real completed beat', () => {
  const result = runPulses({ weapon: 'dussack', gap: 220, pulseTicks: [0, 8, 20, 32, 44, 56, 68], frames: 150 });
  const starts = result.starts;
  assert.ok(starts.length >= MAX_PLAYER_CHAIN_LENGTH);
  assert.ok(starts.length < 7, 'dussack cannot sustain every mash as an invulnerable loop');

  const connected = runPulses({ weapon: 'longsword', gap: 220, pulseTicks: [0, 18], frames: 70 });
  assert.equal(connected.contacts.length, 0);
  assert.equal(connected.starts[1]?.id, 'ls_l1');
  assert.ok(
    (connected.starts[1]?.tick ?? 0) >= Math.ceil(attackDuration(getAttack('ls_l1')) / FRAME),
    'a whiff never links before full recovery'
  );
});

test('weapon switching and improvised item throws still use their existing action grammar', () => {
  const { world, player } = readyWorld(4240);
  const item = {
    id: 991,
    kind: 'club',
    x: player.x,
    z: player.z,
    y: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    durability: 2,
    thrownBy: null,
    hitIds: new Set(),
    age: 0
  };
  world.items.push(item);
  world.step(FRAME, [frame({ switchPressed: true })]);
  assert.equal(player.weapon, 'club');
  assert.equal(world.items.some((floorItem) => floorItem.id === item.id), false);

  world.step(FRAME, [frame()]);
  world.step(FRAME, [frame({ switchPressed: true })]);
  assert.equal(player.state, 'attack');
  assert.equal(player.attack?.id, 'cl_throw');
  assert.equal(player.weapon, 'club');
});

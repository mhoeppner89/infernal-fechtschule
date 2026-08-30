import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlayerAttack, withUpgradeEffects, getAttack } from '../site/js/sim/attacks.js';
import { createEnemy, createPlayer } from '../site/js/sim/factories.js';
import { chooseSoftTarget } from '../site/js/sim/targeting.js';
import { GameWorld } from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

const neutral = () => ({ ...NEUTRAL_INPUT });

function advance(world, seconds, input = neutral()) {
  const frames = Math.ceil(seconds * 60);
  for (let frame = 0; frame < frames; frame += 1) world.step(1 / 60, [input]);
}

function killEnemies(world) {
  for (const actor of world.actors) {
    if (actor.team === 'enemies') {
      actor.health = 0;
      actor.state = 'dead';
      actor.deathTimer = 2;
    }
  }
}

test('soft targeting prefers depth alignment and keeps previous target sticky', () => {
  const player = createPlayer(1, 0, 300, 400);
  const closeButMisaligned = createEnemy(2, 'thug', 355, 480);
  const aligned = createEnemy(3, 'thug', 375, 410);
  const selected = chooseSoftTarget(player, [closeButMisaligned, aligned], {
    maxForward: 180,
    maxDepth: 120
  });
  assert.equal(selected?.id, aligned.id);

  const comparable = createEnemy(4, 'thug', 368, 418);
  const sticky = chooseSoftTarget(player, [aligned, comparable], {
    maxForward: 180,
    maxDepth: 120,
    previousTargetId: comparable.id
  });
  assert.equal(sticky?.id, comparable.id);
});

test('the shared combo grammar resolves weapon-specific routes', () => {
  assert.equal(resolvePlayerAttack('longsword', 'light', null, false), 'ls_l1');
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l1', false), 'ls_l2');
  assert.equal(resolvePlayerAttack('longsword', 'heavy', 'ls_l2', false), 'ls_l2h');
  assert.equal(resolvePlayerAttack('dussack', 'heavy', 'ds_l1', false), 'ds_lh');
  assert.equal(resolvePlayerAttack('dussack', 'heavy', null, true), 'ds_counter');
});

test('lessons alter behavior rather than applying opaque percentage bonuses', () => {
  const base = getAttack('ls_l3');
  const upgraded = withUpgradeEffects(base, new Set(['longsword-sweep']));
  assert.ok(upgraded.depth > base.depth);
  assert.ok(upgraded.maxTargets > base.maxTargets);

  const dussack = withUpgradeEffects(getAttack('ds_l3'), new Set(['dussack-circle']));
  assert.equal(dussack.arc, 'radial');
});

test('wave flow reaches a lesson choice and resumes after selecting it', () => {
  const world = new GameWorld({ playerCount: 1, seed: 1234, skipCountdown: true });
  advance(world, 5.5);
  assert.equal(world.waveIndex, 0);
  assert.ok(world.actors.some((actor) => actor.team === 'enemies'));

  killEnemies(world);
  advance(world, 1.5);
  assert.equal(world.waveIndex, 1);

  advance(world, 5.5);
  killEnemies(world);
  advance(world, 1.5);
  assert.equal(world.phase, 'upgrade');
  assert.equal(world.offeredUpgrades.length, 3);

  const selected = world.offeredUpgrades[0];
  assert.ok(selected);
  assert.equal(world.chooseUpgrade(selected), true);
  assert.equal(world.phase, 'wave');
  assert.equal(world.waveIndex, 2);
  assert.ok(world.upgrades.has(selected));
});

test('snapshots are JSON serializable for the WebRTC replica client', () => {
  const world = new GameWorld({ playerCount: 2, seed: 42, skipCountdown: true });
  advance(world, 1);
  const snapshot = world.snapshot();
  const encoded = JSON.stringify(snapshot);
  const decoded = JSON.parse(encoded);
  assert.equal(decoded.version, 1);
  assert.equal(decoded.actors.filter((actor) => actor.team === 'players').length, 2);
});

test('the same seed and input log produce identical snapshots', () => {
  const left = new GameWorld({ playerCount: 1, seed: 987654, skipCountdown: true });
  const right = new GameWorld({ playerCount: 1, seed: 987654, skipCountdown: true });
  let state = 0x12345678;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };

  for (let tick = 0; tick < 1800; tick += 1) {
    const frame = {
      moveX: random() * 2 - 1,
      moveZ: random() * 2 - 1,
      lightPressed: random() < 0.025,
      heavyPressed: random() < 0.012,
      mobilityPressed: random() < 0.008,
      switchPressed: random() < 0.004,
      guardHeld: random() < 0.12,
      guardPressed: random() < 0.01
    };
    left.step(1 / 60, [frame]);
    right.step(1 / 60, [frame]);
    left.consumeEvents();
    right.consumeEvents();
  }

  assert.deepEqual(left.snapshot(), right.snapshot());
});

test('the complete encounter sequence can reach victory through both lesson gates', () => {
  const world = new GameWorld({ playerCount: 1, seed: 20260830, skipCountdown: true });
  for (let tick = 0; tick < 12_000 && world.phase !== 'victory'; tick += 1) {
    for (const actor of world.actors) {
      if (actor.team === 'players') {
        actor.health = actor.maxHealth;
        actor.invulnerable = 2;
      } else if (actor.state !== 'dead') {
        actor.health = 0;
        actor.state = 'dead';
        actor.deathTimer = 2;
      }
    }
    if (world.phase === 'upgrade') {
      const selected = world.offeredUpgrades[0];
      assert.ok(selected);
      world.chooseUpgrade(selected);
    }
    world.step(1 / 60, [NEUTRAL_INPUT]);
  }
  assert.equal(world.phase, 'victory');
  assert.equal(world.waveIndex, 3);
  assert.equal(world.upgrades.size, 2);
});

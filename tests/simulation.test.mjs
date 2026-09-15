import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCrouchAttack, resolvePlayerAttack } from '../site/js/sim/attacks.js';
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
  const allLessons = new Set(['ls-crossing', 'ls-threefold', 'ls-provoker', 'ds-backhand', 'ds-wheel', 'switch-flourish']);
  assert.equal(resolvePlayerAttack('longsword', 'light', null, false), 'ls_l1');
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l1', false, allLessons), 'ls_l2');
  assert.equal(resolvePlayerAttack('longsword', 'heavy', 'ls_l2', false, allLessons), 'ls_l2h');
  assert.equal(resolvePlayerAttack('dussack', 'heavy', 'ds_l1', false, allLessons), 'ds_lh');
  assert.equal(resolvePlayerAttack('dussack', 'heavy', null, true, allLessons), 'ds_counter');
});

test('combo lessons gate chained routes until learned', () => {
  const none = new Set();
  // Without lessons only the basic starters are reachable: chains fall back.
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l1', false, none), 'ls_l1');
  assert.equal(resolvePlayerAttack('longsword', 'heavy', 'ls_l2', false, none), 'ls_h');
  assert.equal(resolveCrouchAttack('longsword', 'heavy', none), 'ls_low_l');
  // Learning ls-crossing opens its routes; unrelated routes stay locked.
  const crossing = new Set(['ls-crossing']);
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l1', false, crossing), 'ls_l2');
  assert.equal(resolvePlayerAttack('longsword', 'heavy', 'ls_l2', false, crossing), 'ls_l2h');
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l2', false, crossing), 'ls_l1');
  // The low heavy belongs to ls-threefold, not ls-crossing.
  assert.equal(resolveCrouchAttack('longsword', 'heavy', crossing), 'ls_low_l');
  assert.equal(resolveCrouchAttack('longsword', 'heavy', new Set(['ls-threefold'])), 'ls_low_h');

  // Dussack lessons do not unlock longsword chains.
  const dussackOnly = new Set(['ds-backhand']);
  assert.equal(resolvePlayerAttack('dussack', 'light', 'ds_l1', false, dussackOnly), 'ds_l2');
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l1', false, dussackOnly), 'ls_l1');
});

test('wave flow reaches a lesson choice and resumes after selecting it', () => {
  const world = new GameWorld({ playerCount: 1, seed: 1234, skipCountdown: true });
  advance(world, 5.5);
  assert.equal(world.waveIndex, 0);
  assert.ok(world.actors.some((actor) => actor.team === 'enemies'));

  killEnemies(world);
  // The clear-fallback may still release the wave's remaining group; keep
  // clearing until the wave actually resolves (the lesson phase marks it —
  // waveIndex still points at the finished wave until the choice is made).
  for (let cycle = 0; cycle < 6 && world.phase === 'wave'; cycle += 1) {
    killEnemies(world);
    advance(world, 1.5);
  }
  assert.equal(world.phase, 'lesson');

  // The choice advances to wave 1 with the lesson learned (waveIndex still
  // names the finished wave until the pick lands).
  const selected = world.offeredLessons[0];
  assert.ok(selected);
  assert.equal(world.chooseLesson(selected), true);
  assert.equal(world.phase, 'wave');
  assert.equal(world.waveIndex, 1);
  assert.ok(world.lessons.has(selected));
  assert.equal(world.offeredLessons.length, 0);
});

test('snapshots are JSON serializable for the WebRTC replica client', () => {
  const world = new GameWorld({ playerCount: 2, seed: 42, skipCountdown: true });
  advance(world, 1);
  const snapshot = world.snapshot();
  const encoded = JSON.stringify(snapshot);
  const decoded = JSON.parse(encoded);
  assert.equal(decoded.version, 4);
  assert.equal(decoded.actors.filter((actor) => actor.team === 'players').length, 2);
});

test('continuous movement animation clocks reset on entry and advance while moving', () => {
  const world = new GameWorld({ playerCount: 1, seed: 417, skipCountdown: true });
  advance(world, 0.2);

  const player = world.actors.find((actor) => actor.team === 'players');
  assert.ok(player);
  assert.equal(player.state, 'idle');
  world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: 1 }]);
  assert.equal(player.state, 'move');
  assert.equal(player.stateElapsed, 0);
  world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: 1 }]);
  assert.ok(player.stateElapsed > 0);

  advance(world, 0.5);
  const enemy = world.actors.find((actor) => actor.team === 'enemies' && actor.state === 'move');
  assert.ok(enemy);
  const elapsed = enemy.stateElapsed;
  world.step(1 / 60, [NEUTRAL_INPUT]);
  assert.equal(enemy.state, 'move');
  assert.ok(enemy.stateElapsed > elapsed);
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
    if (world.phase === 'lesson') {
      const selected = world.offeredLessons[0];
      assert.ok(selected);
      world.chooseLesson(selected);
    }
    world.step(1 / 60, [NEUTRAL_INPUT]);
  }
  assert.equal(world.phase, 'victory');
  assert.equal(world.waveIndex, 6);
  assert.equal(world.lessons.size, 6);
});

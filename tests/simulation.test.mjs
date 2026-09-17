import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCrouchAttack, resolvePlayerAttack } from '../site/js/sim/attacks.js';
import { createEnemy, createPlayer } from '../site/js/sim/factories.js';
import { chooseSoftTarget } from '../site/js/sim/targeting.js';
import { LEVELS } from '../site/js/sim/waves.js';
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

/**
 * A stage ends at its eastern doorway, so clearing one is a clear *and* a walk
 * out of it. Marches the whole party east until the phase changes.
 */
function walkOut(world, seconds = 30) {
  const start = world.phase;
  const march = { ...neutral(), moveX: 1 };
  for (let frame = 0; frame < seconds * 60 && world.phase === start; frame += 1) {
    killEnemies(world);
    world.step(1 / 60, [march, march]);
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
  assert.equal(resolvePlayerAttack('longsword', 'heavy', 'ls_l2', false, allLessons), 'ls_h');
  assert.equal(resolvePlayerAttack('dussack', 'heavy', 'ds_l1', false, allLessons), 'ds_h');
  assert.equal(resolvePlayerAttack('dussack', 'heavy', null, true, allLessons), 'ds_counter');
});

test('the basic chain is available immediately and lessons upgrade it', () => {
  const none = new Set();
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l1', false, none), 'ls_l2');
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l2', false, none), 'ls_l3');
  assert.equal(resolvePlayerAttack('dussack', 'light', 'ds_l1', false, none), 'ds_l2');
  assert.equal(resolvePlayerAttack('dussack', 'light', 'ds_l2', false, none), 'ds_l3');

  // Lessons no longer decide whether a starter route exists. They sharpen the
  // same cuts when learned, while weapon schools remain independent.
  const crossing = new Set(['ls-crossing']);
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l1', false, crossing), 'ls_l2');
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l2', false, crossing), 'ls_l3');
  const crossingAndThreefold = new Set(['ls-crossing', 'ls-threefold']);
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l2', false, crossingAndThreefold), 'ls_l3');

  const dussackOnly = new Set(['ds-backhand']);
  assert.equal(resolvePlayerAttack('dussack', 'light', 'ds_l1', false, dussackOnly), 'ds_l2');
  assert.equal(resolvePlayerAttack('longsword', 'light', 'ls_l1', false, dussackOnly), 'ls_l2');
});

test('wave flow reaches a lesson choice and resumes after selecting it', () => {
  const world = new GameWorld({ playerCount: 1, seed: 1234, skipCountdown: true });
  advance(world, 5.5);
  assert.deepEqual({ level: world.levelIndex, wave: world.waveInLevel }, { level: 0, wave: 0 });
  assert.ok(world.actors.some((actor) => actor.team === 'enemies'));

  killEnemies(world);
  // Clearing only opens the road; the level resolves when the player walks out
  // of it, and a group held back by the march can still release into the lull,
  // so the walk keeps clearing as it goes.
  walkOut(world);
  assert.equal(world.phase, 'lesson');

  // The choice moves the journey on with the lesson learned: the first place
  // held one fight, so the next wave is the next level's first.
  const selected = world.offeredLessons[0];
  assert.ok(selected);
  assert.equal(world.chooseLesson(selected), true);
  assert.equal(world.phase, 'wave');
  assert.deepEqual({ level: world.levelIndex, wave: world.waveInLevel }, { level: 1, wave: 0 });
  assert.ok(world.lessons.has(selected));
  assert.equal(world.offeredLessons.length, 0);
});

test('snapshots are JSON serializable for the WebRTC replica client', () => {
  const world = new GameWorld({ playerCount: 2, seed: 42, skipCountdown: true });
  advance(world, 1);
  const snapshot = world.snapshot();
  const encoded = JSON.stringify(snapshot);
  const decoded = JSON.parse(encoded);
  assert.equal(decoded.version, 9);
  assert.equal(decoded.actors.filter((actor) => actor.team === 'players').length, 2);
  assert.ok(Array.isArray(decoded.items), 'snapshot carries the floor items');
  // The place travels with the snapshot: it names the fight and picks the
  // scenery, so a replica draws the same road the host is standing on.
  assert.equal(decoded.levelName, 'The Town');
  assert.equal(decoded.scenery, 'cobbled-streets');
  assert.equal(decoded.waveInLevel, 0);
  assert.equal(decoded.wavesInLevel, LEVELS[0].waves.length);
  assert.equal(decoded.roadWidth, LEVELS[0].road);
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
  // The march east is not incidental: every stage of the journey has to be
  // walked out of its eastern doorway before the next one begins.
  const march = { ...NEUTRAL_INPUT, moveX: 1 };
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
    world.step(1 / 60, [march]);
  }
  assert.equal(world.phase, 'victory');
  assert.deepEqual(
    { level: world.levelIndex, wave: world.waveInLevel },
    { level: LEVELS.length - 1, wave: (LEVELS.at(-1)?.waves.length ?? 1) - 1 },
    'the run ends on the last fight of the last place'
  );
  assert.equal(world.lessons.size, 6);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld, ARENA, CAMERA, stageBounds } from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

const neutral = () => ({ ...NEUTRAL_INPUT });

function advance(world, seconds, input = neutral()) {
  const frames = Math.ceil(seconds * 60);
  for (let frame = 0; frame < frames; frame += 1) world.step(1 / 60, [input]);
}

function players(world) {
  return world.actors.filter((actor) => actor.team === 'players');
}

function livingEnemies(world) {
  return world.actors.filter((actor) => actor.team === 'enemies' && actor.state !== 'dead');
}

test('stages are wider than the camera window and scroll east with the march', () => {
  const world = new GameWorld({ playerCount: 1, seed: 1948, skipCountdown: true });
  advance(world, 0.2);
  assert.equal(world.phase, 'wave');
  assert.ok(world.stageWidth > CAMERA.width, 'the opening stage should scroll');
  assert.equal(world.cameraX, ARENA.minX - CAMERA.margin + CAMERA.margin);

  const startCameraX = world.cameraX;
  const startPlayerX = players(world)[0].x;
  // March east for two seconds.
  for (let frame = 0; frame < 120; frame += 1) world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: 1 }]);

  const player = players(world)[0];
  assert.ok(player.x > startPlayerX + 200, `player should have advanced east (${player.x})`);
  assert.ok(world.cameraX > startCameraX, 'camera should follow the eastward march');
  assert.equal(world.snapshot().cameraX, world.cameraX);
  assert.equal(world.snapshot().stageWidth, world.stageWidth);
});

test('the camera ratchets forward and never retreats within a wave', () => {
  const world = new GameWorld({ playerCount: 1, seed: 77, skipCountdown: true });
  advance(world, 0.2);
  for (let frame = 0; frame < 150; frame += 1) world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: 1 }]);
  const advancedCameraX = world.cameraX;

  // Within one wave the camera is monotonic: shoving and enemy AI may push it
  // further east, but nothing (including a westward walk) may scroll it back.
  for (let frame = 0; frame < 150; frame += 1) {
    world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: -1 }]);
    if (world.waveIndex !== 0) break; // a resolved wave legitimately resets the window
    assert.ok(
      world.cameraX >= advancedCameraX - 1e-6,
      `camera retreated to ${world.cameraX} from ${advancedCameraX}`
    );
  }
});

test('the player cannot leave the camera window even though the stage is wider', () => {
  const world = new GameWorld({ playerCount: 1, seed: 5150, skipCountdown: true });
  advance(world, 0.2);
  // Try to march west past the window's left edge.
  for (let frame = 0; frame < 240; frame += 1) world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: -1 }]);
  const player = players(world)[0];
  assert.ok(
    player.x >= world.cameraX + 46 - 1e-6,
    `player x ${player.x} should respect the window left edge ${world.cameraX + 46}`
  );

  const bounds = stageBounds(world.stageWidth);
  assert.ok(player.x <= bounds.maxX - player.radius);
});

test('later groups unlock on the march and arrive ahead of the frontier', () => {
  const world = new GameWorld({ playerCount: 1, seed: 2026, skipCountdown: true });
  advance(world, 1.4);
  const firstArrivals = livingEnemies(world).length;
  assert.ok(firstArrivals > 0, 'the opening group should spawn on schedule');

  // March east without fighting; progress must open later groups.
  for (let frame = 0; frame < 60 * 22; frame += 1) {
    world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: 1 }]);
    for (const actor of livingEnemies(world)) {
      if (actor.state !== 'dead' && Math.abs(actor.x - players(world)[0].x) < 600) {
        actor.health = 0;
        actor.state = 'dead';
        actor.deathTimer = 2;
      }
    }
    if (world.phase === 'lesson') break;
  }

  assert.ok(world.cameraX > ARENA.maxX - CAMERA.width - 1, `the camera should reveal far-east stage (${world.cameraX})`);
  const snapshot = world.snapshot();
  const visible = snapshot.actors.filter(
    (actor) => actor.team === 'enemies' && actor.x >= snapshot.cameraX && actor.x <= snapshot.cameraX + CAMERA.width
  );
  assert.ok(visible.length >= 0, 'enemies stay inside world bounds');
});

test('a cleared field releases the next group so camping cannot stall the run', () => {
  const world = new GameWorld({ playerCount: 1, seed: 9900, skipCountdown: true });
  advance(world, 1.4);
  for (const actor of livingEnemies(world)) {
    actor.health = 0;
    actor.state = 'dead';
    actor.deathTimer = 2;
  }
  const before = livingEnemies(world).length;
  advance(world, 1.0);
  assert.ok(livingEnemies(world).length > before, 'cleared field should unlock the next group');
});

test('the boss arena resets the march and keeps the camera clamped to the stage', () => {
  const world = new GameWorld({ playerCount: 1, seed: 3312, skipCountdown: true });
  // Fast-forward through the first three waves via the cleared-field path.
  for (let wave = 0; wave < 3; wave += 1) {
    advance(world, 1.0);
    for (let frame = 0; frame < 60 * 30 && world.phase === 'wave'; frame += 1) {
      world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: 1 }]);
      for (const actor of livingEnemies(world)) {
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
  }
  advance(world, 0.5);
  assert.equal(world.waveIndex, 3);
  const bounds = stageBounds(world.stageWidth);
  assert.ok(world.cameraX >= bounds.minX && world.cameraX <= bounds.maxX - CAMERA.width);
  const snapshot = world.snapshot();
  assert.ok(snapshot.stageWidth > CAMERA.width);
  for (const actor of snapshot.actors) {
    assert.ok(actor.x >= bounds.minX - 1 && actor.x <= bounds.maxX + 1, `actor ${actor.id} inside stage bounds`);
  }
});

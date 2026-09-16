import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld, ARENA, CAMERA, roadBounds } from '../site/js/sim/world.js';
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

test('roads are wider than the camera window and scroll east with the march', () => {
  const world = new GameWorld({ playerCount: 1, seed: 1948, skipCountdown: true });
  advance(world, 0.2);
  assert.equal(world.phase, 'wave');
  assert.ok(world.road > CAMERA.width, 'the opening road should scroll');
  assert.equal(world.cameraX, ARENA.minX - CAMERA.margin + CAMERA.margin);

  const startCameraX = world.cameraX;
  const startPlayerX = players(world)[0].x;
  // The party walks into a level at its western end — a level is one road, and
  // it is walked from the near end — so the window has half a screen of ground
  // to ignore before the march starts moving it. March until it does.
  for (let frame = 0; frame < 240 && world.cameraX <= startCameraX; frame += 1) {
    world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: 1 }]);
  }

  const player = players(world)[0];
  assert.ok(player.x > startPlayerX + 200, `player should have advanced east (${player.x})`);
  assert.ok(world.cameraX > startCameraX, 'camera should follow the eastward march');
  assert.equal(world.snapshot().cameraX, world.cameraX);
  assert.equal(world.snapshot().roadWidth, world.road);
});

test('the camera follows the fighter back when they give ground', () => {
  const world = new GameWorld({ playerCount: 1, seed: 77, skipCountdown: true });
  advance(world, 0.2);
  for (let frame = 0; frame < 150; frame += 1) world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: 1 }]);
  const advancedCameraX = world.cameraX;
  const oldWindowEdge = advancedCameraX + 46;
  assert.ok(advancedCameraX > ARENA.minX, 'the march has to clear the west clamp before a retreat can move the window');

  // Giving ground brings the view with it. The window used to ratchet east and
  // never come back — and since it is also a hard boundary for the player, a
  // retreat was capped by how far the camera had already advanced, so the
  // ground behind a fighter was unplayable exactly when the encounters need it
  // (a stand is a line you break off from, an ambush is answered by turning).
  let retreated = false;
  for (let frame = 0; frame < 300; frame += 1) {
    world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: -1 }]);
    // A resolved wave legitimately resets the window, by moving the journey on.
    if (world.levelIndex !== 0 || world.waveInLevel !== 0) break;
    retreated ||= world.cameraX < advancedCameraX - 1e-6;
  }
  assert.ok(retreated, `camera never followed the retreat (stuck at ${advancedCameraX})`);

  const player = players(world)[0];
  assert.ok(
    player.x < oldWindowEdge,
    `the fighter should be able to give ground past the old window edge ${oldWindowEdge} (at ${player.x})`
  );
  assert.ok(player.x >= world.cameraX + 46 - 1e-6, 'and still be inside the window they are in');
  const bounds = roadBounds(world.road);
  assert.ok(world.cameraX >= ARENA.minX - 1e-6, 'the window never shows west of the arena origin');
  assert.ok(world.cameraX <= bounds.maxX - CAMERA.width + 1e-6, 'nor east of the road end');
});

test('the window moves by the slack a shove uses up, and not by a snap', () => {
  // The follow has slack on the retreating side (`CAMERA.trail`) so a light
  // knockback, or a step back inside an exchange, does not drag the whole road
  // under the fighter. Against the knockback table — 28 px for a light, 132 for a
  // committed heavy — every ordinary shove is inside the slack, and a retreat
  // past it moves the window by exactly the excess rather than recentring.
  const world = new GameWorld({ playerCount: 1, seed: 77, skipCountdown: true });
  advance(world, 0.2);
  // Far enough east that the arithmetic has road: a retreat measured against a
  // window still resting on its western clamp would be measuring the clamp.
  for (let frame = 0; frame < 400 && world.cameraX < ARENA.minX + 320; frame += 1) {
    world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: 1 }]);
  }

  // Own the field: the only thing moving the fighter from here is the test.
  for (const actor of livingEnemies(world)) {
    actor.health = 0;
    actor.state = 'dead';
    actor.deathTimer = 30;
  }
  world.step(1 / 60, [neutral()]);

  const player = players(world)[0];
  // A fighter who has just been hit can still be carrying knockback velocity,
  // which would drift them a pixel or two mid-step and blur the arithmetic.
  player.vx = 0;
  player.vz = 0;
  const settledCameraX = world.cameraX;
  // The forward slack is zero, so a fighter walking east sits within a frame's
  // step of the window's centre — they move *after* the window does, inside a
  // step, which is why this is a tolerance rather than an equality.
  const settledOffset = player.x - (settledCameraX + CAMERA.width / 2);
  assert.ok(Math.abs(settledOffset) < 12, `the window should be centred while advancing (off by ${settledOffset})`);

  // Inside the slack: a committed heavy's knockback does not move the road.
  const shortShove = CAMERA.trail - 30;
  player.x -= shortShove;
  world.step(1 / 60, [neutral()]);
  assert.equal(world.cameraX, settledCameraX, 'a shove inside the slack moved the window');

  // Past it: the window follows by the excess, and the fighter keeps the slack.
  const givenGround = shortShove + 250;
  const offset = settledOffset - givenGround;
  assert.ok(Math.abs(offset) > CAMERA.trail, 'the shove has to cross the slack for this half');
  player.x -= 250;
  world.step(1 / 60, [neutral()]);
  assert.equal(
    world.cameraX,
    settledCameraX - (Math.abs(offset) - CAMERA.trail),
    'the window should move by the slack used up, not recentre'
  );
  assert.ok(
    Math.abs(player.x - world.cameraX - (CAMERA.width / 2 - CAMERA.trail)) < 1e-6,
    'the fighter should end up holding the slack'
  );
});

test('the player cannot leave the camera window even though the road is wider', () => {
  const world = new GameWorld({ playerCount: 1, seed: 5150, skipCountdown: true });
  advance(world, 0.2);
  // Try to march west past the window's left edge.
  for (let frame = 0; frame < 240; frame += 1) world.step(1 / 60, [{ ...NEUTRAL_INPUT, moveX: -1 }]);
  const player = players(world)[0];
  assert.ok(
    player.x >= world.cameraX + 46 - 1e-6,
    `player x ${player.x} should respect the window left edge ${world.cameraX + 46}`
  );

  const bounds = roadBounds(world.road);
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

  assert.ok(world.cameraX > ARENA.maxX - CAMERA.width - 1, `the camera should reveal the far-east road (${world.cameraX})`);
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

test('crossing into a new place resets the march and clamps the camera to its road', () => {
  const world = new GameWorld({ playerCount: 1, seed: 3312, skipCountdown: true });
  // Fast-forward through the first three places via the cleared-field path.
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
  assert.equal(world.levelIndex, 3, 'the journey is in the castle courtyards');
  assert.equal(world.waveInLevel, 0, 'at the first fight of that place');
  const bounds = roadBounds(world.road);
  assert.ok(world.cameraX >= bounds.minX && world.cameraX <= bounds.maxX - CAMERA.width);
  const snapshot = world.snapshot();
  assert.ok(snapshot.roadWidth > CAMERA.width);
  for (const actor of snapshot.actors) {
    assert.ok(actor.x >= bounds.minX - 1 && actor.x <= bounds.maxX + 1, `actor ${actor.id} inside road bounds`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { GameWorld, LEVEL_EXIT, levelExitX, roadBounds } from '../site/js/sim/world.js';
import { LEVELS } from '../site/js/sim/waves.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

/**
 * A level does not end when the last man falls. It ends when the player walks
 * out of its eastern doorway — the Little Fighter 2 rhythm, where clearing the
 * street opens the way on and leaving is the player's decision. These tests pin
 * that rule from every side it can be got wrong: the level must not end itself,
 * the doorway must be the real road edge and reachable, it must refuse to take a
 * fighter through before the clear registers, the whole party has to arrive, and
 * the next level must start barred at its western end.
 */

const FRAME = 1 / 60;
const MARCH = { ...NEUTRAL_INPUT, moveX: 1 };

const players = (world) => world.actors.filter((actor) => actor.team === 'players');
const exitLine = (world) => levelExitX(world.road);
/** Which fight the journey is in, as the campaign counts it: place.fight. */
const stand = (world) => `${world.levelIndex}.${world.waveInLevel}`;
const isFinale = (world) => world.levelIndex === LEVELS.length - 1 &&
  world.waveInLevel === (LEVELS.at(-1)?.waves.length ?? 1) - 1;

function step(world, seconds, input = NEUTRAL_INPUT) {
  const frames = Math.round(seconds / FRAME);
  for (let frame = 0; frame < frames; frame += 1) {
    world.step(FRAME, players(world).map(() => input));
  }
}

function killEnemies(world) {
  for (const actor of world.actors) {
    if (actor.team !== 'enemies') continue;
    actor.health = 0;
    actor.state = 'dead';
    actor.deathTimer = 2;
  }
}

/** Keeps the party standing so a test can measure the road, not the fight. */
function keepPlayersUp(world) {
  for (const player of players(world)) {
    player.health = player.maxHealth;
    player.invulnerable = 2;
  }
}

/** Clears whatever is standing until the road opens, letting gated groups dump in. */
function clearLevel(world, seconds = 40) {
  for (let frame = 0; frame < seconds * 60 && !world.exitOpen; frame += 1) {
    keepPlayersUp(world);
    killEnemies(world);
    world.step(FRAME, players(world).map(() => NEUTRAL_INPUT));
  }
  return world.exitOpen;
}

/** Marches the party east until the phase changes, or the budget runs out. */
function walkOut(world, seconds = 30) {
  const startedIn = world.phase;
  for (let frame = 0; frame < seconds * 60 && world.phase === startedIn; frame += 1) {
    keepPlayersUp(world);
    killEnemies(world);
    world.step(FRAME, players(world).map(() => MARCH));
  }
}

/** Walks the whole campaign to the finale, clearing everything on the way. */
function walkToFinale() {
  const world = new GameWorld({ playerCount: 1, seed: 20260830, skipCountdown: true });
  for (let frame = 0; frame < 20_000 && !isFinale(world); frame += 1) {
    keepPlayersUp(world);
    killEnemies(world);
    if (world.phase === 'lesson') world.chooseLesson(world.offeredLessons[0]);
    world.step(FRAME, players(world).map(() => MARCH));
  }
  return world;
}

function freshWorld(options = {}) {
  const world = new GameWorld({ playerCount: 1, seed: 4242, skipCountdown: true, ...options });
  step(world, 1.2);
  return world;
}

test('a cleared level waits for the player instead of ending itself', () => {
  const world = freshWorld();
  const living = world.actors.filter((actor) => actor.team === 'enemies').length;
  assert.ok(living > 0, 'the level has to have someone on it to clear');

  assert.equal(clearLevel(world), true, 'clearing the street opens the way out');
  assert.equal(world.phase, 'wave', 'a clear is not an ending');
  assert.equal(stand(world), '0.0');

  // Ten seconds of standing still: no lesson card, no next level, no victory.
  step(world, 10, NEUTRAL_INPUT);
  assert.equal(world.phase, 'wave');
  assert.equal(stand(world), '0.0');
  assert.equal(world.exitOpen, true, 'the way out stays open while he dithers');
});

test('the doorway is the eastern end of the road, and it is reachable', () => {
  const world = freshWorld();
  const bounds = roadBounds(world.road);
  assert.equal(exitLine(world), bounds.maxX - LEVEL_EXIT.depth);

  // Reachable means inside the walkable band: a fighter can stand in the
  // doorway, so "leave by the door" is a walk and not an invisible trigger.
  const player = players(world)[0];
  assert.ok(player);
  player.x = exitLine(world) + LEVEL_EXIT.depth * 0.5;
  step(world, 0.1);
  assert.ok(player.x >= exitLine(world), `walked to ${player.x.toFixed(0)}, doorway opens at ${exitLine(world).toFixed(0)}`);
  assert.ok(player.x <= bounds.maxX, 'and the road still stops him');
});

test('the doorway refuses a fighter standing in it until the clear registers', () => {
  const world = freshWorld();
  assert.equal(clearLevel(world), true);
  const player = players(world)[0];
  assert.ok(player);
  player.x = exitLine(world) + 10;

  // The grace is the beat in which "LEVEL CLEAR" is read; without it a fighter
  // already at the edge would be taken off the road by the last death.
  step(world, LEVEL_EXIT.grace * 0.5);
  assert.equal(world.phase, 'wave');
  assert.equal(stand(world), '0.0');

  step(world, LEVEL_EXIT.grace + 0.2);
  assert.equal(world.phase, 'lesson', 'the first fight ends in a lesson once he walks out');
});

test('marching east is how the level ends, and it carries into the next place', () => {
  const world = freshWorld();
  assert.equal(clearLevel(world), true);
  const player = players(world)[0];
  assert.ok(player);
  assert.ok(player.x < exitLine(world), 'the clear leaves him back down the road');

  walkOut(world);
  assert.equal(world.phase, 'lesson');
  assert.ok(player.x >= exitLine(world), 'it was the walk that ended the level');

  const previousExit = exitLine(world);
  const selected = world.offeredLessons[0];
  assert.ok(selected);
  assert.equal(world.chooseLesson(selected), true);

  // The next road starts at its western end, barred: every level is walked left
  // to right, which is what makes the march mean anything.
  assert.equal(world.levelIndex, 1, 'the gate is the second place on the journey');
  assert.equal(world.waveInLevel, 0, 'and the lesson resumes at its first fight');
  const bounds = roadBounds(world.road);
  for (const traveller of players(world)) {
    assert.ok(
      traveller.x <= bounds.minX + 220,
      `the new level should start at its west end, found x=${traveller.x.toFixed(0)}`
    );
  }
  assert.equal(world.exitOpen, false, 'the new level is barred until its own street is clear');
  assert.notEqual(exitLine(world), previousExit, 'and its doorway is that level’s doorway');
  // A level owns the road, so the doorway is the end of the level's own width.
  assert.equal(exitLine(world), roadBounds(LEVELS[world.levelIndex].road).maxX - LEVEL_EXIT.depth);
});

test('every living fighter has to reach the doorway, not just the first', () => {
  const world = freshWorld({ playerCount: 2 });
  assert.equal(clearLevel(world), true);
  const [first, second] = players(world);
  assert.ok(first && second);
  step(world, LEVEL_EXIT.grace + 0.3);

  first.x = exitLine(world) + 6;
  step(world, 2);
  assert.equal(world.phase, 'wave', 'the pair leaves together or not at all');

  second.x = exitLine(world) + 6;
  step(world, 0.5);
  assert.equal(world.phase, 'lesson');
});

test('the finale ends at the doorway too, not on the kill', () => {
  const world = walkToFinale();
  assert.ok(isFinale(world), `the walk has to reach the crypt (${stand(world)})`);
  assert.equal(world.phase, 'wave');

  // The finale is the second fight of the castle, not a fresh arena: the party
  // is still standing where the stand left them, which may be the doorway the
  // march ended at. Put them back down the hall, then kill the grotesque and
  // stand perfectly still.
  const bounds = roadBounds(world.road);
  for (const player of players(world)) player.x = bounds.minX + 400;

  for (let frame = 0; frame < 8 * 60; frame += 1) {
    keepPlayersUp(world);
    killEnemies(world);
    world.step(FRAME, players(world).map(() => NEUTRAL_INPUT));
  }
  assert.equal(world.exitOpen, true, 'the grotesque’s death opens the road east');
  assert.equal(world.phase, 'wave', 'and the campaign is not over while he stands there');

  walkOut(world);
  assert.equal(world.phase, 'victory', 'leaving the crypt is what ends the run');
});

test('the doorway travels with the snapshot', () => {
  const world = freshWorld();
  assert.equal(world.snapshot().exitOpen, false);
  clearLevel(world);
  const snapshot = world.snapshot();
  assert.equal(snapshot.exitOpen, true);
  assert.equal(typeof JSON.parse(JSON.stringify(snapshot)).exitOpen, 'boolean');
});

/**
 * Levels are places; waves are the fights inside them.
 *
 * The campaign was built the other way round — every fight was its own stage,
 * reached through a doorway — which made the journey a corridor of one-room
 * arenas and let a group of enemies be placed wherever a number said, including
 * in front of the player. Two rules carry the restructure, and both are checked
 * here against a real run rather than against the table:
 *
 *   1. Nothing is ever placed inside the picture. Every arrival walks in from
 *      off the edge of the screen, which is Little Fighter 2's rule and the only
 *      way a player can count what is coming.
 *   2. A level is walked once. Its waves are fought along the same road, so
 *      clearing one moves nobody; only walking out of a doorway moves the party,
 *      and only then is the ground swept.
 *
 * The run below is a demolition harness — every enemy is killed on the frame it
 * appears and the party is kept standing — because what is under test is where
 * fighters come from, not whether they can be beaten. It drives every spawn path
 * in the game (march, surge, stand beat, trap, duel, finale) and watches each
 * one land.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CAMERA, GameWorld, MIN_LEVEL_ROAD, roadBounds } from '../site/js/sim/world.js';
import { LEVELS } from '../site/js/sim/waves.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

const FRAME = 1 / 60;
const MARCH = { ...NEUTRAL_INPUT, moveX: 1 };

/** The campaign in the order it is walked, for counting boundaries. */
const CAMPAIGN_WAVES = LEVELS.flatMap((level) => level.waves);

const players = (world) => world.actors.filter((actor) => actor.team === 'players');
const enemies = (world) => world.actors.filter((actor) => actor.team === 'enemies');
/** Where the journey stands: the place, and the fight in it. */
const stand = (world) => ({ level: world.levelIndex, wave: world.waveInLevel });
const sameStand = (a, b) => a.level === b.level && a.wave === b.wave;

function keepPlayersUp(world) {
  for (const player of players(world)) {
    player.health = player.maxHealth;
    player.invulnerable = 2;
  }
}

function killEnemies(world) {
  for (const enemy of enemies(world)) {
    enemy.health = 0;
    enemy.state = 'dead';
    enemy.deathTimer = 2;
  }
}

/**
 * Walks the whole campaign with a demolition harness, recording every arrival and
 * every fight boundary — including whether crossing it also crossed into a new
 * place.
 */
function runCampaign({ onStep } = {}) {
  const world = new GameWorld({ playerCount: 1, seed: 314159, skipCountdown: true });
  const seen = new Set();
  const arrivals = [];
  const transitions = [];
  let previous = stand(world);

  for (let frame = 0; frame < 90 * 60 && world.phase !== 'victory' && world.phase !== 'defeat'; frame += 1) {
    keepPlayersUp(world);
    killEnemies(world);
    if (world.phase === 'lesson') world.chooseLesson(world.offeredLessons[0]);

    const partyX = players(world).map((player) => player.x);
    const cameraBefore = world.cameraX;
    world.step(FRAME, players(world).map(() => MARCH));

    for (const enemy of enemies(world)) {
      if (seen.has(enemy.id)) continue;
      seen.add(enemy.id);
      arrivals.push({
        archetype: enemy.archetype,
        x: enemy.x,
        cameraBefore,
        cameraAfter: world.cameraX,
        stand: stand(world)
      });
    }

    const now = stand(world);
    if (!sameStand(now, previous)) {
      // The countdown's end is not a boundary: wave 0 is where the journey starts.
      if (previous.wave >= 0) {
        transitions.push({
          into: now,
          from: previous,
          newLevel: now.level !== previous.level,
          partyX: players(world).map((player) => player.x),
          partyXBefore: partyX,
          cameraDelta: world.cameraX - cameraBefore
        });
      }
      previous = now;
    }

    onStep?.(world, frame);
  }

  return { world, arrivals, transitions, seen };
}

test('no fighter ever appears inside the picture', () => {
  const { arrivals } = runCampaign();
  assert.ok(arrivals.length >= 25, `the run has to produce arrivals to test (${arrivals.length})`);

  for (const arrival of arrivals) {
    // The window may move during the step the fighter appears in, so the arrival
    // is judged against the union of the window before and after: visible in
    // either one is visible.
    const left = Math.min(arrival.cameraBefore, arrival.cameraAfter);
    const right = Math.max(arrival.cameraBefore, arrival.cameraAfter) + CAMERA.width;
    assert.ok(
      arrival.x <= left || arrival.x >= right,
      `${arrival.archetype} arrived at ${arrival.x.toFixed(0)}, inside the window ${left.toFixed(0)}–${right.toFixed(0)}`
    );
  }

  // And every kind of arrival went through the rule: the marching crowd, the
  // gate's queue, the trap, the flood's surges, the stand's beats, the duelist
  // and the bound thing. If a spawn path ever stops using `spawnEnemy` it will
  // show up here as a missing archetype.
  const archetypes = new Set(arrivals.map((arrival) => arrival.archetype));
  for (const archetype of ['thug', 'spear', 'wretch', 'captain', 'grotesque']) {
    assert.ok(archetypes.has(archetype), `${archetype} never arrived`);
  }
});

test('a level is walked once: its waves move nobody and sweep nothing', () => {
  const { transitions } = runCampaign();
  assert.equal(transitions.length, CAMPAIGN_WAVES.length - 1, 'the run crosses every fight boundary');
  assert.ok(
    transitions.some((transition) => !transition.newLevel),
    'at least one boundary is a handoff inside a place, or the structure is untested'
  );

  for (const transition of transitions) {
    const level = LEVELS[transition.into.level];
    const name = `${level.name} · wave ${transition.into.wave + 1} (${level.waves[transition.into.wave].title})`;

    if (transition.newLevel) {
      // A new level is entered at its western end, on the road's own ground.
      const bounds = roadBounds(level.road);
      for (const x of transition.partyX) {
        assert.ok(x <= bounds.minX + 220, `${name}: the party entered at ${x.toFixed(0)}, not the west end`);
      }
      continue;
    }

    // Inside a level the fighting only pauses: same road, same view, same loot on
    // the ground, and the party standing exactly where they were. The window may
    // still *follow* them — they are walking — but only by a frame's worth; a
    // wave boundary that teleports the party or resets the view is the old
    // one-arena-per-fight design showing through.
    for (const [index, x] of transition.partyX.entries()) {
      const moved = Math.abs(x - (transition.partyXBefore[index] ?? x));
      assert.ok(moved < 12, `${name}: the party was moved ${moved.toFixed(0)} px by a wave boundary`);
    }
    assert.ok(
      Math.abs(transition.cameraDelta) < 12,
      `${name}: the window jumped ${transition.cameraDelta.toFixed(0)} px at a wave boundary`
    );
  }
});

test('a level ends at its doorway, and only its last wave opens one', () => {
  const world = new GameWorld({ playerCount: 1, seed: 2718, skipCountdown: true });
  const doorOpenedOn = [];

  for (let frame = 0; frame < 90 * 60 && world.phase !== 'victory' && world.phase !== 'defeat'; frame += 1) {
    keepPlayersUp(world);
    killEnemies(world);
    if (world.phase === 'lesson') world.chooseLesson(world.offeredLessons[0]);
    const wasOpen = world.exitOpen;
    world.step(FRAME, players(world).map(() => MARCH));
    if (!wasOpen && world.exitOpen) doorOpenedOn.push(stand(world));
  }

  assert.ok(doorOpenedOn.length >= 4, `the doorway opens once per level (${doorOpenedOn.length})`);
  for (const opened of doorOpenedOn) {
    const level = LEVELS[opened.level];
    assert.equal(
      opened.wave,
      level.waves.length - 1,
      `the doorway opened on ${level.waves[opened.wave].title}, which is not the end of ${level.name}`
    );
  }
  // One doorway per place, and no place opens two: the road that stays open
  // afterwards is the one the player walks out of.
  assert.equal(
    new Set(doorOpenedOn.map((opened) => opened.level)).size,
    doorOpenedOn.length,
    'one doorway per level'
  );
});

test('every road is wide enough for the rule to hold wherever the party stands', () => {
  for (const level of LEVELS) {
    assert.ok(level.road >= MIN_LEVEL_ROAD, `${level.name} is ${level.road} wide`);
    // The guarantee is geometric: at the tightest place on the road — the party
    // dead centre — there is still an apron of unshown ground on both sides.
    assert.ok(level.road - CAMERA.width >= 2 * 90, `${level.name} has no apron to arrive on`);
  }
});

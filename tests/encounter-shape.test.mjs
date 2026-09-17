/**
 * The shape of each encounter, pinned against the way it was measured.
 *
 * The campaign's difficulty is meant to be a property of *design* — how the road
 * narrows, when the trap springs, what the clock is doing — rather than of a
 * multiplier on anything. `tools/encounter-measure.mjs` is the instrument for
 * that (two bot playthroughs, a wall defined as a death, a whole bar, or a wave
 * that will not resolve in 75 s), and this file is its cheap half: the structural
 * facts those playthroughs established, asserted in the milliseconds it takes to
 * import the wave table, so that retuning one is not free.
 *
 * A playthrough is the only honest check of a *cost*. What is checked here is the
 * shape that produced the cost — the things that were wrong first and measured
 * right afterwards, every one of which was a wave that looked like an encounter
 * and was not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CAMERA, MIN_LEVEL_ROAD } from '../site/js/sim/world.js';
import { ATTACK_SLOTS, ENCOUNTER_LABELS, LEVELS, laneNarrowingAt } from '../site/js/sim/waves.js';

// The camera window, from the sim rather than from the canvas width: a road no
// wider than this has nothing to scroll and jams its arrivals together.
const ARENA_WIDTH = CAMERA.width;
// The campaign in the order it is walked: a place, then the fights along it.
const CAMPAIGN_WAVES = LEVELS.flatMap((level) => level.waves);
const byKind = (kind) => CAMPAIGN_WAVES.filter((wave) => wave.kind === kind);
const levelHolding = (kind) => LEVELS.find((level) => level.waves.some((wave) => wave.kind === kind));

test('the campaign introduces one encounter idea at a time', () => {
  const kinds = CAMPAIGN_WAVES.map((wave) => wave.kind);
  assert.deepEqual(kinds, ['press', 'choke', 'duel', 'ambush', 'flood', 'hold', 'boss']);
  for (const kind of kinds) {
    assert.ok(ENCOUNTER_LABELS[kind], `${kind} names itself in the HUD`);
  }
  // Every wave is one of the measured kinds, and every kind but the boss is used
  // once: a second flood is a second question, not the same one harder.
  assert.equal(new Set(kinds).size, kinds.length);
});

test('a level is one place and owns the ground its waves are fought on', () => {
  // The nesting is the model, not a convenience over a flat table: the sim holds
  // a level index and an index into that level's waves, so a wave cannot belong
  // to two places or to none, and there is no second list to keep in step.
  for (const level of LEVELS) {
    assert.ok(level.waves.length >= 1, `${level.name} holds at least one fight`);
    assert.ok(level.name.length > 0 && level.setting.length > 0, 'a level names a place and a dressing');
    for (const wave of level.waves) {
      assert.ok(wave.title.length > 0 && wave.subtitle.length > 0, `${level.name} names its fights`);
      // The road, the dressing and the name belong to the place: a wave that
      // carried its own ground would be the old one-arena-per-fight design.
      for (const own of ['road', 'stageWidth', 'setting', 'name']) {
        assert.equal(wave[own], undefined, `${wave.title} leaves \`${own}\` to its level`);
      }
    }
  }
  // Two fights in one place only happens where the place earns it: at least one
  // level holds several waves, or the nesting is decoration.
  assert.ok(LEVELS.filter((level) => level.waves.length > 1).length >= 1, 'a place holds more than one fight');
});

test('every place has procedural scenery, and a level is dressed in exactly one of them', () => {
  const scenery = new Set(['cobbled-streets', 'town-gate', 'sala-darmi', 'castello']);
  for (const level of LEVELS) {
    assert.ok(scenery.has(level.setting), `${level.name} is dressed in ${level.setting}`);
  }
  // Two places may share a dressing — the castle's yard and its hall are one
  // castle — but that is the only reason a setting may repeat: a level wears one
  // outfit for every fight in it, because the scenery *is* the place and the
  // place does not move while the party is standing in it.
  const used = new Set(LEVELS.map((level) => level.setting));
  assert.ok(used.size <= LEVELS.length, 'no level is undressed');
  assert.equal(LEVELS.at(-1).setting, 'castello', 'the journey ends in the castle');
});

test('commitment is uniform, so difficulty cannot hide in a per-wave number', () => {
  // The old `pressure` multiplier is gone and the slot budget replaced it as a
  // per-wave override: a wave that narrows the roster to one melee attacker is
  // the same cheat in quieter clothes. The budget is one frozen shared value.
  assert.deepEqual({ ...ATTACK_SLOTS }, { melee: 2, reach: 1 });
  // The types make a per-wave override unwritable; this keeps it out of the data
  // as well, where a cast or a JS-authored wave could still smuggle one in.
  for (const wave of CAMPAIGN_WAVES) {
    for (const knob of ['slots', 'pressure', 'health', 'armor']) {
      assert.equal(wave[knob], undefined, `${wave.title} does not scale itself through \`${knob}\``);
    }
  }
});

test('every level is wide enough to hide an arrival', () => {
  // Measured the hard way on the stair: ground the camera cannot scroll across
  // puts every arrival within a stride of the player, and three of them at once
  // is a hitstun lock rather than a fight — eleven hits, no cut ever completed.
  // The rule is now absolute — nothing is ever placed inside the picture — so
  // every road has to be wider than the window by an apron on both sides, and
  // `MIN_LEVEL_ROAD` is the width at which that is true wherever the player
  // stands. The duel used to be exempt (its captain waited on the mat); he walks
  // in off the edge now, so its hall is held to the same width as everything.
  for (const level of LEVELS) {
    assert.ok(
      level.road >= MIN_LEVEL_ROAD,
      `${level.name} is ${level.road} wide; an arrival needs ${MIN_LEVEL_ROAD} to stay off-screen`
    );
  }
});

test('the press arrives in clumps, not one man per interval', () => {
  // A crowd that is never more than one deep is met one at a time, and the
  // measured cost of that was exactly zero across every seed: the wave taught
  // nothing. Two arriving inside a third of a second is two clubs on one beat,
  // which is what the thug's pair tempo was built for.
  const [press] = byKind('press');
  assert.ok(press, 'the march opens with a press');
  const tight = press.groups.filter((group) => group.interval <= 0.4);
  assert.ok(tight.length >= 2, 'the rabble walks in as more than one clump');
  const bodies = press.groups.reduce((sum, group) => sum + group.count, 0);
  assert.ok(bodies >= 4 && bodies <= 8, `${bodies} thugs is a press, not a wall`);
});

test('the gate is where the choke happens', () => {
  // Measured: with the groups spread evenly over the stage, the entire roster
  // arrived before the funnel, the fight happened on the open road, and the lane
  // was walked through afterwards as decoration. Every group after the opening
  // one now unlocks at the gate's approach or inside it.
  const [choke] = byKind('choke');
  assert.ok(choke?.lane, 'a choke is a narrowing of the road');
  const authored = choke.groups.filter((group) => typeof group.from === 'number');
  assert.ok(authored.length > 0, 'the queue is scheduled against the gate, not the stage');
  for (const group of authored) {
    assert.ok(
      group.from >= choke.lane.from - choke.lane.approach,
      `a group unlocking at ${group.from} arrives before the gate's approach`
    );
  }
  // And the gate genuinely narrows: half the road's depth at the mouth.
  assert.equal(laneNarrowingAt(choke.lane.from, choke.lane), 1);
  assert.equal(laneNarrowingAt(choke.lane.to + choke.lane.approach, choke.lane), 0);
});

test('the trap is sprung by the bait breaking, not by a mark on the road', () => {
  // Both wrong versions are recorded in the source and in the decision log:
  // sprung into the middle of the bait it cost a whole bar, and sprung after the
  // bait was dead it cost nothing at all — 0 damage across every seed, three
  // wretches delivered into a standing player's back. What is left springs while
  // the bait is still standing, and is small enough to be a turn.
  const [ambush] = byKind('ambush');
  assert.ok(ambush, 'the campaign has a trap');
  const bait = ambush.groups.reduce((sum, group) => sum + group.count, 0);
  assert.ok(ambush.ambush.remaining >= 1, 'the doors can open with the bait alive');
  assert.ok(ambush.ambush.remaining < bait, 'and they cannot open only once it is dead');
  const behind = ambush.ambush.behind.reduce((sum, group) => sum + group.count, 0);
  assert.ok(behind >= 2 && behind <= 4, `${behind} arrivals behind is a turn, not a burial`);
  assert.ok(behind + bait <= 8, 'the whole trap and its bait stay a single fight');
});

test('the flood surges on a clock with a brake, and furnishes its counterplay', () => {
  const [flood] = byKind('flood');
  assert.ok(flood.surges.waves.length >= 2, 'a flood fills more than once');
  assert.ok(flood.surges.every >= 6, 'the lull is long enough to cross the yard and come back');
  assert.ok((flood.provisions ?? []).length >= 2, 'the yard has an answer lying at both ends');
  // The surges are authored as a stream, not a wall on one frame: a group that
  // lands together is a pile, and the pile is what killed in the failing runs.
  // A group of one is the exception — the officer comes alone, and has no
  // cadence to keep.
  for (const surge of flood.surges.waves) {
    for (const group of surge) {
      if (group.count === 1) continue;
      assert.ok(group.interval > 0, 'a surge arrives over time');
    }
  }
});

test('the stand holds a clock it can outlast, and feeds off the edge', () => {
  const [hold] = byKind('hold');
  assert.ok(hold, 'the campaign has a stand');
  assert.ok(hold.hold.seconds >= 15 && hold.hold.seconds <= 30, `${hold.hold.seconds}s of clock is a stand`);
  assert.ok(hold.hold.every > 0 && hold.hold.beats.length >= 2, 'beats cycle, so the mix changes as it wears on');
  // The stand is the encounter with nowhere to march to, so it was authored with
  // its beats arriving a stride behind the player, inside the frame. That is the
  // one placement this project does not allow — a fighter appearing beside you is
  // a fighter appearing out of thin air — so the beats come in at the edge of the
  // picture like everything else, and the walk-in is the player's notice.
  const road = levelHolding('hold').road;
  assert.ok(road >= MIN_LEVEL_ROAD, 'the hall keeps enough road to arrive on');
  assert.ok((hold.provisions ?? []).length >= 1, 'a stand is furnished for attrition');
  for (const provision of hold.provisions ?? []) {
    assert.ok(provision.x < road - 100, `the ${provision.kind} at ${provision.x} is inside the hall`);
  }
});

test('the duel is fought on a mat, and it is a duel', () => {
  // No crowd, and no way to make one: the captain is placed once and never
  // reinforced. Measured at 1520 px of mat the duel cost a competent bot 5
  // health — 88 speed against the player's 220 is an opponent you can simply
  // walk away from, which is not a lesson. A mat barely wider than the camera
  // is a mat you have to fence on.
  const [duel] = byKind('duel');
  assert.ok(duel?.duel, 'the duel places its opponent');
  assert.equal(duel.groups, undefined, 'nothing joins a duel');
  assert.ok(duel.duel.archetype === 'captain', 'and it is the armoured one');
  // He holds an end of the hall rather than being dropped on the mat in front of
  // the player: the party walks in at the west, so the far end is off-screen and
  // the duel is something the player advances into.
  assert.ok(duel.duel.end === 'east' || duel.duel.end === 'west', 'the champion holds an end');
  // A hall may scroll a little — it has to, to hide his arrival — but not a
  // stage's worth: the distance a fighter can open is the distance they can walk
  // away in, and a duel you can stroll out of is not a duel.
  const road = levelHolding('duel').road;
  assert.ok(
    road <= ARENA_WIDTH + 400,
    `${road} px of hall gives ${road - ARENA_WIDTH} px of room to run in`
  );
});

test('the boss is the only thing that arrives with the finale', () => {
  const [boss] = byKind('boss');
  const bodies = boss.groups.reduce((sum, group) => sum + group.count, 0);
  assert.equal(bodies, 1, 'the bound thing arrives alone, and what it drags in it drags in itself');
  assert.equal(boss.groups[0].archetype, 'grotesque');
});

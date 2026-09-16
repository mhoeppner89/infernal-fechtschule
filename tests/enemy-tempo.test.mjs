import test from 'node:test';
import assert from 'node:assert/strict';

import { ATTACKS, ENEMY_TEMPO, attackDuration, getAttack } from '../site/js/sim/attacks.js';
import { createEnemy } from '../site/js/sim/factories.js';
import { GameWorld } from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';
import { ANIMATION_MANIFEST } from '../site/js/render/animation-manifest.js';
import { SpriteAnimationCatalog, attackAnimationFrameIndex } from '../site/js/render/animation-catalog.js';

/**
 * An archetype's identity is its cadence: how fast it decides, whether it
 * commits alone or in company, and what it does when the player makes the
 * obvious mistake. These tests pin both halves of that — the frame data that
 * declares it, and a live simulation that proves the crowded, armoured, and
 * paired behaviours actually happen.
 */

const FRAME = 1 / 60;
const FIELD_ARCHETYPES = ['thug', 'spear', 'captain', 'wretch'];
const frames = (seconds) => Math.round(seconds / FRAME);

function arena(seed) {
  const world = new GameWorld({ playerCount: 1, seed, skipCountdown: true });
  for (let tick = 0; tick < 12 && world.phase !== 'wave'; tick += 1) {
    world.step(FRAME, [{ ...NEUTRAL_INPUT }]);
  }
  assert.equal(world.phase, 'wave');
  world.actors.splice(1);
  world.spawnQueue.length = 0;
  return { world, player: world.actors[0] };
}

function spawn(world, archetype, x, z, id) {
  const enemy = createEnemy(id, archetype, x, z);
  world.actors.push(enemy);
  return enemy;
}

/** A pinned, unkillable training dummy: it takes every hit and never swings. */
function pinAsDummy(world, player, x = 400, z = 420) {
  player.x = x;
  player.z = z;
  player.health = 1e6;
  player.maxHealth = 1e6;
}

function keep(world, keepers, player) {
  for (const actor of [...world.actors]) {
    if (actor !== player && !keepers.includes(actor)) world.actors.splice(world.actors.indexOf(actor), 1);
  }
}

/** Records every attack an actor starts, and every contact that lands on the player. */
function watch(world, watchers, player, seconds) {
  const swings = [];
  const contacts = [];
  const previous = new Map(watchers.map((actor) => [actor.id, null]));
  const beats = [];
  const armed = new Map(watchers.map((actor) => [actor.id, 0]));

  for (let frame = 0; frame < frames(seconds); frame += 1) {
    pinAsDummy(world, player);
    world.consumeEvents();
    world.step(FRAME, [{ ...NEUTRAL_INPUT }]);
    keep(world, watchers, player);

    for (const actor of watchers) {
      if (!world.actors.includes(actor)) continue;
      const timer = actor.pairBeatTimer;
      if (timer > 0 && armed.get(actor.id) <= 0) beats.push({ id: actor.id, frame, served: false });
      armed.set(actor.id, timer);

      const current = actor.attack ? { id: actor.attack.id, elapsed: actor.attack.elapsed } : null;
      const prior = previous.get(actor.id);
      if (current && (!prior || prior.id !== current.id || current.elapsed < prior.elapsed)) {
        swings.push({ id: actor.id, attackId: current.id, frame });
        const pending = [...beats].reverse().find((beat) => beat.id === actor.id
          && !beat.served && current.id === 'thug_follow');
        if (pending) pending.served = true;
      } else if (current) {
        const index = swings.length - 1;
        if (swings[index]?.id === actor.id) swings[index].lastFrame = frame;
      }
      previous.set(actor.id, current);
    }

    for (const event of world.consumeEvents()) {
      if (event.type !== 'hit' && event.type !== 'heavy-hit') continue;
      contacts.push({ attackId: event.attackId, frame, amount: event.amount, impact: event.impact });
    }
  }

  return { swings, contacts, beats };
}

/** Cadence of one archetype swinging at a pinned dummy with nobody else alive. */
function soloCadence(archetype, seed) {
  const { world, player } = arena(seed);
  const actor = spawn(world, archetype, 400 + (archetype === 'spear' ? 140 : 62), 420, 300);
  const { swings } = watch(world, [actor], player, 18);
  return swings;
}

test('every field archetype declares its own acceleration and stations', () => {
  assert.deepEqual(Object.keys(ENEMY_TEMPO).sort(), [...FIELD_ARCHETYPES].sort());

  const signatures = new Set();
  const midpoints = new Map();
  for (const archetype of FIELD_ARCHETYPES) {
    const tempo = ENEMY_TEMPO[archetype];
    signatures.add(JSON.stringify({
      cooldown: tempo.cooldown,
      think: tempo.think,
      station: tempo.station,
      waitStation: tempo.waitStation,
      band: tempo.band
    }));
    midpoints.set(archetype, (tempo.cooldown[0] + tempo.cooldown[1]) / 2);

    assert.ok(tempo.cooldown[0] > 0, `${archetype} swings back to back with no pause`);
    assert.ok(tempo.waitStation >= tempo.station, `${archetype} waits inside its own strike range`);
    assert.ok(tempo.band[1] > 0 && tempo.depth > 0, `${archetype} has no commit window`);
  }
  assert.equal(signatures.size, FIELD_ARCHETYPES.length, 'two archetypes share one tempo');

  // The swarm is the fastest, the spear the most patient, and the club is
  // between them — the ordering a player should be able to feel.
  assert.ok(midpoints.get('wretch') < midpoints.get('thug'), 'the wretch no longer out-paces the thug');
  assert.ok(midpoints.get('thug') < midpoints.get('spear'), 'the spear no longer waits longer than the thug');
});

test('each archetype owns a kit the others cannot field', () => {
  const rosters = {};
  for (const definition of Object.values(ATTACKS)) {
    if (definition.owner === 'player') continue;
    rosters[definition.owner] = rosters[definition.owner] ?? [];
    rosters[definition.owner].push(definition.id);
  }

  assert.deepEqual(rosters.thug.sort(), ['thug_body', 'thug_follow', 'thug_low', 'thug_overhead', 'thug_press']);
  assert.deepEqual(rosters.spear.sort(), ['spear_brace', 'spear_thrust']);
  assert.deepEqual(rosters.captain.sort(), ['captain_answer', 'captain_bash', 'captain_cut']);
  assert.deepEqual(rosters.wretch, ['wretch_claw']);

  // One flurry per club, and only the club: a two-beat hand-off, not a chain
  // that compounds across the crowd.
  const chained = Object.values(ATTACKS).filter((definition) => definition.aiChain);
  assert.deepEqual(chained.map((definition) => definition.id), ['thug_press']);
  assert.equal(getAttack('thug_press').aiChain, 'thug_follow');

  // The spear's shaft runs through a front rank; the butt is what a crowd gets.
  assert.ok(getAttack('spear_thrust').maxTargets >= 2, 'the thrust no longer pierces');
  assert.ok(getAttack('spear_brace').minForward < 0, 'the brace cannot answer a player inside its shaft');
  assert.ok(
    getAttack('spear_brace').guardDamage > getAttack('spear_thrust').guardDamage,
    'the butt no longer punishes a raised guard'
  );
});

test('a borrowed clip keeps the borrowing row inside its own active window', () => {
  const aliases = Object.values(ATTACKS).filter((definition) => definition.animation);
  assert.ok(aliases.length >= 4, 'the new rows have no borrowed art');

  // The renderer has to follow the alias too, or a new tempo renders as the
  // placeholder clip.
  const catalog = new SpriteAnimationCatalog();
  for (const definition of aliases) {
    const resolved = catalog.lookupActor({
      archetype: definition.owner,
      weapon: null,
      desiredWeapon: null,
      state: 'attack',
      attackId: definition.id,
      reactionZone: null
    });
    assert.equal(
      resolved?.id,
      `${definition.owner}:default:${definition.animation}`,
      `${definition.id} does not resolve to its borrowed art`
    );
  }

  for (const definition of aliases) {
    const borrowedRows = Object.values(ATTACKS).filter((other) => other.id === definition.animation);
    assert.equal(borrowedRows.length, 1, `${definition.id} aliases an unknown row`);

    const clip = ANIMATION_MANIFEST.find((candidate) => candidate.availability === 'ready'
      && candidate.state === 'attack'
      && candidate.attackId === definition.animation
      && candidate.archetype === definition.owner);
    assert.ok(clip, `${definition.id} borrows ${definition.animation}, which has no ready clip for ${definition.owner}`);

    // The clip is only borrowed for its poses: the row's own timing must still
    // put the contact key exactly inside its active frames.
    const activeStart = definition.startup;
    const activeEnd = definition.startup + definition.active;
    for (let milliseconds = 0; milliseconds <= Math.ceil(attackDuration(definition) * 1000); milliseconds += 1) {
      const elapsed = milliseconds / 1000;
      const frame = clip.frames[attackAnimationFrameIndex(clip, definition.id, elapsed)];
      const expected = elapsed >= activeStart && elapsed < activeEnd;
      assert.equal(
        frame?.cue === 'contact',
        expected,
        `${definition.id} shows ${frame?.cue} at ${elapsed.toFixed(3)}s`
      );
    }
  }
});

test('thugs press in pairs: one club starts it, the mate answers on a beat', () => {
  const { world, player } = arena(97);
  const thugs = [spawn(world, 'thug', 400 + 66, 420, 200), spawn(world, 'thug', 400 + 78, 426, 201)];
  const { swings, contacts, beats } = watch(world, thugs, player, 12);

  assert.ok(beats.length >= 2, `a pair armed ${beats.length} beats in 12s`);
  assert.equal(beats.filter((beat) => beat.served).length, beats.length, 'an armed beat was dropped with the mate in reach');

  const presses = swings.filter((swing) => swing.attackId === 'thug_press');
  assert.ok(presses.length >= 2, 'the pair never opened with a jab');

  for (const beat of beats) {
    // The mate may still be finishing its own cut when the beat lands on it, so
    // the answer can follow the arming by a little more than the beat delay.
    const answered = swings.find((swing) => swing.id === beat.id
      && swing.attackId === 'thug_follow'
      && swing.frame >= beat.frame
      && (swing.frame - beat.frame) / 60 <= ENEMY_TEMPO.thug.pair.beatDelay + 0.9);
    assert.ok(answered, 'the mate took a beat but never swung on it');
  }

  // The whole point of the beat is that the second club arrives inside the
  // window the first one opened, so contacts land in clusters.
  const clustered = contacts.filter((contact, index) => index > 0
    && (contact.frame - contacts[index - 1].frame) / 60 <= 0.5);
  assert.ok(clustered.length >= 2, 'the pair never landed a two-club press');

  const solo = arena(97);
  const lone = spawn(solo.world, 'thug', 400 + 66, 420, 200);
  const loneWatch = watch(solo.world, [lone], solo.player, 12);
  assert.equal(loneWatch.beats.length, 0, 'a lone thug armed a pair beat');
});

test('a mate that is hit loses its half of the beat', () => {
  const { world, player } = arena(101);
  const thugs = [spawn(world, 'thug', 400 + 62, 420, 200), spawn(world, 'thug', 400 + 74, 424, 201)];

  let holder = null;
  for (let frame = 0; frame < frames(3) && !holder; frame += 1) {
    pinAsDummy(world, player);
    world.step(FRAME, [{ ...NEUTRAL_INPUT }]);
    keep(world, thugs, player);
    holder = thugs.find((thug) => thug.pairBeatTimer > 0) ?? null;
  }
  assert.ok(holder, 'no mate ever took a beat');
  const spare = thugs.find((thug) => thug !== holder);

  // Stand this out as a duel between the player and the mate holding the beat.
  spare.x = 900;
  spare.z = 420;
  player.x = 400;
  player.z = holder.z;
  player.facing = holder.x >= player.x ? 1 : -1;

  const light = getAttack('ls_l1');
  player.attack = {
    id: 'ls_l1',
    elapsed: 0,
    targetId: holder.id,
    hitIds: new Set(),
    hitConfirmed: false,
    blocked: false,
    queuedAction: null,
    activeCuePlayed: false,
    signatureShown: false
  };
  player.state = 'attack';
  player.stateElapsed = 0;
  player.stateDuration = attackDuration(light);

  for (let frame = 0; frame < frames(light.startup + light.active + 0.05); frame += 1) {
    world.step(FRAME, [{ ...NEUTRAL_INPUT }]);
    keep(world, thugs, player);
  }

  assert.equal(holder.state, 'hitstun', 'the light never reached the mate');
  assert.equal(holder.pairBeatTimer, 0, 'a flinched mate kept the beat');
});

/**
 * Drives one button against a pinned captain and reports the exchange from the
 * captain's side: what the plate absorbed, whether it moved, and what it threw
 * back.
 */
function pressCaptain(seed, button, seconds) {
  const { world, player } = arena(seed);
  const captain = spawn(world, 'captain', 400 + 74, 420, 300);
  const answers = [];
  const contacts = [];
  let flinchFrames = 0;
  let armourBrokenAt = null;
  // Hit-stop freezes elapsed time, so an answer is a transition, not a reading.
  let previousAnswer = null;

  for (let frame = 0; frame < frames(seconds); frame += 1) {
    pinAsDummy(world, player);
    captain.x = 400 + 74;
    captain.z = 420;
    captain.health = 1e6;
    captain.maxHealth = 1e6;
    const pressing = frame % 40 === 0;

    world.consumeEvents();
    world.step(FRAME, [{
      ...NEUTRAL_INPUT,
      lightPressed: pressing && button === 'light',
      heavyPressed: pressing && button === 'heavy'
    }]);
    if (!world.actors.includes(captain)) break;

    // Only hitstun counts as being moved: a broken guard is a legitimate way
    // through, so guardbreak frames are nobody's failure here. And only while
    // the plate is intact — once it is gone he is an ordinary man in a helmet.
    if (captain.armor > 0) {
      if (captain.state === 'hitstun' && captain.stateElapsed < FRAME * 2) flinchFrames += 1;
    } else if (armourBrokenAt === null) {
      armourBrokenAt = frame;
    }
    const swing = captain.attack;
    if (swing?.id === 'captain_answer'
      && (!previousAnswer || previousAnswer.id !== swing.id || swing.elapsed < previousAnswer.elapsed)) {
      answers.push(frame);
    }
    previousAnswer = swing ? { id: swing.id, elapsed: swing.elapsed } : null;

    for (const event of world.consumeEvents()) {
      if (event.type !== 'hit' && event.type !== 'heavy-hit') continue;
      contacts.push({ attackId: event.attackId, impact: event.impact, amount: event.amount });
    }
  }

  return { captain, contacts, answers, flinchFrames, armourBrokenAt };
}

test('an armoured captain shrugs lights off and answers them', () => {
  const light = pressCaptain(103, 'light', 14);
  const shrugged = light.contacts.filter(
    (contact) => contact.attackId === 'ls_l1' && contact.impact === 'armor'
  );

  assert.ok(shrugged.length >= 6, `only ${shrugged.length} lights were absorbed by plate`);
  assert.equal(light.flinchFrames, 0, 'an absorbed light moved the captain');
  assert.ok(light.answers.length >= 2, `the captain answered ${light.answers.length} lights`);
  assert.ok(
    light.contacts.some((contact) => contact.attackId === 'captain_answer' && (contact.amount ?? 0) > 0),
    'the answer never actually landed'
  );

  // Lights are the slow way, not a wall: mashing them does eventually get the
  // plate off, but not before the captain has had several answers.
  assert.ok(light.armourBrokenAt !== null, 'a light can never get through plate');
  assert.ok(
    light.armourBrokenAt > frames(7),
    `lights stripped the plate in ${(light.armourBrokenAt / 60).toFixed(1)}s of mashing`
  );

  // Bounded: one bill per exchange, never a machine gun.
  for (let index = 1; index < light.answers.length; index += 1) {
    assert.ok(
      (light.answers[index] - light.answers[index - 1]) / 60 >= ENEMY_TEMPO.captain.answer.cooldown - 0.05,
      'the captain answered twice inside its lockout'
    );
  }
});

test('the committed strike is the way through plate', () => {
  const heavy = pressCaptain(103, 'heavy', 14);
  const bitten = heavy.contacts.filter(
    (contact) => contact.attackId === 'ls_h' && contact.impact === 'armor'
  );

  assert.ok(bitten.length >= 1, 'a heavy never bit into the plate');
  assert.equal(heavy.captain.armor, 0, `${Math.round(heavy.captain.armor)} armour survived the heavies`);
  assert.ok(heavy.flinchFrames > 0, 'the captain never flinched, even with the plate broken');
  assert.equal(heavy.answers.length, 0, 'the captain answered a committed strike');

  // Measured, not assumed: plate has to cost lights several times what it
  // costs heavies, or the armoured lesson has no lesson in it.
  const light = pressCaptain(103, 'light', 14);
  const armourHits = (run) => run.contacts.filter((contact) => contact.impact === 'armor').length;
  const lightCost = (light.captain.maxArmor - light.captain.armor) / Math.max(1, armourHits(light));
  const heavyCost = (heavy.captain.maxArmor - heavy.captain.armor) / Math.max(1, armourHits(heavy));

  assert.ok(
    heavyCost >= 3.5 * lightCost,
    `a heavy drains ${heavyCost.toFixed(1)} armour and a light ${lightCost.toFixed(1)}: too close to read`
  );
});

test('the answer is readable, parryable, and armed only by plate', () => {
  const answer = getAttack('captain_answer');
  const beat = ENEMY_TEMPO.captain.answer;
  assert.equal(beat.attack, answer.id);
  assert.ok(beat.delay < beat.window, 'the answer fires before it can be read');
  assert.ok(beat.window < beat.cooldown, 'the answer window outlives its lockout');
  assert.notEqual(answer.parryable, false, 'the answer cannot be parried');
  assert.ok(answer.heavy, 'the answer is not a committed swing');
  assert.ok(answer.reach >= 74, 'the answer no longer reaches past a light cut');
  assert.equal(getAttack('captain_cut').animation, undefined, 'the borrowed clip became an alias of itself');
});

test('the spear line punishes crowding', () => {
  const tempo = ENEMY_TEMPO.spear;
  assert.ok(tempo.line, 'the spear lost its line');
  assert.ok(tempo.line.crowdStation < tempo.line.commitStation, 'the line no longer closes on a crowd');
  assert.ok(
    (tempo.line.crowdCooldown[0] + tempo.line.crowdCooldown[1]) / 2
      < (tempo.cooldown[0] + tempo.cooldown[1]) / 2,
    'a crowd no longer speeds the line up'
  );

  // Alone at reach: thrusts, and keeps its distance.
  const alone = arena(107);
  const loneSpear = spawn(alone.world, 'spear', 400 + 152, 420, 400);
  const lone = watch(alone.world, [loneSpear], alone.player, 12);
  assert.ok(lone.swings.some((swing) => swing.attackId === 'spear_thrust'), 'the spear never thrust');
  assert.ok(!lone.swings.some((swing) => swing.attackId === 'spear_brace'), 'the spear butted from reach');
  const loneStation = Math.abs(loneSpear.x - 400);

  // Buried in company: the same spear closes up and thrusts more often.
  const crowded = arena(107);
  const crowdSpear = spawn(crowded.world, 'spear', 400 + 152, 420, 400);
  const thugs = [spawn(crowded.world, 'thug', 400 + 48, 412, 401), spawn(crowded.world, 'thug', 400 + 52, 428, 402)];
  const busy = watch(crowded.world, [crowdSpear, ...thugs], crowded.player, 12);
  const crowdThrusts = busy.swings.filter((swing) => swing.attackId === 'spear_thrust').length;
  const loneThrusts = lone.swings.filter((swing) => swing.attackId === 'spear_thrust').length;
  assert.ok(crowdThrusts > loneThrusts, `a crowd did not speed the line up (${crowdThrusts} vs ${loneThrusts})`);
  assert.ok(Math.abs(crowdSpear.x - 400) < loneStation, 'the line did not close on a crowd');

  // The thrust itself reaches through its own front rank.
  const screen = arena(109);
  const screenSpear = spawn(screen.world, 'spear', 400 + 140, 420, 400);
  const screenThug = spawn(screen.world, 'thug', 400 + 72, 420, 401);
  screenThug.aiCooldown = 1e6;
  let thrustLanded = false;
  for (let frame = 0; frame < frames(12) && !thrustLanded; frame += 1) {
    screen.player.x = 400;
    screen.player.z = 420;
    screen.player.health = 1e6;
    screen.player.maxHealth = 1e6;
    screenThug.x = 400 + 72;
    screenThug.z = 420;
    screen.world.step(FRAME, [{ ...NEUTRAL_INPUT }]);
    keep(screen.world, [screenSpear, screenThug], screen.player);
    for (const event of screen.world.consumeEvents()) {
      if (event.attackId === 'spear_thrust') thrustLanded = true;
    }
  }
  assert.ok(thrustLanded, 'the thrust stopped at its own front rank');
});

test('the spear butts a player who crowds its dead zone', () => {
  const { world, player } = arena(113);
  const spear = spawn(world, 'spear', 400 + 44, 420, 400);
  const swings = [];

  for (let frame = 0; frame < frames(8); frame += 1) {
    pinAsDummy(world, player);
    spear.x = 400 + 44;
    spear.z = 420;
    world.consumeEvents();
    world.step(FRAME, [{ ...NEUTRAL_INPUT }]);
    if (!world.actors.includes(spear)) break;
    if (spear.attack && spear.attack.elapsed < FRAME * 2) swings.push(spear.attack.id);
  }

  assert.ok(swings.includes('spear_brace'), `crowding produced ${swings.join(', ') || 'nothing'}`);
  assert.ok(!swings.includes('spear_thrust'), 'the spear thrust from inside its own minimum range');
});

test('the cast reads differently in play, not just on paper', () => {
  const clubbed = soloCadence('thug', 127);
  const clawed = soloCadence('wretch', 127);
  const thrust = soloCadence('spear', 127);

  assert.ok(clubbed.length >= 4, `the thug managed ${clubbed.length} swings in 18s`);
  assert.ok(clawed.length >= 4, `the wretch managed ${clawed.length} swings in 18s`);
  assert.ok(thrust.length >= 3, `the spear managed ${thrust.length} swings in 18s`);

  const thugGap = 18 / clubbed.length;
  const wretchGap = 18 / clawed.length;
  const spearGap = 18 / thrust.length;

  assert.ok(wretchGap < spearGap, `the swarm (${wretchGap.toFixed(2)}s) is no faster than the line (${spearGap.toFixed(2)}s)`);
  assert.ok(thugGap < spearGap, `the club (${thugGap.toFixed(2)}s) is no faster than the line (${spearGap.toFixed(2)}s)`);

  // And the club's rhythm is a two-beat flurry, not single pokes.
  assert.ok(
    clubbed.filter((swing) => swing.attackId === 'thug_follow').length >= 1,
    'the thug never followed its own jab'
  );
});

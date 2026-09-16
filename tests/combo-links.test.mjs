import test from 'node:test';
import assert from 'node:assert/strict';

import { ATTACKS, attackDuration, getAttack } from '../site/js/sim/attacks.js';
import { createEnemy } from '../site/js/sim/factories.js';
import {
  COMBO_HITSTUN_DECAY,
  COMBO_HITSTUN_FLOOR,
  GameWorld
} from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

/**
 * Combo feel is a timing contract, not a vibe: a chained cut only connects if
 * its startup fits inside the hitstun the previous cut is still applying. These
 * tests pin that contract from both ends — the authored frame data first, then
 * a live simulation of a player mashing one button at a training dummy.
 */

const FRAME = 1 / 60;
const ALL_LESSONS = new Set([
  'ls-crossing',
  'ls-threefold',
  'ls-provoker',
  'ds-backhand',
  'ds-wheel',
  'switch-flourish'
]);

/** Hitstun a cut still applies once `hitIndex` hits have landed in the string. */
function decayedHitstun(definition, hitIndex) {
  const scale = Math.max(COMBO_HITSTUN_FLOOR, 1 - COMBO_HITSTUN_DECAY * hitIndex);
  return definition.hitstun * scale;
}

/**
 * Slack left for a link. A cut's remaining active frames are the earliest the
 * next cut can be buffered out of it, and that cut's startup is the earliest it
 * can connect, so the hitstun must still be running one frame past both.
 */
function linkMargin(currentId, nextId, hitIndex) {
  const current = getAttack(currentId);
  const next = getAttack(nextId);
  return decayedHitstun(current, hitIndex) - (current.active + next.startup) - FRAME;
}

function chainArena({ weapon, lessons, gap }) {
  const world = new GameWorld({ playerCount: 1, seed: 97, skipCountdown: true });
  for (let tick = 0; tick < 12 && world.phase !== 'wave'; tick += 1) {
    world.step(FRAME, [{ ...NEUTRAL_INPUT }]);
  }
  assert.equal(world.phase, 'wave');
  world.actors.splice(1);

  const player = world.actors[0];
  assert.ok(player);
  player.weapon = weapon;
  player.desiredWeapon = weapon;
  for (const lesson of lessons) world.lessons.add(lesson);

  const dummy = createEnemy(9000, 'thug', 400 + gap, 420);
  dummy.health = 1e6;
  dummy.maxHealth = 1e6;
  // A training dummy: it is pinned in place, unkillable, and never swings back,
  // so every contact measured here is a link of the player's chain.
  dummy.aiCooldown = 1e6;
  world.actors.push(dummy);

  return { world, player, dummy };
}

function mash({ weapon, lessons = ALL_LESSONS, gap, heavy = false, frames = 420 }) {
  const { world, player, dummy } = chainArena({ weapon, lessons, gap });
  const contacts = [];
  const starts = [];
  let previousAttack = null;

  for (let frame = 0; frame < frames; frame += 1) {
    player.x = 400;
    player.z = 420;
    player.invulnerable = 1;
    dummy.x = 400 + gap;
    dummy.z = 420;
    dummy.attackPermission = false;

    const reacting = dummy.state === 'hitstun' || dummy.state === 'guardbreak';
    const remaining = reacting ? dummy.stateDuration - dummy.stateElapsed : 0;

    world.consumeEvents();
    world.step(FRAME, [{ ...NEUTRAL_INPUT, lightPressed: !heavy, heavyPressed: heavy }]);
    // The wave keeps releasing reinforcements: this is a one-on-one arena, so
    // nothing but the player and the pinned dummy survives a frame.
    world.actors.splice(2);

    const attack = player.attack;
    const started = attack && (!previousAttack
      || previousAttack.id !== attack.id
      || attack.elapsed < previousAttack.elapsed);
    if (started) starts.push({ id: attack.id, frame });
    previousAttack = attack ? { id: attack.id, elapsed: attack.elapsed } : null;

    for (const event of world.consumeEvents()) {
      if (event.type !== 'hit' && event.type !== 'heavy-hit') continue;
      contacts.push({ attackId: event.attackId, frame, reacting, remaining });
    }
  }

  return { contacts, starts };
}

/**
 * Splits the contact log into strings: a contact that arrives after the dummy
 * has finished reeling is the start of a new one.
 */
function contiguousStrings(contacts) {
  const strings = [];
  for (const contact of contacts) {
    if (!contact.reacting || strings.length === 0) strings.push([]);
    strings[strings.length - 1].push(contact);
  }
  return strings;
}

function longestString(contacts) {
  return contiguousStrings(contacts).reduce(
    (best, current) => (current.length > best.length ? current : best),
    []
  );
}

function meanGapSeconds(starts) {
  if (starts.length < 2) return 0;
  const span = starts[starts.length - 1].frame - starts[0].frame;
  return span / (starts.length - 1) / 60;
}

/** The longest string the lessons advertise: the dussack wheel's four cuts. */
const AUTHORED_ROUTE_LENGTH = 4;

/**
 * Deepest position each declared `nextLight` route is asked to land in. A link
 * late in a string is the hardest version of itself, because the hits before it
 * have already spent the target's freeze.
 */
function declaredLinks() {
  const deepest = new Map();
  for (const definition of Object.values(ATTACKS)) {
    if (definition.owner !== 'player') continue;
    let currentId = definition.id;
    for (let hitIndex = 0; hitIndex < AUTHORED_ROUTE_LENGTH - 1; hitIndex += 1) {
      const nextId = getAttack(currentId).nextLight;
      if (!nextId) break;
      const key = `${currentId}→${nextId}`;
      deepest.set(key, Math.max(deepest.get(key) ?? -1, hitIndex));
      currentId = nextId;
    }
  }
  return deepest;
}

test('every declared light link leaves hitstun running after the previous cut', () => {
  const links = declaredLinks();
  for (const [key, hitIndex] of links) {
    const [from, to] = key.split('→');
    const margin = linkMargin(from, to, hitIndex);
    assert.ok(
      margin >= 0,
      `${key} as hit ${hitIndex + 2} of a string leaves ${(margin * 1000).toFixed(1)} ms of hitstun`
    );
  }

  for (const expected of ['ls_l1→ls_l2', 'ls_l2→ls_l3', 'ds_l1→ds_l2', 'ds_l3→ds_l1', 'ls_low_l→ls_l2', 'ds_switch_in→ds_l2']) {
    assert.ok(links.has(expected), `the ${expected} link is missing`);
  }
  assert.ok(links.size >= 8, `only ${links.size} links are declared`);
});

test('a heavy exit is a read, never a link', () => {
  const exits = [];
  for (const definition of Object.values(ATTACKS)) {
    if (definition.owner !== 'player' || !definition.nextHeavy) continue;
    assert.ok(
      getAttack(definition.nextHeavy).heavy,
      `${definition.id} exits into a non-heavy ${definition.nextHeavy}`
    );
    exits.push([definition.id, definition.nextHeavy]);
  }
  assert.ok(exits.length >= 4);

  for (const [currentId, heavyId] of exits) {
    assert.ok(
      linkMargin(currentId, heavyId, 0) < 0,
      `${currentId} → ${heavyId} links: a heavy must stay a committed strike`
    );
  }
});

test('the dussack wheel turns once and cannot be sustained forever', () => {
  // Four links are the authored route; by the seventh the cut before it can no
  // longer freeze the target long enough, so the wheel always comes apart.
  assert.ok(linkMargin('ds_l3', 'ds_l1', 2) > 0);
  assert.ok(linkMargin('ds_l3', 'ds_l1', 5) < 0, 'the dussack wheel must break before it loops twice');
});

test('a mashed light chain strings its cuts together inside the target hitstun', () => {
  for (const gap of [68, 74, 80]) {
    const { contacts } = mash({ weapon: 'longsword', gap });
    const longest = longestString(contacts);
    assert.deepEqual(
      longest.slice(0, 3).map((contact) => contact.attackId),
      ['ls_l1', 'ls_l2', 'ls_l3'],
      `at ${gap}px the longest longsword string was ${longest.map((contact) => contact.attackId).join(' → ')}`
    );
    assert.ok(longest.length <= 4, `longsword string of ${longest.length} contacts never ends`);

    // Every link of the opening string is comfortably inside hitstun, not a
    // frame-perfect knife edge.
    for (const contact of longest.slice(1)) {
      assert.ok(
        contact.remaining >= 0.04,
        `${contact.attackId} only landed with ${(contact.remaining * 1000).toFixed(0)} ms of hitstun left`
      );
    }
  }
});

test('the dussack chain wraps through the wheel and then lets the target go', () => {
  const { contacts } = mash({ weapon: 'dussack', gap: 64 });
  const longest = longestString(contacts);
  assert.deepEqual(
    longest.slice(0, 4).map((contact) => contact.attackId),
    ['ds_l1', 'ds_l2', 'ds_l3', 'ds_l1'],
    'the dussack chain no longer wraps around'
  );
  assert.ok(longest.length >= 4, 'the wrapped dussack string is too short to read as a wheel');
  assert.ok(longest.length <= 7, `dussack string of ${longest.length} contacts never ends`);

  // The dummy does escape: every run has frames where it is nobody's victim.
  const escaped = contacts.some((contact) => !contact.reacting);
  assert.ok(escaped, 'the target was held in hitstun for the whole run');
});

test('the starter cuts chain among themselves before any lesson is learned', () => {
  for (const [weapon, expected] of [['longsword', 'ls_l1'], ['dussack', 'ds_l1']]) {
    const { contacts } = mash({ weapon, lessons: new Set(), gap: 64 });
    const longest = longestString(contacts);
    assert.ok(longest.length >= 3, `the ${weapon} starter produces isolated pokes, not a rhythm`);
    assert.ok(longest.length <= 8, `the ${weapon} starter string of ${longest.length} never ends`);
    assert.ok(
      longest.every((contact) => contact.attackId === expected),
      'an ungated chain resolved to something other than the basic cut'
    );
  }
});

test('a whiffed cut pays its full recovery, so a connected chain is worth chasing', () => {
  const connected = mash({ weapon: 'longsword', gap: 74 });
  const whiffed = mash({ weapon: 'longsword', gap: 220 });

  assert.ok(connected.contacts.length > 0);
  assert.equal(whiffed.contacts.length, 0, 'an out-of-reach cut should not connect');

  const connectedCadence = meanGapSeconds(connected.starts);
  const whiffCadence = meanGapSeconds(whiffed.starts);
  const opening = getAttack('ls_l1');
  const followUp = getAttack('ls_l2');

  assert.ok(
    connectedCadence <= opening.startup + opening.active + followUp.startup + 0.06,
    `connected cuts repeat every ${(connectedCadence * 1000).toFixed(0)} ms`
  );
  assert.ok(
    whiffCadence >= attackDuration(opening),
    `whiffed cuts repeat every ${Math.round(whiffCadence * 1000)} ms instead of paying ${Math.round(
      attackDuration(opening) * 1000
    )} ms of recovery`
  );
});

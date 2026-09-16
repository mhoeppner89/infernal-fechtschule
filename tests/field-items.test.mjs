import test from 'node:test';
import assert from 'node:assert/strict';

import { createEnemy } from '../site/js/sim/factories.js';
import {
  GameWorld,
  ITEM_DURABILITY,
  ITEM_LIFETIME_SECONDS,
  POTION_HEAL
} from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

/**
 * Little Fighter 2 arms the fight, not the character sheet: whoever falls
 * leaves their weapon on the road, anyone can pick it up, and it can be hurled
 * at the next man. These tests pin that loop end to end — the drop table, the
 * pickup rules, the pips that spend a find, the throw that spends the rest of
 * it, and the draught that makes a corner of the stage worth remembering.
 */

const FRAME = 1 / 60;
const frames = (seconds) => Math.round(seconds / FRAME);

const neutral = () => ({ ...NEUTRAL_INPUT });

/**
 * A live wave pinned open by a distant anchor enemy, so a scenario never
 * resolves into a lesson screen and stops stepping.
 */
function arena(seed) {
  const world = new GameWorld({ playerCount: 1, seed, skipCountdown: true });
  for (let tick = 0; tick < 12 && world.phase !== 'wave'; tick += 1) {
    world.step(FRAME, [neutral()]);
  }
  assert.equal(world.phase, 'wave');
  world.actors.splice(1);
  world.spawnQueue.length = 0;
  const anchor = createEnemy(900, 'thug', 1150, 260);
  anchor.health = 1e6;
  anchor.maxHealth = 1e6;
  world.actors.push(anchor);
  // The party walks into a level at its western end, which is a fine place to
  // start a level and a poor place to measure a 400 px throw from. Every
  // scenario in this file authors its geometry from x 400, so the helper stands
  // the fighter there and leaves the walking to the tests that are about it.
  const player = world.actors[0];
  player.x = 400;
  return { world, player, anchor };
}

function put(world, kind, x, z, options = {}) {
  const item = {
    id: 500 + world.items.length,
    kind,
    x,
    z,
    y: options.y ?? 0,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    vz: 0,
    durability: options.durability ?? 0,
    thrownBy: options.thrownBy ?? null,
    hitIds: new Set(),
    age: 0
  };
  world.items.push(item);
  return item;
}

/**
 * Steps frames with fixed input, keeping the scenario from ever resolving.
 * `press` applies its edges on one frame only: a take is a deliberate press,
 * and a button held down is a press on every frame of it.
 */
function run(world, player, anchor, seconds, input = neutral(), press = null) {
  const pressFrame = press?.frame ?? 0;
  const events = [];
  for (let frame = 0; frame < frames(seconds); frame += 1) {
    player.health = Math.min(player.health, player.maxHealth);
    anchor.health = 1e6;
    const frameInput = press && frame === pressFrame ? { ...input, ...press.edges } : { ...input };
    world.consumeEvents();
    world.step(FRAME, [frameInput]);
    events.push(...world.consumeEvents());
  }
  return events;
}

/** One deliberate press of the Switch button, on its own frame. */
const take = (edges = { switchPressed: true }) => ({ edges });

test('the fallen arm Meyer: a club from a thug, a shaft from a spearman, steel from a captain', () => {
  const { world, player, anchor } = arena(11);
  const thug = createEnemy(2, 'thug', 470, 420);
  const spearman = createEnemy(3, 'spear', 560, 420);
  const captain = createEnemy(4, 'captain', 650, 420);
  const wretch = createEnemy(5, 'wretch', 740, 420);
  world.actors.push(thug, spearman, captain, wretch);
  for (const enemy of [thug, spearman, captain, wretch]) enemy.health = 1;

  const drops = new Map();
  for (let frame = 0; frame < frames(6); frame += 1) {
    player.health = 400;
    anchor.health = 1e6;
    // One clean light per target, from just inside reach.
    for (const enemy of [thug, spearman, captain, wretch]) {
      if (enemy.health <= 0) continue;
      player.x = enemy.x - 60;
      player.z = enemy.z;
    }
    world.step(FRAME, [{ ...neutral(), lightPressed: frame % 6 === 0, moveX: 1 }]);
    for (const event of world.consumeEvents()) {
      if (event.type === 'item-drop') drops.set(event.text, (drops.get(event.text) ?? 0) + 1);
    }
  }

  assert.ok(drops.get('club') >= 1, 'a fallen thug leaves his cudgel');
  assert.ok(drops.get('spear') >= 1, 'a fallen spearman leaves his shaft');
  assert.ok(drops.get('longsword') >= 1, 'a captain leaves steel worth fencing with');
  assert.ok(world.items.every((item) => item.thrownBy === null), 'drops are not thrown weapons');
  assert.ok(
    world.items.filter((item) => item.kind === 'club').every((item) => item.durability === ITEM_DURABILITY.club),
    'a dropped find carries its full pips'
  );
  assert.ok(
    world.items.filter((item) => item.kind !== 'potion' && item.kind !== 'club' && item.kind !== 'spear')
      .every((item) => item.durability === 0),
    'fencing steel has no pips to spend'
  );
});

test('the road offers and Switch takes: pacing over a find leaves it lying there', () => {
  const { world, player, anchor } = arena(17);
  player.weapon = 'longsword';
  player.desiredWeapon = 'longsword';
  player.stowedWeapon = 'longsword';
  const club = put(world, 'club', player.x, player.z, { durability: 6 });

  // Standing on it is not taking it, however long he lingers: the cudgel is an
  // offer, and an offer nobody accepts stays on the road.
  run(world, player, anchor, 1.2);
  assert.equal(player.weapon, 'longsword', 'a stride over a cudgel does not arm him');
  assert.ok(world.items.includes(club), 'and does not spend the cudgel either');

  const events = run(world, player, anchor, 0.05, neutral(), take());
  assert.equal(player.weapon, 'club');
  assert.equal(player.durability, 6, 'the pips come from the weapon on the floor, not a fresh find');
  assert.equal(player.stowedWeapon, 'longsword', 'his own blade goes to his back');
  assert.ok(events.some((event) => event.type === 'item-pickup' && event.text === 'club'));
  assert.ok(!world.items.includes(club));

  // A draught is offered only when it would do something: at full health the
  // press is not a take at all, so it goes on doing what it always did.
  player.weapon = 'longsword';
  player.desiredWeapon = 'longsword';
  player.stowedWeapon = 'longsword';
  player.durability = 0;
  player.health = player.maxHealth;
  const waiting = put(world, 'potion', player.x, player.z);
  run(world, player, anchor, 0.6);
  run(world, player, anchor, 0.05, neutral(), take());
  assert.ok(world.items.includes(waiting), 'a draught at full health is left for later');
  assert.equal(player.health, player.maxHealth);

  player.health = 40;
  const events2 = run(world, player, anchor, 0.05, neutral(), take());
  assert.equal(player.health, 40 + POTION_HEAL);
  assert.ok(events2.some((event) => event.type === 'item-heal' && event.amount === POTION_HEAL));
  assert.ok(!world.items.includes(waiting));
});

test('a cut in progress cannot also close on a cudgel: the take waits for a free stance', () => {
  const { world, player, anchor } = arena(19);
  const club = put(world, 'club', player.x, player.z, { durability: 9 });

  // A press during a swing is part of the string, not a reach down to the road.
  let tookItMidCut = false;
  for (let frame = 0; frame < frames(2); frame += 1) {
    player.health = 400;
    anchor.health = 1e6;
    const wasCutting = player.state === 'attack';
    world.step(FRAME, [{ ...neutral(), lightPressed: frame % 4 === 0, switchPressed: wasCutting }]);
    if (wasCutting && player.weapon === 'club') tookItMidCut = true;
  }
  assert.ok(!tookItMidCut, 'no frame of a cut can also close on a cudgel');
  assert.ok(world.items.includes(club), 'and the cudgel is still where it fell');

  // Letting the string recover and pressing again takes it. (His own cuts
  // advanced him past the club, so the find is moved back under his feet — a
  // player would simply step back onto it.)
  run(world, player, anchor, 0.6);
  club.x = player.x;
  club.z = player.z;
  run(world, player, anchor, 0.05, neutral(), take());
  assert.equal(player.weapon, 'club');
  assert.equal(player.durability, 9);
});

test('steel is taken only with both hands free, and Switch says so', () => {
  const { world, player, anchor } = arena(23);
  player.weapon = 'club';
  player.desiredWeapon = 'club';
  player.stowedWeapon = 'longsword';
  player.durability = 5;
  const blade = put(world, 'longsword', player.x, player.z);

  // One pair of hands: a cudgel in them means the steel is never offered, so
  // the press stays the throw it always was and the blade waits where it lies.
  const throwEvents = run(world, player, anchor, 1, neutral(), take());
  assert.ok(throwEvents.some((event) => event.type === 'item-throw'), 'the press hurls the find');
  assert.equal(player.weapon, 'longsword', 'instead of taking the steel that lay under it');
  assert.equal(player.durability, 0, 'the pips went with the thrown cudgel');
  assert.ok(world.items.includes(blade), 'and the captain’s steel is still on the road');

  player.weapon = 'dussack';
  player.desiredWeapon = 'dussack';
  player.stowedWeapon = 'dussack';
  blade.x = player.x;
  blade.z = player.z;
  const events = run(world, player, anchor, 0.05, neutral(), take());
  assert.ok(events.some((event) => event.type === 'item-pickup' && event.text === 'longsword'));
  assert.equal(player.weapon, 'longsword');
  assert.equal(player.stowedWeapon, 'longsword', 'the drawn steel becomes what he reverts to');
  assert.equal(player.durability, 0);

  // A second blade of the same kind is not worth bending down for.
  const duplicate = put(world, 'longsword', player.x, player.z);
  run(world, player, anchor, 0.05, neutral(), take());
  assert.ok(world.items.includes(duplicate));
});

test('a find spends one pip per landed blow and comes apart when they run out', () => {
  const { world, player, anchor } = arena(29);
  const dummy = createEnemy(6, 'thug', 464, 420);
  dummy.health = 1e6;
  dummy.maxHealth = 1e6;
  world.actors.push(dummy);
  player.weapon = 'club';
  player.desiredWeapon = 'club';
  player.stowedWeapon = 'longsword';
  player.durability = ITEM_DURABILITY.club;

  const pips = [player.durability];
  let brokeAt = null;
  let landed = 0;
  for (let frame = 0; frame < frames(24); frame += 1) {
    player.health = 400;
    anchor.health = 1e6;
    dummy.x = 464;
    dummy.z = 420;
    world.consumeEvents();
    world.step(FRAME, [{ ...neutral(), lightPressed: frame % 14 === 0 }]);
    for (const event of world.consumeEvents()) {
      if ((event.type === 'hit' || event.type === 'heavy-hit') && event.actorId === player.id) landed += 1;
      if (event.type === 'weapon-break') brokeAt = landed;
    }
    pips.push(player.durability);
  }

  assert.equal(brokeAt, ITEM_DURABILITY.club, 'the cudgel splits on the blow that spends its last pip');
  assert.equal(player.weapon, 'longsword', 'and his own blade is back in his hand');
  assert.equal(player.durability, 0);
  assert.ok(landed > ITEM_DURABILITY.club, 'he keeps fighting with his steel after the find breaks');
  for (let index = 1; index < pips.length; index += 1) {
    assert.ok(pips[index] <= pips[index - 1], 'pips only ever go down');
  }
});

test('only landed blows spend the club: a whiff swings for free', () => {
  const { world, player, anchor } = arena(31);
  player.weapon = 'club';
  player.desiredWeapon = 'club';
  player.durability = 4;

  let cuts = 0;
  let contacts = 0;
  for (let frame = 0; frame < frames(6); frame += 1) {
    // Both fighters pinned: a cut carries Meyer forward and the anchor walks,
    // so nothing may drift into the other's reach during the measurement.
    player.health = 400;
    player.x = 400;
    player.z = 420;
    player.vx = 0;
    anchor.health = 1e6;
    anchor.x = 1150;
    anchor.z = 260;
    anchor.aiCooldown = 99;
    world.consumeEvents();
    world.step(FRAME, [{ ...neutral(), lightPressed: frame % 14 === 0 }]);
    for (const event of world.consumeEvents()) {
      if (event.type === 'attack' && event.actorId === player.id) cuts += 1;
      if ((event.type === 'hit' || event.type === 'heavy-hit') && event.actorId === player.id) contacts += 1;
    }
  }

  assert.ok(cuts >= 10, `the whiffs actually happened (${cuts} cuts)`);
  assert.equal(contacts, 0, 'nothing was in reach to be hit');
  assert.equal(player.durability, 4, 'a cudgel swung at air keeps all its pips');
});

test('the throw hurls the find, and his own steel comes back out', () => {
  const { world, player, anchor } = arena(37);
  const dummy = createEnemy(8, 'thug', 640, 420);
  dummy.health = 1e6;
  dummy.maxHealth = 1e6;
  dummy.aiCooldown = 99;
  world.actors.push(dummy);
  player.weapon = 'club';
  player.desiredWeapon = 'club';
  player.stowedWeapon = 'longsword';
  player.durability = ITEM_DURABILITY.club;

  let thrownAt = null;
  let contactAt = null;
  let airborne = 0;
  let far = player.x;
  for (let frame = 0; frame < frames(2.5); frame += 1) {
    player.health = 400;
    dummy.x = 640;
    dummy.z = 420;
    dummy.aiCooldown = 99;
    world.consumeEvents();
    world.step(FRAME, [{ ...neutral(), switchPressed: frame === 2 }]);
    for (const event of world.consumeEvents()) {
      if (event.type === 'item-throw') thrownAt = frame * FRAME;
      if (event.type === 'hit' && event.actorId === player.id && contactAt === null) contactAt = frame * FRAME;
    }
    for (const item of world.items) {
      far = Math.max(far, item.x);
      if (item.thrownBy !== null && item.y > 0) airborne += 1;
    }
  }

  assert.ok(thrownAt !== null, 'the switch button hurls a find instead of switching blades');
  assert.equal(player.weapon, 'longsword', 'and his fencing weapon is back in his hand');
  assert.equal(player.durability, 0, 'the pips go with the weapon');
  assert.ok(airborne > 20, `the find is airborne for most of its flight (${airborne} frames)`);
  assert.ok(far - player.x > 180, `a hurl crosses real ground (${(far - player.x).toFixed(0)} px)`);
  assert.ok(contactAt !== null && contactAt > thrownAt, 'and it bites what it crosses on the way');
  const landed = world.items.find((item) => item.thrownBy !== null);
  assert.ok(landed && landed.y === 0, 'then lies on the road where it landed');
});

test('a raised hand takes a thrown find out of the air without flinching the thrower', () => {
  const { world, player, anchor } = arena(41);
  const catcher = createEnemy(9, 'thug', 560, 420);
  catcher.health = 1e6;
  catcher.maxHealth = 1e6;
  catcher.aiCooldown = 99;
  world.actors.push(catcher);
  player.weapon = 'spear';
  player.desiredWeapon = 'spear';
  player.stowedWeapon = 'dussack';
  player.durability = ITEM_DURABILITY.spear;

  const events = [];
  for (let frame = 0; frame < frames(2.5); frame += 1) {
    player.health = 400;
    catcher.x = 560;
    catcher.z = 420;
    catcher.aiCooldown = 99;
    catcher.parryWindow = 1;
    world.step(FRAME, [{ ...neutral(), switchPressed: frame === 2 }]);
    events.push(...world.consumeEvents());
  }

  assert.ok(events.some((event) => event.type === 'parry' && event.text === 'SHAFT ASIDE'));
  assert.equal(catcher.health, 1e6, 'a caught throw does no damage');
  assert.equal(player.state, 'idle', 'the man who threw it is not the man who was hit');
  assert.equal(player.weapon, 'dussack', 'and he is back on the blade he stowed');
  const shaft = world.items.find((item) => item.kind === 'spear');
  assert.ok(shaft, 'the caught shaft stays in the world');
  assert.ok(
    shaft.x - catcher.x < 60,
    `it drops where it was caught rather than sailing on (${(shaft.x - catcher.x).toFixed(0)} px past him)`
  );
});

test('an untouched find fades off the road, and a new wave sweeps it clean', () => {
  const { world, player, anchor } = arena(43);
  const club = put(world, 'club', 300, 300, { durability: 9 });
  let fadedAt = null;
  for (let frame = 0; frame < frames(ITEM_LIFETIME_SECONDS + 4); frame += 1) {
    player.health = 400;
    anchor.health = 1e6;
    world.step(FRAME, [neutral()]);
    // Sim time, not frame count: the countdown before the wave runs on frames
    // that never reach the world clock.
    if (fadedAt === null && !world.items.includes(club)) fadedAt = world.time;
  }
  assert.ok(
    fadedAt !== null && Math.abs(fadedAt - ITEM_LIFETIME_SECONDS) < 0.1,
    `the cudgel fades at ${fadedAt} s instead of ${ITEM_LIFETIME_SECONDS} s`
  );

  // A new wave is a new stretch of road: the road itself is cleared with it.
  // Getting there also means walking out of the stage's eastern doorway, since
  // a cleared street opens the way on but does not walk it for him.
  put(world, 'club', 300, 300, { durability: 9 });
  assert.equal(world.items.length, 1);
  for (let frame = 0; frame < frames(40) && world.phase === 'wave'; frame += 1) {
    for (const actor of world.actors) {
      if (actor.team !== 'enemies') continue;
      actor.health = 0;
      actor.state = 'dead';
      actor.deathTimer = 2;
    }
    player.health = 400;
    world.step(FRAME, [{ ...neutral(), moveX: 1 }]);
  }
  assert.equal(world.phase, 'lesson');
  assert.equal(world.chooseLesson(world.offeredLessons[0]), true);
  assert.equal(world.phase, 'wave');
  assert.equal(world.items.length, 0, 'nothing from the last stretch of road follows him');
});

test('items travel in the replica snapshot as plain data', () => {
  const { world, player } = arena(47);
  put(world, 'potion', 320, 320);
  put(world, 'spear', 340, 330, { durability: 4, thrownBy: player.id, y: 12, vx: 200 });
  const decoded = JSON.parse(JSON.stringify(world.snapshot()));

  assert.equal(decoded.items.length, 2);
  const potion = decoded.items.find((item) => item.kind === 'potion');
  const shaft = decoded.items.find((item) => item.kind === 'spear');
  assert.equal(potion.durability, 0);
  assert.equal(potion.thrown, false);
  assert.equal(shaft.durability, 4);
  assert.equal(shaft.thrown, true, 'the client can tell a hurl from a drop');
  assert.equal(shaft.y, 12, 'and can draw it in the air');
});

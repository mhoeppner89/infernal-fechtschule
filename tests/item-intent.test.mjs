import test from 'node:test';
import assert from 'node:assert/strict';

import { createEnemy } from '../site/js/sim/factories.js';
import {
  GameWorld,
  ITEM_GRAB_HEIGHT,
  ITEM_REACH_STATES,
  canTakeItem,
  itemWithinReach
} from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';

/**
 * Little Fighter 2 arms the fight off the floor, and this game keeps that —
 * but a find is asked for here, not stumbled over. These tests pin the rule
 * from the player's side: standing on something takes nothing, Switch takes
 * one thing, and the cue the renderer draws is decided by the very predicate
 * the press is decided by, so the offer on screen can never lie.
 */

const FRAME = 1 / 60;
const frames = (seconds) => Math.round(seconds / FRAME);
const neutral = () => ({ ...NEUTRAL_INPUT });

/** A live wave held open by an invulnerable anchor, so nothing resolves. */
function arena(seed, playerCount = 1) {
  const world = new GameWorld({ playerCount, seed, skipCountdown: true });
  for (let tick = 0; tick < 12 && world.phase !== 'wave'; tick += 1) {
    world.step(FRAME, Array.from({ length: playerCount }, neutral));
  }
  assert.equal(world.phase, 'wave');
  const players = world.actors.filter((actor) => actor.team === 'players');
  world.actors.splice(players.length);
  world.spawnQueue.length = 0;
  const anchor = createEnemy(900, 'thug', 1150, 260);
  anchor.health = 1e6;
  anchor.maxHealth = 1e6;
  world.actors.push(anchor);
  return { world, players, anchor, player: players[0] };
}

function put(world, kind, x, z, options = {}) {
  const item = {
    id: 900 + world.items.length,
    kind,
    x,
    z,
    y: options.y ?? 0,
    vx: 0,
    vy: 0,
    vz: 0,
    durability: options.durability ?? 0,
    thrownBy: null,
    hitIds: new Set(),
    age: 0
  };
  world.items.push(item);
  return item;
}

/**
 * Steps frames with the given per-player input, pinning the scene so a stray
 * enemy swing can never be what a test is measuring. Input is sampled per
 * frame, because a button held down is a press on every frame of it and the
 * rule being measured here is about one press.
 */
function run(world, { seconds, players }) {
  const collected = [];
  for (let frame = 0; frame < frames(seconds); frame += 1) {
    for (const actor of world.actors) {
      if (actor.team === 'players') actor.health = Math.min(actor.health, actor.maxHealth);
      else actor.health = 1e6;
    }
    world.consumeEvents();
    world.step(FRAME, players.map((sample) => ({ ...sample(frame) })));
    collected.push(...world.consumeEvents());
  }
  return collected;
}

/** Frames of neutral input: a fighter standing still, hands empty of intent. */
const holding = (patch = {}) => () => ({ ...neutral(), ...patch });

/** A Switch edge on one frame only — a press, not a button held down. */
const pressSwitch = (frame = 0, patch = {}) => (at) => ({
  ...neutral(),
  ...patch,
  switchPressed: at === frame
});

/**
 * Puts the scene on the road, presses Switch once from a settled stance, and
 * reports the two things the rule is about: what the cue promised, and what the
 * press actually did.
 */
function pressOnce(world, player, { kind, durability, offset, hands }) {
  Object.assign(player, hands);
  const item = put(world, kind, player.x + offset, player.z, { durability });
  run(world, { seconds: 0.3, players: [holding()] });
  assert.ok(world.items.includes(item), 'the scene survives its own settling frames');
  const promised = itemWithinReach(player, item);
  run(world, { seconds: 0.1, players: [pressSwitch()] });
  return { promised, taken: !world.items.includes(item) };
}

test('standing on a find all day is not taking it', () => {
  const { world, players, player } = arena(61);
  const club = put(world, 'club', player.x, player.z, { durability: 9 });
  const draught = put(world, 'potion', player.x + 8, player.z);
  player.health = 30;

  const events = run(world, { seconds: 3, players: [holding()] });
  assert.ok(world.items.includes(club), 'a cudgel under his feet is still on the road');
  assert.ok(world.items.includes(draught), 'and so is the draught he is standing on');
  assert.equal(player.weapon, 'longsword', 'his hands are his own');
  assert.equal(player.health, 30, 'a draught does not pour itself down him');
  assert.ok(!events.some((event) => event.type === 'item-pickup' || event.type === 'item-heal'));

  // The offer is standing, though: one press and it is his.
  run(world, { seconds: 0.1, players: [pressSwitch()] });
  assert.ok(!world.items.includes(club), 'the press takes it');
  assert.equal(player.weapon, 'club');
});

test('the cue and the press agree about every offer, and about every refusal', () => {
  const hands = {
    'blade drawn': { weapon: 'longsword', desiredWeapon: 'longsword', stowedWeapon: 'longsword', durability: 0 },
    'dussack drawn': { weapon: 'dussack', desiredWeapon: 'dussack', stowedWeapon: 'dussack', durability: 0 },
    'a fresh cudgel': { weapon: 'club', desiredWeapon: 'club', stowedWeapon: 'longsword', durability: 9 },
    'a beaten cudgel': { weapon: 'club', desiredWeapon: 'club', stowedWeapon: 'longsword', durability: 2 }
  };
  const road = [
    { kind: 'club', durability: 9 },
    { kind: 'club', durability: 4 },
    { kind: 'spear', durability: 6 },
    { kind: 'longsword', durability: 0 },
    { kind: 'dussack', durability: 0 },
    { kind: 'potion', durability: 0 }
  ];

  let offers = 0;
  let refusals = 0;
  let seed = 70;
  for (const [name, grip] of Object.entries(hands)) {
    for (const thing of road) {
      for (const offset of [0, 120]) {
        seed += 1;
        const { world, player } = arena(seed);
        // A hurt bearer for a draught, a whole one for everything else: both
        // halves of the potion rule are part of the same claim.
        player.health = thing.kind === 'potion' ? Math.round(player.maxHealth * 0.5) : player.maxHealth;
        const { promised, taken } = pressOnce(world, player, {
          ...thing,
          offset,
          hands: grip
        });
        assert.equal(
          taken,
          promised,
          `${name} vs ${thing.kind}(${thing.durability}) at ${offset} px: ` +
            `the cue said ${promised ? 'take' : 'leave it'} and the press ${taken ? 'took it' : 'did not'}`
        );
        if (offset > 0) assert.equal(promised, false, 'a thing out of arm’s reach is never on offer');
        if (promised) offers += 1;
        else refusals += 1;
      }
    }
  }
  assert.ok(offers > 8, `the matrix actually offered things (${offers})`);
  assert.ok(refusals > 8, `and actually refused them (${refusals})`);
});

test('one press takes one thing: the nearest offer, and never a pile', () => {
  const { world, player } = arena(83);
  const near = put(world, 'club', player.x, player.z, { durability: 3 });
  const far = put(world, 'club', player.x + 12, player.z, { durability: 8 });

  run(world, { seconds: 0.1, players: [pressSwitch()] });
  assert.ok(!world.items.includes(near), 'the nearer find is the one he bends for');
  assert.ok(world.items.includes(far), 'the further one is left for the next press');
  assert.equal(player.durability, 3, 'and the pips he got are the near one’s, not a fresh find’s');

  run(world, { seconds: 0.1, players: [pressSwitch()] });
  assert.equal(player.durability, 8, 'a second press trades up to the fresher cudgel');
  assert.ok(!world.items.includes(far));
});

test('the enemies do not loot: the road is the player’s to strip', () => {
  const { world, player } = arena(89);
  player.x = 200;
  player.z = 640;
  const raider = world.actors.find((actor) => actor.team === 'enemies');
  const armed = raider.weapon;
  const blade = put(world, 'longsword', raider.x, raider.z);
  const draught = put(world, 'potion', raider.x + 6, raider.z);

  run(world, { seconds: 2.5, players: [holding()] });
  assert.equal(raider.weapon, armed, 'the thug is armed the same way he came in');
  assert.ok(world.items.includes(blade), 'steel at his feet is not picked up');
  assert.ok(world.items.includes(draught), 'and neither is a draught');
});

test('in co-op each press arms only the hand that made it', () => {
  const { world, players } = arena(97, 2);
  const [first, second] = players;
  const club = put(world, 'club', second.x, second.z, { durability: 6 });

  run(world, { seconds: 0.1, players: [pressSwitch(), holding()] });
  assert.ok(world.items.includes(club), 'the find under him is not the other man’s find');
  assert.equal(second.weapon, 'longsword');

  run(world, { seconds: 0.1, players: [holding(), pressSwitch()] });
  assert.ok(!world.items.includes(club));
  assert.equal(second.weapon, 'club', 'his own press took it');
  assert.equal(first.weapon, 'longsword', 'and the man with empty hands at the other end has nothing');
});

test('the reach is a stance: a stagger remembers the press and takes on recovery', () => {
  const { world, player } = arena(101);
  const club = put(world, 'club', player.x, player.z, { durability: 9 });
  player.state = 'hitstun';
  player.stateElapsed = 0;
  player.stateDuration = 0.4;

  const events = run(world, { seconds: 0.1, players: [pressSwitch()] });
  assert.ok(world.items.includes(club), 'no reach is possible while he is reeling');
  assert.ok(!events.some((event) => event.type === 'item-pickup'));

  // The press is buffered rather than swallowed, so the reach happens the
  // moment he is back on his feet — losing a press to a stagger is not a rule
  // anyone can feel, and a dropped take is worse than a late one.
  run(world, { seconds: 0.6, players: [holding()] });
  assert.ok(!world.items.includes(club), 'the remembered press takes it on recovery');
  assert.equal(player.weapon, 'club');
});

test('the shared reach rule is what both sides of the screen use', () => {
  // The renderer draws the caret only in these stances; if the sim ever took a
  // thing from outside them, the cue would be describing a different game.
  for (const stance of ['idle', 'move', 'crouch', 'block', 'switch', 'jump']) {
    assert.ok(ITEM_REACH_STATES.has(stance), `${stance} can reach`);
  }
  for (const stance of ['attack', 'dodge', 'hitstun', 'guardbreak', 'dead']) {
    assert.ok(!ITEM_REACH_STATES.has(stance), `${stance} cannot`);
  }

  const club = { kind: 'club', durability: 6 };
  const blade = { kind: 'longsword', durability: 0 };
  const player = {
    weapon: 'longsword', durability: 0, health: 50, maxHealth: 100,
    x: 400, z: 420, radius: 13
  };
  const at = (kind, x, y = 0) => ({ ...kind, x, z: 420, y });

  assert.ok(itemWithinReach(player, at(club, 400)), 'a cudgel at his feet is offered');
  assert.ok(!itemWithinReach(player, at(club, 400 + 60)), 'the same cudgel across the road is not');
  assert.ok(!itemWithinReach(player, at(club, 400, ITEM_GRAB_HEIGHT + 1)), 'nor is a club in the air');
  assert.ok(canTakeItem(player, at(blade, 400)) === false, 'his own kind of steel is never offered');
  assert.ok(canTakeItem(player, { kind: 'potion', durability: 0 }) === true, 'a draught he needs is');
});

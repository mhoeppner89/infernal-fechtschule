/**
 * Encounter measurement: a bot plays the campaign and reports what each wave
 * actually costs.
 *
 * Every wave in `src/sim/waves.ts` declares one encounter idea, and the point of
 * the design is that the idea — not a pressure multiplier — is what is hard. So
 * the thing to measure is not "can a bot survive" but "does each encounter cost
 * a fair slice of a health bar, and does the campaign finish". A bot is the only
 * instrument that answers that repeatably.
 *
 * The bot models a player who reads the fight rather than a frame-perfect one:
 * it decides at 15 Hz and holds its input between decisions, taps attacks at
 * roughly 6-7 Hz rather than holding the button, commits with the heavy against
 * plate, gives ground when a crowd closes in, guards an incoming swing it cannot
 * answer, walks to a provision and *presses Switch to take it* (nothing is
 * picked up by walking over it), and walks out of a stage once the road opens.
 *
 * Two bots are measured, because a bot that plays badly dying is not a wall —
 * a wall is a wave that a competent player cannot get past:
 *
 *   adaptive  reads armour, spacing, draughts and the walk-out.
 *   masher    walks at the nearest thing and taps light. It may die: the duel
 *             exists to teach that lights do not move plate.
 *
 * A wave is a WALL when the adaptive bot dies in it, when it costs a full bar
 * (110 hp) in one stretch, or when it holds the player for over 75 s without
 * resolving. The run must also finish in `victory`.
 *
 * Usage:
 *   node tools/encounter-measure.mjs                 # 5 seeds, both bots
 *   node tools/encounter-measure.mjs --seeds 5,17    # specific seeds
 *   node tools/encounter-measure.mjs --bot adaptive  # one bot
 *   node tools/encounter-measure.mjs --json          # machine-readable rows
 *   node tools/encounter-measure.mjs --fresh         # each wave starts full
 *
 * `--fresh` is the other half of the question. A campaign run can fail in a
 * late wave either because that encounter is a wall or because the run was
 * already spent by the time it arrived; refilling the bar at every wave line
 * separates the two, so a wave that is only hard on an empty bar is an economy
 * problem rather than an encounter one.
 *
 * Exits non-zero when the adaptive bot meets a wall, so it can gate a retune.
 */
import { GameWorld, itemWithinReach } from '../site/js/sim/world.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';
import { LEVELS } from '../site/js/sim/waves.js';
import { ATTACKS } from '../site/js/sim/attacks.js';

const FRAME = 1 / 60;

/** The campaign in the order it is walked, so a run can report a fight per row. */
const CAMPAIGN = LEVELS.flatMap((level) => level.waves.map((wave) => ({ ...wave, place: level.name })));

/** Which fight the journey is in, counted across the whole campaign (-1 before the first). */
function waveNumber(world) {
  if (world.waveInLevel < 0) return -1;
  let flat = world.waveInLevel;
  for (let index = 0; index < world.levelIndex; index += 1) flat += LEVELS[index].waves.length;
  return flat;
}

/** A wall, in health: one encounter may not cost the whole bar. */
export const WALL_DAMAGE = 110;
/** A wall, in time: an encounter that will not resolve is a wall. */
export const WALL_SECONDS = 75;
/** Below this share of the bar a bot drinks; it is the same read the HUD gives. */
const DRINK_AT = 0.62;
/** How often the bot re-reads the fight. A player does not decide per frame. */
const DECISION_FRAMES = 4;
/** A parry cannot follow a parry instantly: a hand has to come back to guard. */
const PARRY_REFRACTORY = 15;
let lastParry = -999;

/**
 * A read is not a guarantee.
 *
 * The bot used to parry every committed strike it could see, every time, which
 * made it something no player is — and it made the encounter measurements lie
 * in a very specific direction. The whole point of the spear line is a thrust
 * you either stop or eat for fifteen, and of the captain duel a committed hew
 * you either answer or eat for twenty-two; a bot with a perfect answer measured
 * both of them as costing *nothing*, so the two archetypes built around being
 * readable were the two the instrument could not see at all.
 *
 * A competent player reads the wind-up and still mistimes some of them. One in
 * three is the honest number for a strike arriving 0.24-0.72 s after it starts,
 * pressed against a thumb rather than a frame counter, and it is applied to the
 * dodge as well: nothing that stops damage is ever a sure thing.
 *
 * The roll is a hash of the frame and the attacker, so a run is still exactly
 * reproducible from its seed — the measurement varies because the *player's*
 * hands do, not because the instrument does.
 */
const MISTIME = 0.33;
function mistimes(frame, id) {
  let hash = (frame * 2654435761) ^ (id * 40503);
  hash = (hash ^ (hash >>> 15)) >>> 0;
  return (hash % 1000) / 1000 < MISTIME;
}
/**
 * The bot notices it has been hit. It does not act on it beyond what the threat
 * read already does, and that is a measured choice rather than an omission: a
 * bot that gave ground after every hit stopped applying pressure, the fights ran
 * long, and the late encounters' arrivals piled up on it (the stand's worst case
 * went from 80 to 167). Trading is what this game is; the parry and the spacing
 * are the answers to it.
 */
let lastHealthSeen = 110;
/**
 * Attack taps, as edges rather than a held button. Ten per second is what a
 * player pressing one attack key with a thumb does, and it is the rate the
 * game's own chain routes were designed around: slower than this and the
 * measurement is of a bot standing around, not of the encounter.
 */
const TAP_FRAMES = 6;

const neutral = () => ({ ...NEUTRAL_INPUT });

const living = (world, team) => world.actors.filter((actor) => actor.team === team && actor.state !== 'dead');
const me = (world) => world.actors.find((actor) => actor.team === 'players');

/** Ground items the hands could take, nearest first. */
function reachableItems(world, actor) {
  return world.items
    .filter((item) => itemWithinReach(actor, item))
    .sort((a, b) => Math.hypot(a.x - actor.x, a.z - actor.z) - Math.hypot(b.x - actor.x, b.z - actor.z));
}

function approach(actor, target, stopX = 58, stopZ = 14) {
  const dx = target.x - actor.x;
  const dz = target.z - actor.z;
  return {
    moveX: Math.abs(dx) > stopX ? Math.sign(dx) : 0,
    moveZ: Math.abs(dz) > stopZ ? Math.sign(dz) * 0.7 : 0
  };
}

/**
 * The telegraph read: an attack that is about to land on this fighter, with how
 * long until it does, and whether a parry is even allowed to stop it.
 *
 * A player can only answer what they can see coming. The bot presses guard when
 * contact is one to two decisions away — early enough to be a reaction, late
 * enough that the 0.17 s parry window is still open when the blow arrives — and
 * it cannot answer a strike whose startup is shorter than its own decision
 * cadence. That is the same asymmetry the tempos were built on: the committed
 * strikes are readable and parryable, the fast ones are not.
 */
function incomingThreat(world, self) {
  let worst = null;
  for (const enemy of living(world, 'enemies')) {
    if (enemy.state !== 'attack' || !enemy.attack) continue;
    if (Math.abs(enemy.z - self.z) > 74) continue;
    const definition = ATTACKS[enemy.attack.id];
    if (!definition) continue;
    const reach = definition.reach + enemy.radius + self.radius * 0.5;
    if (Math.abs(enemy.x - self.x) > reach + 26) continue;
    const contactIn = definition.startup - enemy.attack.elapsed;
    if (contactIn < 0 || contactIn > 0.6) continue;
    if (worst === null || contactIn < worst.contactIn) {
      worst = { enemy, definition, contactIn, parryable: definition.parryable !== false, damage: definition.damage };
    }
  }
  return worst;
}

/**
 * The competent player: threat-first spacing, the committed strike against
 * plate, a parry-and-counter against anything slow enough to read, a dodge
 * against the unparryable, adds cleared before the thing they guard, a draught
 * taken with a press when hurt, and the walk out when the road opens.
 */
function adaptiveBot(world, frame) {
  const self = me(world);
  if (!self || self.state === 'dead') return neutral();
  if (world.exitOpen) return { ...neutral(), moveX: 1 };

  const enemies = living(world, 'enemies');
  const hurt = self.health < self.maxHealth * DRINK_AT;  // Took a hit? Then the exchange was lost. A *retreat* here was measured and
  // rejected: a bot that gave ground after every hit stopped applying pressure,
  // the fights ran long, and the late waves' arrivals piled up on it (the stand
  // went from 0-80 to a 167 worst). The read on a hit stays what it always was:
  // guard what is coming, then answer.
  lastHealthSeen = self.health;

  // The read comes first: a parry or a dodge is worth more than a swing, and
  // the counter a parry opens is the game's own answer to plate and to a boss.
  const threat = incomingThreat(world, self);
  if (threat) {
    const away = { moveX: 0, moveZ: 0 };
    const dx = threat.enemy.x - self.x;
    const dz = threat.enemy.z - self.z;
    if (!threat.parryable) {
      // Nothing stops these but distance: throw the dodge on the side with room,
      // and miss some of those too — the sweep is a 22 no one sidesteps forever.
      if (mistimes(frame, threat.enemy.id)) return { ...neutral(), moveX: Math.abs(dx) > 30 ? -Math.sign(dx) : 1 };
      return {
        ...neutral(),
        ...away,
        mobilityPressed: true,
        moveX: Math.abs(dx) > 30 ? -Math.sign(dx) : 0,
        moveZ: Math.abs(dz) > 8 ? -Math.sign(dz) : 1
      };
    }
    // Attention is finite: save the read for the strikes that matter. A jab
    // for six is not worth the frame that could parry twenty-two.
    if (threat.damage >= 14 && threat.contactIn <= 0.16 && frame - lastParry >= PARRY_REFRACTORY) {
      lastParry = frame;
      // Mistimed, and then *late* rather than absent: a hand that arrives a beat
      // after the parry window is a block, which is what a late guard is. The
      // bot used to return a completely neutral frame here — measured, that is
      // where a lone 20-health wretch held a full bar for eight seconds at 32
      // px, because each of its claws drew a fresh read (the parry refractory
      // makes a read a whole attempt) and one read in three produced a fighter
      // standing perfectly still, taking it. A player's mistake is a worse
      // trade, never a decision to do nothing.
      if (mistimes(frame, threat.enemy.id)) return { ...neutral(), ...away, guardHeld: true };
      return { ...neutral(), guardPressed: true };
    }
  }

  // Which way he is actually pointing is part of the read, and the bot used not
  // to look. A cut reaches in front — the soft-target window stops 28 px behind
  // the fighter — so a bot at a wretch's back swung at empty road, and worse,
  // each swing *carried it forward*, 18 to 31 px in the facing it never
  // changed, so it walked away from the thing clawing it while mashing. Six
  // seconds of that, 8 health a claw, was the whole of the trap's worst seed.
  // Turning costs a step and no attack, which is what a player pays too.
  const facingTarget = (target) => target === undefined || (target.x - self.x) * self.facing > -24;

  // A parry that landed leaves a window open: spend it on the committed strike.
  if (self.counterWindow > 0) {
    const ranked = enemies
      .map((enemy) => ({ enemy, d: Math.abs(enemy.x - self.x) + Math.abs(enemy.z - self.z) * 1.4 }))
      .sort((a, b) => a.d - b.d)[0];
    if (ranked && Math.abs(ranked.enemy.x - self.x) < 104 && Math.abs(ranked.enemy.z - self.z) < 42
      && facingTarget(ranked.enemy)) {
      return { ...neutral(), heavyPressed: true };
    }
  }

  // A draught already underfoot is worth a press before anything else: the
  // press is as cheap as a step and only a press takes it now.
  const underfoot = reachableItems(world, self);
  const offeredDraught = underfoot.find((item) => item.kind === 'potion');
  if (offeredDraught && hurt) return { ...neutral(), switchPressed: true };
  // A find is worth bending for when his hands are free and the road is not on
  // top of him: it hits harder than a cut and it can be thrown.
  const offeredFind = underfoot.find((item) => item.kind === 'club' || item.kind === 'spear');
  const handsFree = self.weapon === 'longsword' || self.weapon === 'dussack';
  const breathing = enemies.every((enemy) => Math.hypot(enemy.x - self.x, enemy.z - self.z) > 130);
  if (offeredFind && handsFree && breathing) return { ...neutral(), switchPressed: true };

  // Hurt with a draught still on the ground: go and drink it, unless something
  // is already swinging. Crossing the ground for the next draught is the
  // designed answer to the long encounters, so the bot has to make the trip.
  // It makes the trip at below half a bar, not below two thirds: measured both
  // ways, the earlier errand cost more than it healed, because leaving the line
  // in a stand is how the stand punishes you.
  if (hurt && self.health < self.maxHealth * 0.5) {
    const draughts = world.items.filter((item) => item.kind === 'potion' && item.y <= 0);
    const nearestDraught = draughts
      .map((item) => ({ item, d: Math.hypot(item.x - self.x, item.z - self.z) }))
      .sort((a, b) => a.d - b.d)[0];
    // Only across ground he owns. The errand used to run unless something was
    // mid-swing, which is not the same thing: a twenty-health wretch between its
    // claws reads as `move`, so the bot set off with it glued at 27 px and was
    // clawed from behind the whole way — measured, that was the stand's fatal
    // seed, four hits and no cut of its own in three and a half seconds. Nobody
    // turns their back to drink with something inside arm's reach.
    const crowded = enemies.some((enemy) => Math.hypot(enemy.x - self.x, enemy.z - self.z) < 140);
    if (nearestDraught && !crowded) return { ...neutral(), ...approach(self, nearestDraught.item, 6, 6) };
  }

  // Low-health arrivals standing on him are the first thing a player kills:
  // they cost nothing to remove and they are what a big fight is actually made
  // of. Chasing the captain through two wretches is how a bar disappears.
  const adds = enemies.filter((enemy) => enemy.maxHealth <= 30
    && Math.hypot(enemy.x - self.x, enemy.z - self.z) < 118);

  const ranked = enemies
    .map((enemy) => ({
      enemy,
      weighted: (adds.includes(enemy) ? -60 : 0)
        + Math.abs(enemy.x - self.x) + Math.abs(enemy.z - self.z) * 1.4,
      distance: Math.hypot(enemy.x - self.x, enemy.z - self.z)
    }))
    .sort((a, b) => a.weighted - b.weighted);
  const nearest = ranked[0];
  if (!nearest) {
    // Nothing to fight means the objective decides where to be. A stand is held
    // where you are standing — measured, a bot that marched through the stair
    // met the next beat at the stage's east wall with nowhere to give ground and
    // lost the run there, which is the objective being ignored rather than the
    // encounter being unfair. Everything else is a march.
    const kind = CAMPAIGN[waveNumber(world)]?.kind;
    return kind === 'hold' ? neutral() : { ...neutral(), moveX: 1 };
  }

  const { enemy } = nearest;
  const dx = enemy.x - self.x;
  const dz = enemy.z - self.z;
  const inReach = Math.abs(dx) < 96 && Math.abs(dz) < 40;
  const incoming = enemies.some((other) => other.state === 'attack'
    && other.attack
    && other.attack.elapsed < 0.34
    && Math.abs(other.x - self.x) < 118
    && Math.abs(other.z - self.z) < 70);
  const tap = frame % TAP_FRAMES === 0;
  const armoured = enemy.armor > 0;

  // Something is already swinging and he is not in range to answer it: hold
  // the guard rather than walk into it.
  if (incoming && !inReach) return { ...neutral(), guardHeld: true };

  // What counts as a crowd, and when giving ground is worth anything.
  //
  // Both halves of this were measured wrong once, and the same way: the read
  // counted *bodies*, and it retreated from anything already swinging.
  //
  // Bodies first. Three wretches are 60 health of chaff that dies to one cut
  // each; counted as a crowd they sent the bot walking away from them for
  // eleven seconds while a claw took 8 hp every six frames, and it died on the
  // trap and in the yard without ever swinging. It could not outrun them
  // either — a wretch moves at 150 and the player at 220 only while uncommitted,
  // and the bot's own retreat frames are not free. A wretch is an answer; a
  // thug is a problem. Only the solid count.
  //
  // Then the reach. Giving ground from *inside* an exchange is leaving a fight
  // that was being won, and the retreat frames cost attacks: measured, a bot
  // that retreated whenever any attack was in flight spent the yard at
  // 62-70 px from a thug it never touched, taking 5 and 9 at a time until the
  // bar was gone. Ground is only worth giving when it is the ground that is the
  // problem — two solid attackers already committed, or three of them on him —
  // and only from outside reach, so the trade he can win is the trade he takes.
  const solid = ranked.filter((entry) => entry.distance < 118 && entry.enemy.maxHealth > 30);
  const committed = solid.filter((entry) => {
    const definition = entry.enemy.attack ? ATTACKS[entry.enemy.attack.id] : null;
    return entry.enemy.state === 'attack' && definition
      && entry.enemy.attack.elapsed <= definition.startup + 0.06;
  });
  if (!inReach && (committed.length >= 2 || solid.length >= 3)) {
    const fallBack = { moveX: -Math.sign(dx || 1), moveZ: Math.sign(dz || -1) * 0.8 };
    const veryClose = ranked.some((entry) => entry.distance < 62);
    return { ...neutral(), ...fallBack, mobilityPressed: veryClose, lightPressed: false };
  }

  // Facing first, then the swing.
  //
  // An enemy inside the stop band at his back used to leave the bot with no
  // input at all: too close for `approach` to step (32 px is inside the 58 px
  // stop), and suppressed from tapping because the cut would go the wrong way —
  // so it stood still and was clawed. Measured, that was ten seconds and 88
  // health against a *single* twenty-health wretch, which is the trap's entire
  // worst case and nothing about the trap. A player with something at their back
  // steps through it; the turn is one frame of walking, and then the cut lands.
  if (!facingTarget(enemy)) {
    return {
      ...neutral(),
      moveX: (enemy.x - self.x) === 0 ? -self.facing : Math.sign(enemy.x - self.x),
      moveZ: Math.abs(dz) > 16 ? Math.sign(dz) * 0.7 : 0
    };
  }

  return {
    ...neutral(),
    ...approach(self, enemy, 58, 16),
    lightPressed: tap && inReach && !armoured,
    heavyPressed: tap && inReach && armoured
  };
}

/** The impatient player: walk at the nearest thing and tap light. */
function masherBot(world, frame) {
  const self = me(world);
  if (!self || self.state === 'dead') return neutral();
  if (world.exitOpen) return { ...neutral(), moveX: 1, lightPressed: frame % 14 === 0 };
  const ranked = living(world, 'enemies')
    .map((enemy) => ({ enemy, d: Math.abs(enemy.x - self.x) + Math.abs(enemy.z - self.z) }))
    .sort((a, b) => a.d - b.d);
  const nearest = ranked[0];
  if (!nearest) return { ...neutral(), moveX: 1 };
  const inReach = Math.abs(nearest.enemy.x - self.x) < 92 && Math.abs(nearest.enemy.z - self.z) < 46;
  return {
    ...neutral(),
    ...approach(self, nearest.enemy, 58, 16),
    lightPressed: inReach && frame % 14 === 0
  };
}

export const BOTS = Object.freeze({ adaptive: adaptiveBot, masher: masherBot });

/**
 * Plays one run and reports a row per wave. Input is sampled at the bot's own
 * cadence and held between decisions, so the measurement is a plausible player
 * rather than a 60 Hz reaction machine.
 */
export function playRun(seed, decide = adaptiveBot, maxSeconds = 600, fresh = false) {
  // The parry refractory and the spacing reset are bot state, and a run has to
  // be measurable on its own: leaving either set made seed 2's outcome depend
  // on where seed 1 left off.
  lastParry = -999;
  lastHealthSeen = 110;
  const world = new GameWorld({ playerCount: 1, seed, skipCountdown: true });
  const rows = [];
  let wave = -1;
  let row = null;
  let held = neutral();
  let frames = 0;
  let health = 0;

  const push = (fatal) => {
    if (row) rows.push({ ...row, fatal, kind: CAMPAIGN[row.wave]?.kind ?? '?', title: CAMPAIGN[row.wave]?.title ?? '' });
  };

  for (let frame = 0; frame < 60 * maxSeconds; frame += 1) {
    if (world.phase === 'victory' || world.phase === 'defeat') break;
    if (world.phase === 'lesson') {
      world.chooseLesson(world.offeredLessons[0]);
      continue;
    }
    const self = me(world);
    if (world.phase === 'wave' && waveNumber(world) !== wave) {
      push(false);
      wave = waveNumber(world);
      // In fresh mode every encounter starts from a full bar, so what follows is
      // that wave's own cost rather than the run's bill arriving at once.
      if (fresh && self) self.health = self.maxHealth;
      health = self ? self.health : health;
      row = {
        wave,
        seconds: 0,
        hpIn: health,
        damage: 0,
        healed: 0,
        peak: 0,
        peakCrowd: 0,
        taken: 0,
        returned: 0,
        fatal: false
      };
    }

    if (frame % DECISION_FRAMES === 0) held = { ...decide(world, frame) };
    const before = self ? self.health : 0;
    const crowdBefore = living(world, 'enemies');
    world.step(FRAME, [held]);
    frames += 1;
    if (row) {
      row.seconds += FRAME;
      if (crowdBefore.length > row.peak) row.peak = crowdBefore.length;
      const near = crowdBefore.filter((enemy) => self && Math.hypot(enemy.x - self.x, enemy.z - self.z) < 120).length;
      if (near > row.peakCrowd) row.peakCrowd = near;
    }
    const after = me(world);
    const delta = before - (after ? after.health : 0);
    if (row && delta > 0) row.damage += delta;
    else if (row && delta < 0) row.healed += -delta;
    if (after) health = after.health;
  }

  const finished = world.phase === 'victory';
  // A run that wins has to report its last wave too. The final row used to be
  // dropped on victory — the only ending that pushes it was a fatal one — so the
  // boss, which is always the last wave, was measured only in the runs that died
  // to it: every summary reported six encounters and a wall.
  if (finished) push(false);
  else if (world.phase !== 'defeat') push(Boolean(row && row.wave === waveNumber(world)));
  if (world.phase === 'defeat' && row && (row.fatal === false)) {
    row.fatal = true;
    rows.push({ ...row, kind: CAMPAIGN[row.wave]?.kind ?? '?', title: CAMPAIGN[row.wave]?.title ?? '' });
    row = null;
  }
  const self = me(world);
  return {
    seed,
    outcome: world.phase,
    seconds: world.time,
    health: self ? Math.max(0, Math.round(self.health)) : 0,
    wave: waveNumber(world),
    place: LEVELS[world.levelIndex]?.name ?? '',
    lessons: world.lessons.size,
    rows
  };
}

/** Wall, fairness and clearance verdicts for one run. */
export function judge(run) {
  const waves = run.rows.map((row) => ({
    ...row,
    wall: run.outcome !== 'victory'
      ? row.fatal
      : row.damage >= WALL_DAMAGE || row.seconds >= WALL_SECONDS
  }));
  return {
    ...run,
    rows: waves,
    walls: waves.filter((row) => row.wall).map((row) => row.wave),
    cleared: run.outcome === 'victory'
  };
}

function parseSeeds(value) {
  if (!value) return [5, 17, 29, 41, 53];
  return value.split(',').map((part) => Number(part.trim())).filter((seed) => Number.isInteger(seed));
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? (args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : '') : null;
  };
  const seeds = parseSeeds(flag('--seeds'));
  const wanted = flag('--bot');
  const bots = wanted ? [wanted] : ['adaptive', 'masher'];
  const asJson = args.includes('--json');
  const fresh = args.includes('--fresh');
  const runs = [];
  let failures = 0;

  for (const name of bots) {
    const decide = BOTS[name];
    if (!decide) throw new Error(`Unknown bot ${name}`);
    for (const seed of seeds) {
      const run = judge(playRun(seed, decide, 600, fresh));
      runs.push({ bot: name, ...run });
      if (name === 'adaptive' && (!run.cleared || run.walls.length > 0)) failures += 1;
      if (asJson) continue;
      const tail = run.cleared
        ? `victory at ${run.health} hp`
        : `${run.outcome} on wave ${run.wave} in ${run.place} (${run.rows.at(-1)?.title ?? ''}) at ${run.health} hp`;
      console.log(`\n${name} · seed ${seed}: ${tail} · ${run.rows.length} waves in ${run.seconds.toFixed(0)}s`);
      for (const row of run.rows) {
        console.log(
          `  w${row.wave} ${row.kind.padEnd(6)}${row.title.slice(0, 23).padEnd(24)}` +
          `${row.seconds.toFixed(1).padStart(6)}s  hp in ${String(row.hpIn).padStart(3)}` +
          `  dmg ${String(Math.round(row.damage)).padStart(3)}  heal ${String(Math.round(row.healed)).padStart(3)}` +
          `  peak ${String(row.peak).padStart(2)} (crowd ${row.peakCrowd})` +
          `${row.wall ? '  <- WALL' : ''}`
        );
      }
    }
  }

  if (asJson) {
    console.log(JSON.stringify(runs, null, 2));
  } else {
    const adaptive = runs.filter((run) => run.bot === 'adaptive');
    const cleared = adaptive.filter((run) => run.cleared).length;
    console.log(`\nadaptive bot: ${cleared}/${adaptive.length} runs finished in victory`);
    for (const kind of ['press', 'choke', 'duel', 'ambush', 'flood', 'hold', 'boss']) {
      const rows = adaptive.flatMap((run) => run.rows).filter((row) => row.kind === kind);
      if (rows.length === 0) continue;
      const damage = rows.map((row) => Math.round(row.damage));
      const seconds = rows.map((row) => Math.round(row.seconds));
      const worst = Math.max(...damage);
      const mean = damage.reduce((total, value) => total + value, 0) / damage.length;
      console.log(
        `  ${kind.padEnd(7)} n=${String(rows.length).padStart(2)}` +
        `  dmg mean ${mean.toFixed(0).padStart(3)} worst ${String(worst).padStart(3)}` +
        `  seconds ${Math.min(...seconds)}-${Math.max(...seconds)}` +
        `  walls ${rows.filter((row) => row.wall).length}`
      );
    }
    console.log(failures === 0
      ? '\nno waves are walls for the adaptive bot.'
      : `\n${failures} adaptive runs met a wall.`);
  }

  process.exitCode = failures === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();

import {
  ENEMY_TEMPO,
  attackDuration,
  getAttack,
  isHitZoneExposed,
  isAttackActive,
  isImprovisedWeapon,
  resolveCrouchAttack,
  resolveDodgeAttack,
  resolvePlayerAttack,
  resolveSwitchAttack,
  throwAttackFor
} from './attacks.js';
import type { EnemyTempo } from './attacks.js';
import { createEnemy, createPlayer } from './factories.js';
import { clamp, damp, normalize2 } from './math.js';
import { Rng } from './rng.js';
import { chooseSoftTarget } from './targeting.js';
import { LESSON_OFFERS } from './lessons.js';
import { ATTACK_SLOTS, ENCOUNTER_LABELS, LEVELS, laneNarrowingAt } from './waves.js';
import type { AmbushWave, DuelWave, FloodWave, HoldWave, SpawnSpec, WaveDefinition } from './waves.js';
import type {
  Actor,
  ActorSnapshot,
  ActorState,
  Archetype,
  AttackDefinition,
  GameEvent,
  GamePhase,
  GameSnapshot,
  ImprovisedWeapon,
  InputFrame,
  Item,
  ItemKind,
  ItemSnapshot,
  Lane,
  LessonId,
  Weapon,
  WorldOptions
} from './types.js';
import { GAME_SNAPSHOT_VERSION, NEUTRAL_INPUT } from './types.js';

export const ARENA = Object.freeze({
  minX: 92,
  maxX: 1188,
  minZ: 248,
  maxZ: 612
});

/**
 * Walkable depth at a road x, after any lane on the current wave funnels it.
 * Sim and renderer both call this, so the road the player sees narrowing is the
 * road that is actually narrowing.
 */
export function laneDepthRange(
  x: number,
  lane: Lane | null | undefined
): { maxZ: number; minZ: number } {
  const narrowing = laneNarrowingAt(x, lane);
  return {
    minZ: ARENA.minZ + ((lane?.minZ ?? ARENA.minZ) - ARENA.minZ) * narrowing,
    maxZ: ARENA.maxZ + ((lane?.maxZ ?? ARENA.maxZ) - ARENA.maxZ) * narrowing
  };
}

/**
 * Camera window in world coordinates. Roads wider than this scroll as the party
 * moves, in both directions: the sim clamps the window to the bounds of the
 * level being walked and follows them as they advance or give ground.
 */
export const CAMERA = Object.freeze({
  width: ARENA.maxX - ARENA.minX,
  /** Furthest the player can pull the camera left from the world origin. */
  margin: 72,
  /**
   * How far behind the window's centre a fighter may drift before the view comes
   * with them, in world pixels.
   *
   * The window follows the player in *both* directions, and this is the slack on
   * the retreating side only: the view is tight ahead (see `updateCamera`), where
   * the fight is, and generous behind, where the player is walking away from it.
   * The slack exists because a hit shoves — 28 px for a light, 132 for a
   * committed heavy — and a window that tracked every knockback would slide the
   * whole road under the fighter it is meant to frame. A deliberate retreat
   * crosses it in well under a second and the view follows from there.
   */
  trail: 160
});

/**
 * The ground a level's road covers, in world coordinates.
 *
 * A level's waves are fought along one road, so this is level state rather than
 * wave state: the sim resolves it once when the journey enters a place and reads
 * it from there (`GameWorld.bounds`) instead of re-deriving it per call. The
 * renderer derives the same numbers from the road width the snapshot carries, so
 * the road drawn is the road walked.
 */
export function roadBounds(road: number | undefined): { minX: number; maxX: number } {
  if (!road || road <= CAMERA.width) {
    return { minX: ARENA.minX, maxX: ARENA.maxX };
  }
  return {
    minX: ARENA.minX - CAMERA.margin,
    maxX: ARENA.minX - CAMERA.margin + road
  };
}

/**
 * Off-screen road an arrival wants beyond the visible edge, in world pixels.
 *
 * Little Fighter 2 never lets a fighter appear in the picture: they walk in from
 * the edge of the screen, and by the time the player can see them they are a
 * body with an approach the player can read, count and answer. This is how far
 * past the edge the arrivals start.
 */
const SPAWN_APRON = 90;

/**
 * The least margin that still counts as off-screen. An arrival lands past the
 * visible edge by `SPAWN_APRON` when the road allows it and never closer than
 * this, so nothing is ever placed inside the picture.
 */
const ARRIVAL_CLEARANCE = 24;

/** Road left between an arrival and the end of the level it walks in from. */
const ROAD_EDGE_INSET = 30;

/**
 * The narrowest road a level may author, in world pixels.
 *
 * Arrivals walk in from off the edge of the picture, and the picture follows the
 * party, so a road only hides a spawn if it is wider than the window by the
 * apron on *both* sides of the tightest case — the party standing in the middle.
 * Anything narrower and a group would have to be placed where the player can
 * watch it appear. Every level in `LEVELS` is authored at or above this width,
 * and `tests/level-structure.test.mjs` holds the data to it.
 */
export const MIN_LEVEL_ROAD = CAMERA.width + 2 * SPAWN_APRON;

/**
 * The way out of a level. Little Fighter 2 does not end a stage when the last
 * man falls: the road east opens and the fighter walks off it. Making the exit
 * a place rather than a timer is what turns "cleared" into a decision — the
 * player chooses when to leave, and can loot the road first.
 */
export const LEVEL_EXIT = Object.freeze({
  /** Depth of the doorway band, measured back from the road's east end. */
  depth: 84,
  /**
   * How long the doorway stands open before it will take the player through.
   * Without it, a fighter who happens to be at the edge of the road when the
   * last man falls would be pulled off it before the clear even registers.
   */
  grace: 0.8
});

/** Beats between the last death and the road being declared clear. */
const WAVE_CLEAR_DELAY = 1.05;

/**
 * How many stragglers a falling surge is allowed to leave before the next one
 * arrives on top of them. One, which is the subtitle taken literally: the yard
 * empties, then fills. Measured with two allowed, the surges overlapped into a
 * pile in the runs that failed, and the flood's worst case (110, a whole bar)
 * was that pile rather than any single surge.
 */
const SURGE_TAIL = 1;

/**
 * How many of the press a stand will let stand before holding the next beat
 * back. A stand is a formation to hold, so the road is a queue.
 *
 * Two, and the number moved with the arrival rule rather than with taste. It
 * was one while the beats were placed a stride behind the player: with contact
 * immediate, one leftover body plus the next beat was already three on top of
 * the player, and a beat landing on a beat was measured as the pile that ended
 * runs. Beats walk in from the edge of the picture now, so the road itself takes
 * seconds to deliver anyone — the queue can hold two without ever crowding the
 * player, and one was measured too tight: the stand cost a competent bot
 * exactly nothing, because a beat arrived slower than one man could clear it.
 */
const HOLD_CROWD = 2;

/**
 * How long an ambush keeps precedence for the attack slots. Long enough for the
 * trap to land its first blows, short enough that it is a moment rather than a
 * permanent privilege. Measured: at 3.5 s the trap's arrivals held the slots
 * through the whole turn, so a player who did the right thing — turn and cut —
 * was still being hit from behind by whoever was waiting his turn.
 */
const AMBUSH_URGENCY = 2;

/**
 * How far past the trap's trigger the player may run before the doors open
 * regardless of how much of the bait line is still standing. The trap is not a
 * fence: a player who ignores the front and simply runs the street is caught by
 * the doors closing behind them.
 */
const AMBUSH_PURSUIT = 420;

/**
 * Depth lanes an ambush wedge spreads itself across. Three arrivals in four
 * lanes is a group a single broad cut cannot answer, which is the difference
 * measured between a trap that cost 0 health and one that costs a turn.
 */
const AMBUSH_BANDS = 4;

/**
 * Near edge of a level's eastern doorway: the line a fighter crosses to leave.
 * Sim and renderer share it so the drawn gate is the real one.
 */
export function levelExitX(road: number | undefined): number {
  return roadBounds(road).maxX - LEVEL_EXIT.depth;
}

/** Hits a fresh find survives before it comes apart in the player's hands. */
export const ITEM_DURABILITY: Readonly<Record<ImprovisedWeapon, number>> = Object.freeze({
  club: 9,
  spear: 6
});
/** Health one draught restores, capped at the drinker's maximum. */
export const POTION_HEAL = 38;
/**
 * How close a player has to stand to reach something off the road. Taking it is
 * still a deliberate press; this is only how far the arm goes.
 */
export const ITEM_PICKUP_RADIUS = 20;
/** Items fade out of the world after this long, so a road cannot silt up. */
export const ITEM_LIFETIME_SECONDS = 26;
const ITEM_GRAVITY = 900;
const ITEM_DROP_HOP = 168;
/** A hurl crosses roughly a fifth of the camera window before it lands. */
const THROWN_SPEED_X = 520;
const THROWN_SPEED_Y = 290;
/** Thrown items only bite while they are still off the ground. */
const THROWN_HIT_HEIGHT = 6;
/** A hurled weapon barely slows: it is thrown, not pushed. */
const ITEM_AIR_DRAG = 0.35;

/**
 * Damage of a hurled find, resolved through the ordinary hit pipeline so a
 * thrown club can still be blocked or parried like anything else.
 */
const THROWN_ATTACKS: Readonly<Record<ImprovisedWeapon, AttackDefinition>> = Object.freeze({
  club: Object.freeze({
    id: 'hurl_club', label: 'Hurled Cudgel', owner: 'player', hitZone: 'torso',
    startup: 0, active: 0.12, recovery: 0,
    damage: 9, guardDamage: 8, reach: 0, depth: 0, minForward: 0,
    knockback: 66, hitstun: 0.34, hitStop: 0.05, movement: 0,
    maxTargets: 1, arc: 'front'
  }),
  spear: Object.freeze({
    id: 'hurl_spear', label: 'Cast Shaft', owner: 'player', hitZone: 'torso',
    startup: 0, active: 0.12, recovery: 0,
    damage: 13, guardDamage: 10, reach: 0, depth: 0, minForward: 0,
    knockback: 84, hitstun: 0.4, hitStop: 0.06, movement: 0,
    maxTargets: 1, arc: 'front'
  })
});

/**
 * Stances a hand can close on something from. A strike or a stagger is not one
 * of them, so the reach never fights the attack buttons for the same moment.
 * Exported because the renderer only draws the take cue in these stances: the
 * offer on the road and the press that accepts it are the same rule.
 */
export const ITEM_REACH_STATES: ReadonlySet<ActorState> = new Set<ActorState>([
  'idle',
  'move',
  'crouch',
  'block',
  'switch',
  'jump'
]);

/** Nothing is plucked out of the air: a hand reaches down to the road only. */
export const ITEM_GRAB_HEIGHT = 8;

/** The hands side of a take: the bearer is whoever is doing the reaching. */
export interface ItemBearer {
  weapon: Weapon;
  durability: number;
  health: number;
  maxHealth: number;
}

/** The road's side of a take: what is lying there, and how worn it is. */
export interface FloorItem {
  kind: ItemKind;
  /** Pips a carried find has left; 0 for potions and for fencing steel. */
  durability: number;
}

/**
 * Whether these hands can accept this thing at all. One pair of hands is the
 * whole rule set: a find goes into the free hand, steel off a captain replaces
 * his blade only when that hand is free, a draught is drunk on the spot only
 * when it would do something, and a worse cudgel is not worth the bend.
 *
 * Shared by the sim and the renderer so the cue the player sees is the offer
 * the press accepts — the caret can never lie.
 */
export function canTakeItem(bearer: ItemBearer, item: FloorItem): boolean {
  if (item.kind === 'potion') return bearer.health < bearer.maxHealth;
  if (isImprovisedWeapon(item.kind)) {
    return bearer.weapon !== item.kind || bearer.durability < item.durability;
  }
  return !isImprovisedWeapon(bearer.weapon) && bearer.weapon !== item.kind;
}

/**
 * The whole offer: this thing is on the ground, inside arm's reach of this
 * fighter, and his hands can take it. Anything else is scenery.
 */
export function itemWithinReach(
  actor: ItemBearer & { x: number; z: number; radius: number },
  item: FloorItem & { x: number; z: number; y: number }
): boolean {
  if (item.y > ITEM_GRAB_HEIGHT) return false;
  if (Math.hypot(item.x - actor.x, item.z - actor.z) > ITEM_PICKUP_RADIUS + actor.radius) return false;
  return canTakeItem(actor, item);
}

/**
 * What each archetype leaves behind. The player's weapons come off the field:
 * a thug's cudgel, a soldier's shaft, and — from a captain — steel good enough
 * to be fenced with properly.
 */
const DROP_TABLE: Readonly<Record<Exclude<Archetype, 'meyer'>, { weapon: Weapon | null; potionChance: number }>> = Object.freeze({
  thug: Object.freeze({ weapon: 'club', potionChance: 0.07 }),
  spear: Object.freeze({ weapon: 'spear', potionChance: 0.09 }),
  captain: Object.freeze({ weapon: 'longsword', potionChance: 0.35 }),
  wretch: Object.freeze({ weapon: null, potionChance: 0.06 }),
  grotesque: Object.freeze({ weapon: null, potionChance: 1 })
});

export const CROUCH_DURATION_SECONDS = 0.48;
export const CROUCH_ATTACK_WINDOW_SECONDS = 0.36;
/** Fraction of the remaining hitstun each further hit in the same string sheds. */
export const COMBO_HITSTUN_DECAY = 0.09;
/** Hitstun can never decay past this share of the attack's authored value. */
export const COMBO_HITSTUN_FLOOR = 0.4;
/**
 * Silence between landing hits that ends a chain. It sits above the longest
 * possible link (a cut's active window plus the next cut's startup) and below
 * the pause after a whiffed or heavily committed strike, so decay follows what
 * the player experiences as one string.
 */
export const COMBO_LINK_GRACE_SECONDS = 0.36;
const MOVE_INPUT_DEADZONE = 0.1;
const DODGE_INPUT_DEADZONE = 0.15;

interface SpawnEntry {
  at: number;
  archetype: Exclude<Archetype, 'meyer'>;
  /** Authored cadence of the entry's group, used to re-stagger gated releases. */
  interval: number;
  /** Frontier (player x) that unlocks this entry; -Infinity for the opening group. */
  threshold: number;
  /** Which flank this one walks in from, when the encounter cares. */
  side?: 'west' | 'east';
  /** Seconds of attack-slot priority this arrival carries. */
  urgency?: number;
  /**
   * Explicit arrival depth, for a group that has to arrive *spread* instead of
   * clumped. The player's broad cuts cover 42 px of depth and take two targets,
   * so a group bunched into one lane is a group that dies to a single turn and
   * a single swing.
   */
  z?: number;
}

export class GameWorld {
  readonly actors: Actor[] = [];
  /** Lessons learned this run; each unlocks a set of chained attacks. */
  readonly lessons = new Set<LessonId>();

  phase: GamePhase = 'title';
  /**
   * Where the journey stands: which place (`LEVELS`) and which of that place's
   * fights. The campaign is walked by these two counters, so a flat wave number
   * is the only thing ever derived from them rather than the other way round.
   */
  levelIndex = 0;
  waveInLevel = -1;
  waveTitle = '';
  score = 0;
  bossPhase = 0;
  tick = 0;
  time = 0;
  offeredLessons: LessonId[] = [];

  private readonly rng: Rng;
  private readonly playerCount: 1 | 2;
  private readonly events: GameEvent[] = [];
  private nextActorId = 1;
  private countdownTimer = 0;
  private spawnClock = 0;
  private spawnQueue: SpawnEntry[] = [];
  private permissionTimer = 0;
  private clearTimer = 0;
  private hitStop = 0;
  /** Everything lying on the floor: dropped weapons, hurled finds, potions. */
  readonly items: Item[] = [];
  private nextItemId = 1;
  private readonly pendingPlayerEdges: InputFrame[] = [];
  private waveResolved = false;
  /** Seconds the eastern doorway has been open, counted down from its grace. */
  private exitTimer = 0;
  /** True while the level is clear and its eastern doorway will let him out. */
  exitOpen = false;
  private lessonOfferIndex = 0;
  /** The narrowing in force in the fight underway, if the wave authored one. */
  private lane: Lane | null = null;
  /** Surges already delivered in a flood wave. */
  private surgeIndex = 0;
  /** Seconds left in a hold wave; zero for every other kind. */
  private holdRemaining = 0;
  private holdBeat = 0;
  /** Whether an ambush wave's trap has already sprung. */
  private ambushSprung = false;
  private duelSpawned = false;
  /** Left edge of the camera window in world coordinates (authoritative). */
  cameraX: number = ARENA.minX;
  /** World width of the road being walked. */
  road: number = ARENA.maxX - ARENA.minX;
  /** The ground that road covers; level state, resolved once when entered. */
  private bounds: { minX: number; maxX: number } = roadBounds(this.road);

  /** The fight underway: this place's current wave, or nothing between them. */
  private get wave(): WaveDefinition | undefined {
    return LEVELS[this.levelIndex]?.waves[this.waveInLevel];
  }

  constructor(options: WorldOptions) {
    this.playerCount = options.playerCount;
    this.rng = new Rng(options.seed);

    const centreX = 400;
    for (let index = 0; index < options.playerCount; index += 1) {
      this.actors.push(createPlayer(
        this.nextActorId++,
        index,
        centreX - index * 64,
        420 + index * 54
      ));
      this.pendingPlayerEdges.push({ ...NEUTRAL_INPUT });
    }

    // The journey opens standing at the near end of the first level's road, so
    // the countdown happens in the place the first wave is fought in.
    this.enterLevel(0);
    this.phase = 'countdown';
    this.waveTitle = 'Meyer Crosses the Alps';
    this.countdownTimer = options.skipCountdown ? 0.05 : 1.25;
    this.emit({ type: 'banner', text: 'Meyer Crosses the Alps' });
  }

  step(dt: number, inputs: readonly InputFrame[]): void {
    const safeDt = clamp(dt, 0, 1 / 20);
    this.tick += 1;

    if (this.phase === 'countdown') {
      this.countdownTimer -= safeDt;
      if (this.countdownTimer <= 0) this.beginWave(0);
      return;
    }

    if (this.phase !== 'wave') return;

    if (this.hitStop > 0) {
      this.bufferPlayerEdges(inputs);
      this.hitStop -= safeDt;
      return;
    }

    this.time += safeDt;
    this.updateSpawns(safeDt);
    this.updatePermissions(safeDt);
    this.updateActorTimers(safeDt);
    this.updateCamera();

    const players = this.playerActors();
    for (const player of players) {
      const playerIndex = player.playerIndex ?? 0;
      const input = this.consumePlayerInput(playerIndex, inputs[playerIndex] ?? NEUTRAL_INPUT);
      this.updatePlayer(player, input, safeDt);
    }

    for (const actor of this.actors) {
      if (actor.team === 'enemies') this.updateEnemy(actor, safeDt);
    }

    this.updateItems(safeDt);
    this.processAttackHits();
    this.resolveSeparation();
    this.cleanupActors();
    this.checkWaveResolution(safeDt);
    this.checkDefeat();
  }

  chooseLesson(id: LessonId): boolean {
    if (this.phase !== 'lesson' || !this.offeredLessons.includes(id)) return false;
    this.lessons.add(id);
    this.offeredLessons = [];
    this.emit({ type: 'lesson-chosen', text: id });
    this.advanceWave();
    return true;
  }

  restart(): GameWorld {
    return new GameWorld({ playerCount: this.playerCount, seed: this.rng.integer(1, 0x7fffffff) });
  }

  consumeEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  snapshot(): GameSnapshot {
    const level = LEVELS[this.levelIndex];
    const definition = this.wave;
    return {
      version: GAME_SNAPSHOT_VERSION,
      tick: this.tick,
      time: this.time,
      phase: this.phase,
      levelIndex: this.levelIndex,
      levelName: level?.name ?? '',
      scenery: level?.setting ?? null,
      // The journey counts waves in one running number internally; what anyone
      // outside needs is how far through *this place* the player is, which is the
      // number that means something while they are standing in it.
      waveInLevel: Math.max(0, this.waveInLevel),
      wavesInLevel: level?.waves.length ?? 0,
      waveTitle: this.waveTitle,
      waveLabel: definition ? ENCOUNTER_LABELS[definition.kind] : '',
      lane: this.lane,
      score: this.score,
      bossPhase: this.bossPhase,
      lessons: [...this.lessons],
      offeredLessons: [...this.offeredLessons],
      actors: this.actors.map((actor) => this.actorSnapshot(actor)),
      items: this.items.map((item) => this.itemSnapshot(item)),
      cameraX: this.cameraX,
      roadWidth: this.road,
      exitOpen: this.exitOpen,
      holdRemaining: this.holdRemaining
    };
  }

  private itemSnapshot(item: Item): ItemSnapshot {
    return {
      id: item.id,
      kind: item.kind,
      x: item.x,
      z: item.z,
      y: item.y,
      durability: item.durability,
      thrown: item.thrownBy !== null,
      age: item.age
    };
  }

  private actorSnapshot(actor: Actor): ActorSnapshot {
    return {
      id: actor.id,
      team: actor.team,
      archetype: actor.archetype,
      name: actor.name,
      playerIndex: actor.playerIndex,
      x: actor.x,
      z: actor.z,
      vx: actor.vx,
      vz: actor.vz,
      facing: actor.facing,
      radius: actor.radius,
      health: actor.health,
      maxHealth: actor.maxHealth,
      guard: actor.guard,
      maxGuard: actor.maxGuard,
      armor: actor.armor,
      maxArmor: actor.maxArmor,
      state: actor.state,
      stateElapsed: actor.stateElapsed,
      stateDuration: actor.stateDuration,
      stateMoveX: actor.stateMoveX,
      stateMoveZ: actor.stateMoveZ,
      weapon: actor.weapon,
      desiredWeapon: actor.desiredWeapon,
      stowedWeapon: actor.stowedWeapon,
      durability: actor.durability,
      attackId: actor.attack?.id ?? null,
      attackElapsed: actor.attack?.elapsed ?? 0,
      reactionZone: actor.reactionZone,
      invulnerable: actor.invulnerable,
      openingTimer: actor.openingTimer,
      provokeTimer: actor.provokeTimer,
      counterWindow: actor.counterWindow,
      flashTimer: actor.flashTimer,
      comboCount: actor.comboCount,
      deathTimer: actor.deathTimer
    };
  }

  private updateActorTimers(dt: number): void {
    for (const actor of this.actors) {
      actor.invulnerable = Math.max(0, actor.invulnerable - dt);
      actor.parryWindow = Math.max(0, actor.parryWindow - dt);
      actor.openingTimer = Math.max(0, actor.openingTimer - dt);
      actor.provokeTimer = Math.max(0, actor.provokeTimer - dt);
      actor.counterWindow = Math.max(0, actor.counterWindow - dt);
      actor.flashTimer = Math.max(0, actor.flashTimer - dt);
      actor.guardRegenDelay = Math.max(0, actor.guardRegenDelay - dt);
      actor.comboLull += dt;
      actor.aiCooldown = Math.max(0, actor.aiCooldown - dt);
      actor.aiThink = Math.max(0, actor.aiThink - dt);
      actor.answerCooldown = Math.max(0, actor.answerCooldown - dt);
      actor.urgency = Math.max(0, actor.urgency - dt);
      // The answer stays armed for a moment after the shrug; if it runs out,
      // the captain simply never got the chance to reply.
      actor.answerTimer = Math.max(0, actor.answerTimer - dt);

      if (
        actor.guardRegenDelay <= 0 &&
        actor.state !== 'block' &&
        actor.state !== 'guardbreak' &&
        actor.guard < actor.maxGuard
      ) {
        const rate = actor.team === 'players' ? 18 : 11;
        actor.guard = Math.min(actor.maxGuard, actor.guard + rate * dt);
      }

      if (actor.state === 'dead') {
        actor.deathTimer += dt;
        actor.stateElapsed = actor.deathTimer;
      }
    }
  }

  private updatePlayer(actor: Actor, input: InputFrame, dt: number): void {
    actor.lastInput = { ...input };
    if (actor.state === 'dead') return;

    // The parry window is armed first so a reach can never eat it: the two are
    // different buttons, and a player who pressed both meant both.
    if (input.guardPressed) actor.parryWindow = 0.17;

    // A reach down to the road, before anything else claims the press: the
    // thing the cue is offering is taken by the same button that would otherwise
    // switch blades or hurl what he carries. When there is no offer, the press
    // falls through to those jobs untouched.
    if (input.switchPressed && this.reachForItem(actor)) return;

    if (actor.state === 'hitstun' || actor.state === 'guardbreak') {
      actor.stateElapsed += dt;
      actor.x += actor.vx * dt;
      actor.z += actor.vz * dt;
      actor.vx = damp(actor.vx, 0, 11, dt);
      actor.vz = damp(actor.vz, 0, 11, dt);
      this.clampActor(actor);
      if (actor.stateElapsed >= actor.stateDuration) {
        if (actor.state === 'guardbreak') actor.guard = actor.maxGuard * 0.34;
        this.enterNeutral(actor);
      }
      return;
    }

    if (actor.state === 'attack') {
      this.updatePlayerAttack(actor, input, dt);
      return;
    }

    if (actor.state === 'switch') {
      actor.stateElapsed += dt;
      if (actor.stateElapsed >= actor.stateDuration) {
        actor.weapon = actor.desiredWeapon;
        this.emit({ type: 'weapon-switch', actorId: actor.id, x: actor.x, z: actor.z, text: actor.weapon });
        const shouldEnter = actor.stateMoveX > 0.5;
        actor.stateMoveX = 0;
        if (shouldEnter) this.startAttack(actor, resolveSwitchAttack(actor.weapon));
        else this.enterNeutral(actor);
      }
      return;
    }

    if (actor.state === 'dodge') {
      actor.stateElapsed += dt;
      const remaining = 1 - actor.stateElapsed / actor.stateDuration;
      actor.x += actor.stateMoveX * 470 * Math.max(0.35, remaining) * dt;
      actor.z += actor.stateMoveZ * 330 * Math.max(0.35, remaining) * dt;
      this.clampActor(actor);
      if (input.lightPressed && actor.stateElapsed > 0.045 && actor.stateElapsed < 0.22) {
        this.startAttack(actor, resolveDodgeAttack(actor.weapon));
        if (actor.weapon === 'dussack' && this.lessons.has('ds-wheel')) actor.invulnerable = 0.24;
        return;
      }
      if (actor.stateElapsed >= actor.stateDuration) this.enterNeutral(actor);
      return;
    }

    if (actor.state === 'crouch') {
      actor.stateElapsed += dt;
      actor.vx = 0;
      actor.vz = 0;
      if (
        (input.lightPressed || input.heavyPressed) &&
        actor.stateElapsed <= CROUCH_ATTACK_WINDOW_SECONDS
      ) {
        const action = input.lightPressed ? 'light' : 'heavy';
        this.startAttack(actor, resolveCrouchAttack(actor.weapon, action));
        return;
      }
      if (actor.stateElapsed >= actor.stateDuration) this.enterNeutral(actor);
      return;
    }

    if (actor.state === 'block') {
      actor.stateElapsed += dt;
      if (!input.guardHeld || actor.guard <= 0) {
        this.enterNeutral(actor);
      } else {
        this.moveActor(actor, input.moveX, input.moveZ, 0.31, dt);
      }
      return;
    }

    if (input.switchPressed) {
      this.startSwitch(actor, false);
      return;
    }

    if (input.mobilityPressed) {
      const rawMagnitude = Math.hypot(input.moveX, input.moveZ);
      const direction = rawMagnitude > DODGE_INPUT_DEADZONE
        ? normalize2(input.moveX, input.moveZ)
        : { x: 0, y: 0 };
      if (rawMagnitude > DODGE_INPUT_DEADZONE) this.startDodge(actor, direction.x, direction.y);
      else if (input.lightPressed || input.heavyPressed) {
        const action = input.lightPressed ? 'light' : 'heavy';
        this.startAttack(actor, resolveCrouchAttack(actor.weapon, action));
      } else {
        this.startCrouch(actor);
      }
      return;
    }

    if (input.guardHeld) {
      actor.state = 'block';
      actor.stateElapsed = 0;
      // Zero means an input-held state with no predetermined end. Keeping this
      // finite also preserves the snapshot over JSON for the replica client.
      actor.stateDuration = 0;
      actor.vx = 0;
      actor.vz = 0;
      actor.reactionZone = null;
      return;
    }

    if (input.lightPressed || input.heavyPressed) {
      const action = input.lightPressed ? 'light' : 'heavy';
      const id = resolvePlayerAttack(actor.weapon, action, null, actor.counterWindow > 0, this.lessons);
      if (action === 'heavy' && actor.counterWindow > 0) actor.counterWindow = 0;
      this.startAttack(actor, id);
      return;
    }

    this.moveActor(actor, input.moveX, input.moveZ, 1, dt);
    this.updateContinuousState(
      actor,
      Math.hypot(input.moveX, input.moveZ) > MOVE_INPUT_DEADZONE ? 'move' : 'idle',
      dt
    );
  }

  private updatePlayerAttack(actor: Actor, input: InputFrame, dt: number): void {
    const runtime = actor.attack;
    if (!runtime) {
      this.enterNeutral(actor);
      return;
    }
    const definition = getAttack(runtime.id);

    runtime.elapsed += dt;
    actor.stateElapsed = runtime.elapsed;

    if (runtime.elapsed < definition.startup) {
      const target = runtime.targetId === null ? null : this.actors.find((candidate) => candidate.id === runtime.targetId);
      if (target && target.state !== 'dead') {
        const depthError = target.z - actor.z;
        actor.z += clamp(depthError, -92 * dt, 92 * dt);
        if (Math.abs(target.x - actor.x) > 6) actor.facing = target.x >= actor.x ? 1 : -1;
      }
    }

    const motionDuration = Math.max(0.01, definition.startup + definition.active);
    if (runtime.elapsed <= motionDuration) {
      actor.x += actor.facing * (definition.movement / motionDuration) * dt;
    }
    this.clampActor(actor);

    // A throw does its damage with the weapon, not the hand: at the release
    // frame the find leaves the fist and the fencing weapon comes back out.
    if (
      definition.throw &&
      !runtime.released &&
      runtime.elapsed >= (definition.releaseAt ?? definition.startup)
    ) {
      runtime.released = true;
      this.releaseCarriedWeapon(actor);
    }

    const queueOpen = runtime.elapsed >= definition.startup * 0.45;
    if (queueOpen) {
      if (input.lightPressed) runtime.queuedAction = 'light';
      else if (input.heavyPressed) runtime.queuedAction = 'heavy';
      else if (input.switchPressed && runtime.hitConfirmed) runtime.queuedAction = 'switch';
    }

    if (
      runtime.blocked &&
      definition.provoke &&
      this.lessons.has('ls-provoker') &&
      input.guardHeld &&
      runtime.elapsed >= definition.startup + definition.active
    ) {
      actor.attack = null;
      actor.state = 'block';
      actor.stateElapsed = 0;
      actor.stateDuration = 0;
      actor.reactionZone = null;
      return;
    }

    // The Little Fighter 2 link: a cut that actually connects releases the rest
    // of its recovery into the next buffered chain move, so a string's rhythm is
    // set by its startups rather than by its recovery tails. A whiffed or
    // blocked cut plays out in full — that is what whiffing costs — and heavies
    // never cancel, so the committed strike stays a decision instead of the
    // fastest available button.
    const linkOpen = !definition.heavy
      && runtime.hitConfirmed
      && runtime.elapsed >= definition.startup + definition.active;
    if (runtime.elapsed < attackDuration(definition) && !(linkOpen && runtime.queuedAction !== null)) return;

    const queued = runtime.queuedAction;
    const hitConfirmed = runtime.hitConfirmed;
    const currentId = runtime.id;
    actor.attack = null;

    if (queued === 'switch') {
      this.startSwitch(actor, hitConfirmed);
      return;
    }

    if (queued === 'light' || queued === 'heavy') {
      const next = resolvePlayerAttack(actor.weapon, queued, currentId, actor.counterWindow > 0, this.lessons);
      if (queued === 'heavy' && actor.counterWindow > 0) actor.counterWindow = 0;
      this.startAttack(actor, next);
      return;
    }

    actor.comboCount = 0;
    this.enterNeutral(actor);
  }

  private updateEnemy(actor: Actor, dt: number): void {
    // Enemies only; the guard also narrows the archetype to the field cast.
    if (actor.archetype === 'meyer') return;
    if (actor.state === 'dead') return;

    if (actor.state === 'hitstun' || actor.state === 'guardbreak') {
      actor.stateElapsed += dt;
      actor.x += actor.vx * dt;
      actor.z += actor.vz * dt;
      actor.vx = damp(actor.vx, 0, 10, dt);
      actor.vz = damp(actor.vz, 0, 10, dt);
      this.clampActor(actor);
      if (actor.stateElapsed >= actor.stateDuration) {
        if (actor.state === 'guardbreak') actor.guard = actor.maxGuard * 0.3;
        this.enterNeutral(actor);
      }
      return;
    }

    if (actor.state === 'attack') {
      this.updateEnemyAttack(actor, dt);
      return;
    }

    if (actor.state === 'block') {
      actor.stateElapsed += dt;
      if (actor.stateElapsed >= actor.stateDuration) this.enterNeutral(actor);
      return;
    }

    const target = this.nearestLivingPlayer(actor);
    if (!target) return;
    actor.facing = target.x >= actor.x ? 1 : -1;

    if (actor.archetype === 'grotesque') {
      this.updateBossAI(actor, target, dt);
      return;
    }

    const dx = target.x - actor.x;
    const dz = target.z - actor.z;
    const forward = Math.abs(dx);
    const depth = Math.abs(dz);

    // Every archetype reads the fight on its own clock: the captain looks for a
    // block on a slow, deliberate one, the wretch barely thinks at all. Cadence
    // is what separates the cast, not the size of their health bars.
    const tempo = ENEMY_TEMPO[actor.archetype];
    const inBand = (band: readonly [number, number]) =>
      forward >= band[0] && forward <= band[1] && depth <= tempo.depth;
    const line = tempo.line;
    const crowded = line !== undefined && this.isCrowded(target, tempo);

    if (actor.archetype === 'captain' && actor.aiThink <= 0) {
      actor.aiThink = this.rng.range(tempo.think[0], tempo.think[1]);
      if (target.state === 'attack' && forward < 128 && depth < 48 && this.rng.next() < 0.55) {
        actor.state = 'block';
        actor.stateElapsed = 0;
        actor.stateDuration = this.rng.range(0.36, 0.68);
        actor.reactionZone = null;
        actor.parryWindow = this.rng.next() < 0.25 ? 0.13 : 0;
        return;
      }
    }

    // A mate's half of the pair beat. It is armed by the partner's jab rather
    // than by this thug's own clock, which is why a pair can pincer a player who
    // is only watching one club: the second swing is timed to land as the first
    // one's hitstun ends. A thug loses the beat if it is flinched or commits to
    // a swing of its own, so hitting the mate is a real way out.
    if (actor.pairBeatTimer > 0) {
      actor.pairBeatTimer -= dt;
      if (actor.pairBeatTimer <= 0) {
        actor.pairBeatTimer = 0;
        // A mate is allowed to accept the beat from further out than it would
        // pick a fight of its own: it is already stepping into the swing.
        const pair = tempo.pair;
        const pairRange = pair ? pair.beatForward : tempo.band[1];
        const pairDepth = pair ? pair.beatDepth : tempo.depth;
        if (forward <= pairRange && depth <= pairDepth) {
          this.startAttack(actor, 'thug_follow', target);
          actor.aiCooldown = Math.max(actor.aiCooldown, pair?.beatRecovery ?? 1.1);
          return;
        }
      }
    }

    // Plate, then the bill. A captain that shrugged a light throws its answer one
    // readable beat later, so the player can still parry or leave. It is a
    // reaction rather than a decision, so it ignores the attack roster — but its
    // lockout is long enough that poking the plate stays a mistake you make
    // once an exchange.
    const answer = tempo.answer;
    if (
      answer &&
      actor.answerTimer > 0 &&
      actor.answerTimer <= answer.window - answer.delay + 1e-6 &&
      actor.answerCooldown <= 0 &&
      inBand(tempo.band)
    ) {
      actor.answerTimer = 0;
      actor.answerCooldown = answer.cooldown;
      this.startAttack(actor, answer.attack, target);
      return;
    }

    // A mate that has a beat armed waits for it: this is the partner's turn, and
    // spending the beat on its own swing would break the pair's whole point.
    if (actor.attackPermission && actor.aiCooldown <= 0 && actor.pairBeatTimer <= 0) {
      const braces = tempo.braceBand !== undefined && inBand(tempo.braceBand);
      if (braces || inBand(tempo.band)) {
        const attackId = this.chooseFieldAttack(actor, target, forward, braces);
        this.startAttack(actor, attackId, target);
        // A jab is the opening of a two-beat flurry: the thug follows it up
        // itself and, if it has a mate in reach, so does the mate. The rest
        // after the swing is charged when the swing resolves.
        if (attackId === 'thug_press') this.armPairBeat(actor);
        return;
      }
    }

    let desiredX = target.x;
    let desiredZ = target.z;
    const pair = tempo.pair;
    if (pair && actor.pairBeatTimer > 0) {
      // Stepping in to take up its half of the beat: alignment first, because a
      // mate that answers on a square line is the whole point of the pair.
      desiredX = target.x - actor.facing * (pair.beatForward - 20);
      desiredZ = target.z;
    } else if (!actor.attackPermission) {
      // Waiting its turn: hold the line, staggered in depth so the queue does
      // not stack into one silhouette.
      desiredX = target.x - actor.facing * tempo.waitStation;
      desiredZ = target.z + actor.aiStrafeSign * (72 + (actor.id % 3) * 24);
    } else if (line) {
      // The spear line holds at reach, but closes on a crowd so the shaft runs
      // through its own front rank instead of over it.
      desiredX = target.x - actor.facing * (crowded ? line.crowdStation : line.commitStation);
      desiredZ = target.z;
    } else {
      desiredX = target.x - actor.facing * tempo.station;
    }

    const move = normalize2(desiredX - actor.x, desiredZ - actor.z);
    const speedScale = actor.attackPermission ? 1 : 0.72;
    this.moveActor(actor, move.x, move.y, speedScale, dt);
    this.updateContinuousState(actor, 'move', dt);
  }

  /**
   * The swing this archetype commits to. Each one answers a different question:
   * the thug's flurry comes from two clubs and a mate, the captain cuts slowly
   * and heavily, the spear thrusts at reach but butts anyone crowding its dead
   * zone, and the wretch simply keeps clawing.
   */
  private chooseFieldAttack(actor: Actor, target: Actor, forward: number, braced: boolean): string {
    const roll = this.rng.next();
    switch (actor.archetype) {
      case 'spear':
        return braced ? 'spear_brace' : 'spear_thrust';
      case 'captain':
        return roll < 0.35 ? 'captain_bash' : 'captain_cut';
      case 'wretch':
        return 'wretch_claw';
      case 'thug':
        // Still just a club: long it jabs its way in, close it swings for the head.
        if (forward > 60) return roll < 0.6 ? 'thug_press' : 'thug_overhead';
        if (target.state === 'crouch') return roll < 0.58 ? 'thug_low' : 'thug_body';
        return roll < 0.34 ? 'thug_press'
          : roll < 0.62 ? 'thug_overhead'
          : roll < 0.84 ? 'thug_body'
          : 'thug_low';
      default:
        return 'thug_press';
    }
  }

  /**
   * True when the target is standing inside a crowd. The spear line reads that
   * as an invitation: closing up puts the shaft through its own front rank.
   */
  private isCrowded(target: Actor, tempo: EnemyTempo): boolean {
    const line = tempo.line;
    if (!line) return false;
    const limit = line.crowdRadius * line.crowdRadius;
    let count = 0;
    for (const enemy of this.actors) {
      if (enemy.team !== 'enemies' || enemy.state === 'dead') continue;
      if (this.distanceSquared(enemy, target) > limit) continue;
      count += 1;
      if (count >= line.crowdCount) return true;
    }
    return false;
  }

  /**
   * Arms the mate's half of a pair beat. A thug press is never one club: the
   * nearest thug in reach that is neither swinging nor already committed swings
   * on a beat offset from this one, timed so its cudgel arrives just as the
   * player is climbing out of the first hitstun.
   */
  private armPairBeat(actor: Actor): void {
    const pair = ENEMY_TEMPO.thug.pair;
    if (!pair) return;
    let mate: Actor | null = null;
    let closest = pair.radius * pair.radius;
    for (const other of this.actors) {
      if (other === actor || other.archetype !== 'thug' || other.state === 'dead') continue;
      if (other.pairBeatTimer > 0) continue;
      if (other.state === 'hitstun' || other.state === 'guardbreak') continue;
      // A mate still winding up or landing its own cut cannot answer. One that
      // has already planted its cudgel can, and does: the pair trades beats
      // instead of standing around waiting for each other.
      if (other.state === 'attack' && other.attack) {
        const swing = getAttack(other.attack.id);
        if (other.attack.elapsed < swing.startup + swing.active) continue;
      }
      const distance = this.distanceSquared(other, actor);
      if (distance >= closest) continue;
      closest = distance;
      mate = other;
    }
    if (!mate) return;
    mate.pairBeatTimer = pair.beatDelay;
  }

  private updateBossAI(actor: Actor, target: Actor, dt: number): void {
    const healthRatio = actor.health / actor.maxHealth;
    if (healthRatio <= 0.5 && this.bossPhase < 2) {
      this.bossPhase = 2;
      actor.speedX *= 1.18;
      actor.speedZ *= 1.14;
      this.emit({ type: 'boss-phase', actorId: actor.id, x: actor.x, z: actor.z, text: 'The chains tear.' });
      // One wretch, not two. Measured: the pair that comes with the phase change
      // is what ended the fight — a bot that had taken the boss to 99 of 420 died
      // to the two of them while it was still on its feet, because the last
      // stretch is a boss *and* a swarm and the swarm is what keeps landing.
      //
      // And it comes in the way every other fighter in the game comes in: off the
      // edge of the picture, walking. It used to be shed at the boss's own flank
      // — a body appearing out of nothing a stride away, which is the one thing
      // this project does not do — so the second half of the finale now reads as
      // the thing calling help rather than conjuring it, and the player gets the
      // length of a walk-in to see it coming.
      this.spawnEnemy('wretch');
    }

    const dx = target.x - actor.x;
    const dz = target.z - actor.z;
    const distance = Math.hypot(dx, dz);

    if (actor.aiCooldown <= 0) {
      let attackId = 'boss_sweep';
      if (distance > 185) attackId = 'boss_leap';
      else if (this.bossPhase >= 2 && this.rng.next() < 0.34) attackId = 'boss_shock';
      else if (this.rng.next() < 0.38) attackId = 'boss_leap';
      this.startAttack(actor, attackId, target);
      actor.aiCooldown = this.bossPhase >= 2 ? this.rng.range(0.65, 1.0) : this.rng.range(0.9, 1.35);
      return;
    }

    const move = normalize2(dx, dz);
    const preferred = distance > 105 ? 1 : 0.25;
    this.moveActor(actor, move.x, move.y, preferred, dt);
    this.updateContinuousState(actor, 'move', dt);
  }

  private updateEnemyAttack(actor: Actor, dt: number): void {
    const runtime = actor.attack;
    if (!runtime) {
      this.enterNeutral(actor);
      return;
    }
    const definition = getAttack(runtime.id);
    runtime.elapsed += dt;
    actor.stateElapsed = runtime.elapsed;

    const target = runtime.targetId === null ? null : this.actors.find((candidate) => candidate.id === runtime.targetId);
    if (target && runtime.elapsed < definition.startup * 0.72) {
      actor.facing = target.x >= actor.x ? 1 : -1;
      actor.z += clamp(target.z - actor.z, -54 * dt, 54 * dt);
    }

    const motionDuration = Math.max(0.01, definition.startup + definition.active);
    if (runtime.elapsed <= motionDuration) {
      actor.x += actor.facing * (definition.movement / motionDuration) * dt;
    }
    this.clampActor(actor);

    if (runtime.elapsed >= attackDuration(definition)) {
      // A beat of its own: the jab hands off to the falling cudgel while the
      // player is still inside the first hitstun, as long as the target is still
      // standing in front of it. Any hit that flinches the attacker drops the
      // follow-up with it, because `applyHit` clears `actor.attack`.
      const chainId = definition.aiChain;
      if (chainId && definition.owner !== 'player' && target && target.state !== 'dead'
        && this.attackIntersects(actor, target, getAttack(chainId))) {
        this.startAttack(actor, chainId, target);
        return;
      }
      actor.attack = null;
      actor.aiCooldown = Math.max(actor.aiCooldown, this.restAfterSwing(actor, target ?? null));
      this.enterNeutral(actor);
    }
  }

  /**
   * The rest an archetype takes once a swing has played out. Charging it at the
   * end of the move (rather than when it was committed to) is what makes the
   * tempo table mean "the pause between swings": a slow thrust does not eat the
   * spearman's own patience, and a crowd is thinned by rest, not by permission
   * alone. The spear's rest shortens when the player is buried in company, which
   * is how the line punishes crowding.
   */
  private restAfterSwing(actor: Actor, target: Actor | null): number {
    if (actor.archetype === 'meyer' || actor.archetype === 'grotesque') return 0;
    const tempo = ENEMY_TEMPO[actor.archetype];
    const line = tempo.line;
    const cadence = line && target && this.isCrowded(target, tempo) ? line.crowdCooldown : tempo.cooldown;
    return this.rng.range(cadence[0], cadence[1]);
  }

  /**
   * Everything on the floor: drops hop where they fell, hurled finds arc away
   * and bite whatever they cross. Nothing here is picked up — a take waits for
   * a hand to reach for it (see reachForItem).
   */
  private updateItems(dt: number): void {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      if (!item) continue;
      item.age += dt;
      if (item.y > 0 || item.vy > 0) {
        item.vy -= ITEM_GRAVITY * dt;
        item.x += item.vx * dt;
        item.z += item.vz * dt;
        item.y += item.vy * dt;
        item.vx = damp(item.vx, 0, ITEM_AIR_DRAG, dt);
        if (item.y <= 0) {
          item.y = 0;
          item.vy = 0;
          item.vx *= 0.25;
          item.vz = 0;
          this.clampItem(item);
        } else if (item.thrownBy !== null && item.y > THROWN_HIT_HEIGHT) {
          this.resolveThrownHit(item);
        }
      }
      // Anything left on the road too long fades, so a road cannot silt up.
      if (item.age >= ITEM_LIFETIME_SECONDS) this.items.splice(index, 1);
    }
  }

  private clampItem(item: Item): void {
    item.x = clamp(item.x, this.bounds.minX + 14, this.bounds.maxX - 14);
    item.z = clamp(item.z, ARENA.minZ + 6, ARENA.maxZ - 6);
  }

  private spawnItem(
    kind: ItemKind,
    x: number,
    z: number,
    options: {
      durability?: number;
      thrownBy?: number | null;
      vx?: number;
      vy?: number;
      vz?: number;
    } = {}
  ): Item {
    const item: Item = {
      id: this.nextItemId++,
      kind,
      x,
      z,
      y: 0,
      vx: options.vx ?? 0,
      vy: options.vy ?? 0,
      vz: options.vz ?? 0,
      durability: options.durability ?? 0,
      thrownBy: options.thrownBy ?? null,
      hitIds: new Set<number>(),
      age: 0
    };
    this.items.push(item);
    return item;
  }

  /**
   * Whatever the fallen was holding lands where they fell. This is the only way
   * a club or a shaft ever reaches Meyer's hands: the field arms him.
   */
  private dropLoot(actor: Actor): void {
    if (actor.archetype === 'meyer') return;
    const table = DROP_TABLE[actor.archetype];
    const toward = this.playerActors().find((player) => player.state !== 'dead');
    const drift = toward ? Math.sign(toward.x - actor.x || 1) : 1;
    const kind = table.weapon;
    if (kind) {
      this.spawnItem(kind, actor.x, actor.z, {
        durability: isImprovisedWeapon(kind) ? ITEM_DURABILITY[kind] : 0,
        vx: drift * 44,
        vy: ITEM_DROP_HOP * 0.72
      });
      this.emit({ type: 'item-drop', actorId: actor.id, x: actor.x, z: actor.z, text: kind });
    }
    // A draught is the consolation prize of a long fight, and the reason a
    // corner of the road is worth remembering.
    if (this.rng.next() < table.potionChance) {
      this.spawnItem('potion', actor.x - drift * 16, actor.z + 8, { vx: -drift * 26, vy: ITEM_DROP_HOP * 0.5 });
      this.emit({ type: 'item-drop', actorId: actor.id, x: actor.x, z: actor.z, text: 'potion' });
    }
  }

  /**
   * A flying find bites the first hostile it crosses, then lies where it lands.
   * The hit runs through the ordinary pipeline so armour, guard and combo decay
   * all behave — but a parry knocks the weapon out of the air rather than
   * flinching the man who threw it, because he is not the one being hit.
   */
  private resolveThrownHit(item: Item): void {
    const kind = item.kind;
    if (kind !== 'club' && kind !== 'spear') return;
    const thrower = this.actors.find((actor) => actor.id === item.thrownBy);
    if (!thrower || thrower.state === 'dead') return;
    const definition = THROWN_ATTACKS[kind];
    for (const target of this.actors) {
      if (target.team === thrower.team || target.state === 'dead') continue;
      if (target.invulnerable > 0 || item.hitIds.has(target.id)) continue;
      if (Math.hypot(target.x - item.x, target.z - item.z) > target.radius + 18) continue;
      item.hitIds.add(target.id);

      if (this.catchesThrownWeapon(target)) {
        // Taken out of the air: robbed of its flight, so it drops at the feet of
        // whoever caught it instead of sailing on.
        item.vx *= 0.2;
        this.deflectItem(item, target, definition);
        return;
      }
      // The throw itself is over long before the club arrives, and the hit
      // pipeline books its work against an active attack, so the throw's own
      // runtime is lent back for the length of this call.
      const previous = thrower.attack;
      if (!previous) {
        thrower.attack = {
          id: definition.id,
          elapsed: definition.startup + definition.active,
          targetId: target.id,
          hitIds: new Set<number>(),
          hitConfirmed: false,
          blocked: false,
          queuedAction: null,
          activeCuePlayed: true,
          signatureShown: true,
          released: true
        };
      }
      if (this.tryBlock(thrower, target, definition)) this.deflectItem(item, target, definition);
      else this.applyHit(thrower, target, definition);
      if (!previous) thrower.attack = null;
      item.vx *= 0.3;
      return;
    }
  }

  /** A hand raised at the right moment takes a thrown club out of the air. */
  private catchesThrownWeapon(target: Actor): boolean {
    if (target.parryWindow > 0) return true;
    if (!target.attack) return false;
    const definition = getAttack(target.attack.id);
    return definition.deflectStart !== undefined
      && definition.deflectEnd !== undefined
      && target.attack.elapsed >= definition.deflectStart
      && target.attack.elapsed <= definition.deflectEnd;
  }

  private deflectItem(item: Item, target: Actor, definition: AttackDefinition): void {
    target.flashTimer = 0.08;
    this.hitStop = Math.max(this.hitStop, 0.05);
    this.emit({
      type: 'parry',
      actorId: target.id,
      x: item.x,
      z: item.z,
      text: definition.id === 'hurl_spear' ? 'SHAFT ASIDE' : 'CLUB ASIDE',
      hitZone: definition.hitZone
    });
  }/**
 * Reaching down for something is a deliberate act — Little Fighter 2's streets
 * arm the fight, but nothing here is collected by pacing over it. The Switch
 * button is the hand that does the reaching: it already means "change what I am
 * holding", and when the road offers something those hands can accept, taking
 * it is that change. Returns true when the press was spent on a find.
 *
 * The nearest acceptable thing wins, so one press takes one thing and never
 * sweeps a pile. Note what this means for the button's other jobs: while a
 * cudgel is in hand, standing over steel you cannot yet take leaves Switch as
 * the throw it always was, because the offer was never made.
 */
  private reachForItem(actor: Actor): boolean {
    if (!ITEM_REACH_STATES.has(actor.state)) return false;
    let nearest: Item | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const item of this.items) {
      if (!itemWithinReach(actor, item)) continue;
      const distance = Math.hypot(item.x - actor.x, item.z - actor.z);
      if (distance >= nearestDistance) continue;
      nearest = item;
      nearestDistance = distance;
    }
    if (!nearest) return false;
    this.takeItem(actor, nearest);
    this.items.splice(this.items.indexOf(nearest), 1);
    return true;
  }

  /**
   * Puts a thing off the road into the hands that reached for it. Whether those
   * hands were allowed to is decided once, in canTakeItem, so this only applies
   * the take it was promised.
   */
  private takeItem(player: Actor, item: Item): void {
    const kind = item.kind;
    if (kind === 'potion') {
      const healed = Math.round(Math.min(player.maxHealth, player.health + POTION_HEAL) - player.health);
      player.health += healed;
      player.flashTimer = 0.12;
      this.emit({ type: 'item-heal', actorId: player.id, x: player.x, z: player.z, amount: healed, text: 'POTION' });
      return;
    }

    if (isImprovisedWeapon(kind)) {
      player.weapon = kind;
      player.desiredWeapon = kind;
      player.durability = item.durability;
      this.emit({ type: 'item-pickup', actorId: player.id, x: player.x, z: player.z, text: kind });
      return;
    }

    player.weapon = kind;
    player.desiredWeapon = kind;
    player.stowedWeapon = kind;
    player.durability = 0;
    this.emit({ type: 'item-pickup', actorId: player.id, x: player.x, z: player.z, text: kind });
  }

  private startThrow(actor: Actor): void {
    const attackId = throwAttackFor(actor.weapon);
    if (attackId) this.startAttack(actor, attackId);
  }

  /** The weapon leaves the hand here, and the fencing weapon comes back out. */
  private releaseCarriedWeapon(actor: Actor): void {
    if (!isImprovisedWeapon(actor.weapon)) return;
    const kind = actor.weapon;
    this.spawnItem(kind, actor.x + actor.facing * 18, actor.z, {
      durability: actor.durability,
      thrownBy: actor.id,
      vx: actor.facing * THROWN_SPEED_X,
      vy: THROWN_SPEED_Y
    });
    actor.weapon = actor.stowedWeapon;
    actor.desiredWeapon = actor.stowedWeapon;
    actor.durability = 0;
    this.emit({ type: 'item-throw', actorId: actor.id, x: actor.x, z: actor.z, text: kind });
  }

  /** A landed blow spends a point of the carried find; at zero it comes apart. */
  private chipCarriedWeapon(attacker: Actor): void {
    if (attacker.team !== 'players' || !isImprovisedWeapon(attacker.weapon)) return;
    attacker.durability -= 1;
    if (attacker.durability > 0) return;
    const broken = attacker.weapon;
    attacker.weapon = attacker.stowedWeapon;
    attacker.desiredWeapon = attacker.stowedWeapon;
    attacker.durability = 0;
    this.emit({
      type: 'weapon-break',
      actorId: attacker.id,
      x: attacker.x,
      z: attacker.z,
      text: broken,
      hitZone: 'torso'
    });
  }

  private processAttackHits(): void {
    for (const attacker of this.actors) {
      const runtime = attacker.attack;
      if (!runtime || attacker.state !== 'attack') continue;
      const definition = getAttack(runtime.id);
      // A throw does not resolve a melee hitbox; it lets go of the weapon and
      // the flying item does the rest.
      if (definition.throw) continue;
      if (!isAttackActive(definition, runtime.elapsed)) continue;

      if (!runtime.activeCuePlayed) {
        runtime.activeCuePlayed = true;
        this.emit({
          type: 'attack',
          actorId: attacker.id,
          x: attacker.x,
          z: attacker.z,
          attackId: definition.id,
          hitZone: definition.hitZone
        });
      }

      let targetsHit = 0;
      for (const target of this.actors) {
        if (target.team === attacker.team || target.state === 'dead' || runtime.hitIds.has(target.id)) continue;
        if (target.invulnerable > 0) continue;
        if (!this.attackIntersects(attacker, target, definition)) continue;

        runtime.hitIds.add(target.id);
        targetsHit += 1;

        if (this.tryParryOrDeflect(attacker, target, definition)) break;
        if (this.tryBlock(attacker, target, definition)) {
          if (targetsHit >= definition.maxTargets) break;
          continue;
        }

        this.applyHit(attacker, target, definition);
        // A find only lasts so long: every blow that lands chips it.
        this.chipCarriedWeapon(attacker);
        if (targetsHit >= definition.maxTargets) break;
      }
    }
  }

  private attackIntersects(attacker: Actor, target: Actor, definition: AttackDefinition): boolean {
    const dx = target.x - attacker.x;
    const dz = target.z - attacker.z;
    let intersects: boolean;
    if (definition.arc === 'radial') {
      const radius = Math.max(definition.reach, definition.depth) + target.radius;
      intersects = Math.hypot(dx, dz) <= radius;
    } else {
      const forward = dx * attacker.facing;
      intersects = (
        forward >= definition.minForward - target.radius &&
        forward <= definition.reach + target.radius &&
        Math.abs(dz) <= definition.depth + target.radius * 0.72
      );
    }
    const targetPosture = this.hasCrouchedPosture(target) ? 'crouch' : target.state;
    return intersects && isHitZoneExposed(targetPosture, definition.hitZone);
  }

  private tryParryOrDeflect(attacker: Actor, target: Actor, definition: AttackDefinition): boolean {
    if (definition.parryable === false) return false;
    const fromFront = (attacker.x - target.x) * target.facing >= -18;
    if (!fromFront) return false;

    const timedParry = target.parryWindow > 0;
    let deflected = timedParry;
    if (!deflected && target.attack) {
      const targetDef = getAttack(target.attack.id);
      if (
        targetDef.deflectStart !== undefined &&
        targetDef.deflectEnd !== undefined &&
        target.attack.elapsed >= targetDef.deflectStart &&
        target.attack.elapsed <= targetDef.deflectEnd
      ) {
        deflected = true;
      }
    }
    if (!deflected) return false;

    attacker.attack = null;
    attacker.state = 'hitstun';
    attacker.stateElapsed = 0;
    attacker.stateDuration = attacker.archetype === 'grotesque' ? 0.24 : 0.52;
    attacker.reactionZone = definition.hitZone;
    attacker.vx = -attacker.facing * 58;
    attacker.vz = 0;
    target.counterWindow = 1.05;
    target.openingTimer = Math.max(target.openingTimer, target.provokeTimer > 0 ? 2.5 : 1.6);
    target.provokeTimer = 0;
    target.flashTimer = 0.08;
    this.hitStop = Math.max(this.hitStop, 0.075);
    this.emit({
      type: timedParry ? 'parry' : 'interception',
      actorId: target.id,
      targetId: attacker.id,
      x: target.x,
      z: target.z,
      text: 'TAKE',
      hitZone: definition.hitZone
    });
    return true;
  }

  private tryBlock(attacker: Actor, target: Actor, definition: AttackDefinition): boolean {
    if (target.state !== 'block' || target.guard <= 0) return false;
    const fromFront = (attacker.x - target.x) * target.facing >= -14;
    if (!fromFront) return false;
    const targetCrouched = this.hasCrouchedPosture(target);

    target.guard -= definition.guardDamage;
    target.guardRegenDelay = 1.55;
    target.flashTimer = 0.06;
    attacker.attack!.blocked = true;
    if (definition.provoke && attacker.team === 'players') attacker.provokeTimer = 2.25;

    target.x += attacker.facing * Math.min(14, definition.knockback * 0.09);
    this.clampActor(target);

    if (target.guard <= 0) {
      target.guard = 0;
      target.reactionZone = definition.hitZone;
      target.state = 'guardbreak';
      target.stateElapsed = 0;
      target.stateDuration = target.archetype === 'grotesque' ? 0.48 : 0.9;
      target.attack = null;
      this.emit({
        type: 'guardbreak',
        actorId: attacker.id,
        targetId: target.id,
        x: target.x,
        z: target.z,
        text: 'GUARD BROKEN',
        hitZone: definition.hitZone,
        targetCrouched
      });
      this.hitStop = Math.max(this.hitStop, 0.085);
    } else {
      this.emit({
        type: 'blocked',
        actorId: attacker.id,
        targetId: target.id,
        x: target.x,
        z: target.z,
        amount: definition.guardDamage,
        hitZone: definition.hitZone,
        targetCrouched
      });
      this.hitStop = Math.max(this.hitStop, definition.heavy ? 0.045 : 0.025);
    }
    return true;
  }

  private applyHit(attacker: Actor, target: Actor, definition: AttackDefinition): void {
    let multiplier = 1;
    let thirdIntention = false;

    if (attacker.team === 'players' && definition.heavy && attacker.openingTimer > 0) {
      multiplier = 1.52;
      if (attacker.weapon === 'longsword' && this.lessons.has('ls-provoker')) multiplier = 1.78;
      attacker.openingTimer = 0;
      attacker.provokeTimer = 0;
      thirdIntention = true;
    }

    let damage = definition.damage * multiplier;
    let appliedHitstun = definition.hitstun;

    const absorbedByArmor = target.armor > 0;
    if (absorbedByArmor) {
      // Lights do grind through plate — otherwise the armoured lesson has no
      // floor for a beginner — but they grind slowly enough that the committed
      // strike is still the answer.
      const armorPressure = definition.guardDamage * (definition.heavy ? 1.05 : 0.75) * (thirdIntention ? 1.65 : 1);
      target.armor = Math.max(0, target.armor - armorPressure);
      damage *= definition.heavy || thirdIntention ? 0.66 : 0.28;
    }

    // What the plate absorbed. A light that fails to get through is felt but not
    // answered by the body: the armoured man does not flinch, he only learns
    // where you are — and posts a bill. Heavies still move him, which is why the
    // way through plate is a committed strike, and the blow that finally breaks
    // the plate lands as a hit because there is nothing left holding him up.
    const shruggedOff = absorbedByArmor && !definition.heavy && target.armor > 0;

    if (target.archetype === 'grotesque') {
      appliedHitstun = definition.heavy ? Math.min(appliedHitstun, 0.2) : 0.055;
    }

    // Successive hits in one string freeze the target for less each time, so a
    // chain starves itself out instead of looping forever: the longer the string,
    // the thinner the window each link has to land in. A lull longer than any
    // possible link means the chain ended and the next hit starts a fresh one —
    // which is also why the decay can never be gamed by stalling a string.
    if (attacker.team === 'players') {
      if (attacker.comboLull > COMBO_LINK_GRACE_SECONDS) {
        attacker.comboHits = 0;
        // The HUD counter names one string at a time, not a whole fight.
        attacker.comboCount = 0;
      }
      appliedHitstun *= Math.max(COMBO_HITSTUN_FLOOR, 1 - COMBO_HITSTUN_DECAY * attacker.comboHits);
      attacker.comboHits += 1;
      attacker.comboLull = 0;
    }

    const roundedDamage = Math.max(1, Math.round(damage));
    const targetCrouched = this.hasCrouchedPosture(target);
    target.health = Math.max(0, target.health - roundedDamage);
    target.guardRegenDelay = 1.25;
    target.flashTimer = 0.1;
    target.reactionZone = definition.hitZone;

    if (shruggedOff && target.health > 0) {
      // The plate held: no flinch, no interrupted swing, and the answer is armed.
      if (target.archetype !== 'meyer' && target.archetype !== 'grotesque') {
        const answer = ENEMY_TEMPO[target.archetype].answer;
        if (answer) target.answerTimer = Math.max(target.answerTimer, answer.window);
      }
    } else {
      target.attack = null;
      // A mate's queued swing dies with the man who was about to take it.
      target.pairBeatTimer = 0;
      target.vx = attacker.facing * definition.knockback;
      target.vz += Math.sign(target.z - attacker.z || 1) * definition.knockback * 0.18;
    }

    attacker.attack!.hitConfirmed = true;
    attacker.comboCount += 1;

    if (target.health <= 0) {
      target.state = 'dead';
      target.stateElapsed = 0;
      target.stateDuration = 1.15;
      target.deathTimer = 0;
      target.vx = attacker.facing * definition.knockback * 1.2;
      this.dropLoot(target);
      this.score += target.scoreValue;
      this.emit({
        type: 'death',
        actorId: attacker.id,
        targetId: target.id,
        x: target.x,
        z: target.z,
        amount: roundedDamage,
        hitZone: definition.hitZone,
        targetCrouched
      });
    } else if (!shruggedOff) {
      target.state = 'hitstun';
      target.stateElapsed = 0;
      target.stateDuration = appliedHitstun;
    }

    if (definition.signature && !attacker.attack!.signatureShown) {
      this.emit({ type: 'signature', actorId: attacker.id, targetId: target.id, x: attacker.x, z: attacker.z, text: thirdIntention ? 'PROVOKE · TAKE · HIT' : definition.signature });
      attacker.attack!.signatureShown = true;
    }
    const hitEvent: GameEvent = {
      type: definition.heavy ? 'heavy-hit' : 'hit',
      actorId: attacker.id,
      targetId: target.id,
      x: target.x,
      z: target.z,
      amount: roundedDamage,
      attackId: definition.id,
      hitZone: definition.hitZone,
      targetCrouched,
      impact: absorbedByArmor ? 'armor' : 'flesh'
    };
    if (thirdIntention) hitEvent.text = 'HIT';
    this.emit(hitEvent);
    this.hitStop = Math.max(this.hitStop, definition.hitStop * (thirdIntention ? 1.3 : 1));
  }

  private startAttack(actor: Actor, attackId: string, explicitTarget?: Actor): void {
    const definition = getAttack(attackId);
    const target = explicitTarget ?? chooseSoftTarget(actor, this.actors, {
      maxForward: definition.reach + 74,
      maxDepth: Math.max(96, definition.depth + 68),
      previousTargetId: actor.attack?.targetId ?? null
    });

    if (target) actor.facing = target.x >= actor.x ? 1 : -1;
    actor.attack = {
      id: attackId,
      elapsed: 0,
      targetId: target?.id ?? null,
      hitIds: new Set<number>(),
      hitConfirmed: false,
      blocked: false,
      queuedAction: null,
      activeCuePlayed: false,
      signatureShown: false,
      released: false
    };
    actor.state = 'attack';
    actor.stateElapsed = 0;
    actor.stateDuration = attackDuration(definition);
    actor.vx = 0;
    actor.vz = 0;
    actor.reactionZone = null;
    // Committing to its own swing loses whatever beat was queued for it.
    actor.pairBeatTimer = 0;
  }

  private startDodge(actor: Actor, moveX: number, moveZ: number): void {
    actor.state = 'dodge';
    actor.stateElapsed = 0;
    actor.stateDuration = 0.31;
    actor.stateMoveX = moveX;
    actor.stateMoveZ = moveZ;
    actor.invulnerable = 0.18;
    actor.reactionZone = null;
    if (Math.abs(moveX) > 0.15) actor.facing = moveX >= 0 ? 1 : -1;
  }

  private startCrouch(actor: Actor): void {
    actor.state = 'crouch';
    actor.stateElapsed = 0;
    actor.stateDuration = CROUCH_DURATION_SECONDS;
    actor.vx = 0;
    actor.vz = 0;
    actor.reactionZone = null;
  }

  private startSwitch(actor: Actor, fromHit: boolean): void {
    // With a find in hand there is nothing to switch to: the same button hurls
    // it instead, which is how a thug's club stops being your problem.
    if (isImprovisedWeapon(actor.weapon)) {
      this.startThrow(actor);
      return;
    }
    actor.desiredWeapon = actor.weapon === 'longsword' ? 'dussack' : 'longsword';
    actor.state = 'switch';
    actor.stateElapsed = 0;
    actor.stateDuration = this.lessons.has('switch-flourish') && fromHit ? 0.11 : fromHit ? 0.19 : 0.31;
    actor.stateMoveX = fromHit ? 1 : 0;
    actor.stateMoveZ = 0;
    actor.attack = null;
    actor.comboCount = fromHit ? actor.comboCount : 0;
    actor.comboHits = fromHit ? actor.comboHits : 0;
    actor.reactionZone = null;
  }

  private enterNeutral(actor: Actor): void {
    actor.state = 'idle';
    actor.stateElapsed = 0;
    actor.stateDuration = 0;
    actor.vx = 0;
    actor.vz = 0;
    actor.attack = null;
    // Idling out of a move is what ends a chain, so the next cut starts fresh
    // with undecayed hitstun.
    actor.comboHits = 0;
    actor.reactionZone = null;
  }

  private updateContinuousState(actor: Actor, state: 'idle' | 'move', dt: number): void {
    if (actor.state === state) actor.stateElapsed += dt;
    else actor.stateElapsed = 0;
    actor.state = state;
    actor.stateDuration = 0;
    actor.reactionZone = null;
  }

  private moveActor(actor: Actor, moveX: number, moveZ: number, scale: number, dt: number): void {
    const normalized = Math.hypot(moveX, moveZ) > MOVE_INPUT_DEADZONE
      ? normalize2(moveX, moveZ)
      : { x: 0, y: 0 };
    const targetVx = normalized.x * actor.speedX * scale;
    const targetVz = normalized.y * actor.speedZ * scale;
    actor.vx = damp(actor.vx, targetVx, 16, dt);
    actor.vz = damp(actor.vz, targetVz, 16, dt);
    actor.x += actor.vx * dt;
    actor.z += actor.vz * dt;
    if (Math.abs(normalized.x) > 0.12) actor.facing = normalized.x >= 0 ? 1 : -1;
    this.clampActor(actor);
  }

  private hasCrouchedPosture(actor: Actor): boolean {
    if (actor.state === 'crouch') return true;
    if (actor.state !== 'attack' || !actor.attack) return false;
    return getAttack(actor.attack.id).crouchedPosture === true;
  }

  private bufferPlayerEdges(inputs: readonly InputFrame[]): void {
    for (let index = 0; index < this.playerCount; index += 1) {
      const pending = this.pendingPlayerEdges[index];
      if (pending) this.mergePlayerEdges(pending, inputs[index] ?? NEUTRAL_INPUT);
    }
  }

  private consumePlayerInput(playerIndex: number, current: Readonly<InputFrame>): InputFrame {
    const pending = this.pendingPlayerEdges[playerIndex];
    if (!pending) return { ...current };
    this.mergePlayerEdges(pending, current);
    const actor = this.actors.find((candidate) => candidate.playerIndex === playerIndex);
    if (actor && (actor.state === 'hitstun' || actor.state === 'guardbreak')) {
      // Reaction states cannot act this step; keep edges queued so the press
      // fires on recovery instead of being consumed and silently dropped.
      return { ...current };
    }
    const useMobilityEdgeAxes = pending.mobilityPressed;
    const merged: InputFrame = {
      ...current,
      moveX: useMobilityEdgeAxes ? pending.moveX : current.moveX,
      moveZ: useMobilityEdgeAxes ? pending.moveZ : current.moveZ,
      lightPressed: pending.lightPressed,
      heavyPressed: pending.heavyPressed,
      mobilityPressed: pending.mobilityPressed,
      switchPressed: pending.switchPressed,
      guardPressed: pending.guardPressed
    };
    pending.lightPressed = false;
    pending.heavyPressed = false;
    pending.mobilityPressed = false;
    pending.switchPressed = false;
    pending.guardPressed = false;
    pending.moveX = 0;
    pending.moveZ = 0;
    return merged;
  }

  private mergePlayerEdges(target: InputFrame, source: Readonly<InputFrame>): void {
    const mobilityAlreadyPending = target.mobilityPressed;
    const attackAlreadyPending = target.lightPressed || target.heavyPressed;
    target.lightPressed ||= source.lightPressed;
    target.heavyPressed ||= source.heavyPressed;
    if (!attackAlreadyPending && source.mobilityPressed && !mobilityAlreadyPending) {
      target.mobilityPressed = true;
      target.moveX = source.moveX;
      target.moveZ = source.moveZ;
    }
    target.switchPressed ||= source.switchPressed;
    target.guardPressed ||= source.guardPressed;
  }

  private clampActor(actor: Actor): void {
    const roadMinX = this.bounds.minX + actor.radius;
    const roadMaxX = this.bounds.maxX - actor.radius;
    if (actor.team === 'players') {
      // Roads are wider than the camera window, and the window is a hard
      // boundary in both directions — but it follows the player, so the boundary
      // is the visible edge of the fight rather than a wall the camera once
      // walked past.
      const viewMinX = this.cameraX + 46;
      const viewMaxX = this.cameraX + CAMERA.width - 46;
      actor.x = clamp(actor.x, Math.max(roadMinX, viewMinX), Math.min(roadMaxX, viewMaxX));
    } else {
      actor.x = clamp(actor.x, roadMinX, roadMaxX);
    }
    // A gate narrows the walkable road for everyone: the player loses their
    // depth, and a crowd has to file through instead of arriving abreast.
    const depth = laneDepthRange(actor.x, this.lane);
    actor.z = clamp(actor.z, depth.minZ + actor.radius * 0.35, depth.maxZ - actor.radius * 0.25);
  }

  private resolveSeparation(): void {
    const living = this.actors.filter((actor) => actor.state !== 'dead');
    for (let firstIndex = 0; firstIndex < living.length; firstIndex += 1) {
      const first = living[firstIndex];
      if (!first) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < living.length; secondIndex += 1) {
        const second = living[secondIndex];
        if (!second) continue;
        const dx = second.x - first.x;
        const dz = second.z - first.z;
        const distance = Math.hypot(dx, dz);
        const minimum = (first.radius + second.radius) * 0.72;
        if (distance <= 0.001 || distance >= minimum) continue;
        const push = (minimum - distance) * 0.5;
        const nx = dx / distance;
        const nz = dz / distance;
        if (first.state !== 'attack' && first.state !== 'dodge') {
          first.x -= nx * push;
          first.z -= nz * push;
          this.clampActor(first);
        }
        if (second.state !== 'attack' && second.state !== 'dodge') {
          second.x += nx * push;
          second.z += nz * push;
          this.clampActor(second);
        }
      }
    }
  }

  private updatePermissions(dt: number): void {
    this.permissionTimer -= dt;
    if (this.permissionTimer > 0) return;
    this.permissionTimer = 0.38;

    for (const enemy of this.enemyActors()) enemy.attackPermission = enemy.archetype === 'grotesque';

    for (const player of this.playerActors().filter((actor) => actor.state !== 'dead')) {
      const candidates = this.enemyActors()
        .filter((enemy) => enemy.state !== 'dead' && enemy.archetype !== 'grotesque')
        // Whoever is urgent gets the first slots (a sprung ambush), then the
        // nearest, so the queue behaves the way the player reads it.
        .sort((left, right) => (right.urgency - left.urgency) ||
          (this.distanceSquared(left, player) - this.distanceSquared(right, player)));
      // How many enemies may commit at once is one frozen campaign-wide budget,
      // never a per-wave number: a crowd gets more dangerous by coordinating,
      // not by getting tougher.
      let meleeSlots = ATTACK_SLOTS.melee;
      let reachSlots = ATTACK_SLOTS.reach;
      for (const enemy of candidates) {
        if (enemy.attackPermission) continue;
        if (enemy.archetype === 'spear') {
          if (reachSlots <= 0) continue;
          reachSlots -= 1;
          enemy.attackPermission = true;
        } else {
          if (meleeSlots <= 0) continue;
          meleeSlots -= 1;
          enemy.attackPermission = true;
        }
        if (meleeSlots <= 0 && reachSlots <= 0) break;
      }
    }
  }

  /**
   * How this wave feeds enemies in. The marching kinds are scheduled up front;
   * a flood and a stand enqueue on their own clocks, and an ambush additionally
   * waits for the player to walk past its trigger.
   */
  private updateSpawns(dt: number): void {
    this.spawnClock += dt;
    const definition = this.wave;
    if (definition) {
      if (definition.kind === 'flood') this.updateSurgeClock(definition);
      else if (definition.kind === 'hold') this.updateHoldClock(definition, dt);
      else if (definition.kind === 'ambush') this.checkAmbushTrigger(definition);
    }
    this.drainSpawnQueue();
  }

  /**
   * The road empties, then fills: one authored surge per beat, flank to flank.
   *
   * The clock is the pacing, with one brake on it. A surge will not land on a
   * *pile* — if the yard is still holding more than a couple of stragglers the
   * next one waits, so a player who is drowning is not drowned — but it does
   * land on a *fight*. Waiting for a perfectly empty yard made the flood four
   * separate fight-by-fight arrivals and nothing more: the lull stopped being
   * the space between two waves and became the whole encounter. The flood's
   * pressure lives in the overlap, and it is affordable to overlap because the
   * yard permits only two to commit at once (`ATTACK_SLOTS`), so a crowded
   * courtyard is a queue rather than a burst.
   */
  private updateSurgeClock(definition: FloodWave): void {
    const { waves, every } = definition.surges;
    const due = this.surgeIndex * every;
    if (this.surgeIndex >= waves.length || this.spawnClock < due) return;
    const standing = this.enemyActors().filter((actor) => actor.state !== 'dead').length;
    if (standing > SURGE_TAIL) return;
    const beat = waves[this.surgeIndex];
    this.surgeIndex += 1;
    if (!beat) return;
    this.enqueueBeat(beat, this.spawnClock);
    const flank = this.surgeIndex % 2 === 1 ? 'east' : 'west';
    for (const entry of this.spawnQueue) entry.side = flank;
    this.emit({
      type: 'surge',
      text: this.surgeIndex === 1 ? 'They come' : `Surge ${this.surgeIndex} of ${waves.length}`,
      amount: this.surgeIndex
    });
  }

  /**
   * The stand: beats keep arriving until the clock runs out, then they stop.
   *
   * One brake, and it is the same one the flood uses: a beat waits for the
   * stair to have room. The clock is the pressure here, and a beat that lands on
   * top of the beat before it turns the clock into a pile — measured, that was
   * the whole difference between a stand that cost a competent bot nothing (the
   * stair never held more than a pair) and one that cost 80-100 health and
   * ended runs (four and six on the steps at once). The beats still keep coming
   * after the clock stops if they were held back; outlasting the press means
   * outlasting what is on the stair, not just the countdown.
   */
  private updateHoldClock(definition: HoldWave, dt: number): void {
    if (this.holdRemaining <= 0) return;
    this.holdRemaining = Math.max(0, this.holdRemaining - dt);
    const beat = definition.hold.beats[this.holdBeat % definition.hold.beats.length];
    const elapsed = definition.hold.seconds - this.holdRemaining;
    if (!beat || elapsed < this.holdBeat * definition.hold.every) return;
    const standing = this.enemyActors().filter((enemy) => enemy.state !== 'dead').length;
    if (standing > HOLD_CROWD) return;
    this.holdBeat += 1;
    this.enqueueBeat(beat, this.spawnClock);
    // Down the stair, from one direction: a stand is a line held, and the
    // encounter that comes at your back is the ambush, not this one. Alternating
    // the flank here made the stair a squeeze from two sides; the pile, not the
    // clock, is what killed, which is the encounter's own idea turned inside out.
    //
    // And the beat comes in from the edge of the picture, like every other
    // arrival in the game: off-screen, so the player watches it walk in and has
    // the length of that walk to set their feet again. The old mouth — a stride
    // behind the player, *inside* the frame — was authored before the off-screen
    // rule and is gone with it. A beat that materialises beside the player is
    // exactly what the rule exists to stop, and a stand is a line the player
    // chooses to hold, not an ambush they cannot see coming.
    for (const entry of this.spawnQueue) entry.side = 'east';
    if (this.holdRemaining <= 0) {
      this.emit({ type: 'hold-over', text: 'The climb breaks.' });
    }
  }

  /**
   * The trap: the front group is the bait, and the doors open when the bait is
   * down to its last man. The doorway group then walks in at the player's back,
   * all at once, from off the western edge of the picture — so it is a turn the
   * player can see coming rather than a knife in the back, and the *walk-in* is
   * the warning: three figures crossing the ground behind you is the ambush
   * telling you what it is before it arrives.
   *
   * Two earlier rules were measured and are worth recording, because both were
   * reasonable and both broke the encounter in opposite directions.
   *
   * Sprung into the *middle* of the bait group it was not a turn but four more
   * bodies in an ongoing fight, and it cost a competent bot 64-110 of its 110
   * health. So the trigger was made to wait for the street to thin — and with
   * that wait the bait died first, every time: measured across eight seeds the
   * trap fired at x 1255 onto a street it had already lost, delivering three
   * wretches into a standing player's back for exactly 0 damage, while the
   * subtitle promised two fires. A wave that cannot cost anything is not a
   * gentle wave, it is a wave that does not exist.
   *
   * What is left is the encounter itself: the trap is the *turn*, so it fires
   * while the last of the bait is still in front of the player, and it is short
   * (three arrivals, spread, with 2 s of slot priority) so that a player who
   * turns and cuts gets to finish rather than drowning. The frontier check and
   * the room check stay as escape hatches: a player who simply runs the street
   * still gets caught, and one who has backed onto the road's western end waits
   * until there is off-screen ground for the wedge to come from.
   */
  private checkAmbushTrigger(definition: AmbushWave): void {
    if (this.ambushSprung) return;
    const frontier = this.playerActors().reduce((max, player) => Math.max(max, player.x), 0);
    const reachedTrigger = frontier >= definition.ambush.trigger;
    const baitIsBroken = this.enemyActors().filter((enemy) => enemy.state !== 'dead').length <=
      definition.ambush.remaining;
    // The doors open when the bait line breaks, or once the player has run far
    // enough past the trigger that waiting is the same as never firing.
    if (!reachedTrigger) return;
    if (!baitIsBroken && frontier < definition.ambush.trigger + AMBUSH_PURSUIT) return;
    // The doors are the western edge of the picture, so the trap needs off-screen
    // ground behind the player to open on. When there is none — a player with
    // their back to the west end of the road — it waits for the road it needs
    // rather than stacking bodies against a boundary and calling that an ambush.
    const behindX = this.offscreenArrivalX('west');
    if (behindX === null && frontier < definition.ambush.trigger + AMBUSH_PURSUIT) return;
    this.ambushSprung = true;

    // The whole trap walks in together: a trap that trickles is a queue.
    this.enqueueBeat(definition.ambush.behind, this.spawnClock, true);
    const depth = laneDepthRange(behindX ?? this.bounds.minX + ROAD_EDGE_INSET, this.lane);
    const span = depth.maxZ - depth.minZ - 70;
    let rank = 0;
    for (const entry of this.spawnQueue) {
      entry.side = 'west';
      // A wedge of backs, spread across the road's depth rather than stacked in
      // one lane. Measured false first — three wretches arriving in a single
      // depth band died to two cuts inside half a second, so the turn the wave is
      // built on cost nothing; the same three across three lanes are three
      // separate answers.
      entry.z = depth.minZ + 40 + ((rank % AMBUSH_BANDS) * span) / (AMBUSH_BANDS - 1);
      entry.urgency = AMBUSH_URGENCY;
      rank += 1;
    }
    this.emit({
      type: 'ambush',
      text: 'AMBUSH',
      subtitle: 'They are behind you — turn and cut, or be caught between two fires.'
    });
  }

  private drainSpawnQueue(): void {
    const schedule = this.spawnQueue;
    const frontier = this.playerActors().reduce((max, player) => Math.max(max, player.x), 0);

    while (schedule.length > 0) {
      const entry = schedule[0];
      if (!entry || entry.at > this.spawnClock) break;
      // Later groups unlock when the player's march reaches their road zone
      // (the Little Fighter 2 progression feel) or, as a soft-lock safety, when
      // the field is clear. The opening group always arrives on schedule.
      if (
        entry.threshold > Number.NEGATIVE_INFINITY &&
        frontier < entry.threshold &&
        this.actors.some((actor) => actor.team === 'enemies' && actor.state !== 'dead')
      ) break;
      schedule.shift();
      const arrival = this.spawnEnemy(entry.archetype, entry);
      if (arrival && entry.urgency) arrival.urgency = entry.urgency;
      // Keep the remainder of a released group trickling at its authored
      // cadence even when their scheduled times elapsed behind the gate.
      const follower = schedule[0];
      if (follower && follower.at <= this.spawnClock) {
        follower.at = this.spawnClock + entry.interval;
      }
    }
  }

  /**
   * The duel: one champion holding the far end of the hall, placed once, and
   * never reinforced.
   *
   * He is put down off the edge of the picture — the party walks into a level at
   * its western end, so the far end is off-screen at that moment — and then he
   * stands there. Nothing pops into being in front of the player; what the player
   * sees is a man across the hall who was already waiting, which is the duel's
   * whole read.
   */
  private spawnDuel(definition: DuelWave): void {
    if (this.duelSpawned) return;
    this.duelSpawned = true;
    let frontier: number = ARENA.minX;
    for (const player of this.playerActors()) frontier = Math.max(frontier, player.x);
    const x = this.offscreenArrivalX(definition.duel.end) ?? this.furthestRoadEnd(frontier);
    const depth = laneDepthRange(x, this.lane);
    const z = clamp(definition.duel.z, depth.minZ + 24, depth.maxZ - 24);
    const enemy = createEnemy(this.nextActorId++, definition.duel.archetype, x, z);
    enemy.facing = x >= frontier ? -1 : 1;
    this.actors.push(enemy);
  }

  /**
   * Advances the authoritative camera window, following the party in both
   * directions.
   *
   * The view used to ratchet east and never come back: it moved only forward
   * (`Math.max` against the last position), so giving ground meant walking toward
   * the left edge of your own screen and then off it — the window's edge is also
   * a hard boundary for the player (`clampActor`), so a retreat was capped by how
   * far the camera had already advanced. Little Fighter 2's camera follows the
   * fighter back, and the encounters here need it to: the stand is a line you
   * hold with room to break off *behind* it, and an ambush is answered by turning
   * and giving ground, both of which are unplayable if the ground behind you is
   * off-screen.
   *
   * The follow is asymmetric on purpose. Ahead of the fighter there is almost no
   * slack — the window centres them, as it always did, because what is ahead is
   * what has to be visible — and behind them there is `CAMERA.trail`, so the
   * shoves of ordinary fighting (28 px for a light, 132 for a committed heavy)
   * do not slide the road, while a deliberate retreat brings the view with it.
   */
  private updateCamera(): void {
    // The window never shows west of the arena's origin. `CAMERA.margin` is how
    // far the *camera* is pulled west of a road's grout, not ground anyone stands
    // on, and the party walks in at `bounds.minX + 150`, so the westmost window
    // is the origin itself.
    const minCameraX = ARENA.minX;
    const maxCameraX = Math.max(minCameraX, this.bounds.maxX - CAMERA.width);
    let frontier: number = minCameraX;
    for (const player of this.playerActors()) {
      if (player.state === 'dead') continue;
      frontier = Math.max(frontier, player.x);
    }
    // Move by only the slack the fighter has used up, so the window neither
    // snaps to them nor ignores them.
    const offset = frontier - (this.cameraX + CAMERA.width * 0.5);
    const slack = offset < 0 ? CAMERA.trail : 0;
    const excess = Math.abs(offset) - slack;
    if (excess <= 0) return;
    this.cameraX = clamp(
      this.cameraX + Math.sign(offset) * excess,
      minCameraX,
      maxCameraX
    );
  }

  /**
   * Begins a fight inside the place the journey is standing in.
   *
   * Nothing moves here, deliberately: a level is one place walked once, so the
   * waves after its first begin exactly where the player is standing, on the same
   * road, with what the fallen left lying where it fell — which is what makes a
   * level a place rather than a queue of arenas. Crossing into a new place is
   * `enterLevel`, and the choice between the two is `advanceWave`, so no caller
   * has to know which case it is in.
   */
  private beginWave(index: number): void {
    this.waveInLevel = index;
    const definition = this.wave;
    if (!definition) {
      this.finishCampaign();
      return;
    }

    this.phase = 'wave';
    this.waveTitle = definition.title;
    this.spawnClock = 0;
    this.spawnQueue = [];
    this.clearTimer = 0;
    this.exitOpen = false;
    this.exitTimer = 0;
    this.waveResolved = false;
    this.offeredLessons = [];
    if (definition.kind === 'boss') this.bossPhase = 1;

    // Whichever kind authored a lane gets it: the road narrows if the wave says
    // it does, and the renderer reads the same field, so the funnel drawn is the
    // funnel that acts.
    this.lane = definition.lane ?? null;
    this.surgeIndex = 0;
    this.holdRemaining = definition.kind === 'hold' ? definition.hold.seconds : 0;
    this.holdBeat = 0;
    this.ambushSprung = false;
    this.duelSpawned = false;
    if (definition.kind === 'duel') this.spawnDuel(definition);

    // Whatever the level was furnished with is already lying on it when the
    // player walks in, so the fight can start with the player deciding whether
    // it is worth crossing the ground to pick something useful up.
    for (const provision of definition.provisions ?? []) {
      this.spawnItem(provision.kind, provision.x, provision.z, {
        durability: provision.kind === 'club' || provision.kind === 'spear'
          ? ITEM_DURABILITY[provision.kind]
          : 0
      });
      this.emit({ type: 'item-drop', x: provision.x, z: provision.z, text: provision.kind });
    }

    // Only the marching kinds need a schedule up front. A flood and a stand are
    // driven by their own clocks, and a duel is already standing on the mat.
    if (definition.kind === 'press' || definition.kind === 'choke' || definition.kind === 'ambush' || definition.kind === 'boss') {
      this.scheduleMarch(definition.groups);
    }

    // The announcement carries what the wave is asking as well as its name: the
    // sim is the only layer that knows the campaign, so the banner the DOM shows
    // is the wave's own words rather than a second look-up of them.
    this.emit({ type: 'banner', text: definition.title, subtitle: definition.subtitle });
  }

  /**
   * The classic arrival pattern: group 0 opens the wave at the west end, and
   * each later group unlocks once the player's march reaches its zone (or the
   * field clears, so camping cannot stall the run). Ordering stays
   * deterministic.
   */
  private scheduleMarch(groups: readonly SpawnSpec[]): void {
    const scrollSpan = Math.max(1, this.road - CAMERA.width);
    let at = 0.45;
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex];
      if (!group) continue;
      const count = this.encounterCount(group);
      // A group may author where it lands. Even slices of the road are the
      // right default for a crowd that walks in behind the player's march, but
      // they put a wave's fight wherever the road's length happens to fall
      // rather than where the wave's idea is — measured on the gate, whose
      // whole roster arrived before the lane and left the funnel as decoration.
      const threshold = group.from !== undefined
        ? group.from
        : groupIndex === 0
          ? Number.NEGATIVE_INFINITY
          : this.bounds.minX + (groupIndex / groups.length) * scrollSpan;
      for (let iteration = 0; iteration < count; iteration += 1) {
        this.spawnQueue.push({
          at,
          archetype: group.archetype,
          interval: group.interval,
          threshold,
          ...(group.side ? { side: group.side } : {})
        });
        at += group.interval;
      }
      at += 0.3;
    }
  }

  /** Two-phone co-op answers extra bodies, never inflated health pools. */
  private encounterCount(group: SpawnSpec): number {
    if (this.playerCount !== 2 || group.archetype === 'grotesque') return group.count;
    return group.count + (group.archetype === 'thug' ? 2 : 1);
  }

  /**
   * Puts a beat of arrivals on the queue. A beat normally trickles at each
   * group's authored cadence; `together` fires the whole beat on one frame, for
   * the arrivals that are supposed to land as a single event.
   */
  private enqueueBeat(groups: readonly SpawnSpec[], at = this.spawnClock, together = false): void {
    let cursor = at;
    for (const group of groups) {
      const count = this.encounterCount(group);
      for (let iteration = 0; iteration < count; iteration += 1) {
        this.spawnQueue.push({
          at: together ? at : cursor,
          archetype: group.archetype,
          interval: together ? 0 : group.interval,
          threshold: Number.NEGATIVE_INFINITY
        });
        cursor += group.interval;
      }
    }
  }

  /**
   * Walks the journey on by one fight: the next wave of the place being fought
   * in, or — when that place's road has been walked to its end — the next place,
   * entered at its western end with its first fight beginning.
   *
   * This is the only thing that moves the campaign, so "is this the last wave of
   * the level or not" is asked in exactly one place instead of being derived
   * from a running count at every call site.
   */
  private advanceWave(): void {
    const waves = LEVELS[this.levelIndex]?.waves ?? [];
    if (this.waveInLevel + 1 < waves.length) {
      this.beginWave(this.waveInLevel + 1);
      return;
    }
    if (!LEVELS[this.levelIndex + 1]) {
      this.finishCampaign();
      return;
    }
    this.enterLevel(this.levelIndex + 1);
    this.beginWave(0);
  }

  /**
   * Enters a level: its road becomes the world, and the party is standing at the
   * near end of it, empty-handed of nothing but what they carry. Anything the
   * last place left lying on the ground stays there — a level's ground is its
   * own, and the only thing that crosses a doorway is the people and their
   * weapons, pips and lessons.
   */
  private enterLevel(levelIndex: number): void {
    const level = LEVELS[levelIndex];
    // The index always exists: the constructor opens the first place, and
    // `advanceWave` looks the next one up before it calls this.
    if (!level) return;
    this.levelIndex = levelIndex;
    this.road = level.road;
    this.bounds = roadBounds(this.road);
    this.cameraX = this.bounds.minX + CAMERA.margin;
    this.items.length = 0;

    for (const player of this.playerActors()) {
      const playerIndex = player.playerIndex ?? 0;
      player.x = this.bounds.minX + 150 - playerIndex * 64;
      player.facing = 1;
      this.enterNeutral(player);
      // Placed on a road they have not walked yet, facing the way it runs.
      this.clampActor(player);
    }
  }

  /** The last road has been walked: there is no next place to enter. */
  private finishCampaign(): void {
    this.phase = 'victory';
    this.waveTitle = 'The road goes quiet—for now.';
    this.emit({ type: 'victory', text: this.waveTitle });
  }

  /**
   * Off-screen ground on one side of the picture, or null when that side has no
   * road to arrive on.
   *
   * This is the whole spawn rule, in one place, and everything that brings a
   * fighter into the level goes through it: nothing is ever placed where the
   * player can watch it happen. An arrival walks in from just past the edge of
   * the screen, so by the time it is visible it is a body with an approach —
   * which the player can count, read and answer, the way Little Fighter 2 feeds
   * a stage.
   */
  private offscreenArrivalX(side: 'east' | 'west'): number | null {
    if (side === 'east') {
      const edge = this.cameraX + CAMERA.width;
      const x = Math.min(this.bounds.maxX - ROAD_EDGE_INSET, edge + SPAWN_APRON);
      return x >= edge + ARRIVAL_CLEARANCE ? x : null;
    }
    const edge = this.cameraX;
    const x = Math.max(this.bounds.minX + ROAD_EDGE_INSET, edge - SPAWN_APRON);
    return x <= edge - ARRIVAL_CLEARANCE ? x : null;
  }

  /**
   * The end of the road with the most ground between it and the party. Only
   * reached if a level ever authors a road narrower than the window — which
   * `MIN_LEVEL_ROAD` and `tests/level-structure.test.mjs` exist to prevent — and
   * it keeps the run going rather than stalling a wave that can never deliver.
   */
  private furthestRoadEnd(frontier: number): number {
    const west = this.bounds.minX + ROAD_EDGE_INSET;
    const east = this.bounds.maxX - ROAD_EDGE_INSET;
    return frontier - west > east - frontier ? west : east;
  }

  private spawnEnemy(
    archetype: Exclude<Archetype, 'meyer'>,
    arrival: { side?: 'west' | 'east'; z?: number } = {}
  ): Actor {
    const player = this.playerActors()[0];
    const frontier = player ? player.x : ARENA.minX + 300;
    // The authored flank yields to the road it actually has: a player standing
    // on a level's east end leaves no off-screen ground east of them, so that
    // group comes from behind instead. Measured in the flood, the alternative —
    // forcing the authored side — put a surge on top of a player with the wall
    // at their back, and that surge is what ended the run.
    let side: 'east' | 'west' = arrival.side ?? (this.nextActorId % 2 === 0 ? 'east' : 'west');
    let x = this.offscreenArrivalX(side);
    if (x === null) {
      side = side === 'east' ? 'west' : 'east';
      x = this.offscreenArrivalX(side);
    }
    if (x === null) x = this.furthestRoadEnd(frontier);
    // Spawn depth respects the road as it is at that x, so a fresh enemy is
    // never placed somewhere the funnel is about to shove him out of.
    const depth = laneDepthRange(x, this.lane);
    const z = arrival.z !== undefined
      ? clamp(arrival.z, depth.minZ + 24, depth.maxZ - 24)
      : archetype === 'grotesque'
        ? 432
        : this.rng.range(depth.minZ + 32, depth.maxZ - 28);
    const enemy = createEnemy(this.nextActorId++, archetype, x, z);
    enemy.facing = x >= frontier ? -1 : 1;
    this.actors.push(enemy);
    return enemy;
  }

  /**
   * Whether this wave has delivered everything it is going to. A flood wave is
   * spent when its last surge has landed, a stand when its clock runs out, an
   * ambush only once its trap has sprung — so the road can never open while the
   * encounter still owes the player something.
   */
  private encounterIsSpent(): boolean {
    if (this.spawnQueue.length > 0) return false;
    const definition = this.wave;
    if (!definition) return true;
    if (definition.kind === 'flood') return this.surgeIndex >= definition.surges.waves.length;
    if (definition.kind === 'hold') return this.holdRemaining <= 0;
    if (definition.kind === 'ambush') return this.ambushSprung;
    return true;
  }

  /**
   * A level ends at its eastern doorway, never on the last kill: once the last
   * of its waves is down the way out opens and stays open until every living
   * fighter has walked into it. Marching on is the player's decision, in the
   * order they choose — which is why the road is also where the loot is.
   *
   * Between the waves of one level there is no doorway at all. The road is the
   * same road and the player is standing on it, so the next wave's arrivals
   * simply walk in from off-screen and the fighting picks up where it stopped —
   * Little Fighter 2's stages, which are one place with several fights in them.
   */
  private checkWaveResolution(dt: number): void {
    if (this.waveResolved || !this.encounterIsSpent()) return;
    const enemiesAlive = this.enemyActors().some((actor) => actor.state !== 'dead');
    if (enemiesAlive) {
      // A group held back by the march can release into a lull: the road shuts
      // again and the level is not clear after all.
      this.clearTimer = 0;
      this.exitOpen = false;
      this.exitTimer = 0;
      return;
    }

    const definition = this.wave;
    if (!this.isLastWaveOfLevel()) {
      this.clearTimer += dt;
      if (this.clearTimer < WAVE_CLEAR_DELAY) return;
      this.clearTimer = 0;
      // A lesson can be learned in the middle of a level: the fighting stops,
      // the card is offered, and the road picks up where it left off.
      if (definition?.lessonAfter) {
        this.offerLesson();
        return;
      }
      this.advanceWave();
      return;
    }

    // The last wave of a place is the one that ends in a doorway: there is
    // nothing left to walk toward, so the road opens instead of handing off.
    if (!this.exitOpen) {
      this.clearTimer += dt;
      if (this.clearTimer < WAVE_CLEAR_DELAY) return;
      this.exitOpen = true;
      this.exitTimer = LEVEL_EXIT.grace;
      this.emit({ type: 'wave-clear', text: this.waveTitle });
      return;
    }

    this.exitTimer = Math.max(0, this.exitTimer - dt);
    if (this.exitTimer > 0) return;
    if (!this.partyIsAtExit()) return;
    this.resolveLevelExit();
  }

  /** Whether the fight in play is the last one the place holds. */
  private isLastWaveOfLevel(): boolean {
    const level = LEVELS[this.levelIndex];
    return !level || this.waveInLevel >= level.waves.length - 1;
  }

  /** Every living fighter has to reach the doorway for the level to end. */
  private partyIsAtExit(): boolean {
    const exitX = levelExitX(this.road);
    const living = this.playerActors().filter((actor) => actor.state !== 'dead');
    return living.length > 0 && living.every((actor) => actor.x >= exitX);
  }

  private resolveLevelExit(): void {
    this.waveResolved = true;
    this.exitOpen = false;
    this.exitTimer = 0;

    const definition = this.wave;
    if (definition?.kind === 'boss') {
      this.phase = 'victory';
      this.waveTitle = 'The castellan yields. A master’s name is spoken: ACHILLE MAROZZO.';
      this.emit({ type: 'victory', text: this.waveTitle });
      return;
    }

    if (definition?.lessonAfter) {
      this.offerLesson();
      return;
    }

    this.advanceWave();
  }

  /** The lesson card the end of a wave offers, and the run's queue of them. */
  private offerLesson(): void {
    this.phase = 'lesson';
    const offer = LESSON_OFFERS[Math.min(this.lessonOfferIndex, LESSON_OFFERS.length - 1)] ?? [];
    this.offeredLessons = [...offer].filter((id) => !this.lessons.has(id));
    this.lessonOfferIndex += 1;
    this.emit({ type: 'lesson-offer', lessons: [...this.offeredLessons] });
  }

  private checkDefeat(): void {
    if (this.playerActors().some((actor) => actor.state !== 'dead')) return;
    this.phase = 'defeat';
    this.waveTitle = 'The road takes another name.';
    this.emit({ type: 'defeat', text: this.waveTitle });
  }

  private cleanupActors(): void {
    for (let index = this.actors.length - 1; index >= 0; index -= 1) {
      const actor = this.actors[index];
      if (!actor || actor.team === 'players') continue;
      if (actor.state === 'dead' && actor.deathTimer >= 1.15) this.actors.splice(index, 1);
    }
  }

  private nearestLivingPlayer(actor: Actor): Actor | null {
    let best: Actor | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const player of this.playerActors()) {
      if (player.state === 'dead') continue;
      const distance = this.distanceSquared(actor, player);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = player;
      }
    }
    return best;
  }

  private playerActors(): Actor[] {
    return this.actors.filter((actor) => actor.team === 'players');
  }

  private enemyActors(): Actor[] {
    return this.actors.filter((actor) => actor.team === 'enemies');
  }

  private distanceSquared(left: Actor, right: Actor): number {
    const dx = right.x - left.x;
    const dz = right.z - left.z;
    return dx * dx + dz * dz;
  }

  private emit(event: GameEvent): void {
    this.events.push(event);
  }
}

/**
 * The backdrop the title screen renders: the world before the journey starts.
 *
 * It is built here, beside the snapshot the sim really publishes, because it *is*
 * a snapshot — with nothing in it but a place — and every field the snapshot
 * grows has to be answered here too. It used to be written out by the controller,
 * which made a second place to keep in step with the schema.
 */
export function titleSnapshot(): GameSnapshot {
  const level = LEVELS[0];
  return {
    version: GAME_SNAPSHOT_VERSION,
    tick: 0,
    time: 0,
    phase: 'title',
    levelIndex: 0,
    levelName: level?.name ?? '',
    scenery: level?.setting ?? null,
    waveInLevel: 0,
    wavesInLevel: level?.waves.length ?? 1,
    waveTitle: 'Meyer Crosses the Alps',
    waveLabel: '',
    lane: null,
    score: 0,
    bossPhase: 0,
    lessons: [],
    offeredLessons: [],
    actors: [],
    items: [],
    cameraX: 0,
    roadWidth: level?.road ?? ARENA.maxX - ARENA.minX,
    exitOpen: false,
    holdRemaining: 0
  };
}

export type Team = 'players' | 'enemies';
/**
 * Meyer's two fencing weapons and the improvised finds he can pick up off the
 * street. Finds have their own basic kits and break; the fencing weapons do
 * not, and they are the only ones that carry his learned routes.
 */
export type Weapon = 'longsword' | 'dussack' | 'club' | 'spear';
export type FencingWeapon = 'longsword' | 'dussack';
export type ImprovisedWeapon = 'club' | 'spear';
export type HitZone = 'head' | 'torso' | 'legs';
export const GAME_SNAPSHOT_VERSION = 9 as const;
export type ActorState =
  | 'idle'
  | 'move'
  | 'block'
  | 'attack'
  | 'dodge'
  | 'crouch'
  | 'jump'
  | 'switch'
  | 'hitstun'
  | 'guardbreak'
  | 'dead';

export type Archetype =
  | 'meyer'
  | 'thug'
  | 'spear'
  | 'captain'
  | 'wretch'
  | 'grotesque';

export type ActionName = 'light' | 'heavy' | 'mobility' | 'switch';
/**
 * Lessons are the run's combo unlocks: Meyer starts with only his basic cuts
 * and learns chained routes over the course of the journey. Each id unlocks a
 * specific set of attacks (see LESSON_ATTACKS in attacks.ts).
 */
export type LessonId =
  | 'ls-crossing'
  | 'ls-threefold'
  | 'ls-provoker'
  | 'ds-backhand'
  | 'ds-wheel'
  | 'switch-flourish';

export interface InputFrame {
  moveX: number;
  moveZ: number;
  lightPressed: boolean;
  heavyPressed: boolean;
  mobilityPressed: boolean;
  switchPressed: boolean;
  guardHeld: boolean;
  guardPressed: boolean;
}

export const NEUTRAL_INPUT: Readonly<InputFrame> = Object.freeze({
  moveX: 0,
  moveZ: 0,
  lightPressed: false,
  heavyPressed: false,
  mobilityPressed: false,
  switchPressed: false,
  guardHeld: false,
  guardPressed: false
});

export interface AttackDefinition {
  id: string;
  label: string;
  owner: 'player' | Archetype;
  weapon?: Weapon;
  /**
   * The swing is a throw, not a strike: it resolves no melee hitbox and lets go
   * of the carried weapon `releaseAt` seconds into the move.
   */
  throw?: boolean;
  /** Seconds from the start of the move to the moment the weapon leaves the hand. */
  releaseAt?: number;
  hitZone: HitZone;
  /** Keeps the attacker below head-height for the full move. */
  crouchedPosture?: boolean;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  guardDamage: number;
  reach: number;
  depth: number;
  minForward: number;
  knockback: number;
  hitstun: number;
  hitStop: number;
  movement: number;
  maxTargets: number;
  arc: 'front' | 'radial';
  heavy?: boolean;
  provoke?: boolean;
  /**
   * Authored clip this row plays when its archetype has no dedicated art for
   * it. Timing always comes from this row; the alias only decides which poses
   * are drawn, so a new tempo costs no new sprites.
   */
  animation?: string;
  /**
   * Beat the AI throws the moment this one resolves with the target still in
   * front of it. This is how an archetype gets a rhythm of its own instead of
   * one swing per decision.
   */
  aiChain?: string;
  deflectStart?: number;
  deflectEnd?: number;
  signature?: string;
  nextLight?: string;
  nextHeavy?: string;
  nextSwitch?: string;
  parryable?: boolean;
  shockwave?: boolean;
}

export interface AttackRuntime {
  id: string;
  elapsed: number;
  targetId: number | null;
  hitIds: Set<number>;
  hitConfirmed: boolean;
  blocked: boolean;
  queuedAction: ActionName | null;
  activeCuePlayed: boolean;
  signatureShown: boolean;
  /** A throw only lets go of its weapon once. */
  released: boolean;
}

/** Anything lying on the floor: a dropped or thrown weapon, or a potion. */
export type ItemKind = Weapon | 'potion';

export interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  z: number;
  /** Height above the floor. Positive while a drop or a throw is in flight. */
  y: number;
  vx: number;
  vy: number;
  vz: number;
  /** Hits a carried find has left before it breaks; 0 for potions. */
  durability: number;
  /** Thrower's id, or null for a drop. Only thrown items deal damage. */
  thrownBy: number | null;
  /** Targets this flight has already bitten; a hurled weapon hits once each. */
  hitIds: Set<number>;
  /** Seconds since this item first existed, used for the fade-out. */
  age: number;
}

export interface ItemSnapshot {
  id: number;
  kind: ItemKind;
  x: number;
  z: number;
  y: number;
  durability: number;
  thrown: boolean;
  age: number;
}

export interface Actor {
  id: number;
  team: Team;
  archetype: Archetype;
  name: string;
  playerIndex: number | null;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: -1 | 1;
  radius: number;
  speedX: number;
  speedZ: number;
  health: number;
  maxHealth: number;
  guard: number;
  maxGuard: number;
  guardRegenDelay: number;
  armor: number;
  maxArmor: number;
  state: ActorState;
  stateElapsed: number;
  stateDuration: number;
  stateMoveX: number;
  stateMoveZ: number;
  invulnerable: number;
  parryWindow: number;
  openingTimer: number;
  provokeTimer: number;
  counterWindow: number;
  attack: AttackRuntime | null;
  weapon: Weapon;
  desiredWeapon: Weapon;
  /** The fencing weapon Meyer keeps on his back while carrying a find. */
  stowedWeapon: FencingWeapon;
  /** Hits a carried find has left before it breaks; 0 while none is carried. */
  durability: number;
  lastInput: InputFrame;
  aiCooldown: number;
  aiThink: number;
  aiStrafeSign: -1 | 1;
  attackPermission: boolean;
  /** Thug pair beat: seconds until this mate's queued swing (0 = none). */
  pairBeatTimer: number;
  /** Armoured actor: seconds its answer stays armed after shrugging a light. */
  answerTimer: number;
  /** Armoured actor: lockout between answers, so poking it is bounded. */
  answerCooldown: number;
  /**
   * Seconds this fighter is waiting to get its hands on the player. The attack
   * permission budget hands slots to the nearest enemies, which quietly buries
   * a group that arrives behind the player behind the group in front of them;
   * an ambush marks its arrivals urgent so the trap commits when it springs.
   */
  urgency: number;
  deathTimer: number;
  flashTimer: number;
  comboCount: number;
  /**
   * Hits this actor has already landed in the current chain. Drives hitstun
   * decay, so a string always starves itself instead of looping forever.
   */
  comboHits: number;
  /** Seconds since this actor last landed a hit; a long lull ends the chain. */
  comboLull: number;
  reactionZone: HitZone | null;
  scoreValue: number;
}

export type GamePhase =
  | 'title'
  | 'countdown'
  | 'wave'
  | 'lesson'
  | 'victory'
  | 'defeat';

export interface ActorSnapshot {
  id: number;
  team: Team;
  archetype: Archetype;
  name: string;
  playerIndex: number | null;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: -1 | 1;
  radius: number;
  health: number;
  maxHealth: number;
  guard: number;
  maxGuard: number;
  armor: number;
  maxArmor: number;
  state: ActorState;
  stateElapsed: number;
  stateDuration: number;
  stateMoveX: number;
  stateMoveZ: number;
  weapon: Weapon;
  desiredWeapon: Weapon;
  stowedWeapon: FencingWeapon;
  durability: number;
  attackId: string | null;
  attackElapsed: number;
  reactionZone: HitZone | null;
  invulnerable: number;
  openingTimer: number;
  provokeTimer: number;
  counterWindow: number;
  flashTimer: number;
  comboCount: number;
  deathTimer: number;
}

/**
 * The dressing a place wears; the renderer keys its background art on this.
 */
export type SceneryId = 'cobbled-streets' | 'town-gate' | 'sala-darmi' | 'castello';

/**
 * A narrowing of the road: inside its x range the walkable depth shrinks to
 * `minZ..maxZ`, and the approach on either side funnels into it. Authored per
 * wave in the campaign data, and carried in the snapshot as the road's shape for
 * the fight in progress.
 */
export interface Lane {
  /** Road x range of the narrow section. */
  from: number;
  /** Depth band inside the narrow section, in arena z coordinates. */
  maxZ: number;
  minZ: number;
  /** How far out the road funnels — the ramp either side of the narrow part. */
  approach: number;
  to: number;
}

/**
 * One frame of the world, complete enough to draw. Everything the presentation
 * layers need is here — where the journey is, what the fight is, the shape of
 * the road it is fought on, and every actor and item on it — so nothing outside
 * the sim ever has to read the campaign tables.
 */
export interface GameSnapshot {
  version: typeof GAME_SNAPSHOT_VERSION;
  tick: number;
  time: number;
  phase: GamePhase;
  /** The place the journey is standing in; see `LEVELS`. */
  levelIndex: number;
  levelName: string;
  /** The dressing that place wears, or null before a place exists. */
  scenery: SceneryId | null;
  /** Which wave of its own place this is, and how many that place holds. */
  waveInLevel: number;
  wavesInLevel: number;
  waveTitle: string;
  /** How the encounter names itself where a clock has to be stated. */
  waveLabel: string;
  /** The narrowing in force in this fight, if the wave authored one. */
  lane: Lane | null;
  score: number;
  bossPhase: number;
  lessons: LessonId[];
  offeredLessons: LessonId[];
  actors: ActorSnapshot[];
  /** Everything currently lying on the floor. */
  items: ItemSnapshot[];
  /** Left edge of the camera window in world coordinates. */
  cameraX: number;
  /** World width of the road being walked. */
  roadWidth: number;
  /**
   * True once a level's last wave is down and its eastern doorway is open. A
   * level ends by walking out of it, so the renderer and HUD both need to know
   * the road is open before it closes behind the player.
   */
  exitOpen: boolean;
  /**
   * Seconds left to outlast in a hold wave, zero for every other kind. The
   * objective is a clock rather than a body count, so the HUD has to read it.
   */
  holdRemaining: number;
}

export type GameEventType =
  | 'banner'
  | 'attack'
  | 'hit'
  | 'heavy-hit'
  | 'blocked'
  | 'parry'
  | 'interception'
  | 'guardbreak'
  | 'death'
  | 'signature'
  | 'weapon-switch'
  | 'weapon-break'
  | 'item-drop'
  | 'item-pickup'
  | 'item-heal'
  | 'item-throw'
  | 'wave-clear'
  | 'ambush'
  | 'surge'
  | 'hold-over'
  | 'lesson-offer'
  | 'lesson-chosen'
  | 'boss-phase'
  | 'victory'
  | 'defeat';

export interface GameEvent {
  type: GameEventType;
  actorId?: number;
  targetId?: number;
  x?: number;
  z?: number;
  amount?: number;
  text?: string;
  /** Second line for a banner the world raises itself (an ambush, a phase). */
  subtitle?: string;
  attackId?: string;
  hitZone?: HitZone;
  /** True when the struck or blocking target was below normal head-height at contact. */
  targetCrouched?: boolean;
  impact?: 'flesh' | 'armor';
  lessons?: LessonId[];
}

export interface WorldOptions {
  playerCount: 1 | 2;
  seed?: number;
  skipCountdown?: boolean;
}

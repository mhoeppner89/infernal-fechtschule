export type Team = 'players' | 'enemies';
export type Weapon = 'longsword' | 'dussack';
export type HitZone = 'head' | 'torso' | 'legs';
export const GAME_SNAPSHOT_VERSION = 4 as const;
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
  lastInput: InputFrame;
  aiCooldown: number;
  aiThink: number;
  aiStrafeSign: -1 | 1;
  attackPermission: boolean;
  deathTimer: number;
  flashTimer: number;
  comboCount: number;
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

export interface GameSnapshot {
  version: typeof GAME_SNAPSHOT_VERSION;
  tick: number;
  time: number;
  phase: GamePhase;
  waveIndex: number;
  waveTitle: string;
  score: number;
  bossPhase: number;
  lessons: LessonId[];
  offeredLessons: LessonId[];
  actors: ActorSnapshot[];
  /** Left edge of the camera window in world coordinates. */
  cameraX: number;
  /** Full world width of the current wave's stage. */
  stageWidth: number;
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
  | 'wave-clear'
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

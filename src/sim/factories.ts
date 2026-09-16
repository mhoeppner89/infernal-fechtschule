import type { Actor, Archetype, FencingWeapon, InputFrame, Team, Weapon } from './types.js';
import { NEUTRAL_INPUT } from './types.js';

function cloneInput(input: Readonly<InputFrame>): InputFrame {
  return { ...input };
}

export function createPlayer(id: number, playerIndex: number, x: number, z: number): Actor {
  return createActor({
    id,
    team: 'players',
    archetype: 'meyer',
    name: playerIndex === 0 ? 'Joachim Meyer' : 'Meyer — Fellow Traveller',
    playerIndex,
    x,
    z,
    radius: 25,
    speedX: 220,
    speedZ: 166,
    health: 110,
    guard: 72,
    armor: 0,
    weapon: 'longsword',
    stowedWeapon: 'longsword',
    scoreValue: 0
  });
}

export function createEnemy(
  id: number,
  archetype: Exclude<Archetype, 'meyer'>,
  x: number,
  z: number
): Actor {
  const configs: Record<Exclude<Archetype, 'meyer'>, {
    name: string;
    radius: number;
    speedX: number;
    speedZ: number;
    health: number;
    guard: number;
    armor: number;
    scoreValue: number;
  }> = {
    thug: { name: 'Club Thug', radius: 23, speedX: 128, speedZ: 94, health: 28, guard: 0, armor: 0, scoreValue: 80 },
    spear: { name: 'Spear Soldier', radius: 24, speedX: 112, speedZ: 88, health: 38, guard: 12, armor: 0, scoreValue: 140 },
    captain: { name: 'Armoured Captain', radius: 28, speedX: 88, speedZ: 70, health: 92, guard: 64, armor: 58, scoreValue: 420 },
    wretch: { name: 'Bound Wretch', radius: 21, speedX: 150, speedZ: 112, health: 20, guard: 0, armor: 0, scoreValue: 60 },
    grotesque: { name: 'The Bound Grotesque', radius: 54, speedX: 92, speedZ: 76, health: 420, guard: 72, armor: 0, scoreValue: 2400 }
  };
  const config = configs[archetype];
  return createActor({
    id,
    team: 'enemies',
    archetype,
    name: config.name,
    playerIndex: null,
    x,
    z,
    radius: config.radius,
    speedX: config.speedX,
    speedZ: config.speedZ,
    health: config.health,
    guard: config.guard,
    armor: config.armor,
    weapon: 'longsword',
    // Enemies do not fence: their snapshot weapon is presentation only, and the
    // thing that actually drops is declared in the world's drop table.
    stowedWeapon: 'longsword',
    scoreValue: config.scoreValue
  });
}

interface ActorConfig {
  id: number;
  team: Team;
  archetype: Archetype;
  name: string;
  playerIndex: number | null;
  x: number;
  z: number;
  radius: number;
  speedX: number;
  speedZ: number;
  health: number;
  guard: number;
  armor: number;
  weapon: Weapon;
  stowedWeapon: FencingWeapon;
  scoreValue: number;
}

function createActor(config: ActorConfig): Actor {
  return {
    id: config.id,
    team: config.team,
    archetype: config.archetype,
    name: config.name,
    playerIndex: config.playerIndex,
    x: config.x,
    z: config.z,
    vx: 0,
    vz: 0,
    facing: config.team === 'players' ? 1 : -1,
    radius: config.radius,
    speedX: config.speedX,
    speedZ: config.speedZ,
    health: config.health,
    maxHealth: config.health,
    guard: config.guard,
    maxGuard: config.guard,
    guardRegenDelay: 0,
    armor: config.armor,
    maxArmor: config.armor,
    state: 'idle',
    stateElapsed: 0,
    stateDuration: 0,
    stateMoveX: 0,
    stateMoveZ: 0,
    invulnerable: 0,
    parryWindow: 0,
    openingTimer: 0,
    provokeTimer: 0,
    counterWindow: 0,
    attack: null,
    weapon: config.weapon,
    desiredWeapon: config.weapon,
    stowedWeapon: config.stowedWeapon,
    durability: 0,
    lastInput: cloneInput(NEUTRAL_INPUT),
    aiCooldown: 0,
    aiThink: 0,
    aiStrafeSign: idParity(config.id),
    attackPermission: config.archetype === 'grotesque',
    pairBeatTimer: 0,
    answerTimer: 0,
    answerCooldown: 0,
    urgency: 0,
    deathTimer: 0,
    flashTimer: 0,
    comboCount: 0,
    comboHits: 0,
    comboLull: 0,
    reactionZone: null,
    scoreValue: config.scoreValue
  };
}

const idParity = (id: number): -1 | 1 => (id % 2 === 0 ? -1 : 1);

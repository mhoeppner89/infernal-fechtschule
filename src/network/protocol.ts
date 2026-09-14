import { GAME_SNAPSHOT_VERSION } from '../sim/types.js';
import type { ActorSnapshot, GameSnapshot, InputFrame, UpgradeId } from '../sim/types.js';

export const PEER_PROTOCOL_VERSION = 2 as const;

export type PeerMessage =
  | { type: 'hello'; protocol: typeof PEER_PROTOCOL_VERSION }
  | { type: 'start'; seed: number }
  | { type: 'input'; seq: number; frame: InputFrame }
  | { type: 'snapshot'; snapshot: GameSnapshot }
  | { type: 'upgrade'; id: UpgradeId }
  | { type: 'restart' }
  | { type: 'pause'; paused: boolean }
  | { type: 'ping'; sentAt: number }
  | { type: 'pong'; sentAt: number };

const PHASES = new Set(['title', 'countdown', 'wave', 'upgrade', 'victory', 'defeat']);
const TEAMS = new Set(['players', 'enemies']);
const ARCHETYPES = new Set(['meyer', 'thug', 'spear', 'captain', 'wretch', 'grotesque']);
const STATES = new Set(['idle', 'move', 'block', 'attack', 'dodge', 'crouch', 'jump', 'switch', 'hitstun', 'guardbreak', 'dead']);
const HIT_ZONES = new Set(['head', 'torso', 'legs']);
const WEAPONS = new Set(['longsword', 'dussack']);
const UPGRADES = new Set<UpgradeId>([
  'longsword-sweep',
  'longsword-control',
  'dussack-circle',
  'dussack-passing-step',
  'quick-change',
  'second-intention'
]);

export function isPeerMessage(value: unknown): value is PeerMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'hello':
      return value.protocol === PEER_PROTOCOL_VERSION;
    case 'start':
      return isIntegerInRange(value.seed, 0, 0x7fffffff);
    case 'input':
      return isIntegerInRange(value.seq, 0, Number.MAX_SAFE_INTEGER) && isInputFrame(value.frame);
    case 'snapshot':
      return isSnapshot(value.snapshot);
    case 'upgrade':
      return typeof value.id === 'string' && UPGRADES.has(value.id as UpgradeId);
    case 'restart':
      return true;
    case 'pause':
      return typeof value.paused === 'boolean';
    case 'ping':
    case 'pong':
      return isFiniteNumber(value.sentAt) && value.sentAt >= 0;
    default:
      return false;
  }
}

function isInputFrame(value: unknown): value is InputFrame {
  if (!isRecord(value)) return false;
  return isAxis(value.moveX) && isAxis(value.moveZ) &&
    typeof value.lightPressed === 'boolean' &&
    typeof value.heavyPressed === 'boolean' &&
    typeof value.mobilityPressed === 'boolean' &&
    typeof value.switchPressed === 'boolean' &&
    typeof value.guardHeld === 'boolean' &&
    typeof value.guardPressed === 'boolean';
}

function isSnapshot(value: unknown): value is GameSnapshot {
  if (!isRecord(value)) return false;
  if (value.version !== GAME_SNAPSHOT_VERSION || !isIntegerInRange(value.tick, 0, Number.MAX_SAFE_INTEGER)) return false;
  if (!isFiniteNumber(value.time) || value.time < 0) return false;
  if (typeof value.phase !== 'string' || !PHASES.has(value.phase)) return false;
  if (!isIntegerInRange(value.waveIndex, -1, 64) || typeof value.waveTitle !== 'string' || value.waveTitle.length > 160) return false;
  if (!isFiniteNumber(value.score) || !isIntegerInRange(value.bossPhase, 0, 16)) return false;
  if (!isUpgradeArray(value.upgrades) || !isUpgradeArray(value.offeredUpgrades)) return false;
  if (!Array.isArray(value.actors) || value.actors.length > 128) return false;
  return value.actors.every(isActorSnapshot);
}

function isActorSnapshot(value: unknown): value is ActorSnapshot {
  if (!isRecord(value)) return false;
  return isIntegerInRange(value.id, 0, Number.MAX_SAFE_INTEGER) &&
    typeof value.team === 'string' && TEAMS.has(value.team) &&
    typeof value.archetype === 'string' && ARCHETYPES.has(value.archetype) &&
    typeof value.name === 'string' && value.name.length <= 96 &&
    (value.playerIndex === null || isIntegerInRange(value.playerIndex, 0, 3)) &&
    isFiniteNumber(value.x) && isFiniteNumber(value.z) &&
    isFiniteNumber(value.vx) && isFiniteNumber(value.vz) &&
    (value.facing === -1 || value.facing === 1) &&
    isFiniteNumber(value.radius) && value.radius >= 0 && value.radius <= 256 &&
    isFiniteNumber(value.health) && isFiniteNumber(value.maxHealth) && value.maxHealth >= 0 &&
    isFiniteNumber(value.guard) && isFiniteNumber(value.maxGuard) && value.maxGuard >= 0 &&
    isFiniteNumber(value.armor) && isFiniteNumber(value.maxArmor) && value.maxArmor >= 0 &&
    typeof value.state === 'string' && STATES.has(value.state) &&
    isFiniteNumber(value.stateElapsed) && isFiniteNumber(value.stateDuration) &&
    isAxis(value.stateMoveX) && isAxis(value.stateMoveZ) &&
    typeof value.weapon === 'string' && WEAPONS.has(value.weapon) &&
    typeof value.desiredWeapon === 'string' && WEAPONS.has(value.desiredWeapon) &&
    (value.attackId === null || (typeof value.attackId === 'string' && value.attackId.length <= 64)) &&
    isFiniteNumber(value.attackElapsed) &&
    isFiniteNumber(value.invulnerable) && isFiniteNumber(value.openingTimer) &&
    isFiniteNumber(value.provokeTimer) && isFiniteNumber(value.counterWindow) &&
    isFiniteNumber(value.flashTimer) && isIntegerInRange(value.comboCount, 0, 9999) &&
    (value.reactionZone === null || (typeof value.reactionZone === 'string' && HIT_ZONES.has(value.reactionZone))) &&
    isFiniteNumber(value.deathTimer) && value.deathTimer >= 0;
}

function isUpgradeArray(value: unknown): value is UpgradeId[] {
  return Array.isArray(value) && value.length <= UPGRADES.size && value.every((id) => typeof id === 'string' && UPGRADES.has(id as UpgradeId));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function isAxis(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -1.25 && value <= 1.25;
}

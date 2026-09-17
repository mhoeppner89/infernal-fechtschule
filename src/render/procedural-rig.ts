import { ATTACKS, attackDuration } from '../sim/attacks.js';
import type {
  ActorSnapshot,
  Archetype,
  AttackDefinition,
  HitZone,
  Weapon
} from '../sim/types.js';

export interface RigPoint {
  readonly x: number;
  readonly y: number;
}

export interface TwoBoneIK {
  readonly root: RigPoint;
  readonly elbow: RigPoint;
  readonly end: RigPoint;
  readonly upperLength: number;
  readonly lowerLength: number;
}

export type AttackVisualPhase = 'idle' | 'anticipation' | 'contact' | 'recovery';
export type AttackVisualStyle =
  | 'diagonal'
  | 'cross'
  | 'overhead'
  | 'rising'
  | 'thrust'
  | 'sweep'
  | 'flourish';

export interface AttackMotion {
  readonly definition: AttackDefinition | null;
  readonly progress: number;
  readonly phase: AttackVisualPhase;
  readonly style: AttackVisualStyle;
  readonly active: boolean;
  readonly angle: number;
  readonly arc: number;
  readonly lunge: number;
  readonly lift: number;
  readonly recoil: number;
  readonly speed: number;
}

export interface BladeGeometry {
  readonly base: RigPoint;
  readonly tip: RigPoint;
  readonly length: number;
  readonly angle: number;
  readonly gripLength: number;
}

export interface ProceduralPose {
  readonly scale: number;
  readonly bodyHeight: number;
  readonly jump: number;
  readonly crouch: number;
  readonly bodyRotation: number;
  readonly hip: RigPoint;
  readonly chest: RigPoint;
  readonly neck: RigPoint;
  readonly head: RigPoint;
  readonly headRadius: number;
  readonly frontShoulder: RigPoint;
  readonly rearShoulder: RigPoint;
  readonly frontHip: RigPoint;
  readonly rearHip: RigPoint;
  readonly frontKnee: RigPoint;
  readonly rearKnee: RigPoint;
  readonly frontFoot: RigPoint;
  readonly rearFoot: RigPoint;
  readonly frontElbow: RigPoint;
  readonly rearElbow: RigPoint;
  readonly frontHand: RigPoint;
  readonly rearHand: RigPoint;
  readonly supportHand: RigPoint;
  readonly frontArm: TwoBoneIK;
  readonly rearArm: TwoBoneIK;
  readonly attack: AttackMotion;
  readonly blade: BladeGeometry;
  readonly bladeTrail: readonly RigPoint[];
  readonly weapon: Weapon;
  readonly twoHanded: boolean;
  readonly fallen: number;
  readonly stride: number;
}

const TAU = Math.PI * 2;
const EPSILON = 0.0001;

const BODY_HEIGHT: Readonly<Record<Archetype, number>> = Object.freeze({
  meyer: 176,
  thug: 166,
  spear: 178,
  captain: 186,
  wretch: 148,
  grotesque: 232
});

const HEAD_RADIUS: Readonly<Record<Archetype, number>> = Object.freeze({
  meyer: 16,
  thug: 15,
  spear: 15,
  captain: 17,
  wretch: 17,
  grotesque: 28
});

const WEAPON_BLADE_LENGTH: Readonly<Record<Weapon, number>> = Object.freeze({
  longsword: 104,
  dussack: 78,
  club: 58,
  spear: 132
});

const WEAPON_GRIP_LENGTH: Readonly<Record<Weapon, number>> = Object.freeze({
  longsword: 19,
  dussack: 9,
  club: 8,
  spear: 25
});

export function point(x: number, y: number): RigPoint {
  return { x: finiteOr(x, 0), y: finiteOr(y, 0) };
}

export function addPoint(left: RigPoint, right: RigPoint): RigPoint {
  return point(left.x + right.x, left.y + right.y);
}

export function subtractPoint(left: RigPoint, right: RigPoint): RigPoint {
  return point(left.x - right.x, left.y - right.y);
}

export function scalePoint(value: RigPoint, scale: number): RigPoint {
  return point(value.x * finiteOr(scale, 0), value.y * finiteOr(scale, 0));
}

export function distance(left: RigPoint, right: RigPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function lerpPoint(left: RigPoint, right: RigPoint, amount: number): RigPoint {
  const t = clamp01(amount);
  return point(left.x + (right.x - left.x) * t, left.y + (right.y - left.y) * t);
}

export function rotatePoint(value: RigPoint, angle: number): RigPoint {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return point(value.x * c - value.y * s, value.x * s + value.y * c);
}

/**
 * Solve a two-bone chain without an iterative step. The end point is kept at
 * the requested location when it is reachable and otherwise clamped to the
 * nearest point on the annulus. This is shared by arms and legs so every hand
 * is visibly attached to a hilt and every foot can plant on the road.
 */
export function solveTwoBoneIK(
  root: RigPoint,
  target: RigPoint,
  upperLength: number,
  lowerLength: number,
  bendDirection = 1
): TwoBoneIK {
  const upper = Math.max(EPSILON, finiteOr(upperLength, 1));
  const lower = Math.max(EPSILON, finiteOr(lowerLength, 1));
  const dx = finiteOr(target.x - root.x, 0);
  const dy = finiteOr(target.y - root.y, 0);
  const rawDistance = Math.hypot(dx, dy);
  const minimum = Math.max(EPSILON, Math.abs(upper - lower) + EPSILON);
  const maximum = Math.max(minimum, upper + lower - EPSILON);
  const clampedDistance = clamp(rawDistance || minimum, minimum, maximum);
  const direction = rawDistance > EPSILON ? Math.atan2(dy, dx) : 0;
  const cosine = clamp(
    (upper * upper + clampedDistance * clampedDistance - lower * lower)
      / (2 * upper * clampedDistance),
    -1,
    1
  );
  const bend = direction + Math.acos(cosine) * (bendDirection < 0 ? -1 : 1);
  const elbow = point(
    root.x + Math.cos(bend) * upper,
    root.y + Math.sin(bend) * upper
  );
  const end = point(
    root.x + Math.cos(direction) * clampedDistance,
    root.y + Math.sin(direction) * clampedDistance
  );
  return { root: point(root.x, root.y), elbow, end, upperLength: upper, lowerLength: lower };
}

export function bladeLengthFor(weapon: Weapon): number {
  return WEAPON_BLADE_LENGTH[weapon];
}

export function gripLengthFor(weapon: Weapon): number {
  return WEAPON_GRIP_LENGTH[weapon];
}

export function actorBodyHeight(archetype: Archetype): number {
  return BODY_HEIGHT[archetype];
}

export function actorHeadRadius(archetype: Archetype): number {
  return HEAD_RADIUS[archetype];
}

export function clamp01(value: number): number {
  return clamp(finiteOr(value, 0), 0, 1);
}

export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function unit(angle: number): RigPoint {
  return point(Math.cos(angle), Math.sin(angle));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function attackStyle(actor: ActorSnapshot, definition: AttackDefinition | null): AttackVisualStyle {
  const id = actor.attackId ?? '';
  const weapon = definition?.weapon ?? actor.weapon;
  if (weapon === 'spear' || id.includes('thrust') || id.includes('brace')) return 'thrust';
  if (id.includes('sweep') || id.includes('shock') || id.includes('leap')) return 'sweep';
  if (id.includes('overhead') || id.includes('_h') || id.includes('captain_cut') || id.includes('bash')) {
    return 'overhead';
  }
  if (id.includes('counter') || id.includes('l3') || id.includes('wheel') || id.includes('circular')) {
    return 'flourish';
  }
  if (id.includes('l2') || id.includes('backhand') || id.includes('follow')) return 'cross';
  if (id.includes('low')) return 'rising';
  return hashString(id || actor.archetype) > 0.52 ? 'diagonal' : 'cross';
}

function attackAngle(style: AttackVisualStyle, progress: number, facing: number): number {
  const p = clamp01(progress);
  const windup = smoothstep(0, 0.34, p);
  const follow = smoothstep(0.6, 1, p);
  switch (style) {
    case 'thrust': return -0.08 + Math.sin(p * Math.PI) * 0.035;
    case 'overhead': return -1.85 + windup * 1.45 + follow * 1.1;
    case 'rising': return 1.08 - windup * 2.35 + follow * 0.42;
    case 'sweep': return -2.45 + windup * 4.15;
    case 'cross': return -1.12 + windup * 2.55 + follow * 0.12;
    case 'flourish': return -2.2 + Math.sin(p * Math.PI * 1.2) * 3.4;
    case 'diagonal':
    default: return (-1.62 + windup * 2.65 + follow * 0.15) * (facing < 0 ? 1 : 1);
  }
}

function smoothstep(start: number, end: number, value: number): number {
  const t = clamp01((value - start) / Math.max(EPSILON, end - start));
  return t * t * (3 - 2 * t);
}

export function attackMotionFor(actor: ActorSnapshot): AttackMotion {
  const definition = actor.attackId ? ATTACKS[actor.attackId] ?? null : null;
  const total = definition
    ? Math.max(EPSILON, attackDuration(definition))
    : Math.max(0.7, finiteOr(actor.stateDuration, 0.7));
  const progress = actor.state === 'attack'
    ? clamp01(finiteOr(actor.attackElapsed, 0) / total)
    : 0;
  const startup = definition?.startup ?? total * 0.32;
  const activeEnd = startup + (definition?.active ?? total * 0.16);
  const phase: AttackVisualPhase = actor.state !== 'attack'
    ? 'idle'
    : finiteOr(actor.attackElapsed, 0) < startup
      ? 'anticipation'
      : finiteOr(actor.attackElapsed, 0) < activeEnd
        ? 'contact'
        : 'recovery';
  const style = attackStyle(actor, definition);
  const angle = attackAngle(style, progress, actor.facing);
  const speed = definition
    ? Math.max(0.1, definition.reach / Math.max(EPSILON, total))
    : 95;
  const active = phase === 'contact';
  const lunge = definition
    ? (active ? definition.movement * 0.64 : progress > 0.65 ? definition.movement * 0.38 : 0)
    : 0;
  const lift = style === 'overhead' ? Math.sin(progress * Math.PI) * 8 : style === 'sweep' ? 5 : 0;
  const recoil = phase === 'recovery' ? smoothstep(0.6, 1, progress) : 0;
  const arc = style === 'thrust' ? 0.04
    : style === 'sweep' ? 0.55
      : style === 'flourish' ? 0.7
        : 0.4;
  return {
    definition,
    progress,
    phase,
    style,
    active,
    angle,
    arc,
    lunge,
    lift,
    recoil,
    speed
  };
}

function crouchAmount(actor: ActorSnapshot, attack: AttackMotion): number {
  if (actor.state === 'crouch') return 0.94;
  if (attack.definition?.crouchedPosture) return 0.82;
  if (actor.state === 'block') return 0.12;
  if (actor.state === 'dodge') return 0.56;
  if (attack.style === 'rising') return 0.6;
  return 0;
}

function motionStride(actor: ActorSnapshot, attack: AttackMotion, time: number): number {
  if (actor.state === 'move') return Math.sin(finiteOr(actor.stateElapsed, 0) * 10.5 + actor.id * 0.27);
  if (actor.state === 'dodge') return Math.sin(clamp01(actor.stateElapsed / Math.max(EPSILON, actor.stateDuration)) * Math.PI);
  if (actor.state === 'attack') return attack.phase === 'contact' ? 0.72 : attack.recoil * -0.26;
  return Math.sin(time * 2.05 + actor.id * 0.31) * 0.08;
}

function weaponAngle(actor: ActorSnapshot, attack: AttackMotion): number {
  if (actor.state === 'block') return -1.2;
  if (actor.state === 'switch') {
    const progress = clamp01(actor.stateElapsed / Math.max(EPSILON, actor.stateDuration));
    return -1.45 + progress * 2.35;
  }
  if (actor.state === 'attack') return attack.angle;
  if (actor.weapon === 'spear') return -0.05;
  if (actor.weapon === 'club') return -0.35;
  return -0.42;
}

function bladeFromGrip(
  grip: RigPoint,
  weapon: Weapon,
  angle: number,
  bladeLength = bladeLengthFor(weapon)
): BladeGeometry {
  const safeLength = Math.max(1, finiteOr(bladeLength, bladeLengthFor(weapon)));
  const direction = unit(angle);
  const tip = point(grip.x + direction.x * safeLength, grip.y + direction.y * safeLength);
  return {
    base: point(grip.x, grip.y),
    tip,
    length: safeLength,
    angle,
    gripLength: gripLengthFor(weapon)
  };
}

function bladeTrailFor(
  blade: BladeGeometry,
  attack: AttackMotion,
  actor: ActorSnapshot
): readonly RigPoint[] {
  if (actor.state !== 'attack' || attack.phase === 'anticipation' || attack.style === 'thrust') return [];
  const points: RigPoint[] = [];
  const count = attack.phase === 'contact' ? 5 : 3;
  for (let index = count; index >= 0; index -= 1) {
    const amount = index / Math.max(1, count);
    const offsetAngle = blade.angle - attack.arc * (amount - 0.5) * (attack.phase === 'contact' ? 2.1 : 1.3);
    const direction = unit(offsetAngle);
    const length = blade.length * (0.76 + (1 - amount) * 0.24);
    points.push(point(
      blade.base.x + direction.x * length,
      blade.base.y + direction.y * length
    ));
  }
  return points;
}

function jumpAmount(actor: ActorSnapshot, attack: AttackMotion): number {
  if (actor.state === 'jump') {
    const progress = clamp01(actor.stateElapsed / Math.max(EPSILON, actor.stateDuration));
    return Math.sin(progress * Math.PI) * 66;
  }
  if (actor.attackId?.includes('_air_')) return Math.sin(attack.progress * Math.PI) * 54;
  if (attack.style === 'sweep' && actor.attackId?.includes('leap')) return Math.sin(attack.progress * Math.PI) * 30;
  return 0;
}

function bodyRotationFor(actor: ActorSnapshot, attack: AttackMotion): number {
  if (actor.state === 'dead') {
    return -0.04 + clamp01(actor.stateElapsed / Math.max(EPSILON, actor.stateDuration)) * 1.18;
  }
  if (actor.state === 'hitstun') return actor.reactionZone === 'legs' ? -0.18 : -0.3;
  if (actor.state === 'guardbreak') return -0.42;
  if (actor.state === 'dodge') return 0.2;
  if (actor.state === 'attack') {
    if (attack.style === 'thrust') return 0.08;
    if (attack.phase === 'anticipation') return -0.1;
    if (attack.phase === 'contact') return 0.1;
    return -0.05;
  }
  return 0;
}

/**
 * Generate the whole articulated pose from simulation state. No animation asset
 * is consulted here: the attack row supplies timing/reach, while this function
 * supplies the authored pose language for every known and unknown attack id.
 */
export function poseForActor(actor: ActorSnapshot, time = 0): ProceduralPose {
  const weapon = actor.team === 'enemies' && actor.archetype === 'thug' ? 'club' : actor.team === 'enemies' && actor.archetype === 'spear' ? 'spear' : actor.weapon;
  if (weapon !== actor.weapon) actor = { ...actor, weapon };
  const attack = attackMotionFor(actor);
  const crouch = crouchAmount(actor, attack);
  const stride = motionStride(actor, attack, time);
  const bodyHeight = actorBodyHeight(actor.archetype);
  const headRadius = actorHeadRadius(actor.archetype);
  const jump = jumpAmount(actor, attack);
  const bodyRotation = bodyRotationFor(actor, attack);
  const squat = crouch * 19;
  const hipY = -68 + squat + attack.lift * 0.18;
  const chestY = -112 + squat * 0.72 + attack.lift * 0.14;
  const shoulderY = chestY - 4;
  const headY = -140 + squat * 0.72 + attack.lift * 0.08;
  const forwardBias = attack.lunge * 0.22 + (actor.state === 'dodge' ? stride * 20 : 0);
  const frontFoot = point(15 + forwardBias + stride * 8, actor.state === 'jump' ? -jump * 0.16 : 0);
  const rearFoot = point(-14 + forwardBias - stride * 7, actor.state === 'jump' ? -jump * 0.08 : 0);
  const frontHip = point(10, hipY);
  const rearHip = point(-10, hipY + 1);
  const frontLeg = solveTwoBoneIK(frontHip, frontFoot, 39, 37, -1);
  const rearLeg = solveTwoBoneIK(rearHip, rearFoot, 39, 37, 1);
  const hip = point(0, hipY);
  const chest = point(0, chestY);
  const neck = point(0, headY + headRadius * 0.65);
  const head = point(0, headY);
  const frontShoulder = point(16, shoulderY);
  const rearShoulder = point(-16, shoulderY + 1);
  const twoHanded = actor.weapon === 'longsword' || actor.weapon === 'spear';
  const angle = weaponAngle(actor, attack);
  const grip = point(20 + forwardBias, -76 + squat * 0.7 - attack.lift * 0.34);
  const gripDirection = unit(angle);
  const gripLength = gripLengthFor(actor.weapon);
  const frontHand = point(
    grip.x + gripDirection.x * gripLength * 0.5,
    grip.y + gripDirection.y * gripLength * 0.5
  );
  const rearHand = twoHanded
    ? point(
      grip.x - gripDirection.x * gripLength * 0.5,
      grip.y - gripDirection.y * gripLength * 0.5
    )
    : point(frontHand.x - 7, frontHand.y + 5);
  const supportHand = twoHanded
    ? rearHand
    : point(-19 - attack.recoil * 6, -70 + squat * 0.66 + (actor.state === 'block' ? 6 : 0));
  const frontArm = solveTwoBoneIK(frontShoulder, frontHand, 31, 29, -1);
  const rearArm = solveTwoBoneIK(rearShoulder, twoHanded ? rearHand : supportHand, 31, 29, 1);
  const bladeLength = actor.archetype === 'captain' ? 88 : bladeLengthFor(actor.weapon);
  const blade = bladeFromGrip(frontHand, actor.weapon, angle, bladeLength);
  const trail = bladeTrailFor(blade, attack, actor);
  const fallen = actor.state === 'dead'
    ? clamp01(actor.stateElapsed / Math.max(EPSILON, actor.stateDuration))
    : 0;
  const scale = actor.archetype === 'grotesque' ? 1.17 : actor.archetype === 'wretch' ? 1 : bodyHeight / 176;
  return {
    scale,
    bodyHeight,
    jump,
    crouch,
    bodyRotation,
    hip,
    chest,
    neck,
    head,
    headRadius,
    frontShoulder,
    rearShoulder,
    frontHip,
    rearHip,
    frontKnee: frontLeg.elbow,
    rearKnee: rearLeg.elbow,
    frontFoot,
    rearFoot,
    frontElbow: frontArm.elbow,
    rearElbow: rearArm.elbow,
    frontHand,
    rearHand,
    supportHand,
    frontArm,
    rearArm,
    attack,
    blade,
    bladeTrail: trail,
    weapon: actor.weapon,
    twoHanded,
    fallen,
    stride
  };
}

export function hitZoneAnchor(actor: ActorSnapshot, zone: HitZone | null | undefined): RigPoint {
  const pose = poseForActor(actor, actor.stateElapsed);
  if (zone === 'head') return pose.head;
  if (zone === 'legs') return lerpPoint(pose.frontKnee, pose.frontFoot, 0.55);
  return pose.chest;
}

export function wrapAngle(angle: number): number {
  let result = finiteOr(angle, 0) % TAU;
  if (result > Math.PI) result -= TAU;
  if (result < -Math.PI) result += TAU;
  return result;
}

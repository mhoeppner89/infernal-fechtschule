import type { ActorState, Archetype, HitZone, Weapon } from '../sim/types.js';
import { ATTACKS } from '../sim/attacks.js';

export const ANIMATION_TICKS_PER_SECOND = 60;

export type AnimationState = Exclude<ActorState, 'attack'>;
export type AnimationFrameCue = 'neutral' | 'anticipation' | 'contact' | 'overshoot' | 'recovery';
export type AnimationPlayback = 'loop' | 'once';

export interface AnimationFrameSpec {
  readonly url: string;
  /** Authored timing at 60 Hz. Playback stretches these relative holds to stateDuration. */
  readonly holdTicks: number;
  readonly cue: AnimationFrameCue;
}

export interface AnimationDisplaySpec {
  /** Drawn height in the renderer's 1280 x 720 logical coordinate space. */
  readonly height: number;
  /** Normalized bottom-centre registration point within each source image. */
  readonly anchorX: number;
  readonly anchorY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** Authored fixed-rig clips must never receive per-clip body-size correction. */
  readonly fixedScale?: boolean;
}

interface AnimationClipBase {
  readonly id: string;
  readonly archetype: Archetype;
  /** Enemy clips use null because their snapshot weapon is not part of their visual identity. */
  readonly weapon: Weapon | null;
  readonly state: ActorState;
  readonly attackId: string | null;
  /** Optional visual variant, currently used by the three hit-reaction zones. */
  readonly variant?: string | null;
  readonly playback: AnimationPlayback;
  readonly display: AnimationDisplaySpec;
}

export interface ReadyAnimationClip extends AnimationClipBase {
  readonly availability: 'ready';
  readonly frames: readonly [AnimationFrameSpec, ...AnimationFrameSpec[]];
}

export interface PlannedAnimationClip extends AnimationClipBase {
  readonly availability: 'planned';
  readonly frames: readonly [];
}

export type AnimationClipSpec = ReadyAnimationClip | PlannedAnimationClip;

const MEYER_STATES = [
  'idle',
  'move',
  'block',
  'dodge',
  'crouch',
  'switch',
  'hitstun',
  'guardbreak',
  'dead'
] as const satisfies readonly AnimationState[];

const LONGSWORD_ATTACKS = [
  'ls_l1',
  'ls_l2',
  'ls_l3',
  'ls_h',
  'ls_dodge_l',
  'ls_low_l',
  'ls_air_l',
  'ls_counter',
  'ls_switch_in'
] as const;

const DUSSACK_ATTACKS = [
  'ds_l1',
  'ds_l2',
  'ds_l3',
  'ds_h',
  'ds_dodge_l',
  'ds_low_l',
  'ds_air_l',
  'ds_counter',
  'ds_switch_in'
] as const;

/** The finds: a picked-up cudgel and spear, used but never trained with. */
const CLUB_ATTACKS = ['cl_l1', 'cl_l2', 'cl_h', 'cl_throw'] as const;
const SPEAR_ATTACKS = ['sp_l1', 'sp_h', 'sp_throw'] as const;

export interface AnimationInventoryEntry {
  readonly archetype: Archetype;
  readonly weapon: Weapon | null;
  readonly states: readonly AnimationState[];
  readonly attacks: readonly string[];
}

/**
 * The complete art contract for the current vertical slice. This inventory is
 * deliberately separate from asset readiness: a declared clip may still be planned.
 */
export const ANIMATION_INVENTORY = Object.freeze([
  { archetype: 'meyer', weapon: 'longsword', states: MEYER_STATES, attacks: LONGSWORD_ATTACKS },
  { archetype: 'meyer', weapon: 'dussack', states: MEYER_STATES, attacks: DUSSACK_ATTACKS },
  { archetype: 'meyer', weapon: 'club', states: MEYER_STATES, attacks: CLUB_ATTACKS },
  { archetype: 'meyer', weapon: 'spear', states: MEYER_STATES, attacks: SPEAR_ATTACKS },
  {
    archetype: 'thug',
    weapon: null,
    states: ['idle', 'move', 'block', 'dodge', 'crouch', 'hitstun', 'guardbreak', 'dead'],
    attacks: ['thug_overhead', 'thug_body', 'thug_low']
  },
  {
    archetype: 'spear',
    weapon: null,
    states: ['idle', 'move', 'hitstun', 'dead'],
    attacks: ['spear_thrust']
  },
  {
    archetype: 'captain',
    weapon: null,
    states: ['idle', 'move', 'block', 'hitstun', 'guardbreak', 'dead'],
    attacks: ['captain_cut', 'captain_bash']
  },
  {
    archetype: 'wretch',
    weapon: null,
    states: ['idle', 'move', 'hitstun', 'dead'],
    attacks: ['wretch_claw']
  },
  {
    archetype: 'grotesque',
    weapon: null,
    states: ['idle', 'move', 'hitstun', 'dead'],
    attacks: ['boss_sweep', 'boss_leap', 'boss_shock']
  }
] as const satisfies readonly AnimationInventoryEntry[]);

const DEFAULT_DISPLAY: Readonly<Record<Archetype, AnimationDisplaySpec>> = Object.freeze({
  meyer: { height: 188, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 12 },
  thug: { height: 174, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 10 },
  spear: { height: 181, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 10 },
  captain: { height: 196, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 12 },
  wretch: { height: 162, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 8 },
  grotesque: { height: 278, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 24 }
});

const MEYER_LONGSWORD_IDLE_DISPLAY: AnimationDisplaySpec = Object.freeze({
  ...DEFAULT_DISPLAY.meyer,
  // The repaired source/runtime pair carries 12 px of transparent bottom
  // padding; this keeps its feet on the shared floor line at 18.27 logical px.
  offsetY: 18.27
});

export function animationClipId(
  archetype: Archetype,
  weapon: Weapon | null,
  state: ActorState,
  attackId: string | null = null,
  variant: string | null = null
): string {
  const kit = archetype === 'meyer' ? weapon ?? 'unarmed' : 'default';
  const baseAction = state === 'attack' ? attackId ?? 'unknown-attack' : state;
  const action = variant ? `${baseAction}_${variant}` : baseAction;
  return `${archetype}:${kit}:${action}`;
}

const readyClips = new Map<string, ReadyAnimationClip>();

function registerReady(clip: Omit<ReadyAnimationClip, 'availability' | 'id'>): void {
  const id = animationClipId(
    clip.archetype,
    clip.weapon,
    clip.state,
    clip.attackId,
    clip.variant ?? null
  );
  readyClips.set(id, Object.freeze({ ...clip, id, availability: 'ready' }));
}

registerReady({
  archetype: 'meyer',
  weapon: 'longsword',
  state: 'idle',
  attackId: null,
  playback: 'loop',
  display: MEYER_LONGSWORD_IDLE_DISPLAY,
  frames: [
    { url: 'assets/art/meyer/longsword/idle/01.webp', holdTicks: 10, cue: 'neutral' },
    { url: 'assets/art/meyer/longsword/idle/02.webp', holdTicks: 8, cue: 'neutral' },
    { url: 'assets/art/meyer/longsword/idle/03.webp', holdTicks: 10, cue: 'neutral' },
    { url: 'assets/art/meyer/longsword/idle/04.webp', holdTicks: 8, cue: 'neutral' }
  ]
});

const MAX_RECOVERY_POSE_HOLD_SECONDS = 0.12;
const MIN_RECOVERY_POSES = 3;
const OVERSHOOT_HOLD_TICKS = 3;
const SETTLE_HOLD_TICKS = 7;
const RECOVERY_POSE_HOLD_EPSILON = 1e-9;
const SOURCE_CONTACT_FRAME = 3;
const GENERATED_RECOVERY_FRAME_START = 5;
const SOURCE_RECOVERY_FRAME = 4;

/**
 * Keep this equation in lockstep with tools/generate-recovery-inbetweens.py:
 * the first recovery pose is a 3-tick overshoot and every remaining pose is a
 * 7-tick settle. Add poses until no stretched pose exceeds 120 ms.
 */
function recoveryPoseCount(attackId: string): number {
  const definition = ATTACKS[attackId];
  if (!definition) throw new Error(`Missing attack definition for animation: ${attackId}`);
  let frameCount = MIN_RECOVERY_POSES;
  while (
    definition.recovery * SETTLE_HOLD_TICKS
      / (OVERSHOOT_HOLD_TICKS + SETTLE_HOLD_TICKS * (frameCount - 1))
      > MAX_RECOVERY_POSE_HOLD_SECONDS + RECOVERY_POSE_HOLD_EPSILON
  ) frameCount += 1;
  return frameCount;
}

function recoveryHoldTicks(attackId: string): readonly number[] {
  const frameCount = recoveryPoseCount(attackId);
  return [
    OVERSHOOT_HOLD_TICKS,
    ...Array.from({ length: frameCount - 1 }, () => SETTLE_HOLD_TICKS)
  ];
}

function recoveryFrameNumber(recoveryIndex: number): number {
  if (recoveryIndex === 0) return GENERATED_RECOVERY_FRAME_START;
  if (recoveryIndex === 1) return SOURCE_RECOVERY_FRAME;
  return recoveryIndex + GENERATED_RECOVERY_FRAME_START - 1;
}

/**
 * Builds a variable-length attack track. Frames 01..04 remain untouched on
 * disk. Playback goes contact 03 -> follow-through 05 -> recovery 04 -> settle
 * 06 onward, with timing that keeps every moving pose at or below 120 ms.
 */
const attackFrames = (
  baseUrl: string,
  attackId: string,
  holds: readonly [number, number, number, number]
): readonly [AnimationFrameSpec, ...AnimationFrameSpec[]] => {
  const recoveryHolds = recoveryHoldTicks(attackId);
  const recoveryFrames: AnimationFrameSpec[] = recoveryHolds.map((holdTicks, recoveryIndex) => ({
    url: `${baseUrl}/${String(recoveryFrameNumber(recoveryIndex)).padStart(2, '0')}.webp`,
    holdTicks,
    cue: recoveryIndex === 0 ? 'overshoot' as const : 'recovery' as const
  }));
  return [
    { url: `${baseUrl}/01.webp`, holdTicks: holds[0], cue: 'anticipation' },
    { url: `${baseUrl}/02.webp`, holdTicks: holds[1], cue: 'anticipation' },
    {
      url: `${baseUrl}/${String(SOURCE_CONTACT_FRAME).padStart(2, '0')}.webp`,
      holdTicks: holds[2],
      cue: 'contact'
    },
    ...recoveryFrames
  ];
};

const reactionFrames = (
  baseUrl: string,
  holds: readonly [number, number, number, number]
): readonly [AnimationFrameSpec, AnimationFrameSpec, AnimationFrameSpec, AnimationFrameSpec] => [
  { url: `${baseUrl}/01.webp`, holdTicks: holds[0], cue: 'contact' },
  { url: `${baseUrl}/02.webp`, holdTicks: holds[1], cue: 'overshoot' },
  { url: `${baseUrl}/03.webp`, holdTicks: holds[2], cue: 'recovery' },
  { url: `${baseUrl}/04.webp`, holdTicks: holds[3], cue: 'recovery' }
];

const sequenceFrames = (
  baseUrl: string,
  holds: readonly [number, number, number, number]
): readonly [AnimationFrameSpec, AnimationFrameSpec, AnimationFrameSpec, AnimationFrameSpec] => [
  { url: `${baseUrl}/01.webp`, holdTicks: holds[0], cue: 'neutral' },
  { url: `${baseUrl}/02.webp`, holdTicks: holds[1], cue: 'neutral' },
  { url: `${baseUrl}/03.webp`, holdTicks: holds[2], cue: 'neutral' },
  { url: `${baseUrl}/04.webp`, holdTicks: holds[3], cue: 'neutral' }
];

/* v1 enemy clips removed: every archetype now uses the fixed-rig v2 set. */

registerReady({
  archetype: 'meyer',
  weapon: 'longsword',
  state: 'attack',
  attackId: 'ls_l1',
  playback: 'once',
  display: DEFAULT_DISPLAY.meyer,
  frames: attackFrames('assets/art/meyer/longsword/ls_l1', 'ls_l1', [4, 3, 2, 7])
});

for (const state of [
  { id: 'move', playback: 'loop', holds: [4, 4, 5, 4] },
  { id: 'block', playback: 'loop', holds: [6, 4, 5, 6] },
  { id: 'dodge', playback: 'once', holds: [3, 4, 5, 6] },
  { id: 'jump', playback: 'once', holds: [5, 5, 6, 7] },
  { id: 'switch', playback: 'once', holds: [5, 6, 6, 5] }
] as const) {
  registerReady({
    archetype: 'meyer',
    weapon: 'longsword',
    state: state.id,
    attackId: null,
    playback: state.playback,
    display: DEFAULT_DISPLAY.meyer,
    frames: sequenceFrames(`assets/art/meyer/longsword/${state.id}`, state.holds)
  });
}

for (const state of [
  { id: 'hitstun', holds: [2, 4, 5, 4] },
  { id: 'guardbreak', holds: [3, 7, 8, 12] },
  { id: 'dead', holds: [5, 7, 8, 24] }
] as const) {
  registerReady({
    archetype: 'meyer',
    weapon: 'longsword',
    state: state.id,
    attackId: null,
    playback: 'once',
    display: DEFAULT_DISPLAY.meyer,
    frames: reactionFrames(`assets/art/meyer/longsword/${state.id}`, state.holds)
  });
}

for (const attack of [
  { id: 'ls_l2', holds: [4, 4, 2, 7] },
  { id: 'ls_l3', holds: [7, 8, 3, 10] },
  { id: 'ls_h', holds: [14, 16, 3, 16] },
  { id: 'ls_dodge_l', holds: [3, 3, 2, 7] },
  { id: 'ls_air_l', holds: [5, 5, 3, 9] },
  { id: 'ls_counter', holds: [2, 2, 2, 7] },
  { id: 'ls_switch_in', holds: [4, 4, 2, 8] }
] as const) {
  registerReady({
    archetype: 'meyer',
    weapon: 'longsword',
    state: 'attack',
    attackId: attack.id,
    playback: 'once',
    display: DEFAULT_DISPLAY.meyer,
    frames: attackFrames(`assets/art/meyer/longsword/${attack.id}`, attack.id, attack.holds)
  });
}

for (const state of [
  { id: 'idle', playback: 'loop', holds: [8, 7, 9, 7] },
  { id: 'move', playback: 'loop', holds: [3, 3, 4, 3] },
  { id: 'block', playback: 'loop', holds: [4, 3, 4, 5] },
  { id: 'dodge', playback: 'once', holds: [2, 3, 4, 5] },
  { id: 'jump', playback: 'once', holds: [4, 4, 5, 6] },
  { id: 'switch', playback: 'once', holds: [3, 4, 4, 5] }
] as const) {
  registerReady({
    archetype: 'meyer',
    weapon: 'dussack',
    state: state.id,
    attackId: null,
    playback: state.playback,
    display: DEFAULT_DISPLAY.meyer,
    frames: sequenceFrames(`assets/art/meyer/dussack/${state.id}`, state.holds)
  });
}

for (const state of [
  { id: 'hitstun', holds: [2, 3, 4, 4] },
  { id: 'guardbreak', holds: [2, 6, 7, 10] },
  { id: 'dead', holds: [4, 6, 8, 24] }
] as const) {
  registerReady({
    archetype: 'meyer',
    weapon: 'dussack',
    state: state.id,
    attackId: null,
    playback: 'once',
    display: DEFAULT_DISPLAY.meyer,
    frames: reactionFrames(`assets/art/meyer/dussack/${state.id}`, state.holds)
  });
}

for (const attack of [
  { id: 'ds_l1', holds: [3, 3, 2, 6] },
  { id: 'ds_l2', holds: [3, 3, 2, 6] },
  { id: 'ds_l3', holds: [5, 6, 2, 8] },
  { id: 'ds_h', holds: [9, 10, 3, 12] },
  { id: 'ds_dodge_l', holds: [2, 3, 2, 6] },
  { id: 'ds_air_l', holds: [4, 4, 2, 8] },
  { id: 'ds_counter', holds: [1, 2, 2, 6] },
  { id: 'ds_switch_in', holds: [3, 3, 2, 7] }
] as const) {
  registerReady({
    archetype: 'meyer',
    weapon: 'dussack',
    state: 'attack',
    attackId: attack.id,
    playback: 'once',
    display: DEFAULT_DISPLAY.meyer,
    frames: attackFrames(`assets/art/meyer/dussack/${attack.id}`, attack.id, attack.holds)
  });
}

// The authored heel sits at y=350 on every 384 px frame. Keeping that exact
// registration point makes pose changes move limbs, never the whole actor.
const v2Display = (height: number): AnimationDisplaySpec => Object.freeze({
  height,
  anchorX: 0.5,
  anchorY: 350 / 384,
  offsetX: 0,
  offsetY: 0,
  fixedScale: true
});

const V2_MEYER_DISPLAY = v2Display(188);

type SixFrameCues = readonly [
  AnimationFrameCue,
  AnimationFrameCue,
  AnimationFrameCue,
  AnimationFrameCue,
  AnimationFrameCue,
  AnimationFrameCue
];

type SixFrames = readonly [
  AnimationFrameSpec,
  AnimationFrameSpec,
  AnimationFrameSpec,
  AnimationFrameSpec,
  AnimationFrameSpec,
  AnimationFrameSpec
];

const V2_HOLDS = [4, 5, 3, 3, 5, 5] as const;

function v2Frame(baseUrl: string, cues: SixFrameCues, index: 0 | 1 | 2 | 3 | 4 | 5): AnimationFrameSpec {
  return {
    url: `${baseUrl}/${String(index + 1).padStart(2, '0')}.webp`,
    holdTicks: V2_HOLDS[index],
    cue: cues[index]
  };
}

function v2Frames(baseUrl: string, cues: SixFrameCues): SixFrames {
  return [
    v2Frame(baseUrl, cues, 0),
    v2Frame(baseUrl, cues, 1),
    v2Frame(baseUrl, cues, 2),
    v2Frame(baseUrl, cues, 3),
    v2Frame(baseUrl, cues, 4),
    v2Frame(baseUrl, cues, 5)
  ];
}

const V2_NEUTRAL_CUES: SixFrameCues = [
  'neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'neutral'
];
const V2_ATTACK_CUES: SixFrameCues = [
  'neutral', 'anticipation', 'contact', 'overshoot', 'recovery', 'neutral'
];
const V2_HIT_REACTION_CUES: SixFrameCues = [
  'contact', 'recovery', 'recovery', 'recovery', 'recovery', 'recovery'
];
const V2_GUARDBREAK_CUES: SixFrameCues = [
  'contact', 'contact', 'recovery', 'recovery', 'recovery', 'recovery'
];
const V2_REACTION_ZONES = ['head', 'torso', 'legs'] as const satisfies readonly HitZone[];

const LOOPED_STATES: ReadonlySet<AnimationState> = new Set(['idle', 'move', 'block', 'crouch']);
const statePlayback = (state: AnimationState): AnimationPlayback =>
  LOOPED_STATES.has(state) ? 'loop' : 'once';

function stateCues(state: AnimationState): SixFrameCues {
  if (state === 'hitstun' || state === 'dead') return V2_HIT_REACTION_CUES;
  return state === 'guardbreak' ? V2_GUARDBREAK_CUES : V2_NEUTRAL_CUES;
}

function registerV2MeyerKit(weapon: Weapon, attacks: readonly string[]): void {
  const base = `assets/art-v2/meyer/${weapon}`;
  for (const [state, cues] of [
    ['idle', V2_NEUTRAL_CUES],
    ['move', V2_NEUTRAL_CUES],
    ['block', V2_NEUTRAL_CUES],
    ['crouch', V2_NEUTRAL_CUES],
    ['dodge', V2_NEUTRAL_CUES],
    ['switch', V2_NEUTRAL_CUES],
    ['hitstun', V2_HIT_REACTION_CUES],
    ['guardbreak', V2_GUARDBREAK_CUES],
    ['dead', V2_HIT_REACTION_CUES]
  ] as const) {
    registerReady({
      archetype: 'meyer',
      weapon,
      state,
      attackId: null,
      playback: statePlayback(state),
      display: V2_MEYER_DISPLAY,
      frames: v2Frames(`${base}/${state}`, cues)
    });
  }

  for (const zone of V2_REACTION_ZONES) {
    registerReady({
      archetype: 'meyer',
      weapon,
      state: 'hitstun',
      attackId: null,
      variant: zone,
      playback: 'once',
      display: V2_MEYER_DISPLAY,
      frames: v2Frames(`${base}/hitstun_${zone}`, V2_HIT_REACTION_CUES)
    });
  }

  for (const attackId of attacks) {
    registerReady({
      archetype: 'meyer',
      weapon,
      state: 'attack',
      attackId,
      playback: 'once',
      display: V2_MEYER_DISPLAY,
      frames: v2Frames(`${base}/${attackId}`, V2_ATTACK_CUES)
    });
  }
}

registerV2MeyerKit('longsword', LONGSWORD_ATTACKS);
registerV2MeyerKit('dussack', DUSSACK_ATTACKS);
registerV2MeyerKit('club', CLUB_ATTACKS);
registerV2MeyerKit('spear', SPEAR_ATTACKS);

const V2_NPC_DISPLAY: Readonly<Record<'thug' | 'spear' | 'captain' | 'wretch' | 'grotesque', AnimationDisplaySpec>> = Object.freeze({
  thug: v2Display(174),
  spear: v2Display(DEFAULT_DISPLAY.spear.height),
  captain: v2Display(DEFAULT_DISPLAY.captain.height),
  wretch: v2Display(DEFAULT_DISPLAY.wretch.height),
  grotesque: v2Display(DEFAULT_DISPLAY.grotesque.height)
});

const V2_NPC_KITS: readonly {
  archetype: 'thug' | 'spear' | 'captain' | 'wretch' | 'grotesque';
  folder: string;
  states: readonly AnimationState[];
  attacks: readonly string[];
}[] = [
  {
    archetype: 'thug',
    folder: 'assets/art-v2/thug/club',
    states: ['idle', 'move', 'block', 'crouch', 'dodge', 'hitstun', 'guardbreak', 'dead'],
    attacks: ['thug_overhead', 'thug_body', 'thug_low']
  },
  {
    archetype: 'spear',
    folder: 'assets/art-v2/spear/spear',
    states: ['idle', 'move', 'hitstun', 'dead'],
    attacks: ['spear_thrust']
  },
  {
    archetype: 'captain',
    folder: 'assets/art-v2/captain/captain-sword',
    states: ['idle', 'move', 'block', 'hitstun', 'guardbreak', 'dead'],
    attacks: ['captain_cut', 'captain_bash']
  },
  {
    archetype: 'wretch',
    folder: 'assets/art-v2/wretch/claws',
    states: ['idle', 'move', 'hitstun', 'dead'],
    attacks: ['wretch_claw']
  },
  {
    archetype: 'grotesque',
    folder: 'assets/art-v2/grotesque/claws',
    states: ['idle', 'move', 'hitstun', 'dead'],
    attacks: ['boss_sweep', 'boss_leap', 'boss_shock']
  }
];

for (const kit of V2_NPC_KITS) {
  const display = V2_NPC_DISPLAY[kit.archetype];
  for (const state of kit.states) {
    registerReady({
      archetype: kit.archetype,
      weapon: null,
      state,
      attackId: null,
      playback: statePlayback(state),
      display,
      frames: v2Frames(`${kit.folder}/${state}`, stateCues(state))
    });
  }
  // Every archetype now has authored per-zone reaction variants; the generic
  // hitstun clip remains registered as a safe fallback.
  for (const zone of V2_REACTION_ZONES) {
    registerReady({
      archetype: kit.archetype,
      weapon: null,
      state: 'hitstun',
      attackId: null,
      variant: zone,
      playback: 'once',
      display,
      frames: v2Frames(`${kit.folder}/hitstun_${zone}`, V2_HIT_REACTION_CUES)
    });
  }
  for (const attackId of kit.attacks) {
    registerReady({
      archetype: kit.archetype,
      weapon: null,
      state: 'attack',
      attackId,
      playback: 'once',
      display,
      frames: v2Frames(`${kit.folder}/${attackId}`, V2_ATTACK_CUES)
    });
  }
}

function plannedStateClip(entry: AnimationInventoryEntry, state: AnimationState): PlannedAnimationClip {
  return Object.freeze({
    id: animationClipId(entry.archetype, entry.weapon, state),
    archetype: entry.archetype,
    weapon: entry.weapon,
    state,
    attackId: null,
    playback: statePlayback(state),
    display: DEFAULT_DISPLAY[entry.archetype],
    availability: 'planned',
    frames: [] as const
  });
}

function plannedAttackClip(entry: AnimationInventoryEntry, attackId: string): PlannedAnimationClip {
  return Object.freeze({
    id: animationClipId(entry.archetype, entry.weapon, 'attack', attackId),
    archetype: entry.archetype,
    weapon: entry.weapon,
    state: 'attack',
    attackId,
    playback: 'once',
    display: DEFAULT_DISPLAY[entry.archetype],
    availability: 'planned',
    frames: [] as const
  });
}

function buildManifest(): readonly AnimationClipSpec[] {
  const clips: AnimationClipSpec[] = [];
  const includedIds = new Set<string>();
  for (const entry of ANIMATION_INVENTORY) {
    for (const state of entry.states) {
      const id = animationClipId(entry.archetype, entry.weapon, state);
      clips.push(readyClips.get(id) ?? plannedStateClip(entry, state));
      includedIds.add(id);
    }
    for (const attackId of entry.attacks) {
      const id = animationClipId(entry.archetype, entry.weapon, 'attack', attackId);
      clips.push(readyClips.get(id) ?? plannedAttackClip(entry, attackId));
      includedIds.add(id);
    }
  }
  // Variant reactions are supplemental to the state inventory but remain
  // first-class manifest clips so preload, QA, and service-worker coverage see them.
  for (const clip of readyClips.values()) {
    if (!includedIds.has(clip.id) && clip.variant) clips.push(clip);
  }
  return Object.freeze(clips);
}

/** Complete runtime and QA inventory, including explicit zone-reaction variants. */
export const ANIMATION_MANIFEST: readonly AnimationClipSpec[] = buildManifest();

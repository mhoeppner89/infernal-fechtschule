export const ANIMATION_TICKS_PER_SECOND = 60;
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
];
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
];
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
];
/** The finds: a picked-up cudgel and spear, used but never trained with. */
const CLUB_ATTACKS = ['cl_l1', 'cl_l2', 'cl_h', 'cl_throw'];
const SPEAR_ATTACKS = ['sp_l1', 'sp_h', 'sp_throw'];
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
]);
const DEFAULT_DISPLAY = Object.freeze({
    meyer: { height: 188, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 12 },
    thug: { height: 174, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 10 },
    spear: { height: 181, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 10 },
    captain: { height: 196, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 12 },
    wretch: { height: 162, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 8 },
    grotesque: { height: 278, anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 24 }
});
export function animationClipId(archetype, weapon, state, attackId = null, variant = null) {
    const kit = archetype === 'meyer' ? weapon ?? 'unarmed' : 'default';
    const baseAction = state === 'attack' ? attackId ?? 'unknown-attack' : state;
    const action = variant ? `${baseAction}_${variant}` : baseAction;
    return `${archetype}:${kit}:${action}`;
}
const readyClips = new Map();
function registerReady(clip) {
    const id = animationClipId(clip.archetype, clip.weapon, clip.state, clip.attackId, clip.variant ?? null);
    readyClips.set(id, Object.freeze({ ...clip, id, availability: 'ready' }));
}
// The authored heel sits at y=350 on every 384 px frame. Keeping that exact
// registration point makes pose changes move limbs, never the whole actor.
const v2Display = (height) => Object.freeze({
    height,
    anchorX: 0.5,
    anchorY: 350 / 384,
    offsetX: 0,
    offsetY: 0,
    fixedScale: true
});
const V2_MEYER_DISPLAY = v2Display(188);
const V2_HOLDS = [4, 5, 3, 3, 5, 5];
function v2Frame(baseUrl, cues, index) {
    return {
        url: `${baseUrl}/${String(index + 1).padStart(2, '0')}.webp`,
        holdTicks: V2_HOLDS[index],
        cue: cues[index]
    };
}
function v2Frames(baseUrl, cues) {
    return [
        v2Frame(baseUrl, cues, 0),
        v2Frame(baseUrl, cues, 1),
        v2Frame(baseUrl, cues, 2),
        v2Frame(baseUrl, cues, 3),
        v2Frame(baseUrl, cues, 4),
        v2Frame(baseUrl, cues, 5)
    ];
}
const V2_NEUTRAL_CUES = [
    'neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'neutral'
];
const V2_ATTACK_CUES = [
    'neutral', 'anticipation', 'contact', 'overshoot', 'recovery', 'neutral'
];
const V2_HIT_REACTION_CUES = [
    'contact', 'recovery', 'recovery', 'recovery', 'recovery', 'recovery'
];
const V2_GUARDBREAK_CUES = [
    'contact', 'contact', 'recovery', 'recovery', 'recovery', 'recovery'
];
const V2_REACTION_ZONES = ['head', 'torso', 'legs'];
const LOOPED_STATES = new Set(['idle', 'move', 'block', 'crouch']);
const statePlayback = (state) => LOOPED_STATES.has(state) ? 'loop' : 'once';
function stateCues(state) {
    if (state === 'hitstun' || state === 'dead')
        return V2_HIT_REACTION_CUES;
    return state === 'guardbreak' ? V2_GUARDBREAK_CUES : V2_NEUTRAL_CUES;
}
function registerV2MeyerKit(weapon, attacks) {
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
    ]) {
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
const V2_NPC_DISPLAY = Object.freeze({
    thug: v2Display(174),
    spear: v2Display(DEFAULT_DISPLAY.spear.height),
    captain: v2Display(DEFAULT_DISPLAY.captain.height),
    wretch: v2Display(DEFAULT_DISPLAY.wretch.height),
    grotesque: v2Display(DEFAULT_DISPLAY.grotesque.height)
});
const V2_NPC_KITS = [
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
function plannedStateClip(entry, state) {
    return Object.freeze({
        id: animationClipId(entry.archetype, entry.weapon, state),
        archetype: entry.archetype,
        weapon: entry.weapon,
        state,
        attackId: null,
        playback: statePlayback(state),
        display: DEFAULT_DISPLAY[entry.archetype],
        availability: 'planned',
        frames: []
    });
}
function plannedAttackClip(entry, attackId) {
    return Object.freeze({
        id: animationClipId(entry.archetype, entry.weapon, 'attack', attackId),
        archetype: entry.archetype,
        weapon: entry.weapon,
        state: 'attack',
        attackId,
        playback: 'once',
        display: DEFAULT_DISPLAY[entry.archetype],
        availability: 'planned',
        frames: []
    });
}
function buildManifest() {
    const clips = [];
    const includedIds = new Set();
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
        if (!includedIds.has(clip.id) && clip.variant)
            clips.push(clip);
    }
    return Object.freeze(clips);
}
/** Complete runtime and QA inventory, including explicit zone-reaction variants. */
export const ANIMATION_MANIFEST = buildManifest();
//# sourceMappingURL=animation-manifest.js.map
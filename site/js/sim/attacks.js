const attack = (definition) => definition;
export const ATTACKS = Object.freeze({
    // Meyer — longsword
    ls_l1: attack({
        id: 'ls_l1', label: 'Opening Hew', owner: 'player', weapon: 'longsword',
        startup: 0.12, active: 0.09, recovery: 0.16,
        damage: 8, guardDamage: 6, reach: 82, depth: 29, minForward: -8,
        knockback: 28, hitstun: 0.22, hitStop: 0.035, movement: 18,
        maxTargets: 1, arc: 'front', nextLight: 'ls_l2', nextHeavy: 'ls_lh'
    }),
    ls_l2: attack({
        id: 'ls_l2', label: 'Crossing Hew', owner: 'player', weapon: 'longsword',
        startup: 0.14, active: 0.09, recovery: 0.18,
        damage: 9, guardDamage: 7, reach: 88, depth: 32, minForward: -10,
        knockback: 34, hitstun: 0.24, hitStop: 0.04, movement: 20,
        maxTargets: 2, arc: 'front', deflectStart: 0.08, deflectEnd: 0.22,
        nextLight: 'ls_l3', nextHeavy: 'ls_l2h'
    }),
    ls_l3: attack({
        id: 'ls_l3', label: 'Threefold Cut', owner: 'player', weapon: 'longsword',
        startup: 0.19, active: 0.12, recovery: 0.28,
        damage: 15, guardDamage: 14, reach: 99, depth: 42, minForward: -16,
        knockback: 92, hitstun: 0.42, hitStop: 0.065, movement: 26,
        maxTargets: 4, arc: 'front', heavy: true, signature: 'Threefold Cut'
    }),
    ls_lh: attack({
        id: 'ls_lh', label: 'Provoking Hew', owner: 'player', weapon: 'longsword',
        startup: 0.24, active: 0.12, recovery: 0.31,
        damage: 17, guardDamage: 19, reach: 104, depth: 38, minForward: -10,
        knockback: 86, hitstun: 0.38, hitStop: 0.06, movement: 29,
        maxTargets: 3, arc: 'front', heavy: true, provoke: true,
        signature: 'Provoking Hew', nextLight: 'ls_hl'
    }),
    ls_l2h: attack({
        id: 'ls_l2h', label: 'Crossing Breaker', owner: 'player', weapon: 'longsword',
        startup: 0.29, active: 0.14, recovery: 0.36,
        damage: 24, guardDamage: 27, reach: 116, depth: 50, minForward: -16,
        knockback: 132, hitstun: 0.55, hitStop: 0.085, movement: 34,
        maxTargets: 5, arc: 'front', heavy: true, provoke: true,
        signature: 'Crossing Breaker'
    }),
    ls_h: attack({
        id: 'ls_h', label: 'Committed Hew', owner: 'player', weapon: 'longsword',
        startup: 0.33, active: 0.13, recovery: 0.42,
        damage: 22, guardDamage: 24, reach: 112, depth: 41, minForward: -12,
        knockback: 118, hitstun: 0.48, hitStop: 0.08, movement: 31,
        maxTargets: 4, arc: 'front', heavy: true, provoke: true,
        nextLight: 'ls_hl'
    }),
    ls_hl: attack({
        id: 'ls_hl', label: 'Taking Cut', owner: 'player', weapon: 'longsword',
        startup: 0.16, active: 0.1, recovery: 0.24,
        damage: 14, guardDamage: 10, reach: 91, depth: 34, minForward: -12,
        knockback: 54, hitstun: 0.32, hitStop: 0.05, movement: 20,
        maxTargets: 3, arc: 'front', deflectStart: 0.06, deflectEnd: 0.22,
        signature: 'Taking Cut', nextHeavy: 'ls_l2h'
    }),
    ls_dodge_l: attack({
        id: 'ls_dodge_l', label: 'Passing Cut', owner: 'player', weapon: 'longsword',
        startup: 0.1, active: 0.11, recovery: 0.23,
        damage: 13, guardDamage: 8, reach: 92, depth: 30, minForward: -8,
        knockback: 48, hitstun: 0.29, hitStop: 0.045, movement: 56,
        maxTargets: 2, arc: 'front', signature: 'Passing Cut'
    }),
    ls_air_l: attack({
        id: 'ls_air_l', label: 'Descending Hew', owner: 'player', weapon: 'longsword',
        startup: 0.13, active: 0.13, recovery: 0.3,
        damage: 16, guardDamage: 12, reach: 90, depth: 37, minForward: -15,
        knockback: 84, hitstun: 0.39, hitStop: 0.06, movement: 22,
        maxTargets: 3, arc: 'front', heavy: true, signature: 'Descending Hew'
    }),
    ls_counter: attack({
        id: 'ls_counter', label: 'Master Cut', owner: 'player', weapon: 'longsword',
        startup: 0.07, active: 0.12, recovery: 0.25,
        damage: 27, guardDamage: 30, reach: 106, depth: 38, minForward: -12,
        knockback: 132, hitstun: 0.62, hitStop: 0.095, movement: 27,
        maxTargets: 4, arc: 'front', heavy: true, signature: 'Master Cut'
    }),
    ls_switch_in: attack({
        id: 'ls_switch_in', label: 'Long Edge Entry', owner: 'player', weapon: 'longsword',
        startup: 0.13, active: 0.11, recovery: 0.22,
        damage: 15, guardDamage: 13, reach: 101, depth: 36, minForward: -10,
        knockback: 62, hitstun: 0.35, hitStop: 0.055, movement: 28,
        maxTargets: 3, arc: 'front', signature: 'Long Edge Entry', nextLight: 'ls_l2'
    }),
    // Meyer — dussack
    ds_l1: attack({
        id: 'ds_l1', label: 'Forehand Cut', owner: 'player', weapon: 'dussack',
        startup: 0.09, active: 0.08, recovery: 0.12,
        damage: 6, guardDamage: 4, reach: 66, depth: 25, minForward: -7,
        knockback: 20, hitstun: 0.18, hitStop: 0.028, movement: 21,
        maxTargets: 1, arc: 'front', nextLight: 'ds_l2', nextHeavy: 'ds_lh'
    }),
    ds_l2: attack({
        id: 'ds_l2', label: 'Backhand Cut', owner: 'player', weapon: 'dussack',
        startup: 0.09, active: 0.08, recovery: 0.13,
        damage: 7, guardDamage: 5, reach: 69, depth: 27, minForward: -10,
        knockback: 23, hitstun: 0.19, hitStop: 0.03, movement: 23,
        maxTargets: 2, arc: 'front', deflectStart: 0.05, deflectEnd: 0.17,
        nextLight: 'ds_l3', nextHeavy: 'ds_l2h'
    }),
    ds_l3: attack({
        id: 'ds_l3', label: 'Circular Pursuit', owner: 'player', weapon: 'dussack',
        startup: 0.13, active: 0.11, recovery: 0.2,
        damage: 12, guardDamage: 9, reach: 74, depth: 39, minForward: -24,
        knockback: 54, hitstun: 0.3, hitStop: 0.045, movement: 28,
        maxTargets: 4, arc: 'front', signature: 'Circular Pursuit'
    }),
    ds_lh: attack({
        id: 'ds_lh', label: 'Pressing Cut', owner: 'player', weapon: 'dussack',
        startup: 0.17, active: 0.1, recovery: 0.23,
        damage: 14, guardDamage: 15, reach: 76, depth: 31, minForward: -10,
        knockback: 61, hitstun: 0.34, hitStop: 0.05, movement: 33,
        maxTargets: 3, arc: 'front', heavy: true, provoke: true,
        signature: 'Pressing Cut', nextLight: 'ds_hl'
    }),
    ds_l2h: attack({
        id: 'ds_l2h', label: 'Wheel Cut', owner: 'player', weapon: 'dussack',
        startup: 0.2, active: 0.13, recovery: 0.28,
        damage: 18, guardDamage: 17, reach: 78, depth: 66, minForward: -78,
        knockback: 84, hitstun: 0.4, hitStop: 0.065, movement: 24,
        maxTargets: 6, arc: 'radial', heavy: true, provoke: true,
        signature: 'Wheel Cut'
    }),
    ds_h: attack({
        id: 'ds_h', label: 'Committed Dussack Cut', owner: 'player', weapon: 'dussack',
        startup: 0.22, active: 0.11, recovery: 0.31,
        damage: 17, guardDamage: 19, reach: 79, depth: 33, minForward: -11,
        knockback: 78, hitstun: 0.39, hitStop: 0.06, movement: 34,
        maxTargets: 3, arc: 'front', heavy: true, provoke: true,
        nextLight: 'ds_hl'
    }),
    ds_hl: attack({
        id: 'ds_hl', label: 'Reversing Cut', owner: 'player', weapon: 'dussack',
        startup: 0.11, active: 0.09, recovery: 0.18,
        damage: 11, guardDamage: 8, reach: 72, depth: 31, minForward: -14,
        knockback: 39, hitstun: 0.25, hitStop: 0.04, movement: 28,
        maxTargets: 3, arc: 'front', deflectStart: 0.04, deflectEnd: 0.15,
        signature: 'Reversing Cut', nextHeavy: 'ds_l2h'
    }),
    ds_dodge_l: attack({
        id: 'ds_dodge_l', label: 'Passing Step', owner: 'player', weapon: 'dussack',
        startup: 0.08, active: 0.1, recovery: 0.18,
        damage: 11, guardDamage: 7, reach: 73, depth: 28, minForward: -8,
        knockback: 42, hitstun: 0.26, hitStop: 0.04, movement: 72,
        maxTargets: 2, arc: 'front', signature: 'Passing Step'
    }),
    ds_air_l: attack({
        id: 'ds_air_l', label: 'Leaping Cut', owner: 'player', weapon: 'dussack',
        startup: 0.1, active: 0.11, recovery: 0.24,
        damage: 13, guardDamage: 9, reach: 70, depth: 34, minForward: -16,
        knockback: 57, hitstun: 0.31, hitStop: 0.05, movement: 31,
        maxTargets: 3, arc: 'front', signature: 'Leaping Cut'
    }),
    ds_counter: attack({
        id: 'ds_counter', label: 'Cut Around', owner: 'player', weapon: 'dussack',
        startup: 0.055, active: 0.11, recovery: 0.2,
        damage: 23, guardDamage: 24, reach: 80, depth: 42, minForward: -22,
        knockback: 104, hitstun: 0.54, hitStop: 0.085, movement: 38,
        maxTargets: 5, arc: 'front', heavy: true, signature: 'Cut Around'
    }),
    ds_switch_in: attack({
        id: 'ds_switch_in', label: 'Dussack Entry', owner: 'player', weapon: 'dussack',
        startup: 0.1, active: 0.1, recovery: 0.18,
        damage: 12, guardDamage: 9, reach: 75, depth: 35, minForward: -14,
        knockback: 49, hitstun: 0.29, hitStop: 0.045, movement: 38,
        maxTargets: 4, arc: 'front', signature: 'Dussack Entry', nextLight: 'ds_l2'
    }),
    // Enemy attacks
    thug_overhead: attack({
        id: 'thug_overhead', label: 'Club Overhead', owner: 'thug',
        startup: 0.55, active: 0.12, recovery: 0.67,
        damage: 10, guardDamage: 11, reach: 58, depth: 27, minForward: -5,
        knockback: 62, hitstun: 0.38, hitStop: 0.055, movement: 16,
        maxTargets: 1, arc: 'front', heavy: true
    }),
    spear_thrust: attack({
        id: 'spear_thrust', label: 'Spear Thrust', owner: 'spear',
        startup: 0.72, active: 0.13, recovery: 0.86,
        damage: 15, guardDamage: 14, reach: 145, depth: 20, minForward: 34,
        knockback: 81, hitstun: 0.46, hitStop: 0.065, movement: 20,
        maxTargets: 1, arc: 'front', heavy: true
    }),
    captain_cut: attack({
        id: 'captain_cut', label: 'Armoured Cut', owner: 'captain',
        startup: 0.49, active: 0.14, recovery: 0.72,
        damage: 17, guardDamage: 19, reach: 82, depth: 32, minForward: -8,
        knockback: 88, hitstun: 0.48, hitStop: 0.07, movement: 21,
        maxTargets: 2, arc: 'front', heavy: true
    }),
    captain_bash: attack({
        id: 'captain_bash', label: 'Shield Bash', owner: 'captain',
        startup: 0.31, active: 0.1, recovery: 0.52,
        damage: 9, guardDamage: 25, reach: 54, depth: 31, minForward: -6,
        knockback: 105, hitstun: 0.58, hitStop: 0.075, movement: 28,
        maxTargets: 1, arc: 'front', heavy: true
    }),
    wretch_claw: attack({
        id: 'wretch_claw', label: 'Chain Claw', owner: 'wretch',
        startup: 0.37, active: 0.11, recovery: 0.5,
        damage: 8, guardDamage: 8, reach: 61, depth: 33, minForward: -12,
        knockback: 43, hitstun: 0.29, hitStop: 0.04, movement: 31,
        maxTargets: 1, arc: 'front'
    }),
    boss_sweep: attack({
        id: 'boss_sweep', label: 'Grotesque Sweep', owner: 'grotesque',
        startup: 0.68, active: 0.18, recovery: 0.88,
        damage: 18, guardDamage: 21, reach: 117, depth: 92, minForward: -96,
        knockback: 132, hitstun: 0.58, hitStop: 0.09, movement: 8,
        maxTargets: 2, arc: 'radial', heavy: true
    }),
    boss_leap: attack({
        id: 'boss_leap', label: 'Bound Leap', owner: 'grotesque',
        startup: 0.82, active: 0.16, recovery: 0.9,
        damage: 22, guardDamage: 25, reach: 88, depth: 72, minForward: -56,
        knockback: 148, hitstun: 0.67, hitStop: 0.105, movement: 145,
        maxTargets: 2, arc: 'radial', heavy: true, shockwave: true
    }),
    boss_shock: attack({
        id: 'boss_shock', label: 'Chain Rupture', owner: 'grotesque',
        startup: 0.95, active: 0.2, recovery: 1.0,
        damage: 16, guardDamage: 17, reach: 150, depth: 150, minForward: -150,
        knockback: 118, hitstun: 0.52, hitStop: 0.085, movement: 0,
        maxTargets: 2, arc: 'radial', heavy: true, shockwave: true, parryable: false
    })
});
export function getAttack(id) {
    const result = ATTACKS[id];
    if (!result)
        throw new Error(`Unknown attack: ${id}`);
    return result;
}
export function attackDuration(definition) {
    return definition.startup + definition.active + definition.recovery;
}
export function isAttackActive(definition, elapsed) {
    return elapsed >= definition.startup && elapsed < definition.startup + definition.active;
}
export function attackProgress(definition, elapsed) {
    return Math.max(0, Math.min(1, elapsed / attackDuration(definition)));
}
export function resolvePlayerAttack(weapon, action, currentAttackId, afterParry) {
    if (afterParry && action === 'heavy')
        return weapon === 'longsword' ? 'ls_counter' : 'ds_counter';
    if (currentAttackId) {
        const current = getAttack(currentAttackId);
        const chained = action === 'light' ? current.nextLight : current.nextHeavy;
        if (chained)
            return chained;
    }
    if (weapon === 'longsword')
        return action === 'light' ? 'ls_l1' : 'ls_h';
    return action === 'light' ? 'ds_l1' : 'ds_h';
}
export function resolveDodgeAttack(weapon) {
    return weapon === 'longsword' ? 'ls_dodge_l' : 'ds_dodge_l';
}
export function resolveAirAttack(weapon) {
    return weapon === 'longsword' ? 'ls_air_l' : 'ds_air_l';
}
export function resolveSwitchAttack(weapon) {
    return weapon === 'longsword' ? 'ls_switch_in' : 'ds_switch_in';
}
export function nextAttackForAction(definition, action) {
    if (action === 'light')
        return definition.nextLight ?? null;
    if (action === 'heavy')
        return definition.nextHeavy ?? null;
    if (action === 'switch')
        return definition.nextSwitch ?? null;
    return null;
}
export function withUpgradeEffects(base, upgrades) {
    let result = base;
    if (upgrades.has('longsword-sweep') && base.id === 'ls_l3') {
        result = { ...result, depth: result.depth + 20, maxTargets: result.maxTargets + 2, knockback: result.knockback + 18 };
    }
    if (upgrades.has('dussack-circle') && (base.id === 'ds_l2h' || base.id === 'ds_l3')) {
        result = { ...result, arc: 'radial', minForward: -result.reach, depth: result.depth + 18, maxTargets: result.maxTargets + 2 };
    }
    if (upgrades.has('dussack-passing-step') && base.id === 'ds_dodge_l') {
        result = { ...result, movement: result.movement + 42, maxTargets: result.maxTargets + 1 };
    }
    return result;
}
//# sourceMappingURL=attacks.js.map
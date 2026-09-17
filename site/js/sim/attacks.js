const attack = (definition) => definition;
/**
 * Player chain timings are load-bearing, not decoration. A chained cut only
 * links when its startup fits inside the hitstun the previous cut applied, so
 * every light link satisfies:
 *
 *     hitstun(previous) * decay(position) >= active(previous) + startup(next) + 1 frame
 *
 * The left side is measured from the previous cut's last possible active frame,
 * the right side from the first frame the next cut can connect. Recovery is
 * deliberately not part of it: a confirmed cut cancels its recovery (see
 * `updatePlayerAttack`), so strings are paced by startups, while a whiff or a
 * blocked cut pays the full recovery. `tests/combo-links.test.mjs` asserts the
 * inequality for every authored link, so retuning one value tells you at once
 * whether a route broke.
 */
export const ATTACKS = Object.freeze({
    // Meyer — longsword
    ls_l1: attack({
        id: 'ls_l1', label: 'Opening Hew', owner: 'player', weapon: 'longsword', hitZone: 'torso',
        startup: 0.11, active: 0.08, recovery: 0.16,
        damage: 8, guardDamage: 6, reach: 82, depth: 29, minForward: -8,
        knockback: 28, hitstun: 0.28, hitStop: 0.035, movement: 18,
        maxTargets: 1, arc: 'front', nextLight: 'ls_l2', nextHeavy: 'ls_h'
    }),
    ls_l2: attack({
        id: 'ls_l2', label: 'Crossing Hew', owner: 'player', weapon: 'longsword', hitZone: 'torso',
        startup: 0.1, active: 0.08, recovery: 0.18,
        damage: 9, guardDamage: 7, reach: 88, depth: 32, minForward: -10,
        knockback: 34, hitstun: 0.3, hitStop: 0.04, movement: 20,
        maxTargets: 2, arc: 'front', deflectStart: 0.08, deflectEnd: 0.22,
        nextLight: 'ls_l3', nextHeavy: 'ls_h'
    }),
    ls_l3: attack({
        id: 'ls_l3', label: 'Threefold Cut', owner: 'player', weapon: 'longsword', hitZone: 'head',
        startup: 0.12, active: 0.11, recovery: 0.28,
        damage: 15, guardDamage: 14, reach: 99, depth: 42, minForward: -16,
        knockback: 92, hitstun: 0.42, hitStop: 0.065, movement: 26,
        maxTargets: 4, arc: 'front', heavy: true, signature: 'Threefold Cut'
    }),
    ls_h: attack({
        id: 'ls_h', label: 'Committed Hew', owner: 'player', weapon: 'longsword', hitZone: 'head',
        startup: 0.26, active: 0.12, recovery: 0.31,
        damage: 22, guardDamage: 24, reach: 112, depth: 41, minForward: -12,
        knockback: 132, hitstun: 0.48, hitStop: 0.08, movement: 31,
        maxTargets: 4, arc: 'front', heavy: true, provoke: true
    }),
    ls_dodge_l: attack({
        id: 'ls_dodge_l', label: 'Passing Cut', owner: 'player', weapon: 'longsword', hitZone: 'torso',
        startup: 0.1, active: 0.11, recovery: 0.23,
        damage: 13, guardDamage: 8, reach: 92, depth: 30, minForward: -8,
        knockback: 48, hitstun: 0.29, hitStop: 0.045, movement: 56,
        maxTargets: 2, arc: 'front', signature: 'Passing Cut'
    }),
    ls_low_l: attack({
        id: 'ls_low_l', label: 'Low Cut', owner: 'player', weapon: 'longsword', hitZone: 'legs',
        startup: 0.1, active: 0.09, recovery: 0.18,
        damage: 8, guardDamage: 5, reach: 80, depth: 31, minForward: -6,
        knockback: 25, hitstun: 0.28, hitStop: 0.034, movement: 15,
        maxTargets: 1, arc: 'front', crouchedPosture: true, nextLight: 'ls_l2', nextHeavy: 'ls_h'
    }),
    ls_air_l: attack({
        id: 'ls_air_l', label: 'Descending Hew', owner: 'player', weapon: 'longsword', hitZone: 'head',
        startup: 0.13, active: 0.13, recovery: 0.3,
        damage: 16, guardDamage: 12, reach: 90, depth: 37, minForward: -15,
        knockback: 84, hitstun: 0.39, hitStop: 0.06, movement: 22,
        maxTargets: 3, arc: 'front', heavy: true, signature: 'Descending Hew'
    }),
    ls_counter: attack({
        id: 'ls_counter', label: 'Master Cut', owner: 'player', weapon: 'longsword', hitZone: 'head',
        startup: 0.07, active: 0.12, recovery: 0.25,
        damage: 27, guardDamage: 30, reach: 106, depth: 38, minForward: -12,
        knockback: 132, hitstun: 0.62, hitStop: 0.095, movement: 27,
        maxTargets: 4, arc: 'front', heavy: true, signature: 'Master Cut'
    }),
    ls_switch_in: attack({
        id: 'ls_switch_in', label: 'Long Edge Entry', owner: 'player', weapon: 'longsword', hitZone: 'torso',
        startup: 0.13, active: 0.11, recovery: 0.22,
        damage: 15, guardDamage: 13, reach: 101, depth: 36, minForward: -10,
        knockback: 62, hitstun: 0.35, hitStop: 0.055, movement: 28,
        maxTargets: 3, arc: 'front', signature: 'Long Edge Entry', nextLight: 'ls_l2', nextHeavy: 'ls_h'
    }),
    // Guard-command branches. These are arcade adaptations of fencing ideas,
    // not claims to reconstruct a complete historical action. Each is a short,
    // definition-driven cut so the mobile controls can advertise the same names.
    ls_guard_forward: attack({
        id: 'ls_guard_forward', label: 'Long Point Entry', owner: 'player', weapon: 'longsword', hitZone: 'torso',
        startup: 0.11, active: 0.1, recovery: 0.23,
        damage: 12, guardDamage: 11, reach: 124, depth: 25, minForward: 12,
        knockback: 58, hitstun: 0.32, hitStop: 0.045, movement: 40,
        maxTargets: 1, arc: 'front', guardDirection: 'forward', nextLight: 'ls_l2', nextHeavy: 'ls_h'
    }),
    ls_guard_up: attack({
        id: 'ls_guard_up', label: 'Zwerchhau', owner: 'player', weapon: 'longsword', hitZone: 'head',
        startup: 0.1, active: 0.1, recovery: 0.24,
        damage: 13, guardDamage: 13, reach: 105, depth: 43, minForward: -12,
        knockback: 66, hitstun: 0.34, hitStop: 0.05, movement: 24,
        maxTargets: 3, arc: 'front', guardDirection: 'up', deflectStart: 0.05, deflectEnd: 0.16,
        nextLight: 'ls_l2', nextHeavy: 'ls_h'
    }),
    ls_guard_down: attack({
        id: 'ls_guard_down', label: 'Unterhau', owner: 'player', weapon: 'longsword', hitZone: 'torso',
        startup: 0.11, active: 0.1, recovery: 0.24,
        damage: 12, guardDamage: 10, reach: 96, depth: 34, minForward: -10,
        knockback: 54, hitstun: 0.31, hitStop: 0.045, movement: 32,
        maxTargets: 2, arc: 'front', crouchedPosture: true, guardDirection: 'down',
        nextLight: 'ls_l2', nextHeavy: 'ls_h'
    }),
    ls_guard_back: attack({
        id: 'ls_guard_back', label: 'Abzug', owner: 'player', weapon: 'longsword', hitZone: 'torso',
        startup: 0.13, active: 0.1, recovery: 0.27,
        damage: 14, guardDamage: 12, reach: 82, depth: 36, minForward: -10,
        knockback: 74, hitstun: 0.36, hitStop: 0.05, movement: -34,
        maxTargets: 2, arc: 'front', guardDirection: 'back', signature: 'Abzug',
        nextLight: 'ls_l2', nextHeavy: 'ls_h'
    }),
    // Meyer — dussack
    ds_l1: attack({
        id: 'ds_l1', label: 'Forehand Cut', owner: 'player', weapon: 'dussack', hitZone: 'torso',
        startup: 0.07, active: 0.07, recovery: 0.12,
        damage: 6, guardDamage: 4, reach: 66, depth: 25, minForward: -7,
        knockback: 20, hitstun: 0.27, hitStop: 0.028, movement: 21,
        maxTargets: 1, arc: 'front', nextLight: 'ds_l2', nextHeavy: 'ds_h'
    }),
    ds_l2: attack({
        id: 'ds_l2', label: 'Backhand Cut', owner: 'player', weapon: 'dussack', hitZone: 'torso',
        startup: 0.07, active: 0.07, recovery: 0.13,
        damage: 7, guardDamage: 5, reach: 69, depth: 27, minForward: -10,
        knockback: 23, hitstun: 0.28, hitStop: 0.03, movement: 23,
        maxTargets: 2, arc: 'front', deflectStart: 0.05, deflectEnd: 0.17,
        nextLight: 'ds_l3', nextHeavy: 'ds_h'
    }),
    ds_l3: attack({
        id: 'ds_l3', label: 'Circular Pursuit', owner: 'player', weapon: 'dussack', hitZone: 'head',
        startup: 0.08, active: 0.09, recovery: 0.2,
        damage: 12, guardDamage: 9, reach: 74, depth: 39, minForward: -24,
        knockback: 54, hitstun: 0.31, hitStop: 0.045, movement: 28,
        maxTargets: 4, arc: 'front', signature: 'Circular Pursuit', nextLight: 'ds_l1'
    }),
    ds_h: attack({
        id: 'ds_h', label: 'Committed Dussack Cut', owner: 'player', weapon: 'dussack', hitZone: 'head',
        startup: 0.22, active: 0.11, recovery: 0.26,
        damage: 17, guardDamage: 19, reach: 79, depth: 33, minForward: -11,
        knockback: 78, hitstun: 0.39, hitStop: 0.06, movement: 34,
        maxTargets: 3, arc: 'front', heavy: true, provoke: true
    }),
    ds_dodge_l: attack({
        id: 'ds_dodge_l', label: 'Passing Step', owner: 'player', weapon: 'dussack', hitZone: 'torso',
        startup: 0.08, active: 0.1, recovery: 0.18,
        damage: 11, guardDamage: 7, reach: 73, depth: 28, minForward: -8,
        knockback: 42, hitstun: 0.26, hitStop: 0.04, movement: 72,
        maxTargets: 2, arc: 'front', signature: 'Passing Step'
    }),
    ds_low_l: attack({
        id: 'ds_low_l', label: 'Low Cut', owner: 'player', weapon: 'dussack', hitZone: 'legs',
        startup: 0.07, active: 0.09, recovery: 0.14,
        damage: 6, guardDamage: 4, reach: 65, depth: 28, minForward: -7,
        knockback: 21, hitstun: 0.24, hitStop: 0.03, movement: 20,
        maxTargets: 1, arc: 'front', crouchedPosture: true, nextLight: 'ds_l2', nextHeavy: 'ds_h'
    }),
    ds_air_l: attack({
        id: 'ds_air_l', label: 'Leaping Cut', owner: 'player', weapon: 'dussack', hitZone: 'head',
        startup: 0.1, active: 0.11, recovery: 0.24,
        damage: 13, guardDamage: 9, reach: 70, depth: 34, minForward: -16,
        knockback: 57, hitstun: 0.31, hitStop: 0.05, movement: 31,
        maxTargets: 3, arc: 'front', signature: 'Leaping Cut'
    }),
    ds_counter: attack({
        id: 'ds_counter', label: 'Cut Around', owner: 'player', weapon: 'dussack', hitZone: 'head',
        startup: 0.055, active: 0.11, recovery: 0.2,
        damage: 23, guardDamage: 24, reach: 80, depth: 42, minForward: -22,
        knockback: 104, hitstun: 0.54, hitStop: 0.085, movement: 38,
        maxTargets: 5, arc: 'front', heavy: true, signature: 'Cut Around'
    }),
    ds_switch_in: attack({
        id: 'ds_switch_in', label: 'Dussack Entry', owner: 'player', weapon: 'dussack', hitZone: 'torso',
        startup: 0.1, active: 0.1, recovery: 0.18,
        damage: 12, guardDamage: 9, reach: 75, depth: 35, minForward: -14,
        knockback: 49, hitstun: 0.29, hitStop: 0.045, movement: 38,
        maxTargets: 4, arc: 'front', signature: 'Dussack Entry', nextLight: 'ds_l2', nextHeavy: 'ds_h'
    }),
    ds_guard_forward: attack({
        id: 'ds_guard_forward', label: 'Dussack Point', owner: 'player', weapon: 'dussack', hitZone: 'torso',
        startup: 0.08, active: 0.1, recovery: 0.2,
        damage: 10, guardDamage: 9, reach: 94, depth: 27, minForward: 8,
        knockback: 45, hitstun: 0.29, hitStop: 0.04, movement: 38,
        maxTargets: 1, arc: 'front', guardDirection: 'forward', nextLight: 'ds_l2', nextHeavy: 'ds_h'
    }),
    ds_guard_up: attack({
        id: 'ds_guard_up', label: 'High Backhand', owner: 'player', weapon: 'dussack', hitZone: 'head',
        startup: 0.075, active: 0.1, recovery: 0.21,
        damage: 11, guardDamage: 10, reach: 82, depth: 39, minForward: -14,
        knockback: 51, hitstun: 0.3, hitStop: 0.043, movement: 29,
        maxTargets: 3, arc: 'front', guardDirection: 'up', deflectStart: 0.045, deflectEnd: 0.15,
        nextLight: 'ds_l2', nextHeavy: 'ds_h'
    }),
    ds_guard_down: attack({
        id: 'ds_guard_down', label: 'Rising Dussack Cut', owner: 'player', weapon: 'dussack', hitZone: 'legs',
        startup: 0.08, active: 0.1, recovery: 0.21,
        damage: 10, guardDamage: 8, reach: 78, depth: 34, minForward: -11,
        knockback: 43, hitstun: 0.28, hitStop: 0.04, movement: 35,
        maxTargets: 2, arc: 'front', crouchedPosture: true, guardDirection: 'down',
        nextLight: 'ds_l2', nextHeavy: 'ds_h'
    }),
    ds_guard_back: attack({
        id: 'ds_guard_back', label: 'Retreating Dussack Cut', owner: 'player', weapon: 'dussack', hitZone: 'torso',
        startup: 0.1, active: 0.1, recovery: 0.23,
        damage: 12, guardDamage: 10, reach: 76, depth: 36, minForward: -100,
        knockback: 62, hitstun: 0.33, hitStop: 0.045, movement: -42,
        maxTargets: 2, arc: 'front', guardDirection: 'back', signature: 'Retreating Cut',
        nextLight: 'ds_l2', nextHeavy: 'ds_h'
    }),
    // Improvised kits — the finds. Meyer can swing whatever he picks up, but a
    // cudgel is not a longsword: the kit is two cuts, a heavier overhead, and a
    // hurl, and none of his learned routes fire with a find in his hands. The
    // club is short and fast, the spear long and committed.
    cl_l1: attack({
        id: 'cl_l1', label: 'Cudgel Cut', owner: 'player', weapon: 'club', hitZone: 'torso',
        startup: 0.1, active: 0.08, recovery: 0.16,
        damage: 7, guardDamage: 6, reach: 96, depth: 30, minForward: -8,
        knockback: 30, hitstun: 0.28, hitStop: 0.035, movement: 18,
        maxTargets: 1, arc: 'front', nextLight: 'cl_l2', nextHeavy: 'cl_h'
    }),
    cl_l2: attack({
        id: 'cl_l2', label: 'Reversed Cudgel', owner: 'player', weapon: 'club', hitZone: 'torso',
        startup: 0.1, active: 0.08, recovery: 0.18,
        damage: 8, guardDamage: 7, reach: 100, depth: 32, minForward: -10,
        knockback: 36, hitstun: 0.29, hitStop: 0.04, movement: 20,
        maxTargets: 2, arc: 'front', nextHeavy: 'cl_h'
    }),
    cl_h: attack({
        id: 'cl_h', label: 'Cudgel Overhead', owner: 'player', weapon: 'club', hitZone: 'head',
        startup: 0.24, active: 0.12, recovery: 0.3,
        damage: 16, guardDamage: 18, reach: 108, depth: 38, minForward: -12,
        knockback: 88, hitstun: 0.44, hitStop: 0.06, movement: 26,
        maxTargets: 3, arc: 'front', heavy: true
    }),
    cl_throw: attack({
        id: 'cl_throw', label: 'Hurl the Cudgel', owner: 'player', weapon: 'club', hitZone: 'head',
        startup: 0.16, active: 0.1, recovery: 0.34,
        damage: 0, guardDamage: 0, reach: 0, depth: 0, minForward: 0,
        knockback: 0, hitstun: 0, hitStop: 0.04, movement: 0,
        maxTargets: 0, arc: 'front', heavy: true, throw: true, releaseAt: 0.16
    }),
    sp_l1: attack({
        id: 'sp_l1', label: 'Shaft Thrust', owner: 'player', weapon: 'spear', hitZone: 'torso',
        startup: 0.22, active: 0.12, recovery: 0.34,
        damage: 12, guardDamage: 12, reach: 124, depth: 22, minForward: 20,
        knockback: 60, hitstun: 0.36, hitStop: 0.05, movement: 26,
        maxTargets: 2, arc: 'front', nextHeavy: 'sp_h'
    }),
    sp_h: attack({
        // The rig renders six poses, and no pose may be held past 150 ms, which is
        // what caps a player move's recovery at 0.38 s (see docs/ARCHITECTURE.md).
        // The ram's weight therefore lives in its long startup, where the player can
        // still read the telegraph, rather than in a recovery the art cannot show.
        id: 'sp_h', label: 'Shaft Ram', owner: 'player', weapon: 'spear', hitZone: 'torso',
        startup: 0.4, active: 0.14, recovery: 0.38,
        damage: 18, guardDamage: 20, reach: 132, depth: 26, minForward: 24,
        knockback: 96, hitstun: 0.5, hitStop: 0.07, movement: 30,
        maxTargets: 2, arc: 'front', heavy: true
    }),
    sp_throw: attack({
        id: 'sp_throw', label: 'Cast the Shaft', owner: 'player', weapon: 'spear', hitZone: 'head',
        startup: 0.2, active: 0.1, recovery: 0.38,
        damage: 0, guardDamage: 0, reach: 0, depth: 0, minForward: 0,
        knockback: 0, hitstun: 0, hitStop: 0.045, movement: 0,
        maxTargets: 0, arc: 'front', heavy: true, throw: true, releaseAt: 0.2
    }),
    // Enemy attacks
    //
    // The rabble's rows are a rhythm, not a roster: the thug's jab is the first
    // half of a two-beat flurry (`aiChain`), and the pair beat below lets a mate
    // add the second half so a press comes from two clubs instead of one.
    thug_press: attack({
        id: 'thug_press', label: 'Cudgel Jab', owner: 'thug', hitZone: 'torso', animation: 'thug_body',
        startup: 0.26, active: 0.1, recovery: 0.34,
        damage: 5, guardDamage: 6, reach: 57, depth: 28, minForward: -6,
        knockback: 30, hitstun: 0.26, hitStop: 0.03, movement: 15,
        maxTargets: 1, arc: 'front', aiChain: 'thug_follow'
    }),
    thug_follow: attack({
        id: 'thug_follow', label: 'Falling Cudgel', owner: 'thug', hitZone: 'head', animation: 'thug_overhead',
        startup: 0.24, active: 0.11, recovery: 0.5,
        damage: 9, guardDamage: 10, reach: 62, depth: 30, minForward: -7,
        knockback: 62, hitstun: 0.44, hitStop: 0.05, movement: 17,
        maxTargets: 1, arc: 'front'
    }),
    thug_overhead: attack({
        id: 'thug_overhead', label: 'Club Overhead', owner: 'thug', hitZone: 'head',
        startup: 0.55, active: 0.12, recovery: 0.67,
        damage: 10, guardDamage: 11, reach: 58, depth: 27, minForward: -5,
        knockback: 62, hitstun: 0.38, hitStop: 0.055, movement: 16,
        maxTargets: 1, arc: 'front', heavy: true
    }),
    thug_body: attack({
        id: 'thug_body', label: 'Club Swing', owner: 'thug', hitZone: 'torso',
        startup: 0.36, active: 0.12, recovery: 0.46,
        damage: 8, guardDamage: 8, reach: 61, depth: 31, minForward: -7,
        knockback: 48, hitstun: 0.3, hitStop: 0.045, movement: 19,
        maxTargets: 1, arc: 'front'
    }),
    thug_low: attack({
        id: 'thug_low', label: 'Low Club Sweep', owner: 'thug', hitZone: 'legs',
        startup: 0.48, active: 0.13, recovery: 0.63,
        damage: 8, guardDamage: 7, reach: 67, depth: 34, minForward: -10,
        knockback: 44, hitstun: 0.48, hitStop: 0.05, movement: 14,
        maxTargets: 1, arc: 'front'
    }),
    spear_thrust: attack({
        id: 'spear_thrust', label: 'Spear Thrust', owner: 'spear', hitZone: 'torso',
        startup: 0.72, active: 0.13, recovery: 0.86,
        damage: 15, guardDamage: 14, reach: 145, depth: 20, minForward: 34,
        knockback: 81, hitstun: 0.46, hitStop: 0.065, movement: 12,
        // The shaft runs through whoever is standing in front of the spearman, so
        // a front rank of thugs is cover for the spear, not for the player.
        maxTargets: 2, arc: 'front', heavy: true
    }),
    spear_brace: attack({
        id: 'spear_brace', label: 'Shaft Butt', owner: 'spear', hitZone: 'torso', animation: 'spear_thrust',
        startup: 0.3, active: 0.1, recovery: 0.44,
        damage: 10, guardDamage: 22, reach: 64, depth: 34, minForward: -28,
        knockback: 92, hitstun: 0.5, hitStop: 0.055, movement: 12,
        maxTargets: 2, arc: 'front', heavy: true
    }),
    // Plate, then the bill: the captain answers a light it never felt.
    captain_answer: attack({
        id: 'captain_answer', label: 'Armoured Answer', owner: 'captain', hitZone: 'head', animation: 'captain_cut',
        startup: 0.2, active: 0.12, recovery: 0.56,
        damage: 11, guardDamage: 16, reach: 88, depth: 34, minForward: -8,
        knockback: 84, hitstun: 0.46, hitStop: 0.06, movement: 22,
        maxTargets: 2, arc: 'front', heavy: true
    }),
    captain_cut: attack({
        id: 'captain_cut', label: 'Armoured Cut', owner: 'captain', hitZone: 'head',
        startup: 0.49, active: 0.14, recovery: 0.72,
        damage: 17, guardDamage: 19, reach: 82, depth: 32, minForward: -8,
        knockback: 88, hitstun: 0.48, hitStop: 0.07, movement: 21,
        maxTargets: 2, arc: 'front', heavy: true
    }),
    captain_bash: attack({
        id: 'captain_bash', label: 'Shield Bash', owner: 'captain', hitZone: 'torso',
        startup: 0.31, active: 0.1, recovery: 0.52,
        damage: 9, guardDamage: 25, reach: 54, depth: 31, minForward: -6,
        knockback: 105, hitstun: 0.58, hitStop: 0.075, movement: 28,
        maxTargets: 1, arc: 'front', heavy: true
    }),
    wretch_claw: attack({
        id: 'wretch_claw', label: 'Chain Claw', owner: 'wretch', hitZone: 'torso',
        startup: 0.37, active: 0.11, recovery: 0.5,
        damage: 8, guardDamage: 8, reach: 61, depth: 33, minForward: -12,
        knockback: 43, hitstun: 0.29, hitStop: 0.04, movement: 31,
        maxTargets: 1, arc: 'front'
    }),
    boss_sweep: attack({
        id: 'boss_sweep', label: 'Grotesque Sweep', owner: 'grotesque', hitZone: 'legs',
        startup: 0.68, active: 0.18, recovery: 0.88,
        damage: 18, guardDamage: 21, reach: 117, depth: 92, minForward: -96,
        knockback: 132, hitstun: 0.58, hitStop: 0.09, movement: 8,
        maxTargets: 2, arc: 'radial', heavy: true
    }),
    boss_leap: attack({
        id: 'boss_leap', label: 'Bound Leap', owner: 'grotesque', hitZone: 'torso',
        startup: 0.82, active: 0.16, recovery: 0.9,
        damage: 22, guardDamage: 25, reach: 88, depth: 72, minForward: -56,
        knockback: 148, hitstun: 0.67, hitStop: 0.105, movement: 145,
        maxTargets: 2, arc: 'radial', heavy: true, shockwave: true
    }),
    boss_shock: attack({
        id: 'boss_shock', label: 'Chain Rupture', owner: 'grotesque', hitZone: 'torso',
        startup: 0.95, active: 0.2, recovery: 1.0,
        damage: 16, guardDamage: 17, reach: 150, depth: 150, minForward: -150,
        knockback: 118, hitstun: 0.52, hitStop: 0.085, movement: 0,
        maxTargets: 2, arc: 'radial', heavy: true, shockwave: true, parryable: false
    })
});
/**
 * Tempo is the archetype's signature. The numbers are deliberately not a
 * smooth ramp: the thug is quick and shallow, the wretch faster still and
 * closer, the captain slow and deliberate, the spear patient and long. What
 * they share is that none of them waits out a full recovery before deciding
 * again — that is what makes a crowd read as pressure instead of a queue.
 */
const FIELD_TEMPO = {
    // Two beats, no reach, and a partner: the press never comes from one club.
    // Teammates swing on a beat offset from each other, so the mate's cudgel
    // lands as the player is climbing out of the first hitstun.
    thug: {
        cooldown: [0.16, 0.42],
        think: [0.16, 0.3],
        station: 52,
        waitStation: 70,
        band: [0, 67],
        depth: 35,
        pair: { radius: 190, beatDelay: 0.42, beatRecovery: 1.1, beatForward: 85, beatDepth: 70 }
    },
    // Reach and patience: one committed thrust, or the butt if you crowd its
    // dead zone. When the player hides inside a crowd the line closes up and
    // stabs through its own front rank.
    spear: {
        cooldown: [0.55, 1.0],
        think: [0.3, 0.52],
        station: 148,
        waitStation: 148,
        band: [70, 164],
        braceBand: [-28, 64],
        depth: 34,
        line: {
            crowdRadius: 118,
            crowdCount: 2,
            commitStation: 126,
            crowdStation: 104,
            crowdCooldown: [0.15, 0.35]
        }
    },
    // Plate first, bill second. It shrugs a light, waits one readable beat, and
    // answers with a cut the player can still parry.
    captain: {
        cooldown: [0.45, 0.9],
        think: [0.28, 0.55],
        station: 52,
        waitStation: 96,
        band: [0, 92],
        depth: 39,
        answer: {
            attack: 'captain_answer',
            delay: 0.16,
            window: 0.55,
            cooldown: 1.7
        }
    },
    // The swarm: fastest decisions, shortest reach, no patience at all.
    wretch: {
        cooldown: [0.1, 0.3],
        think: [0.12, 0.24],
        station: 44,
        waitStation: 88,
        band: [0, 72],
        depth: 44
    }
};
export const ENEMY_TEMPO = Object.freeze(FIELD_TEMPO);
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
/**
 * The starter rows for each weapon in Meyer's hands. The first two are the
 * fencing weapons he trained with; a club and a spear are things he picked up,
 * and their kits are deliberately short — a find gives you reach or speed, never
 * his learned routes.
 */
const KIT_STARTERS = Object.freeze({
    longsword: { light: 'ls_l1', heavy: 'ls_h', counter: 'ls_counter', dodge: 'ls_dodge_l', crouch: 'ls_low_l', air: 'ls_air_l', entry: 'ls_switch_in' },
    dussack: { light: 'ds_l1', heavy: 'ds_h', counter: 'ds_counter', dodge: 'ds_dodge_l', crouch: 'ds_low_l', air: 'ds_air_l', entry: 'ds_switch_in' },
    club: { light: 'cl_l1', heavy: 'cl_h', counter: 'cl_h', dodge: 'cl_l1', crouch: 'cl_l1', air: 'cl_h', entry: 'cl_l1' },
    spear: { light: 'sp_l1', heavy: 'sp_h', counter: 'sp_h', dodge: 'sp_l1', crouch: 'sp_l1', air: 'sp_h', entry: 'sp_l1' }
});
const GUARD_ATTACKS = Object.freeze({
    longsword: Object.freeze({
        forward: 'ls_guard_forward',
        up: 'ls_guard_up',
        down: 'ls_guard_down',
        back: 'ls_guard_back'
    }),
    dussack: Object.freeze({
        forward: 'ds_guard_forward',
        up: 'ds_guard_up',
        down: 'ds_guard_down',
        back: 'ds_guard_back'
    }),
    // Finds keep the same command grammar without pretending a cudgel or shaft
    // has Meyer's fencing branches. The command falls through to its light kit.
    club: Object.freeze({ forward: 'cl_l1', up: 'cl_l1', down: 'cl_l1', back: 'cl_l1' }),
    spear: Object.freeze({ forward: 'sp_l1', up: 'sp_l1', down: 'sp_l1', back: 'sp_l1' })
});
/** True for the finds: weapons that are picked up, thrown, and break. */
export function isImprovisedWeapon(weapon) {
    return weapon === 'club' || weapon === 'spear';
}
/** The move that hurls a find, if this weapon can be thrown at all. */
export function throwAttackFor(weapon) {
    if (weapon === 'club')
        return 'cl_throw';
    if (weapon === 'spear')
        return 'sp_throw';
    return null;
}
export function resolvePlayerAttack(weapon, action, currentAttackId, afterParry, lessons = ALWAYS_SET) {
    const kit = KIT_STARTERS[weapon];
    // A timed parry gives either attack button the same immediate answer. This
    // keeps Guard -> parry -> Cut usable on a phone, while a normal guard never
    // manufactures a counter window.
    if (afterParry)
        return kit.counter;
    if (currentAttackId) {
        const current = getAttack(currentAttackId);
        const chained = action === 'light' ? current.nextLight : current.nextHeavy;
        if (current.weapon === weapon && chained && getAttack(chained).weapon === weapon && isAttackUnlocked(chained, lessons))
            return chained;
        // A locked chain falls through to the basic starter so the input always
        // produces a legal attack instead of a dead buffer.
    }
    return action === 'light' ? kit.light : kit.heavy;
}
const ALWAYS_SET = new Set();
export function resolveDodgeAttack(weapon) {
    return KIT_STARTERS[weapon].dodge;
}
export function resolveCrouchAttack(weapon, action) {
    const kit = KIT_STARTERS[weapon];
    return action === 'light' ? kit.crouch : kit.heavy;
}
export function isHitZoneExposed(state, hitZone) {
    if (state !== 'crouch')
        return true;
    return hitZone !== 'head';
}
export function resolveAirAttack(weapon) {
    return KIT_STARTERS[weapon].air;
}
export function resolveSwitchAttack(weapon) {
    return KIT_STARTERS[weapon].entry;
}
export function resolveGuardAttack(weapon, direction) {
    return GUARD_ATTACKS[weapon][direction];
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
/**
 * Attack ids referenced by lesson cards as upgrade targets. Every id here is
 * also in BASIC_ATTACKS below, so this table documents the lesson's focus but
 * never gates the starter repertoire. Behaviour upgrades are handled by the
 * simulation's hit-confirm and switch rules.
 */
export const LESSON_ATTACKS = Object.freeze({
    'ls-crossing': Object.freeze(['ls_l2']),
    'ls-threefold': Object.freeze(['ls_l3']),
    'ls-provoker': Object.freeze(['ls_h']),
    'ds-backhand': Object.freeze(['ds_l2']),
    'ds-wheel': Object.freeze(['ds_l3']),
    'switch-flourish': Object.freeze(['ls_switch_in', 'ds_switch_in'])
});
/** The basic repertoire everyone starts the run with. */
const BASIC_ATTACKS = new Set([
    'ls_l1', 'ls_l2', 'ls_l3', 'ls_h', 'ls_dodge_l', 'ls_low_l', 'ls_air_l', 'ls_counter', 'ls_switch_in',
    'ls_guard_forward', 'ls_guard_up', 'ls_guard_down', 'ls_guard_back',
    'ds_l1', 'ds_l2', 'ds_l3', 'ds_h', 'ds_dodge_l', 'ds_low_l', 'ds_air_l', 'ds_counter', 'ds_switch_in',
    'ds_guard_forward', 'ds_guard_up', 'ds_guard_down', 'ds_guard_back',
    // Finds need no lesson: the player earns them by taking them off the street.
    'cl_l1', 'cl_l2', 'cl_h', 'cl_throw',
    'sp_l1', 'sp_h', 'sp_throw'
]);
const ATTACK_LESSON = new Map();
for (const [lesson, attacks] of Object.entries(LESSON_ATTACKS)) {
    for (const id of attacks)
        ATTACK_LESSON.set(id, lesson);
}
export function isAttackUnlocked(attackId, lessons) {
    if (BASIC_ATTACKS.has(attackId))
        return true;
    const lesson = ATTACK_LESSON.get(attackId);
    return lesson !== undefined && lessons.has(lesson);
}
/**
 * Lesson-card copy for upgrades to the starter routes. These descriptions do
 * not imply that the underlying chain is locked.
 */
export const LESSON_ROUTES = Object.freeze({
    'ls-crossing': Object.freeze([
        'J after a confirmed Opening Hew — sharper Crossing Hew'
    ]),
    'ls-threefold': Object.freeze([
        'J after Crossing Hew — heavier Threefold finish'
    ]),
    'ls-provoker': Object.freeze([
        'A provoked opening makes the next committed hit stronger'
    ]),
    'ds-backhand': Object.freeze([
        'J after a confirmed Forehand Cut — harder-to-guard Backhand Cut'
    ]),
    'ds-wheel': Object.freeze([
        'J after Backhand Cut — Circular Pursuit',
        'The capped fourth beat gets a clearer knockback finish'
    ]),
    'switch-flourish': Object.freeze([
        'U after a confirmed hit — faster weapon switch into the entry'
    ])
});
//# sourceMappingURL=attacks.js.map
/**
 * How many enemies may hold an attack against each player at the same time.
 *
 * The same on every stretch of road, deliberately. Waves used to author their
 * own — the flood narrowed it to one, the trap and the stand widened it to
 * three — which was a difficulty multiplier in quieter clothes: the ideas were
 * distinct on paper, but which wave hurt you was decided by a number rather
 * than by what it asked you to do. Held uniform, difficulty has to come from the
 * encounter's shape, and `tests/encounter-shape.test.mjs` fails if a wave starts
 * authoring its own.
 */
export const ATTACK_SLOTS = Object.freeze({ melee: 2, reach: 1 });
/**
 * How each kind names itself where the fight has to be named. The hold's clock
 * is the one objective that cannot be read off the road, so it is stated, and it
 * is stated with the encounter's name in front of it.
 */
export const ENCOUNTER_LABELS = Object.freeze({
    press: 'THE PRESS',
    choke: 'THE GATE — ONE AT A TIME',
    ambush: 'THE TRAP',
    flood: 'THE FLOOD',
    duel: 'THE DUEL',
    hold: 'THE STAND',
    boss: 'THE BOUND THING'
});
/**
 * How much the road has narrowed at a given x: 0 out on the open road, 1 inside
 * the lane. The halfway values are the ramp either side of the gate, so a crowd
 * filters into the narrow ground instead of hitting a wall of it.
 */
export function laneNarrowingAt(x, lane) {
    if (!lane)
        return 0;
    if (x >= lane.from && x <= lane.to)
        return 1;
    const distance = x < lane.from ? lane.from - x : x - lane.to;
    return Math.max(0, 1 - distance / Math.max(1, lane.approach));
}
/**
 * The campaign, level by level. A level names the art it is dressed in
 * (`setting`), and keeps it for every wave inside it: the scenery only changes
 * when the journey crosses into a new place, which is the only moment the party
 * walks out of a doorway.
 *
 * This is the only authored campaign data: the sim walks it directly (a level
 * index and an index within that level's waves), so there is no flat table to
 * keep in step and no wave that can belong to two levels or to none.
 */
const CAMPAIGN = [
    {
        name: 'The Town',
        setting: 'cobbled-streets',
        road: 2360,
        waves: [
            {
                kind: 'press',
                title: 'Street Rabble',
                subtitle: 'The crowd is the lesson: keep the press in front of you with broad cuts and soft alignment.',
                // Pairs, not a queue: three pairs on 0.16 s intervals put two clubs on
                // the same beat, which is what the thug tempo was built for, and give
                // the wide cut's `maxTargets` something to answer.
                groups: [
                    { archetype: 'thug', count: 2, interval: 0.16 },
                    { archetype: 'thug', count: 2, interval: 0.16 },
                    { archetype: 'thug', count: 2, interval: 0.16 }
                ],
                lessonAfter: true
            }
        ]
    },
    {
        name: 'The Town Gate',
        setting: 'town-gate',
        road: 2700,
        waves: [
            {
                kind: 'choke',
                title: 'The Bottleneck',
                subtitle: 'The gate is only as wide as one cart, and a crowd has to file through it. Break the queue at the mouth, where you still have depth to work with.',
                // The unlock positions put the fight *inside* the gate. Spread evenly,
                // every enemy had arrived before the player reached the funnel at 1620,
                // and the gate was decoration on the way to the doorway.
                groups: [
                    { archetype: 'thug', count: 3, interval: 0.5 },
                    { archetype: 'spear', count: 1, interval: 1.1, from: 1440 },
                    { archetype: 'thug', count: 3, interval: 0.45, from: 1700 },
                    { archetype: 'spear', count: 1, interval: 1.0, from: 1980 }
                ],
                // 162 px of road instead of the arena's 364: enough to step out of a
                // thrust, not enough to run around one, and narrow enough that a spear's
                // 145 px reach covers the ground the queue has to take.
                lane: { from: 1620, to: 2020, minZ: 360, maxZ: 522, approach: 300 },
                lessonAfter: true
            }
        ]
    },
    {
        name: 'The Sala d’Armi',
        setting: 'sala-darmi',
        road: 1400,
        waves: [
            {
                kind: 'duel',
                title: 'The Armoured Lesson',
                subtitle: 'One captain holds the far end of the hall, and there is no crowd to hide in. Lights will not move plate: provoke him, take the answer, and cut the opening.',
                duel: { archetype: 'captain', end: 'east', z: 436 },
                // A hall barely wider than the camera is a hall you have to fence on.
                // Measured at 1520 px the captain (88 speed against the player's 220)
                // could simply be walked away from, and the duel cost 5 health.
                provisions: [{ kind: 'potion', x: 700, z: 566 }],
                lessonAfter: true
            }
        ]
    },
    {
        name: 'The Castello Courts',
        setting: 'castello',
        road: 1980,
        waves: [
            {
                kind: 'ambush',
                title: 'Knives Out of the Doorways',
                subtitle: 'They give you a front to fix on, and then the doors behind you open. Turn, or be cut between two fires.',
                groups: [
                    { archetype: 'thug', count: 3, interval: 0.34 },
                    { archetype: 'wretch', count: 1, interval: 0.3, from: 460 }
                ],
                // The doors hold until the bait is down to its last man, and the three
                // that come are spread across depth lanes so a single broad cut cannot
                // erase the group the way it erases a clump.
                ambush: {
                    trigger: 420,
                    remaining: 1,
                    behind: [
                        { archetype: 'wretch', count: 2, interval: 0.12 },
                        { archetype: 'thug', count: 1, interval: 0.18 }
                    ]
                },
                lessonAfter: true
            },
            {
                kind: 'flood',
                title: 'The Garrison Pours Out',
                subtitle: 'The yard empties, then fills from the other side. Use the lull: take what the fallen left, breathe, and set your feet again.',
                // Nine to ten seconds between surges, measured: the subtitle promises the
                // lull is for crossing the yard to a draught and back, and at 8.5 s the
                // trip was a sprint with the next surge already opening. A surge arrives
                // as a stream over a second and a half rather than a wall on one frame,
                // so a player who keeps moving meets them one at a time.
                surges: {
                    every: 10,
                    waves: [
                        [{ archetype: 'thug', count: 2, interval: 0.52 }],
                        [
                            { archetype: 'spear', count: 1, interval: 0.7 },
                            { archetype: 'thug', count: 1, interval: 0.5 }
                        ],
                        [
                            { archetype: 'captain', count: 1, interval: 0 },
                            { archetype: 'wretch', count: 1, interval: 0.56 }
                        ]
                    ]
                },
                // The counterplay to a pincer is the yard's two ends: crossing to heal
                // means crossing the ground the next surge is about to arrive on.
                provisions: [
                    { kind: 'potion', x: 360, z: 574 },
                    { kind: 'potion', x: 1640, z: 320 }
                ],
                lessonAfter: true
            }
        ]
    },
    {
        name: 'The Castello',
        setting: 'castello',
        road: 2360,
        waves: [
            {
                kind: 'hold',
                title: 'The Bound Press',
                subtitle: 'Hold the road while everything the castle chained comes down it. Outlast the press; the way out opens when the last of them falls.',
                // No lane, and that was measured rather than assumed: narrowing the road
                // here took the player's depth away as well as the crowd's, and a stand
                // is the one encounter where the player has to be able to give ground
                // (45 mean to 50, 96 worst to 108).
                //
                // Eighteen seconds, four beats of two. Beats walk in from the edge of the
                // picture like every other arrival, so the road itself takes seconds to
                // deliver anyone; the clock is the stand's whole pressure, and the
                // formation is what it holds.
                hold: {
                    seconds: 18,
                    every: 5,
                    beats: [
                        [{ archetype: 'wretch', count: 2, interval: 0.3 }],
                        [{ archetype: 'thug', count: 2, interval: 0.3 }],
                        [
                            { archetype: 'wretch', count: 1, interval: 0.2 },
                            { archetype: 'spear', count: 1, interval: 0.44 }
                        ],
                        [
                            { archetype: 'thug', count: 1, interval: 0.3 },
                            { archetype: 'wretch', count: 1, interval: 0.26 }
                        ]
                    ]
                },
                provisions: [
                    { kind: 'potion', x: 640, z: 336 },
                    { kind: 'club', x: 1180, z: 566 },
                    { kind: 'potion', x: 1300, z: 556 }
                ],
                lessonAfter: true
            },
            {
                kind: 'boss',
                title: 'The Bound Grotesque',
                subtitle: 'The crypt chains snap, and the thing they held walks down the hall at you. Survive the sweep, parry the claw, and put it down.',
                // Up the hall from the west, off the edge of the picture: the party
                // turns to face it with the doorway at their back. Arriving from the
                // east instead put the fight in the road's last 260 px, and a competent
                // bot lost the whole bar standing in that corner.
                groups: [{ archetype: 'grotesque', count: 1, interval: 0, side: 'west' }]
            }
        ]
    }
];
export const LEVELS = deepFreeze(CAMPAIGN);
/** Freezes a nested literal so authored campaign data cannot be mutated. */
function deepFreeze(value) {
    if (value && typeof value === 'object') {
        for (const entry of Object.values(value))
            deepFreeze(entry);
        Object.freeze(value);
    }
    return value;
}
//# sourceMappingURL=waves.js.map
export const WAVES = Object.freeze([
    Object.freeze({
        title: 'The Cobbled Streets — Street Rabble',
        subtitle: 'Use broad cuts, movement, and soft alignment to keep the press in front of you.',
        groups: Object.freeze([
            Object.freeze({ archetype: 'thug', count: 6, interval: 0.42 })
        ])
    }),
    Object.freeze({
        title: 'The Town Gate — Pike and Press',
        subtitle: 'Spears punish a straight line. Tilt into depth or dodge across the thrust.',
        groups: Object.freeze([
            Object.freeze({ archetype: 'thug', count: 4, interval: 0.34 }),
            Object.freeze({ archetype: 'spear', count: 2, interval: 0.62 })
        ]),
        upgradeAfter: true
    }),
    Object.freeze({
        title: 'The Sala d’Armi — The Armoured Lesson',
        subtitle: 'Provoke the captain, take the answer, then strike the opening.',
        groups: Object.freeze([
            Object.freeze({ archetype: 'thug', count: 3, interval: 0.32 }),
            Object.freeze({ archetype: 'spear', count: 3, interval: 0.48 }),
            Object.freeze({ archetype: 'captain', count: 1, interval: 0.9 })
        ]),
        upgradeAfter: true
    }),
    Object.freeze({
        title: 'The Castello — The Bound Grotesque',
        subtitle: 'The crypt chains snap. Survive the sweep, parry the claw, and put the bound thing down.',
        groups: Object.freeze([
            Object.freeze({ archetype: 'grotesque', count: 1, interval: 0 })
        ]),
        boss: true
    })
]);
//# sourceMappingURL=waves.js.map
/**
 * The run's combat upgrades. The complete short chain and the four guard
 * commands are available immediately; lessons make an existing route sharper
 * instead of withholding its basic inputs.
 */
export const LESSONS = Object.freeze({
    'ls-crossing': {
        id: 'ls-crossing',
        title: 'The Crossing Hew',
        school: 'Longsword',
        description: 'Sharpen the confirmed link into the Crossing Hew.',
        detail: 'Upgrade: the second cut keeps more pressure in a hit-confirmed string.'
    },
    'ls-threefold': {
        id: 'ls-threefold',
        title: 'The Threefold Cut',
        school: 'Longsword',
        description: 'Make the available threefold chain finish with authority.',
        detail: 'Upgrade: Threefold Cut carries a stronger finishing knockback.'
    },
    'ls-provoker': {
        id: 'ls-provoker',
        title: 'Provocation Mastered',
        school: 'Longsword',
        description: 'Turn a blocked committed cut into a stronger opening next time.',
        detail: 'Upgrade: a heavy that finds an opening hits harder after a provocation.'
    },
    'ds-backhand': {
        id: 'ds-backhand',
        title: 'The Backhand Cut',
        school: 'Dussack',
        description: 'Sharpen the confirmed Forehand-to-Backhand link.',
        detail: 'Upgrade: Backhand Cut puts more strain on a guarded target.'
    },
    'ds-wheel': {
        id: 'ds-wheel',
        title: 'Complete the Wheel',
        school: 'Dussack',
        description: 'Close the available dussack wheel before it gives the target room.',
        detail: 'Upgrade: Circular Pursuit gets a clearer knockback finish.'
    },
    'switch-flourish': {
        id: 'switch-flourish',
        title: 'The Flourish',
        school: 'Shared',
        description: 'Make a confirmed mid-combo switch flow into an entry strike.',
        detail: 'Upgrade: confirmed Switch recovery shortens into the entry.'
    }
});
/**
 * One offer per completed level (waves 1–6). The player picks one card each
 * time; the later rows repeat the earlier pairs so a player who learned a
 * card's partner still has a pick at the back half of the run — by the boss
 * every lesson can be learned.
 */
export const LESSON_OFFERS = Object.freeze([
    Object.freeze(['ls-crossing', 'ds-backhand']),
    Object.freeze(['ls-threefold', 'ds-wheel']),
    Object.freeze(['switch-flourish', 'ls-provoker']),
    Object.freeze(['ls-crossing', 'ds-backhand']),
    Object.freeze(['ls-threefold', 'ds-wheel']),
    Object.freeze(['switch-flourish', 'ls-provoker'])
]);
//# sourceMappingURL=lessons.js.map
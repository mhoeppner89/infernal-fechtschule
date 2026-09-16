/**
 * The run's combo unlocks. Meyer starts with only his basic cuts; every lesson
 * opens new chained routes (exact inputs are listed per card from
 * LESSON_ROUTES in attacks.ts).
 */
export const LESSONS = Object.freeze({
    'ls-crossing': {
        id: 'ls-crossing',
        title: 'The Crossing Hew',
        school: 'Longsword',
        description: 'Chain a second cut after the Opening Hew.',
        detail: 'Unlocks: Crossing Hew (J·J).'
    },
    'ls-threefold': {
        id: 'ls-threefold',
        title: 'The Threefold Cut',
        school: 'Longsword',
        description: 'Extend the longsword chain to its threefold head-cut conclusion.',
        detail: 'Unlocks: Threefold Cut (J·J·J).'
    },
    'ls-provoker': {
        id: 'ls-provoker',
        title: 'Provocation Mastered',
        school: 'Longsword',
        description: 'A provoking cut that meets a guard may recover straight into defense.',
        detail: 'Unlocks: hold Guard after a blocked provoke to cancel into it.'
    },
    'ds-backhand': {
        id: 'ds-backhand',
        title: 'The Backhand Cut',
        school: 'Dussack',
        description: 'Chain a backhand after the Forehand Cut.',
        detail: 'Unlocks: Backhand Cut (J·J).'
    },
    'ds-wheel': {
        id: 'ds-wheel',
        title: 'Complete the Wheel',
        school: 'Dussack',
        description: 'Extend the dussack chain into the wheel that turns back on itself.',
        detail: 'Unlocks: Circular Pursuit (J·J·J·J).'
    },
    'switch-flourish': {
        id: 'switch-flourish',
        title: 'The Flourish',
        school: 'Shared',
        description: 'Switching mid-combo flows into entry strikes with routes of their own.',
        detail: 'Unlocks: switch right after a confirmed hit.'
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
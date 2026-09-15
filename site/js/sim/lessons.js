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
        description: 'Chain a second cut after the Opening Hew, and open the provoking route.',
        detail: 'Unlocks: Crossing Hew (J·J), Provoking Hew (J·K), Crossing Breaker (J·J·K).'
    },
    'ls-threefold': {
        id: 'ls-threefold',
        title: 'The Threefold Cut',
        school: 'Longsword',
        description: 'Extend the longsword chain to its threefold head-cut conclusion.',
        detail: 'Unlocks: Threefold Cut (J·J·J), Taking Cut (K·J), Low Sweeping Hew (L then K).'
    },
    'ls-provoker': {
        id: 'ls-provoker',
        title: 'Provocation Mastered',
        school: 'Longsword',
        description: 'A provoking cut that meets a guard may recover straight into defense.',
        detail: 'Unlocks: hold Guard after a blocked provoke to cancel recovery; leaping Descending Hew.'
    },
    'ds-backhand': {
        id: 'ds-backhand',
        title: 'The Backhand Cut',
        school: 'Dussack',
        description: 'Chain a backhand after the forehand, and open the pressing route.',
        detail: 'Unlocks: Backhand Cut (J·J), Pressing Cut (J·K), Wheel Cut (J·J·K).'
    },
    'ds-wheel': {
        id: 'ds-wheel',
        title: 'Complete the Wheel',
        school: 'Dussack',
        description: 'Extend the dussack chain to the wrapping wheel and low wheel.',
        detail: 'Unlocks: Circular Pursuit (J·J·J), Reversing Cut (K·J), Low Wheel Cut (L then K).'
    },
    'switch-flourish': {
        id: 'switch-flourish',
        title: 'The Flourish',
        school: 'Shared',
        description: 'Switching mid-combo flows into entry strikes with routes of their own.',
        detail: 'Unlocks: switch entries keep their chains; either weapon gains the parry Master Cut.'
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